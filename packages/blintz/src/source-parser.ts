/** Trace the actual Milkdown parser's AST runners into the PM nodes they create. */
import {
  ParserState,
  type MarkdownNode,
  type RemarkParser,
} from "@milkdown/kit/transformer";
import type { Node, Schema } from "@milkdown/kit/prose/model";
import {
  createRawCoordinateMap,
  type RawCoordinateMap,
  type SourceTask,
} from "./source-location";
export interface TextOrigin {
  from: number;
  to: number;
  rawFrom: number;
  rawTo: number;
}
export interface ParsedSource {
  text: string;
  coordinates: RawCoordinateMap;
  doc: Node;
  texts: TextOrigin[];
  tasks: Map<number, SourceTask>;
}
export function parseSource(
  schema: Schema,
  remark: RemarkParser,
  text: string,
): ParsedSource {
  const coordinates = createRawCoordinateMap(text);
  const state = new ParserState(schema);
  const origins = new WeakMap<Node, MarkdownNode>();
  const textOrigins = new WeakMap<
    Node,
    { length: number; start?: number; end?: number }[]
  >();
  let active: MarkdownNode | undefined;
  const next = state.next;
  state.next = (nodes = []) => {
    for (const node of [nodes].flat()) {
      const prev = active;
      active = node;
      try {
        next(node);
      } finally {
        active = prev;
      }
    }
    return state;
  };
  const push = state.push;
  state.push = (node) => {
    if (active) origins.set(node, active);
    push(node);
  };
  const addText = state.addText;
  const bom = text.startsWith("\uFEFF") ? 1 : 0;
  state.addText = (value) => {
    const previous = state.top()?.content.at(-1);
    const previousSpans = previous && textOrigins.get(previous);
    addText(value);
    const current = state.top()?.content.at(-1);
    if (!current?.isText) return state;
    const start = active?.position?.start.offset,
      end = active?.position?.end.offset;
    // Entities, escapes, code delimiters and transformed nodes lack an exact
    // one-to-one text correspondence. They stay explicitly unmapped.
    const exact =
      active?.type === "text" &&
      typeof start === "number" &&
      typeof end === "number" &&
      text.slice(start + bom, end + bom) === value;
    const span = exact
      ? { length: value.length, start: start! + bom, end: end! + bom }
      : { length: value.length };
    textOrigins.set(
      current,
      current.text === value
        ? [span]
        : [
            ...(previousSpans ?? [{ length: (previous?.text ?? "").length }]),
            span,
          ],
    );
    return state;
  };
  state.run(remark, text);
  const doc = state.toDoc();
  const texts: TextOrigin[] = [],
    tasks = new Map<number, SourceTask>();
  doc.descendants((node, pos) => {
    if (node.isText) {
      let offset = 0;
      for (const span of textOrigins.get(node) ?? []) {
        if (span.start !== undefined && span.end !== undefined)
          texts.push({
            from: pos + offset,
            to: pos + offset + span.length,
            rawFrom: span.start,
            rawTo: span.end,
          });
        offset += span.length;
      }
    }
    const ast = origins.get(node);
    if (node.type.name !== "list_item" || typeof ast?.checked !== "boolean")
      return;
    const start = ast.position?.start.offset,
      end = ast.position?.end.offset;
    if (typeof start !== "number" || typeof end !== "number") return;
    const itemStart = start + bom,
      itemEnd = end + bom;
    const prefix = /^(?:[*+-]|\d+[.)])[ \t]+(\[[ xX]\])(?=[ \t]|$)/.exec(
      text.slice(itemStart, itemEnd),
    );
    if (!prefix) return;
    const markerStart = itemStart + prefix[0].length - prefix[1]!.length;
    const marker = coordinates.range(markerStart, markerStart + 3);
    const checked = text[markerStart + 1]!.toLowerCase() === "x";
    if (checked !== ast.checked || checked !== node.attrs.checked) return;
    tasks.set(pos, {
      item: coordinates.range(itemStart, itemEnd),
      marker,
      line: marker.startLine,
      checked,
    });
  });
  return { text, coordinates, doc, texts, tasks };
}

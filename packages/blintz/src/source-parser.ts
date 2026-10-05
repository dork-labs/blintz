/** Trace the actual Milkdown parser's AST runners into the PM nodes they create. */
import {
  ParserState,
  type MarkdownNode,
  type RemarkParser,
} from "@milkdown/kit/transformer";
import { Fragment, type Node, type Schema } from "@milkdown/kit/prose/model";
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
type TextSpans = { length: number; start?: number; end?: number }[];
const lexicalSources = new WeakMap<ParsedSource, {
  origins: WeakMap<Node, MarkdownNode>;
  textOrigins: WeakMap<Node, TextSpans>;
  suffixes: WeakMap<Node, number>;
}>();
/** Reconstruct only an original paragraph's one raw terminal space when the live text contains it exactly. */
export function reconcileSourceTerminalSpace(parsed: ParsedSource, actual: Node): ParsedSource {
  const original = lexicalSources.get(parsed);
  if (!original || parsed.doc.type.schema !== actual.type.schema) return parsed;
  const visit = (node: Node, current: Node): Node => {
    if (node.type !== current.type) return node;
    const suffix = original.suffixes.get(node);
    if (node.isText) {
      const spans = original.textOrigins.get(node), last = spans?.at(-1), text = current.text;
      if (suffix === undefined || !node.sameMarkup(current) || typeof text !== "string" || text !== node.text + " " ||
          !spans || !last || last.end !== suffix || parsed.text[suffix] !== " ") return node;
      const next = node.type.schema.text(text, node.marks);
      original.textOrigins.set(next, [...spans.slice(0, -1), { ...last, length: last.length + 1, end: suffix + 1 }]);
      return next;
    }
    if (current.childCount < node.childCount) return node;
    const children: Node[] = [];
    let changed = false;
    for (let index = 0; index < node.childCount; index++) {
      const child = node.child(index), next = visit(child, current.child(index));
      children.push(next); changed ||= next !== child;
    }
    if (!changed) return node;
    const next = node.copy(Fragment.fromArray(children));
    const ast = original.origins.get(node);
    if (ast) original.origins.set(next, ast);
    return next;
  };
  const doc = visit(parsed.doc, actual);
  if (doc === parsed.doc) return parsed;
  return mapSource(parsed.text, parsed.coordinates, doc, original.origins, original.textOrigins);
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
  const parents: MarkdownNode[] = [];
  const suffixes = new WeakMap<Node, number>();
  const next = state.next;
  state.next = (nodes = []) => {
    for (const node of [nodes].flat()) {
      const prev = active;
      active = node;
      if (prev) parents.push(prev);
      try {
        next(node);
      } finally {
        if (prev) parents.pop();
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
    const parent = parents.at(-1), parentEnd = parent?.position?.end.offset;
    if (exact && parent?.type === "paragraph" && parent.children?.at(-1) === active &&
        typeof parentEnd === "number" && parentEnd === end! + 1 && text[end! + bom] === " " &&
        [undefined, "\n", "\r"].includes(text[parentEnd + bom])) suffixes.set(current, end! + bom);
    return state;
  };
  state.run(remark, text);
  const doc = state.toDoc();
  const parsed = mapSource(text, coordinates, doc, origins, textOrigins);
  lexicalSources.set(parsed, { origins, textOrigins, suffixes });
  return parsed;
}
function mapSource(text: string, coordinates: RawCoordinateMap, doc: Node,
  origins: WeakMap<Node, MarkdownNode>, textOrigins: WeakMap<Node, TextSpans>): ParsedSource {
  const bom = text.startsWith("\uFEFF") ? 1 : 0;
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

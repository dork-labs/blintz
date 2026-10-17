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
  type RawSourceRange,
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
  /** Inline and block atoms (wiki links, images, math) and the markdown they came from. */
  atoms: TextOrigin[];
  /**
   * Text without an exact source (escapes, entities, code) and the whole raw
   * node it came from: addressable only as a whole.
   */
  loose: TextOrigin[];
  tasks: Map<number, SourceTask>;
}
/** `start`/`end`: exact raw source. `rawStart`/`rawEnd`: the raw node it came from, when not exact. */
type TextSpans = { length: number; start?: number; end?: number; rawStart?: number; rawEnd?: number }[];
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
  const textOrigins = new WeakMap<Node, TextSpans>();
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
    // Text without an exact source is still tied to the raw node it came
    // from, or, for pieces a transform rebuilt without a position (line
    // endings split a paragraph's text), to the nearest ancestor that has one.
    const owner = [active, ...parents.slice().reverse()].find(
      (node) => typeof node?.position?.start.offset === "number" && typeof node.position.end.offset === "number",
    );
    const span = exact
      ? { length: value.length, start: start! + bom, end: end! + bom }
      : owner
        ? { length: value.length, rawStart: owner.position!.start.offset! + bom, rawEnd: owner.position!.end.offset! + bom }
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
    atoms: TextOrigin[] = [],
    loose: TextOrigin[] = [],
    tasks = new Map<number, SourceTask>();
  doc.descendants((node, pos) => {
    if (node.isLeaf && !node.isText) {
      const position = origins.get(node)?.position;
      const start = position?.start.offset, end = position?.end.offset;
      if (typeof start === "number" && typeof end === "number")
        atoms.push({ from: pos, to: pos + node.nodeSize, rawFrom: start + bom, rawTo: end + bom });
    }
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
        else if (span.rawStart !== undefined && span.rawEnd !== undefined)
          loose.push({
            from: pos + offset,
            to: pos + offset + span.length,
            rawFrom: span.rawStart,
            rawTo: span.rawEnd,
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
  return { text, coordinates, doc, texts, atoms, loose, tasks };
}

/**
 * Map a model range `[from, to)` of `doc` (the parsed document, or a live one
 * that matches it) to raw ranges in the parsed text. Every selected text unit
 * needs parser-origin evidence; anything else (atoms, escapes, entities) is
 * unmapped, and so `null`.
 */
export function mapSourceRange(
  parsed: ParsedSource,
  doc: Node,
  from: number,
  to: number,
  empty = from === to,
): RawSourceRange[] | null {
  const selection = { from, to, empty };
  const spans = parsed.texts.filter(
    (span) => span.to >= selection.from && span.from <= selection.to,
  );
  const ranges = spans
    .filter((span) =>
      selection.empty
        ? selection.from >= span.from && selection.from <= span.to
        : selection.to > span.from && selection.from < span.to,
    )
    .map((span) => {
      const from = Math.max(selection.from, span.from),
        to = Math.min(selection.to, span.to);
      return parsed.coordinates.range(
        span.rawFrom + from - span.from,
        span.rawFrom + to - span.from,
      );
    });
  // Every selected text unit must have direct parser-origin evidence.
  let selectedText = 0,
    unsupportedLeaf = false;
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.isLeaf && !node.isText) unsupportedLeaf = true;
    if (node.isText)
      selectedText += Math.max(
        0,
        Math.min(selection.to, pos + node.nodeSize) -
          Math.max(selection.from, pos),
      );
  });
  if (
    unsupportedLeaf ||
    !ranges.length ||
    ranges.length > 100 ||
    ranges.reduce((n, range) => n + range.end - range.start, 0) !==
      selectedText ||
    (selection.empty && new Set(ranges.map((range) => range.start)).size !== 1)
  )
    return null;
  return ranges;
}

/**
 * Map a raw range `[start, end)` of the parsed text to the model range of the
 * text it covers, and of any atom it covers whole. Ends inside markdown
 * syntax snap inward to the nearest text (`**bold**` covers `bold`). Text
 * with no exact source (an escape, an entity, code) counts only whole: an end
 * inside it is `null`, never a silently shorter range. `null` too when
 * nothing mapped lies inside.
 */
export function mapRawRange(
  parsed: ParsedSource,
  start: number,
  end: number,
): { from: number; to: number } | null {
  let from: number | undefined, to: number | undefined;
  for (const span of parsed.texts) {
    if (span.rawTo <= start || span.rawFrom >= end) continue;
    const spanFrom = span.from + Math.max(0, start - span.rawFrom);
    const spanTo = span.from + Math.min(end, span.rawTo) - span.rawFrom;
    if (from === undefined || spanFrom < from) from = spanFrom;
    if (to === undefined || spanTo > to) to = spanTo;
  }
  for (const run of parsed.loose) {
    if (run.rawTo <= start || run.rawFrom >= end) continue;
    if (run.rawFrom < start || run.rawTo > end) return null;
    if (from === undefined || run.from < from) from = run.from;
    if (to === undefined || run.to > to) to = run.to;
  }
  for (const atom of parsed.atoms) {
    if (atom.rawFrom < start || atom.rawTo > end) continue;
    if (from === undefined || atom.from < from) from = atom.from;
    if (to === undefined || atom.to > to) to = atom.to;
  }
  return from !== undefined && to !== undefined && from < to ? { from, to } : null;
}

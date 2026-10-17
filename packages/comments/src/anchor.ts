import type { Node } from "@milkdown/kit/prose/model";

/**
 * Where a comment sits, independent of the editor: the W3C Web Annotation
 * text-quote selector (the quoted text plus a little context on each side)
 * and a text-position hint. It is opaque to the host: store it, hand it back.
 *
 * Offsets count characters of the document's plain text: each textblock's
 * text, an inline atom (image, wiki link) as one character, and a line break
 * between blocks.
 */
export interface CommentAnchor {
  /** Format version, for future migrations. */
  v: 1;
  /** The commented text, exactly. */
  quote: string;
  /** Up to {@link CONTEXT_LENGTH} characters before the quote. */
  prefix: string;
  /** Up to {@link CONTEXT_LENGTH} characters after the quote. */
  suffix: string;
  /** Where the quote started, in plain-text characters. */
  start: number;
  /** Where the quote ended. */
  end: number;
}

export const CONTEXT_LENGTH = 32;
const ATOM = "￼";

interface Segment {
  /** Offset of this segment in the plain text. */
  textStart: number;
  /** Characters this segment contributes. */
  length: number;
  /** Document position where it starts. */
  pos: number;
  /** Document size it spans (equals `length` for text). */
  size: number;
}

/** A document's plain text and the map between text offsets and positions. */
export interface DocText {
  text: string;
  segments: Segment[];
}

export function docText(doc: Node): DocText {
  let text = "";
  const segments: Segment[] = [];
  let firstBlock = true;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!firstBlock) text += "\n";
    firstBlock = false;
    node.forEach((child, offset) => {
      const at = pos + 1 + offset;
      if (child.isText) {
        segments.push({ textStart: text.length, length: child.text!.length, pos: at, size: child.nodeSize });
        text += child.text!;
      } else {
        segments.push({ textStart: text.length, length: 1, pos: at, size: child.nodeSize });
        text += ATOM;
      }
    });
    return false;
  });
  return { text, segments };
}

/** Text offset of a document position (positions between blocks clamp). */
export function offsetAt(model: DocText, pos: number): number {
  let best = 0;
  for (const segment of model.segments) {
    if (pos < segment.pos) break;
    if (pos <= segment.pos + segment.size) {
      if (segment.length === segment.size) return segment.textStart + (pos - segment.pos);
      return segment.textStart + (pos > segment.pos ? segment.length : 0);
    }
    best = segment.textStart + segment.length;
  }
  return best;
}

/** Document position of a text offset; `side` picks the boundary at an edge. */
export function positionAt(model: DocText, offset: number, side: "start" | "end"): number | null {
  for (const segment of model.segments) {
    const end = segment.textStart + segment.length;
    const inside = side === "start" ? offset >= segment.textStart && offset < end : offset > segment.textStart && offset <= end;
    if (!inside) continue;
    if (segment.length === segment.size) return segment.pos + (offset - segment.textStart);
    return offset === segment.textStart ? segment.pos : segment.pos + segment.size;
  }
  return null;
}

/** The anchor for a document range, or `null` when it covers no text. */
export function anchorFromRange(doc: Node, from: number, to: number, model = docText(doc)): CommentAnchor | null {
  let start = offsetAt(model, from);
  let end = offsetAt(model, to);
  // A selection that runs to (or from) a block edge (a triple-click) picks up
  // the line break between blocks; the comment is on the words, not on it.
  while (start < end && model.text[start] === "\n") start++;
  while (end > start && model.text[end - 1] === "\n") end--;
  const quote = model.text.slice(start, end);
  if (quote.replace(/[\n￼\s]/g, "").length === 0) return null;
  return {
    v: 1,
    quote,
    prefix: model.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: model.text.slice(end, end + CONTEXT_LENGTH),
    start,
    end,
  };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * How a located anchor matched: `exact` (same place, same context), `moved`
 * (found elsewhere with the best context), or `ambiguous` (low confidence:
 * another occurrence fits as well, or under a quarter of its context survives).
 */
export type AnchorMatch = "exact" | "moved" | "ambiguous";

/**
 * Find an anchor's text again. Every occurrence of the quote is scored by how
 * much of the stored prefix and suffix still surrounds it, with nearness to
 * the old position breaking ties. `null` means the text is gone: the comment
 * is orphaned, never silently dropped or attached somewhere arbitrary.
 */
export function locateAnchor(
  model: DocText,
  anchor: CommentAnchor,
): { start: number; end: number; match: AnchorMatch; context: number; fullContext: number } | null {
  const { quote } = anchor;
  if (!quote) return null;
  const { text } = model;
  type Candidate = { start: number; context: number; distance: number };
  // Every occurrence is scored, keeping only the best two: no cap, so a
  // comment late in a long document can't lose to an earlier occurrence.
  const better = (a: Candidate, b: Candidate | undefined) =>
    !b || a.context > b.context || (a.context === b.context && a.distance < b.distance);
  let best: Candidate | undefined;
  let runnerUp: Candidate | undefined;
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const before = text.slice(Math.max(0, at - anchor.prefix.length), at);
    const after = text.slice(at + quote.length, at + quote.length + anchor.suffix.length);
    const candidate = {
      start: at,
      context: commonSuffix(before, anchor.prefix) + commonPrefix(after, anchor.suffix),
      distance: Math.abs(at - anchor.start),
    };
    if (better(candidate, best)) {
      runnerUp = best;
      best = candidate;
    } else if (better(candidate, runnerUp)) runnerUp = candidate;
  }
  if (!best) return null;
  const fullContext = anchor.prefix.length + anchor.suffix.length;
  const exact = best.start === anchor.start && best.context === fullContext;
  // Low confidence: another occurrence fits as well, or less than a quarter
  // of the stored context survives around it.
  const ambiguous =
    !exact && ((runnerUp !== undefined && runnerUp.context === best.context) || best.context * 4 < fullContext);
  return {
    start: best.start,
    end: best.start + quote.length,
    match: exact ? "exact" : ambiguous ? "ambiguous" : "moved",
    context: best.context,
    fullContext,
  };
}

/**
 * {@link locateAnchor}, as document positions: where the editor puts a thread
 * when it first sees its anchor. `null` when the text is gone.
 */
export function locateRange(
  doc: Node,
  anchor: CommentAnchor,
  model = docText(doc),
): { from: number; to: number; match: AnchorMatch; context: number; fullContext: number } | null {
  const found = locateAnchor(model, anchor);
  if (!found) return null;
  const from = positionAt(model, found.start, "start");
  const to = positionAt(model, found.end, "end");
  if (from === null || to === null || from >= to) return null;
  return { from, to, match: found.match, context: found.context, fullContext: found.fullContext };
}

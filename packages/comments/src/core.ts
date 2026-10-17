// @blintz/comments/core: comment anchors without an editor.
//
// A server or an agent works on markdown with no editor open. These find a
// thread's words in markdown, and make anchors from markdown ranges, exactly
// as the editor does: the same document (Blintz's headless model), the same
// matching, and the same mapping to raw markdown as the editor's source port.
// No DOM, no React.
import type { Node } from "@milkdown/kit/prose/model";
import type { MarkdownModel, MarkdownSource, RawSourceRange } from "blintz/collab";

import { anchorFromRange, docText, locateRange, type AnchorMatch, type CommentAnchor, type DocText } from "./anchor";

export { anchorFromRange, docText, locateAnchor, locateRange, CONTEXT_LENGTH } from "./anchor";
export type { AnchorMatch, CommentAnchor, DocText } from "./anchor";

/** Where a thread's words are in a markdown document. */
export interface ResolvedAnchor {
  /** How confidently it was found, as the editor reports it. */
  match: AnchorMatch;
  /** The range in `model.document(markdown)`, as the editor's `rangeOf` gives it. */
  from: number;
  to: number;
  /**
   * The raw markdown the words came from: `ranges` exactly as the editor's
   * `port.range(from, to)` maps them (one per text run; markup between runs,
   * such as `**`, is left out), and `start`/`end` spanning them all. `null`
   * when part of the range has no exact source, as the port refuses it:
   * an atom such as a wiki link, an escape or an entity.
   */
  source: { start: number; end: number; ranges: RawSourceRange[] } | null;
}

const texts = new WeakMap<Node, DocText>();
function textOf(doc: Node): DocText {
  let text = texts.get(doc);
  if (!text) texts.set(doc, (text = docText(doc)));
  return text;
}

/** Pass a `model.source(markdown)` instead of markdown to resolve many anchors with one parse. */
type Markdown = string | MarkdownSource;
const sourceOf = (model: MarkdownModel, markdown: Markdown) =>
  typeof markdown === "string" ? model.source(markdown) : markdown;

/**
 * Find a thread's words in markdown, as the editor would on opening it.
 * `null` when they're gone: the thread is orphaned.
 */
export function resolveAnchor(model: MarkdownModel, markdown: Markdown, anchor: CommentAnchor): ResolvedAnchor | null {
  const source = sourceOf(model, markdown);
  const found = locateRange(source.doc, anchor, textOf(source.doc));
  if (!found) return null;
  const ranges = source.toSource(found.from, found.to);
  return {
    match: found.match,
    from: found.from,
    to: found.to,
    source: ranges ? { start: ranges[0]!.start, end: ranges.at(-1)!.end, ranges } : null,
  };
}

/**
 * An anchor for the text inside the raw markdown range `[start, end)`, as
 * the editor would make it from that selection. Ends inside markdown syntax
 * snap inward to the text (`**bold**` anchors `bold`). `null` when no text
 * lies inside.
 */
export function createAnchor(model: MarkdownModel, markdown: Markdown, start: number, end: number): CommentAnchor | null {
  const source = sourceOf(model, markdown);
  const range = source.fromSource(start, end);
  return range ? anchorFromRange(source.doc, range.from, range.to, textOf(source.doc)) : null;
}

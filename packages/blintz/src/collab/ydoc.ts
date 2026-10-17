import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import * as Y from "yjs";

import type { MarkdownModel } from "../headless";

/** The Y.Doc field Blintz documents live in (y-prosemirror's default). */
export const DEFAULT_FIELD = "prosemirror";

export interface YDocOptions {
  /** The `Y.XmlFragment` name. Defaults to `"prosemirror"`. */
  field?: string;
  /** Transaction origin, so observers (and undo managers) can tell writers apart. */
  origin?: unknown;
  /**
   * The document state the new markdown was written against: the `base`
   * from {@link readYDoc}. With it, only the writer's own changes (base →
   * markdown) are applied, so anything others changed since stays. Without
   * it, the document is made to equal `markdown` exactly.
   */
  base?: Uint8Array;
}

/** What a Y.Doc holds now, plus the base to write changes against later. */
export interface YDocSnapshot {
  markdown: string;
  /** Pass back as `applyMarkdownToYDoc(…, { base })`. */
  base: Uint8Array;
}

/**
 * Read a Y.Doc for a writer who will change it later (an agent): the
 * markdown, and the state to merge their changes against.
 */
export function readYDoc(model: MarkdownModel, ydoc: Y.Doc, options: Pick<YDocOptions, "field"> = {}): YDocSnapshot {
  return { markdown: yDocToMarkdown(model, ydoc, options), base: Y.encodeStateAsUpdate(ydoc) };
}

/**
 * Write `markdown` into a Y.Doc, changing as little as possible. The new
 * document is diffed against what the fragment holds: unchanged blocks keep
 * their Yjs identity, edited text changes by character ranges, so people
 * typing in other parts of the document, their cursors (relative positions)
 * and their unsynced edits all survive. Writing identical content changes
 * nothing. Runs anywhere Yjs does: no DOM, no editor.
 *
 * A writer that read the document a while ago (an agent) should pass the
 * `base` from {@link readYDoc}: then edits others made since that read are
 * kept too, not overwritten by the writer's older copy.
 */
export function applyMarkdownToYDoc(
  model: MarkdownModel,
  ydoc: Y.Doc,
  markdown: string,
  options: YDocOptions = {},
): void {
  if (options.base) {
    // Three-way: replay the writer's change on a copy of what they read, and
    // apply only that difference. Yjs merges it with everything since.
    const fork = new Y.Doc();
    Y.applyUpdate(fork, options.base);
    const before = Y.encodeStateVector(fork);
    applyMarkdownToYDoc(model, fork, markdown, { field: options.field });
    const change = Y.encodeStateAsUpdate(fork, before);
    fork.destroy();
    Y.applyUpdate(ydoc, change, options.origin);
    return;
  }
  const fragment = ydoc.getXmlFragment(options.field ?? DEFAULT_FIELD);
  // The document as live editors hold it (heading ids, trailing paragraph),
  // so an agent's write never fights what every connected editor re-adds.
  const doc = model.document(markdown);
  ydoc.transact(() => {
    // Fresh binding metadata: diff by content, not by a previous mapping.
    updateYFragment(ydoc, fragment, doc, { mapping: new Map(), isOMark: new Map() });
  }, options.origin);
}

/** The markdown a Y.Doc holds, exactly as the editor would write it. */
export function yDocToMarkdown(model: MarkdownModel, ydoc: Y.Doc, options: Pick<YDocOptions, "field"> = {}): string {
  const fragment = ydoc.getXmlFragment(options.field ?? DEFAULT_FIELD);
  return model.serialize(yXmlFragmentToProseMirrorRootNode(fragment, model.schema));
}

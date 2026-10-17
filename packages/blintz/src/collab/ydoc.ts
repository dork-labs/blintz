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
 * kept too, not overwritten by the writer's older copy. Every write returns
 * a fresh `base`; use it (or read again) for the next write, since replaying
 * the same base twice applies the change twice. Two writers changing the
 * same words from one base both land (their edits interleave), and an edit
 * to a block someone else deleted meanwhile is dropped, as in any CRDT.
 */
export function applyMarkdownToYDoc(
  model: MarkdownModel,
  ydoc: Y.Doc,
  markdown: string,
  options: YDocOptions = {},
): { base: Uint8Array } {
  if (options.base) {
    assertBaseFrom(ydoc, options.base);
    // Three-way: replay the writer's change on a copy of what they read, and
    // apply only that difference. Yjs merges it with everything since.
    const fork = new Y.Doc();
    Y.applyUpdate(fork, options.base);
    const before = Y.encodeStateVector(fork);
    applyMarkdownToYDoc(model, fork, markdown, { field: options.field });
    const change = Y.encodeStateAsUpdate(fork, before);
    fork.destroy();
    Y.applyUpdate(ydoc, change, options.origin);
    return { base: Y.encodeStateAsUpdate(ydoc) };
  }
  const fragment = ydoc.getXmlFragment(options.field ?? DEFAULT_FIELD);
  // The document as live editors hold it (heading ids, trailing paragraph),
  // so an agent's write never fights what every connected editor re-adds.
  const doc = model.document(markdown);
  ydoc.transact(() => {
    // Fresh binding metadata: diff by content, not by a previous mapping.
    updateYFragment(ydoc, fragment, doc, { mapping: new Map(), isOMark: new Map() });
  }, options.origin);
  return { base: Y.encodeStateAsUpdate(ydoc) };
}

/**
 * A `base` must be state this Y.Doc already has: everything in it, nothing
 * more. One from another copy of the document (a server rebuilt from saved
 * markdown, a different file) can't be merged: Yjs would hold the write as
 * unresolvable and hand that to every client.
 */
function assertBaseFrom(ydoc: Y.Doc, base: Uint8Array): void {
  let wanted: Map<number, number>;
  try {
    wanted = Y.decodeStateVector(Y.encodeStateVectorFromUpdate(base));
  } catch {
    throw new Error("[blintz] `base` is not a Yjs update; pass the `base` from readYDoc().");
  }
  const has = Y.decodeStateVector(Y.encodeStateVector(ydoc));
  for (const [client, clock] of wanted) {
    if ((has.get(client) ?? 0) < clock) {
      throw new Error(
        "[blintz] `base` was read from a different copy of this document (or a newer one). Read it again with readYDoc().",
      );
    }
  }
}

/** The markdown a Y.Doc holds, exactly as the editor would write it. */
export function yDocToMarkdown(model: MarkdownModel, ydoc: Y.Doc, options: Pick<YDocOptions, "field"> = {}): string {
  const fragment = ydoc.getXmlFragment(options.field ?? DEFAULT_FIELD);
  return model.serialize(yXmlFragmentToProseMirrorRootNode(fragment, model.schema));
}

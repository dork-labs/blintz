import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { DOCUMENT_RESET_META, isCollaboratorChange } from "blintz";
import type { Mappable } from "@milkdown/kit/prose/transform";

import { diffMap } from "./diff-map";

import {
  anchorFromRange,
  docText,
  locateAnchor,
  offsetAt,
  positionAt,
  type AnchorMatch,
  type CommentAnchor,
} from "./anchor";

/** A thread as the editor needs it: an id, where it is, and whether it's resolved. */
export interface CommentThreadRef {
  id: string;
  anchor: CommentAnchor;
  resolved?: boolean;
}

interface LiveRange {
  from: number;
  to: number;
  /** How confidently the thread was placed; kept as it follows edits. */
  match: AnchorMatch;
}

/**
 * Why a thread is orphaned: its anchor was never found (`missing`: retried
 * normally on every change, e.g. once the host's new document arrives), or
 * its words were deleted (`deleted`: retried only where the full stored
 * context reappears, e.g. on undo, so it never jumps to other words).
 */
export type OrphanKind = "missing" | "deleted";

export interface CommentsState {
  ranges: Map<string, LiveRange>;
  /** Threads whose text is gone or could not be found. */
  orphaned: Map<string, OrphanKind>;
  /** The anchor key each thread was located from, to notice a new anchor. */
  anchorKeys: Map<string, string>;
  /** The last anchor each thread was at, to find it again after a reset. */
  lastAnchors: Map<string, CommentAnchor>;
  /**
   * For a deleted thread, its words exactly as they were at the deletion.
   * Undo may restore that text or the older one (history groups quick edits),
   * so both this and `lastAnchors` are tried.
   */
  deletedAnchors: Map<string, CommentAnchor>;
  /** Where each deleted thread's words were, mapped through later edits. */
  deletedAt: Map<string, number>;
  decorations: DecorationSet;
}

export interface CommentsDisplay {
  threads: readonly CommentThreadRef[];
  activeThreadId?: string | null;
  showResolved?: boolean;
}

export const commentsKey = new PluginKey<CommentsState>("blintz-comments");

type Meta = { sync?: CommentsDisplay; remember?: Map<string, CommentAnchor> };

const anchorKey = (anchor: CommentAnchor) =>
  `${anchor.start}:${anchor.end}:${anchor.prefix}\u0000${anchor.quote}\u0000${anchor.suffix}`;

function locate(doc: Node, anchor: CommentAnchor, model = docText(doc)): LiveRange | null {
  return locateDetailed(doc, anchor, model);
}

function locateDetailed(
  doc: Node,
  anchor: CommentAnchor,
  model = docText(doc),
): (LiveRange & { context: number; fullContext: number }) | null {
  const found = locateAnchor(model, anchor);
  if (!found) return null;
  const from = positionAt(model, found.start, "start");
  const to = positionAt(model, found.end, "end");
  if (from === null || to === null || from >= to) return null;
  return { from, to, match: found.match, context: found.context, fullContext: found.fullContext };
}

function decorate(doc: Node, state: Omit<CommentsState, "decorations">, display: CommentsDisplay): DecorationSet {
  const decorations: Decoration[] = [];
  for (const thread of display.threads) {
    const range = state.ranges.get(thread.id);
    if (!range) continue;
    if (thread.resolved && !display.showResolved) continue;
    const classes = ["blintz-comment"];
    if (thread.resolved) classes.push("is-resolved");
    if (thread.id === display.activeThreadId) classes.push("is-active");
    decorations.push(
      Decoration.inline(
        range.from,
        range.to,
        { class: classes.join(" "), "data-comment-id": thread.id },
        { threadId: thread.id },
      ),
    );
  }
  return DecorationSet.create(doc, decorations);
}

function sync(previous: CommentsState, doc: Node, display: CommentsDisplay): CommentsState {
  const ranges = new Map<string, LiveRange>();
  const orphaned = new Map<string, OrphanKind>();
  const anchorKeys = new Map<string, string>();
  const lastAnchors = new Map<string, CommentAnchor>();
  let model: ReturnType<typeof docText> | undefined;
  for (const thread of display.threads) {
    const key = anchorKey(thread.anchor);
    anchorKeys.set(thread.id, key);
    lastAnchors.set(thread.id, previous.lastAnchors.get(thread.id) ?? thread.anchor);
    const live = previous.ranges.get(thread.id);
    // A thread already in the document stays where edits carried it; the
    // host's anchor is only used to find it (on first sight, or when the
    // host hands over a different anchor for an orphaned thread).
    if (live) {
      ranges.set(thread.id, live);
      continue;
    }
    const wasOrphaned = previous.orphaned.get(thread.id);
    if (wasOrphaned && previous.anchorKeys.get(thread.id) === key) {
      orphaned.set(thread.id, wasOrphaned);
      continue;
    }
    model ??= docText(doc);
    const found = locate(doc, thread.anchor, model);
    lastAnchors.set(thread.id, thread.anchor);
    if (found) ranges.set(thread.id, found);
    else orphaned.set(thread.id, "missing");
  }
  const keep = <T,>(map: Map<string, T>) => new Map([...map].filter(([id]) => orphaned.get(id) === "deleted"));
  const deletedAnchors = keep(previous.deletedAnchors);
  const deletedAt = keep(previous.deletedAt);
  const next = { ranges, orphaned, anchorKeys, lastAnchors, deletedAnchors, deletedAt };
  return { ...next, decorations: decorate(doc, next, display) };
}

/**
 * Whether the host replaced the document (a new `value`, as Blintz tags it).
 * Select-all and type looks identical step for step, so the step shape is
 * never used to decide this.
 */
function isHostReset(tr: Transaction): boolean {
  return tr.getMeta(DOCUMENT_RESET_META) === true;
}

/**
 * How positions move through a transaction. A collaborator's change arrives
 * as a whole-document replacement, so its own mapping would collapse every
 * thread; map through what actually differs instead, word by word, as if it
 * were ordinary edits (a remote deletion orphans, a remote undo restores, and
 * edits on both sides of a comment leave it alone).
 */
function mappingFor(tr: Transaction): { mapping: Mappable; exact: boolean } {
  return isCollaboratorChange(tr)
    ? (({ map, exact }) => ({ mapping: map, exact }))(diffMap(tr.before, tr.doc))
    : { mapping: tr.mapping, exact: true };
}

/**
 * A deleted thread comes back only where its words were: the anchor's quote
 * sits exactly at the (mapped) deletion point, with its full context. An
 * identical copy elsewhere never counts.
 */
function restoredAt(
  model: ReturnType<typeof docText>,
  anchor: CommentAnchor,
  pos: number | undefined,
): (LiveRange & { context: number; fullContext: number }) | null {
  if (pos === undefined) return null;
  const at = offsetAt(model, pos);
  const { text } = model;
  const { quote, prefix, suffix } = anchor;
  // Undo puts the words back at the deletion point; depending on how history
  // merged the steps, that point lands at their start or at their end.
  for (const start of [at, at - quote.length]) {
    if (start < 0 || text.slice(start, start + quote.length) !== quote) continue;
    const before = text.slice(Math.max(0, start - prefix.length), start);
    const after = text.slice(start + quote.length, start + quote.length + suffix.length);
    if (before !== prefix || after !== suffix) continue;
    const from = positionAt(model, start, "start");
    const to = positionAt(model, start + quote.length, "end");
    if (from === null || to === null || from >= to) continue;
    const fullContext = prefix.length + suffix.length;
    return { from, to, match: "exact", context: fullContext, fullContext };
  }
  return null;
}

/** A located range is good enough to re-attach a thread during editing. */
function enoughContext(found: LiveRange & { context: number; fullContext: number }, kind: OrphanKind): boolean {
  // Deleted words must come back with all their context (undo); a thread
  // never found needs at least half, so it can't grab freshly typed words.
  return kind === "deleted" ? found.context === found.fullContext : found.context * 2 >= found.fullContext;
}

function mapThrough(previous: CommentsState, tr: Transaction, display: CommentsDisplay): CommentsState {
  const ranges = new Map<string, LiveRange>();
  const orphaned = new Map(previous.orphaned);
  const lastAnchors = new Map(previous.lastAnchors);
  const deletedAnchors = new Map(previous.deletedAnchors);
  // Keep each deletion point on the spot where undo would put the words back.
  const { mapping, exact } = mappingFor(tr);
  const deletedAt = new Map([...previous.deletedAt].map(([id, pos]) => [id, mapping.map(pos, -1)]));
  const reset = isHostReset(tr);
  let model: ReturnType<typeof docText> | undefined;
  for (const [id, range] of previous.ranges) {
    // Typing at either edge does not extend a comment.
    const from = mapping.map(range.from, 1);
    const to = mapping.map(range.to, -1);
    if (from < to) {
      ranges.set(id, { from, to, match: range.match });
      continue;
    }
    if (reset) {
      // A different document arrived: find the words in it.
      const last = lastAnchors.get(id);
      model ??= docText(tr.doc);
      const found = last ? locateDetailed(tr.doc, last, model) : null;
      if (found) ranges.set(id, found);
      else orphaned.set(id, "missing");
      continue;
    }
    if (!exact) {
      // A collaborator's change too big to diff collapsed the range whether
      // or not its words survived: find them again only with all of their
      // current context, so deleted words never land on the same words in
      // another sentence.
      const fresh = anchorFromRange(tr.before, range.from, range.to);
      model ??= docText(tr.doc);
      const found = fresh ? locateDetailed(tr.doc, fresh, model) : null;
      if (found && enoughContext(found, "deleted")) {
        ranges.set(id, found);
        continue;
      }
    }
    // The user deleted the words. Remember them exactly as they were, with
    // their context right now, so undo can bring the thread back, and never
    // re-attach it to the same words elsewhere.
    const fresh = anchorFromRange(tr.before, range.from, range.to);
    if (fresh) deletedAnchors.set(id, fresh);
    deletedAt.set(id, from);
    orphaned.set(id, "deleted");
  }
  // Orphans get another chance on every change: anywhere their anchor fits
  // after a host reset; during editing only with enough of their context.
  // A deleted thread comes back at its deletion point, or, after a change
  // too big to diff (which loses that point), wherever all its context is.
  for (const [id, kind] of previous.orphaned) {
    const candidates = [deletedAnchors.get(id), lastAnchors.get(id)].filter(
      (anchor): anchor is CommentAnchor => anchor !== undefined,
    );
    model ??= docText(tr.doc);
    for (const anchor of candidates) {
      const found =
        kind === "deleted" && !reset && exact
          ? restoredAt(model, anchor, deletedAt.get(id))
          : locateDetailed(tr.doc, anchor, model);
      if (found && (reset || enoughContext(found, kind))) {
        ranges.set(id, found);
        orphaned.delete(id);
        deletedAnchors.delete(id);
        deletedAt.delete(id);
        break;
      }
    }
  }
  const next = { ...previous, ranges, orphaned, lastAnchors, deletedAnchors, deletedAt };
  return { ...next, decorations: decorate(tr.doc, next, display) };
}

export interface CommentsPluginOptions {
  /** The latest display settings (threads, active thread, resolved visibility). */
  display: () => CommentsDisplay;
  /** Clicks on highlighted text: every thread under the click, innermost first. */
  onClick?: (ids: string[]) => void;
  /** Called once the plugin has a view, and with `null` on teardown. */
  onView?: (view: EditorView | null) => void;
  /** Called after each state change, for host notifications. */
  onUpdate?: (view: EditorView, previous: EditorState) => void;
}

const EMPTY: CommentsState = {
  ranges: new Map(),
  orphaned: new Map(),
  anchorKeys: new Map(),
  lastAnchors: new Map(),
  deletedAnchors: new Map(),
  deletedAt: new Map(),
  decorations: DecorationSet.empty,
};

/**
 * Comments live beside the document, never in it: this plugin keeps each
 * thread's range in plugin state, maps it through every edit, and paints it
 * with decorations. The document, its markdown and its source mapping are
 * untouched.
 */
export function createCommentsPlugin(options: CommentsPluginOptions): Plugin<CommentsState> {
  return new Plugin<CommentsState>({
    key: commentsKey,
    state: {
      init: (_config, state) => sync(EMPTY, state.doc, options.display()),
      apply(tr, previous, _old, state) {
        const meta = tr.getMeta(commentsKey) as Meta | undefined;
        let next = tr.docChanged ? mapThrough(previous, tr, options.display()) : previous;
        if (meta?.sync) next = sync(next, state.doc, meta.sync);
        if (meta?.remember) {
          const lastAnchors = new Map(next.lastAnchors);
          for (const [id, anchor] of meta.remember) if (next.ranges.has(id)) lastAnchors.set(id, anchor);
          next = { ...next, lastAnchors };
        }
        return next;
      },
    },
    props: {
      decorations: (state) => commentsKey.getState(state)?.decorations,
      handleClick(view, pos) {
        const ids = threadsAt(view.state, pos);
        if (ids.length > 0) options.onClick?.(ids);
        return false;
      },
    },
    view(view) {
      options.onView?.(view);
      return {
        update: (updated, previous) => options.onUpdate?.(updated, previous),
        destroy: () => options.onView?.(null),
      };
    },
  });
}

/** Threads whose range covers `pos`, the shortest (innermost) first. */
export function threadsAt(state: EditorState, pos: number): string[] {
  const ranges = commentsKey.getState(state)?.ranges;
  if (!ranges) return [];
  return [...ranges]
    .filter(([, range]) => range.from <= pos && pos <= range.to)
    .sort(([, a], [, b]) => a.to - a.from - (b.to - b.from))
    .map(([id]) => id);
}

/** Fresh anchors for every live thread, from the current text. */
export function currentAnchors(state: EditorState): Map<string, CommentAnchor> {
  const plugin = commentsKey.getState(state);
  const anchors = new Map<string, CommentAnchor>();
  if (!plugin) return anchors;
  const model = docText(state.doc);
  for (const [id, range] of plugin.ranges) {
    const anchor = anchorFromRange(state.doc, range.from, range.to, model);
    if (anchor) anchors.set(id, anchor);
  }
  return anchors;
}

export { anchorKey };

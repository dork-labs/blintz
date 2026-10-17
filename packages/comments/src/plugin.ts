import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";

import {
  anchorFromRange,
  docText,
  locateAnchor,
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
  /** How the range was found on load (`"live"` once it has followed edits). */
  match: AnchorMatch | "live";
}

export interface CommentsState {
  ranges: Map<string, LiveRange>;
  /** Threads whose text is gone or could not be found. */
  orphaned: Set<string>;
  /** The anchor key each thread was located from, to notice a new anchor. */
  anchorKeys: Map<string, string>;
  /** The last anchor each thread was at, to find it again after a reset. */
  lastAnchors: Map<string, CommentAnchor>;
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
  const found = locateAnchor(model, anchor);
  if (!found) return null;
  const from = positionAt(model, found.start, "start");
  const to = positionAt(model, found.end, "end");
  if (from === null || to === null || from >= to) return null;
  return { from, to, match: found.match };
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
  const orphaned = new Set<string>();
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
    if (previous.orphaned.has(thread.id) && previous.anchorKeys.get(thread.id) === key) {
      orphaned.add(thread.id);
      continue;
    }
    model ??= docText(doc);
    const found = locate(doc, thread.anchor, model);
    if (found) {
      ranges.set(thread.id, found);
      lastAnchors.set(thread.id, thread.anchor);
    } else orphaned.add(thread.id);
  }
  const next = { ranges, orphaned, anchorKeys, lastAnchors };
  return { ...next, decorations: decorate(doc, next, display) };
}

function mapThrough(previous: CommentsState, tr: Transaction, display: CommentsDisplay): CommentsState {
  const ranges = new Map<string, LiveRange>();
  const orphaned = new Set(previous.orphaned);
  let model: ReturnType<typeof docText> | undefined;
  for (const [id, range] of previous.ranges) {
    // Typing at either edge does not extend a comment.
    const from = tr.mapping.map(range.from, 1);
    const to = tr.mapping.map(range.to, -1);
    if (from < to) {
      ranges.set(id, { from, to, match: "live" });
      continue;
    }
    // The text collapsed: a deletion, or the whole document replaced (a host
    // reset). Look for the last known text before calling it orphaned.
    const last = previous.lastAnchors.get(id);
    model ??= docText(tr.doc);
    const found = last ? locate(tr.doc, last, model) : null;
    if (found) ranges.set(id, found);
    else orphaned.add(id);
  }
  const next = { ...previous, ranges, orphaned };
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
  orphaned: new Set(),
  anchorKeys: new Map(),
  lastAnchors: new Map(),
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

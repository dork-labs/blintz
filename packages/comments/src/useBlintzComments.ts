import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import type { BlintzPlugin } from "blintz";

import { anchorFromRange, type AnchorMatch, type CommentAnchor } from "./anchor";
import {
  anchorKey,
  commentsKey,
  createCommentsPlugin,
  currentAnchors,
  threadsAt,
  type CommentThreadRef,
} from "./plugin";

export interface UseBlintzCommentsOptions {
  /** The document's threads, from your store. Reactive. */
  threads: readonly CommentThreadRef[];
  /** The thread to emphasize (e.g. the one open in your sidebar). */
  activeThreadId?: string | null;
  /** Show resolved threads' highlights (faintly). Defaults to `false`. */
  showResolved?: boolean;
  /** Clicked highlighted text: every thread under the click, innermost first. */
  onThreadClick?: (ids: string[]) => void;
  /**
   * Fresh anchors after the text around threads changed, a moment after
   * editing pauses. Save them so threads re-attach to the current text on the
   * next load.
   */
  onAnchorsChange?: (updates: Array<{ id: string; anchor: CommentAnchor }>) => void;
  /** Threads whose text was deleted or can't be found. Keep them; show them apart. */
  onOrphanedChange?: (ids: string[]) => void;
}

export interface BlintzComments {
  /** Pass in `<MarkdownEditor plugins={[comments.plugin]}>`. Stable. */
  plugin: BlintzPlugin;
  /** An anchor for the current selection, to create a thread; `null` if it covers no text. */
  anchorSelection(): CommentAnchor | null;
  /**
   * A thread's current document range (`[from, to)`, e.g. for `port.range()`)
   * and how confidently it was placed: `exact`, `moved`, `ambiguous` (worth
   * flagging), or `live` once it has followed edits. `null` if orphaned.
   */
  rangeOf(id: string): { from: number; to: number; match: AnchorMatch | "live" } | null;
  /** Threads at the caret, innermost first. */
  threadsAtSelection(): string[];
  /** Select a thread's text and scroll it into view. */
  reveal(id: string): boolean;
}

const ANCHOR_DEBOUNCE_MS = 600;

/**
 * Comments for a Blintz editor. You own the threads (storage, authors,
 * replies, UI); this hook owns where they sit in the text: it highlights
 * them, keeps them attached through edits, re-attaches them on load from
 * their anchors, and tells you when an anchor moved or a thread lost its text.
 */
export function useBlintzComments(options: UseBlintzCommentsOptions): BlintzComments {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const viewRef = useRef<EditorView | null>(null);
  const reported = useRef(new Map<string, string>());
  const orphanedReported = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const display = useCallback(() => {
    const { threads, activeThreadId, showResolved } = optionsRef.current;
    return { threads, activeThreadId, showResolved };
  }, []);

  const reportOrphans = useCallback((state: EditorState) => {
    const orphaned = [...(commentsKey.getState(state)?.orphaned.keys() ?? [])].sort();
    const key = orphaned.join("\u0000");
    if (key === orphanedReported.current) return;
    orphanedReported.current = key;
    optionsRef.current.onOrphanedChange?.(orphaned);
  }, []);

  const reportAnchors = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const anchors = currentAnchors(view.state);
    const stored = new Map(optionsRef.current.threads.map((thread) => [thread.id, anchorKey(thread.anchor)]));
    const updates: Array<{ id: string; anchor: CommentAnchor }> = [];
    for (const [id, anchor] of anchors) {
      const key = anchorKey(anchor);
      // Compare with what the host last heard: our last report, else its own.
      if (key === (reported.current.get(id) ?? stored.get(id))) continue;
      reported.current.set(id, key);
      updates.push({ id, anchor });
    }
    view.dispatch(view.state.tr.setMeta(commentsKey, { remember: anchors }).setMeta("addToHistory", false));
    if (updates.length > 0) optionsRef.current.onAnchorsChange?.(updates);
  }, []);

  const plugin = useMemo<BlintzPlugin>(
    () =>
      Object.assign(({ editor }: Parameters<BlintzPlugin>[0]) => {
        editor.use(
          $prose(() =>
            createCommentsPlugin({
              display,
              onClick: (ids) => optionsRef.current.onThreadClick?.(ids),
              onView: (view) => {
                viewRef.current = view;
                if (view) queueMicrotask(() => reportOrphans(view.state));
              },
              onUpdate: (view, previous) => {
                reportOrphans(view.state);
                if (view.state.doc !== previous.doc) {
                  clearTimeout(timer.current);
                  timer.current = setTimeout(reportAnchors, ANCHOR_DEBOUNCE_MS);
                }
              },
            }),
          ),
        );
      }, { preservesSourceMapping: true } as const),
    [display, reportAnchors, reportOrphans],
  );

  // Re-sync whenever the host's threads or display settings change.
  const { threads, activeThreadId, showResolved } = options;
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(
      view.state.tr
        .setMeta(commentsKey, { sync: { threads, activeThreadId, showResolved } })
        .setMeta("addToHistory", false),
    );
  }, [threads, activeThreadId, showResolved]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return useMemo<BlintzComments>(
    () => ({
      plugin,
      anchorSelection() {
        const view = viewRef.current;
        if (!view) return null;
        const { from, to, empty } = view.state.selection;
        return empty ? null : anchorFromRange(view.state.doc, from, to);
      },
      rangeOf(id) {
        const range = viewRef.current && commentsKey.getState(viewRef.current.state)?.ranges.get(id);
        return range ? { from: range.from, to: range.to, match: range.match } : null;
      },
      threadsAtSelection() {
        const view = viewRef.current;
        return view ? threadsAt(view.state, view.state.selection.from) : [];
      },
      reveal(id) {
        const view = viewRef.current;
        const range = view && commentsKey.getState(view.state)?.ranges.get(id);
        if (!view || !range) return false;
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)).scrollIntoView(),
        );
        view.focus();
        return true;
      },
    }),
    [plugin],
  );
}

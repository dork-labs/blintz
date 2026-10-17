import { Plugin, PluginKey, type EditorState, type PluginView } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** The `[[` query being typed, if any: the range from `[[` to the caret. */
export interface WikiLinkQuery {
  /** Position of the first `[` (or the `!` of `![[`). */
  from: number;
  /** The caret. */
  to: number;
  query: string;
  embed: boolean;
}

interface MenuState {
  query: WikiLinkQuery | null;
  /** The `from` the user dismissed with Escape; stays closed until it changes. */
  dismissed: number | null;
}

export const wikiLinkMenuKey = new PluginKey<MenuState>("blintz-wiki-link-menu");

const OPEN = /(!?)\[\[([^[\]\r\n|#\ufffc]*)$/;

function findQuery(state: EditorState): WikiLinkQuery | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $pos = selection.$from;
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return null;
  if ($pos.marks().some((mark) => mark.type.spec.code)) return null;
  const before = $pos.parent.textBetween(
    Math.max(0, $pos.parentOffset - 200),
    $pos.parentOffset,
    undefined,
    "￼",
  );
  const match = OPEN.exec(before);
  if (!match) return null;
  return {
    from: $pos.pos - match[0].length,
    to: $pos.pos,
    query: match[2]!,
    embed: match[1] === "!",
  };
}

/** Tracks an in-progress `[[query` for the suggestion menu. */
export function wikiLinkMenuPlugin(
  view?: (editorView: EditorView) => PluginView,
): Plugin<MenuState> {
  return new Plugin<MenuState>({
    key: wikiLinkMenuKey,
    view,
    state: {
      init: () => ({ query: null, dismissed: null }),
      apply(tr, previous, _old, state) {
        const query = findQuery(state);
        const dismiss = (tr.getMeta(wikiLinkMenuKey) as { dismiss?: boolean } | undefined)?.dismiss;
        // Keep a dismissal attached to its `[[` while text moves around it.
        let dismissed =
          previous.dismissed === null ? null : tr.mapping.map(previous.dismissed);
        if (dismiss) dismissed = query?.from ?? null;
        else if (!query || query.from !== dismissed) dismissed = null;
        return { query: query && query.from !== dismissed ? query : null, dismissed };
      },
    },
  });
}

export function readMenuQuery(state: EditorState): WikiLinkQuery | null {
  return wikiLinkMenuKey.getState(state)?.query ?? null;
}

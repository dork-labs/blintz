import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { usePluginViewContext } from "@prosemirror-adapter/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cx } from "../../shared/cx";
import { useEditorEditable } from "../../shared/editor-ctx";
import { useWikiLinks, type WikiLinkSuggestion } from "./options";
import { readMenuQuery, wikiLinkMenuKey } from "./menu-plugin";
import { wikiLinkId } from "./schema";
import { isWritableWikiLink } from "./grammar";

/**
 * The `[[` suggestion menu. Open while the caret sits after an unclosed
 * `[[query` and the host passed `wikiLinks.search`; choosing a suggestion
 * replaces `[[query` with a wiki link to it. Arrow keys move, Enter or Tab
 * chooses, Escape closes it until the caret leaves this `[[`.
 */
export function WikiLinkMenu() {
  const { view } = usePluginViewContext();
  const editable = useEditorEditable(view);
  const focused = useEditorFocus(view);
  const { options } = useWikiLinks();
  const search = options.search;
  const query = editable && focused && search ? readMenuQuery(view.state) : null;
  const queryKey = query ? `${query.from}\u0000${query.query}` : null;

  const [results, setResults] = useState<{ key: string; items: WikiLinkSuggestion[] } | null>(null);
  const [active, setActive] = useState(0);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query || !search || queryKey === null) return;
    let live = true;
    Promise.resolve()
      .then(() => search(query.query))
      .then(
        (items) => {
          if (live) setResults({ key: queryKey, items: (items ?? []).slice(0, 50) });
        },
        () => {
          if (live) setResults({ key: queryKey, items: [] });
        },
      );
    return () => {
      live = false;
    };
    // `query` is derived from `queryKey`.
  }, [queryKey, search]);

  const items = results && query && results.key === queryKey ? results.items : [];
  const open = !!query && items.length > 0;

  useEffect(() => setActive(0), [queryKey]);

  const choose = useCallback(
    (suggestion: WikiLinkSuggestion) => {
      // Re-read the query now: the document may have moved since the render.
      const at = readMenuQuery(view.state);
      if (!at) return;
      const link = { target: suggestion.target, heading: null, label: null, embed: at.embed };
      if (!isWritableWikiLink(link)) return;
      const type = view.state.schema.nodes[wikiLinkId];
      if (!type) return;
      const tr = view.state.tr.replaceWith(at.from, at.to, type.create(link));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
    [view],
  );

  // Capture-phase window listener while open, so the keys never reach the
  // editor's own keymap (see SlashMenu for why stopPropagation matters).
  const latest = useRef({ items, active, query });
  latest.current = { items, active, query };
  useEffect(() => {
    if (!open) return;
    const onKeydown = (event: KeyboardEvent) => {
      const { items, active, query } = latest.current;
      // Only keys aimed at this editor: never another input, or another
      // editor's open menu.
      if (!query || !view.hasFocus()) return;
      const owned = ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key);
      if (!owned || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowDown") setActive((active + 1) % items.length);
      else if (event.key === "ArrowUp") setActive((active - 1 + items.length) % items.length);
      else if (event.key === "Escape") view.dispatch(view.state.tr.setMeta(wikiLinkMenuKey, { dismiss: true }));
      else choose(items[active]!);
    };
    window.addEventListener("keydown", onKeydown, { capture: true });
    return () => window.removeEventListener("keydown", onKeydown, { capture: true });
  }, [open, choose, view]);

  useLayoutEffect(() => {
    const element = host.current;
    if (!open || !element || !query) return;
    let coords: { left: number; right: number; top: number; bottom: number };
    try {
      coords = view.coordsAtPos(query.from);
    } catch {
      return; // No layout (e.g. a detached or hidden editor): keep the last position.
    }
    const reference = {
      getBoundingClientRect: () =>
        new DOMRect(coords.left, coords.top, Math.max(1, coords.right - coords.left), coords.bottom - coords.top),
    };
    void computePosition(reference, element, {
      placement: "bottom-start",
      strategy: "fixed",
      middleware: [offset(6), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    });
  });

  return (
    <div
      ref={host}
      className="blintz-wiki-link-menu"
      data-show={open ? "true" : "false"}
      role="listbox"
      aria-label="Link to page"
      onMouseDown={(event) => event.preventDefault()}
    >
      {open &&
        items.map((item, index) => (
          <div
            key={`${item.target}\u0000${index}`}
            role="option"
            aria-selected={index === active}
            className={cx("blintz-wiki-link-option", index === active && "is-active")}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(item)}
          >
            <span className="blintz-wiki-link-option-title">{item.title ?? item.target}</span>
            {item.description && (
              <span className="blintz-wiki-link-option-description">{item.description}</span>
            )}
          </div>
        ))}
    </div>
  );
}

/** Whether the editor has focus, re-rendering on focus changes (which are not transactions). */
function useEditorFocus(view: import("@milkdown/kit/prose/view").EditorView): boolean {
  return useSyncExternalStore(
    (notify) => {
      view.dom.addEventListener("focusin", notify);
      view.dom.addEventListener("focusout", notify);
      return () => {
        view.dom.removeEventListener("focusin", notify);
        view.dom.removeEventListener("focusout", notify);
      };
    },
    () => view.hasFocus(),
    () => false,
  );
}

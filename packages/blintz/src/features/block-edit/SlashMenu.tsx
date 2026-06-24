import type { PointerEvent as ReactPointerEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Icon } from "../../shared/Icon";
import { useEditorCtx } from "../../shared/editor-ctx";
import { getGroups } from "./menu-config";
import { menuAPI, slashStoreCtx } from "./slices";
import type { SlashMenuSnapshot, SlashMenuStore } from "./store";

const EMPTY_SNAPSHOT: SlashMenuSnapshot = { show: false, filter: "" };
// Belt-and-suspenders: the real store is set in `configureMenu` before this view
// ever mounts, but a no-op keeps the hooks unconditional if it somehow isn't.
const FALLBACK_STORE: SlashMenuStore = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY_SNAPSHOT,
  set: () => {},
};

/**
 * React port of Crepe's Vue `Menu` (`block-edit/menu/component.tsx`): the slash
 * command palette — group tabs over a scrollable list of grouped, filterable
 * items, with full keyboard navigation.
 *
 * State split mirrors Crepe's: `show`/`filter` come from the external store (the
 * `SlashProvider` in `plugins.ts` writes them — see `store.ts`), read here via
 * `useSyncExternalStore`; `hoverIndex` is local. `getGroups` is reused verbatim
 * and rebuilt on every filter change (it mutates `index`/`range` onto the items,
 * so it must not be memoized-then-mutated). Show/hide + positioning belong to the
 * provider (toggling the host's `data-show`); the CSS hides it when false.
 */
export function SlashMenu() {
  const ctx = useEditorCtx();
  const store = ctx.get(slashStoreCtx.key) ?? FALLBACK_STORE;
  const { show, filter } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  const { groups, size } = useMemo(() => getGroups(filter), [filter]);

  const [hoverIndex, setHoverIndex] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const prevMouseRef = useRef({ x: -999, y: -999 });

  // Kept fresh each render so the stable window-keydown handler reads current values.
  const hoverIndexRef = useRef(hoverIndex);
  hoverIndexRef.current = hoverIndex;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const hide = useCallback(() => ctx.get(menuAPI.key).hide(), [ctx]);

  const scrollToIndex = useCallback((index: number) => {
    const host = hostRef.current;
    const target = host?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    const scrollRoot = host?.querySelector<HTMLElement>(".menu-groups");
    if (!target || !scrollRoot) return;
    scrollRoot.scrollTop = target.offsetTop - scrollRoot.offsetTop;
  }, []);

  const onHover = useCallback(
    (
      index: number | ((prev: number) => number),
      after?: (index: number) => void,
    ) => {
      const prev = hoverIndexRef.current;
      const next = typeof index === "function" ? index(prev) : index;
      after?.(next);
      setHoverIndex(next);
    },
    [],
  );

  const runByIndex = useCallback(
    (index: number) => {
      const item = groupsRef.current.flatMap((group) => group.items).at(index);
      if (item?.onRun) item.onRun(ctx);
      hide();
    },
    [ctx, hide],
  );

  const onKeydown = useCallback(
    (e: KeyboardEvent) => {
      const size = sizeRef.current;
      const groups = groupsRef.current;

      // While the menu is open these keys belong to it. `stopPropagation` is
      // essential, not just `preventDefault`: ProseMirror's keymap runs from a
      // bubble-phase listener on the editor DOM, so without stopping the event
      // an arrow ALSO moves the editor caret — which re-runs `shouldShow`, hides
      // the menu, and tears down this very listener mid-navigation (the "Up
      // stops working at the bottom of the list" bug). Only intercept the keys
      // we own; everything else (typing to filter) must reach the editor.
      const owned =
        e.key === "Escape" ||
        e.key === "Enter" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight";
      if (!owned) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        hide();
        return;
      }
      if (e.key === "ArrowDown") {
        onHover((index) => (index < size - 1 ? index + 1 : index), scrollToIndex);
        return;
      }
      if (e.key === "ArrowUp") {
        onHover((index) => (index <= 0 ? index : index - 1), scrollToIndex);
        return;
      }
      if (e.key === "ArrowLeft") {
        onHover((index) => {
          const group = groups.find(
            (group) => group.range[0] <= index && group.range[1] > index,
          );
          if (!group) return index;
          const prevGroup = groups[groups.indexOf(group) - 1];
          if (!prevGroup) return index;
          return prevGroup.range[1] - 1;
        }, scrollToIndex);
        return;
      }
      if (e.key === "ArrowRight") {
        onHover((index) => {
          const group = groups.find(
            (group) => group.range[0] <= index && group.range[1] > index,
          );
          if (!group) return index;
          const nextGroup = groups[groups.indexOf(group) + 1];
          if (!nextGroup) return index;
          return nextGroup.range[0];
        }, scrollToIndex);
        return;
      }
      if (e.key === "Enter") {
        runByIndex(hoverIndexRef.current);
      }
    },
    [hide, onHover, runByIndex, scrollToIndex],
  );

  // Capture-phase window listener, only while shown — cleaned up on hide/unmount
  // so it never hijacks the editor's arrow keys (Crepe's watchEffect + onUnmounted).
  useEffect(() => {
    if (!show) return;
    window.addEventListener("keydown", onKeydown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeydown, { capture: true });
  }, [show, onKeydown]);

  // Auto-hide when filtering empties the menu; clamp a stale hover (Crepe's watch).
  useEffect(() => {
    if (size === 0 && show) hide();
    else if (hoverIndex >= size) setHoverIndex(0);
  }, [size, show, hoverIndex, hide]);

  const onPointerMove = (e: ReactPointerEvent) => {
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const getOnPointerEnter = (index: number) => (e: ReactPointerEvent) => {
    const prev = prevMouseRef.current;
    // Ignore the synthetic enter fired while scrolling (cursor hasn't moved).
    if (e.clientX === prev.x && e.clientY === prev.y) return;
    onHover(index);
  };

  return (
    <div ref={hostRef} onPointerDown={(e) => e.preventDefault()}>
      <nav className="tab-group">
        <ul>
          {groups.map((group) => (
            <li
              key={group.key}
              onPointerDown={() => onHover(group.range[0], scrollToIndex)}
              className={
                hoverIndex >= group.range[0] && hoverIndex < group.range[1]
                  ? "selected"
                  : ""
              }
            >
              {group.label}
            </li>
          ))}
        </ul>
      </nav>
      <div className="menu-groups" onPointerMove={onPointerMove}>
        {groups.map((group) => (
          <div key={group.key} className="menu-group">
            <h6>{group.label}</h6>
            <ul>
              {group.items.map((item) => (
                <li
                  key={item.key}
                  data-index={item.index}
                  className={hoverIndex === item.index ? "hover" : ""}
                  onPointerEnter={getOnPointerEnter(item.index)}
                  onPointerDown={() => {
                    hostRef.current
                      ?.querySelector(`[data-index="${item.index}"]`)
                      ?.classList.add("active");
                  }}
                  onPointerUp={() => {
                    hostRef.current
                      ?.querySelector(`[data-index="${item.index}"]`)
                      ?.classList.remove("active");
                    runByIndex(item.index);
                  }}
                >
                  <Icon icon={item.icon} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

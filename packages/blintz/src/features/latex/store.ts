/**
 * The inline-math edit tooltip's reactive state, lifted out of React so the
 * (non-React) plugin-view closure can drive it — the same closure→React bridge
 * the link tooltips use (`link-tooltip/store.ts`).
 *
 * Crepe mounted a Vue component fed `ref`s holding a nested ProseMirror editor +
 * an `updateValue` callback. We keep the user-facing behavior (a small popover
 * with an editable LaTeX field + a confirm button) but, as elsewhere, drive a
 * plain React component from a snapshot store rather than a second nested editor.
 *
 * `getSnapshot` returns a stable reference until `set` replaces it, so
 * `useSyncExternalStore` never loops.
 */

interface Store<T> {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => T;
  set: (next: T) => void;
}

function createStore<T>(initial: T): Store<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
    set: (next) => {
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

/** What the inline-math edit popover renders: the LaTeX source seed plus a
 * confirm callback closed over the node's position. `token` bumps each time a
 * different math node is targeted, so the controlled input re-seeds (Crepe
 * re-created its nested editor on each show). */
export interface LatexInlineEditSnapshot {
  value: string;
  token: number;
  onConfirm: (value: string) => void;
}

export type LatexInlineEditStore = Store<LatexInlineEditSnapshot>;

export function createLatexInlineEditStore(): LatexInlineEditStore {
  return createStore<LatexInlineEditSnapshot>({
    value: "",
    token: 0,
    onConfirm: () => {},
  });
}

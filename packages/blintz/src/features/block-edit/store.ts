/**
 * The slash menu's reactive state, lifted out of React so the (non-React)
 * plugin-view closure can drive it.
 *
 * Why: in Crepe the `SlashProvider`'s `shouldShow` writes `filter` and `onShow/
 * onHide` write `show` as Vue refs. Our `SlashProvider` lives in the plugin-view
 * closure (mirroring the toolbar), which can't call React `setState`. So the
 * closure writes here and the React `SlashMenu` reads via `useSyncExternalStore`
 * — a tiny external store is the clean closure→React bridge. The store object is
 * published on a Milkdown `$ctx` slice (see `plugins.ts`) so the component finds
 * it through the editor `Ctx` it already has, with no prop threading.
 *
 * `getSnapshot` returns a stable reference until a value actually changes, so
 * `useSyncExternalStore` won't loop.
 */
export interface SlashMenuSnapshot {
  show: boolean;
  filter: string;
}

export interface SlashMenuStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => SlashMenuSnapshot;
  /** Closure-side writer; no-ops (no notify) when nothing changed. */
  set: (patch: Partial<SlashMenuSnapshot>) => void;
}

export function createSlashMenuStore(): SlashMenuStore {
  let snapshot: SlashMenuSnapshot = { show: false, filter: "" };
  const listeners = new Set<() => void>();

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
    set: (patch) => {
      const next = { ...snapshot, ...patch };
      if (next.show === snapshot.show && next.filter === snapshot.filter)
        return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

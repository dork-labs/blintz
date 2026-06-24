/**
 * The link tooltips' reactive state, lifted out of React so the (non-React)
 * plugin-view closures can drive it — the same closure→React bridge the slash
 * menu uses (see `block-edit/store.ts`).
 *
 * Crepe's Vue views passed per-show data and callbacks into the mounted
 * component as Vue `ref`s (`src`, `onEdit`, `onRemove` / `src`, `onConfirm`,
 * `onCancel`). Our views live in the plugin-view closure (like the toolbar's
 * `TooltipProvider`) and can't call React `setState`, so each closure writes a
 * snapshot here and the React `LinkPreview` / `LinkEdit` read it via
 * `useSyncExternalStore`. The store is published on a `$ctx` slice (see
 * `slices.ts`) so the components reach it through the editor `Ctx` they hold.
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

/** What the preview tooltip renders: the href plus the edit/remove actions for
 * the currently-hovered link (callbacks close over its mark + range, mirroring
 * Crepe's `#onEdit`/`#onRemove` refs). */
export interface LinkPreviewSnapshot {
  href: string;
  onEdit: () => void;
  onRemove: () => void;
}

export type LinkPreviewStore = Store<LinkPreviewSnapshot>;

export function createLinkPreviewStore(): LinkPreviewStore {
  return createStore<LinkPreviewSnapshot>({
    href: "",
    onEdit: () => {},
    onRemove: () => {},
  });
}

/** What the edit tooltip renders: the input's seed value plus confirm/cancel.
 * `token` bumps on every enter-edit so the input re-seeds even when the same
 * href is edited twice (Crepe re-seeded via a Vue `watch(src)`). */
export interface LinkEditSnapshot {
  src: string;
  token: number;
  onConfirm: (href: string) => void;
  onCancel: () => void;
}

export type LinkEditStore = Store<LinkEditSnapshot>;

export function createLinkEditStore(): LinkEditStore {
  return createStore<LinkEditSnapshot>({
    src: "",
    token: 0,
    onConfirm: () => {},
    onCancel: () => {},
  });
}

import { $ctx } from "@milkdown/kit/utils";

import type { SlashMenuStore } from "./store";

/**
 * Cross-component bridges, published as Milkdown `$ctx` slices so the React view
 * components reach them through the editor `Ctx` they already hold (via
 * `useEditorCtx`) — no prop threading across the adapter's portal boundary. The
 * plugin-view closures in `plugins.ts` fill these; the components read them.
 *
 * They live here (not in `plugins.ts`) only to break the import cycle: the
 * components import the slices, and `plugins.ts` imports the components.
 */

/** Imperative menu control — Crepe's `menuAPI`. The "+" handle calls `show(pos)`. */
export interface MenuAPI {
  show: (pos: number) => void;
  hide: () => void;
}

export const menuAPI = $ctx(
  { show: () => {}, hide: () => {} } as MenuAPI,
  "crepeMenuAPICtx",
);

/** The block handle's "+" action (insert paragraph + open menu), bound in the closure. */
export interface BlockHandleAPI {
  onAdd: () => void;
}

export const blockHandleAPI = $ctx(
  { onAdd: () => {} } as BlockHandleAPI,
  "crepeBlockHandleAPICtx",
);

/** The slash menu's reactive `{ show, filter }` store (closure writes, component reads). */
export const slashStoreCtx = $ctx(
  null as SlashMenuStore | null,
  "crepeSlashStoreCtx",
);

import type { Mark } from "@milkdown/kit/prose/model";
import { $ctx } from "@milkdown/kit/utils";

import {
  confirmIcon,
  copyIcon,
  editIcon,
  removeIcon,
} from "../../icons";
import type { LinkEditStore, LinkPreviewStore } from "./store";

/**
 * The link-tooltip engine's ctx slices, re-implemented locally (verbatim port of
 * `@milkdown/components/link-tooltip/slices.ts`). We re-create them rather than
 * import from `@milkdown/kit/component/link-tooltip` because that package
 * compiles to a single bundle with `import { ... } from "vue"` at the top — the
 * pure slices and the Vue components share one file, so importing any of them
 * risks dragging Vue into the bundle. These are tiny + pure, so owning them
 * keeps the build provably Vue-free.
 */

/** Whether the (mutually exclusive) preview or edit tooltip is the active one. */
export interface LinkTooltipState {
  mode: "preview" | "edit";
}

export const linkTooltipState = $ctx(
  { mode: "preview" } as LinkTooltipState,
  "crepeLinkTooltipStateCtx",
);

/** Imperative entry points the `toggleLinkCommand` + the preview's edit/remove
 * buttons call; wired to the edit view in `plugins.ts`. */
export interface LinkTooltipAPI {
  addLink: (from: number, to: number) => void;
  editLink: (mark: Mark, from: number, to: number) => void;
  removeLink: (from: number, to: number) => void;
}

export const linkTooltipAPI = $ctx(
  {
    addLink: () => {},
    editLink: () => {},
    removeLink: () => {},
  } as LinkTooltipAPI,
  "crepeLinkTooltipAPICtx",
);

/** Icons + placeholder + copy callback. Defaults to Crepe's own icons (the
 * preview's link button copies, so its icon is `copyIcon`). */
export interface LinkTooltipConfig {
  linkIcon: string;
  editButton: string;
  removeButton: string;
  confirmButton: string;
  inputPlaceholder: string;
  onCopyLink: (link: string) => void;
}

export const linkTooltipConfig = $ctx(
  {
    linkIcon: copyIcon,
    editButton: editIcon,
    removeButton: removeIcon,
    confirmButton: confirmIcon,
    inputPlaceholder: "Paste link...",
    onCopyLink: () => {},
  } as LinkTooltipConfig,
  "crepeLinkTooltipConfigCtx",
);

/** Publishers for the closure→React stores (filled in `plugins.ts`, read by the
 * components via `useEditorCtx`) — same pattern as `slashStoreCtx`. */
export const linkPreviewStoreCtx = $ctx(
  null as LinkPreviewStore | null,
  "crepeLinkPreviewStoreCtx",
);

export const linkEditStoreCtx = $ctx(
  null as LinkEditStore | null,
  "crepeLinkEditStoreCtx",
);

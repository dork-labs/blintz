import { $ctx } from "@milkdown/kit/utils";

import type { LatexInlineEditStore } from "./store";

/** Publisher for the closure→React store (filled in `plugins.ts`, read by
 * `LatexInlineEdit` via `useEditorCtx`) — same pattern as `linkEditStoreCtx`. */
export const latexInlineEditStoreCtx = $ctx(
  null as LatexInlineEditStore | null,
  "crepeLatexInlineEditStoreCtx",
);

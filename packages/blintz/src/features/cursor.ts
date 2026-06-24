import type { Editor } from "@milkdown/kit/core";
import {
  cursor as cursorPlugin,
  dropIndicatorConfig,
} from "@milkdown/kit/plugin/cursor";
import { $prose } from "@milkdown/kit/utils";
import { createVirtualCursor } from "prosemirror-virtual-cursor";

/**
 * cursor — drop indicator + gap cursor + virtual caret. 100% engine, zero React
 * UI (a `$prose` plugin + CSS). Mirrors Crepe's `feature/cursor/index.ts`; only
 * the `crepeFeatureConfig` flag plumbing (Crepe-internal) is dropped.
 */
export function cursorFeature(editor: Editor): void {
  editor
    .config((ctx) => {
      ctx.update(dropIndicatorConfig.key, () => ({
        class: "crepe-drop-cursor",
        width: 4,
        color: false as const,
      }));
    })
    .use(cursorPlugin)
    .use($prose(() => createVirtualCursor()));
}

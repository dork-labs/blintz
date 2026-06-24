import { $ctx } from "@milkdown/kit/utils";

/**
 * The table-block config slice, re-implemented locally (port of
 * `@milkdown/components/table-block/config.ts`). We re-create it rather than
 * import from `@milkdown/kit/component/table-block` because that package compiles
 * to a single bundle with `import { ... } from "vue"` at the top — the pure
 * config and the Vue NodeView share ONE file, so importing *any* export drags Vue
 * into the build. Owning this tiny pure piece keeps the bundle provably Vue-free,
 * exactly like the code-block / image-block / link-tooltip features.
 *
 * `renderButton` maps a render slot to an inline-SVG icon string; the feature's
 * `.config()` (see `index.ts`) overrides it with the Crepe icon set.
 */

export type RenderType =
  | "add_row"
  | "add_col"
  | "delete_row"
  | "delete_col"
  | "align_col_left"
  | "align_col_center"
  | "align_col_right"
  | "col_drag_handle"
  | "row_drag_handle";

export interface TableBlockConfig {
  renderButton: (renderType: RenderType) => string;
}

export const defaultTableBlockConfig: TableBlockConfig = {
  renderButton: (renderType) => {
    switch (renderType) {
      case "add_row":
        return "+";
      case "add_col":
        return "+";
      case "delete_row":
        return "-";
      case "delete_col":
        return "-";
      case "align_col_left":
        return "left";
      case "align_col_center":
        return "center";
      case "align_col_right":
        return "right";
      case "col_drag_handle":
        return "=";
      case "row_drag_handle":
        return "=";
    }
  },
};

export const tableBlockConfig = $ctx(
  { ...defaultTableBlockConfig },
  "tableBlockConfigCtx",
);

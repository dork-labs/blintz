import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { findParent } from "@milkdown/kit/prose";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { tableSchema } from "@milkdown/kit/preset/gfm";
import { $view } from "@milkdown/kit/utils";
import type { useNodeViewFactory } from "@prosemirror-adapter/react";

import {
  alignCenterIcon,
  alignLeftIcon,
  alignRightIcon,
  colDragHandleIcon,
  plusIcon,
  removeIcon,
  rowDragHandleIcon,
} from "../../icons";
import { TableView } from "./TableView";
import { tableBlockConfig } from "./config";

type NodeViewFactory = ReturnType<typeof useNodeViewFactory>;

/**
 * table — Crepe's table-editing UI rebuilt Vue-free. Registers a React node view
 * on the GFM `table` node (`@milkdown/kit/preset/gfm` `tableSchema`, already on
 * the editor via `.use(gfm)`) + the local `tableBlockConfig` slice, and overrides
 * `renderButton` with the Crepe icon set.
 *
 * We deliberately do NOT import `@milkdown/kit/component/table-block` (a single
 * bundle with `import {...} from "vue"` — importing any export drags Vue in);
 * every pure piece (config/operation/pointer/utils + the node view) is owned
 * locally, mirroring the code-block / image-block / link-tooltip features.
 *
 * Ships: column popover (align left/center/right + delete-col), row popover
 * (delete-row), add-row/add-col line handles, click-to-select-cell, the floating
 * handle positioning, AND drag-to-reorder (the col/row handles are `draggable`;
 * dragstart carries a `.drag-preview` clone, dragover shows a line drop
 * indicator, drop dispatches gfm's `moveCol/RowCommand` — see `drag.ts`).
 *
 * Markdown round-trip: the `table` node + its GFM serializer are unchanged; we
 * only swap the *view*, so a `| --- |` GFM table round-trips intact. Reordering
 * mutates the doc through the standard gfm move commands, so the serialized
 * markdown reflects the new row/column order with no schema change.
 */
export function tableFeature(
  editor: Editor,
  nodeViewFactory: NodeViewFactory,
): void {
  // Click-to-select-cell — ported from `table-block/view/view.ts` `#handleClick`.
  // Lives in `stopEvent` (on the node view, not the React component) so PM's own
  // selection handling is bypassed when we set a cell NodeSelection ourselves.
  const handleCellClick = (view: EditorView, event: PointerEvent): boolean => {
    if (!view.editable) return false;

    const { state, dispatch } = view;
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!pos) return false;

    const $pos = state.doc.resolve(pos.inside);
    const node = findParent(
      (n) => n.type.name === "table_cell" || n.type.name === "table_header",
    )($pos);
    if (!node) return false;

    // If a text selection is already inside this same cell, leave it (let the
    // user place the caret / edit text normally).
    if (state.selection instanceof TextSelection) {
      const currentNode = findParent(
        (n) => n.type.name === "table_cell" || n.type.name === "table_header",
      )(state.selection.$from);
      if (currentNode?.node === node.node) return false;
    }

    const { from } = node;
    const selection = NodeSelection.create(state.doc, from + 1);
    if (state.selection.eq(selection)) return false;

    if (state.selection instanceof CellSelection) {
      setTimeout(() => {
        dispatch(state.tr.setSelection(selection).scrollIntoView());
      }, 20);
    } else {
      requestAnimationFrame(() => {
        dispatch(state.tr.setSelection(selection).scrollIntoView());
      });
    }
    return true;
  };

  const tableView = $view(tableSchema.node, (ctx) =>
    nodeViewFactory({
      component: TableView,
      // The `.milkdown-table-block` host; the React component renders the chrome
      // + the `<table class="children">` into it.
      as: () => {
        const el = document.createElement("div");
        el.className = "milkdown-table-block";
        return el;
      },
      // The `<tbody>` is PM's contentDOM (the cells); the component appends it
      // into its `<table class="children">` via the adapter's `contentRef`.
      contentAs: "tbody",
      // PM must ignore drag/drop + our chrome's pointer interactions; on a
      // cell-targeted mousedown/pointerdown we set a cell NodeSelection ourselves.
      stopEvent: (e) => {
        if (e.type === "drop" || e.type.startsWith("drag")) return true;

        if (e.type === "mousedown" || e.type === "pointerdown") {
          if (e.target instanceof Element && e.target.closest("button"))
            return true;

          const target = e.target;
          if (
            target instanceof HTMLElement &&
            (target.closest("th") || target.closest("td"))
          ) {
            return handleCellClick(
              ctx.get(editorViewCtx),
              e as PointerEvent,
            );
          }
        }

        return false;
      },
    }),
  );

  editor
    .config((ctx) => {
      ctx.update(tableBlockConfig.key, (defaultConfig) => ({
        ...defaultConfig,
        renderButton: (renderType) => {
          switch (renderType) {
            case "add_row":
              return plusIcon;
            case "add_col":
              return plusIcon;
            case "delete_row":
              return removeIcon;
            case "delete_col":
              return removeIcon;
            case "align_col_left":
              return alignLeftIcon;
            case "align_col_center":
              return alignCenterIcon;
            case "align_col_right":
              return alignRightIcon;
            case "col_drag_handle":
              return colDragHandleIcon;
            case "row_drag_handle":
              return rowDragHandleIcon;
          }
        },
      }));
    })
    .use(tableBlockConfig)
    .use(tableView);
}

import type { Editor } from "@milkdown/kit/core";
import { listItemSchema } from "@milkdown/kit/preset/commonmark";
import { $view } from "@milkdown/kit/utils";
import type { useNodeViewFactory } from "@prosemirror-adapter/react";

import { ListItemView } from "./ListItemView";
import { orderedListLabelSync } from "./sync-order";

type NodeViewFactory = ReturnType<typeof useNodeViewFactory>;

/**
 * list-item — registers the React node view against the commonmark/gfm
 * `list_item` schema via `$view` (framework-agnostic) + the adapter's
 * `nodeViewFactory`. The schema/commands/keymap (Enter/Tab/Backspace) and the
 * `checked` attr come from `.use(commonmark)`/`.use(gfm)` already on the editor;
 * we deliberately do NOT `.use(listItemBlockComponent)` (that pulls Crepe's Vue
 * view).
 */
export function listItemFeature(
  editor: Editor,
  nodeViewFactory: NodeViewFactory,
): void {
  const listItemView = $view(listItemSchema.node, () =>
    nodeViewFactory({
      component: ListItemView,
      // Host element (Crepe's `<div class="milkdown-list-item-block">`); the
      // component renders the inner `<li>` into it.
      as: () => {
        const el = document.createElement("div");
        el.className = "milkdown-list-item-block";
        return el;
      },
      contentAs: "div",
      stopEvent: () => false,
    }),
  );
  // The node view renders the number from `node.attrs.label`; this keeps that
  // label correct after drag-reorders (which the built-in sync skips). See
  // sync-order.ts.
  editor.use(listItemView).use(orderedListLabelSync);
}

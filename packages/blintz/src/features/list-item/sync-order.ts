import {
  listItemSchema,
  orderedListSchema,
} from "@milkdown/kit/preset/commonmark";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

/**
 * Keep ordered-list item `label` attrs in sync with their position.
 *
 * commonmark already ships `syncListOrderPlugin`, but it bails on any
 * transaction carrying meta — `tr.isGeneric` is false whenever `tr.meta` is
 * non-empty. ProseMirror's **native drag-and-drop dispatches the move with a
 * `uiEvent: "drop"` meta**, so the built-in sync skips it and the visible numbers
 * go stale after a block-handle reorder (e.g. dragging item 2 above item 1 leaves
 * it labelled "2."). The markdown still renumbers correctly — remark renumbers
 * ordered lists on serialize regardless of `label` — which is why it's a
 * view-only drift, but it's exactly what the user sees.
 *
 * This complements the built-in: on any doc-changing transaction it recomputes
 * ordered-list labels and fixes mismatches (driving a node-view re-render). It is
 * **idempotent** — on generic transactions the built-in plugin has already fixed
 * the labels, so this finds nothing to change and returns null, which also makes
 * it self-terminating (its own `addToHistory: false` fix, re-fed to
 * `appendTransaction`, finds the labels already correct). Handles nested ordered
 * lists too, since `descendants` recurses into them.
 */
export const orderedListLabelSync = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey("MARKDOWN_EDITOR_ORDERED_LIST_LABEL_SYNC"),
      appendTransaction: (_trs, oldState, newState) => {
        if (oldState.doc.eq(newState.doc)) return null;

        const orderedListType = orderedListSchema.type(ctx);
        const listItemType = listItemSchema.type(ctx);
        let tr = newState.tr;
        let changed = false;

        newState.doc.descendants((node, pos) => {
          if (node.type !== orderedListType) return;
          const start = (node.attrs.order as number | undefined) ?? 1;
          node.forEach((child, offset, index) => {
            if (child.type !== listItemType) return;
            const expected = `${index + start}.`;
            if (child.attrs.label !== expected) {
              // setNodeMarkup is attrs-only (node size unchanged), so sibling
              // positions don't shift — safe to batch in one transaction.
              tr = tr.setNodeMarkup(pos + 1 + offset, undefined, {
                ...child.attrs,
                label: expected,
                listType: "ordered",
              });
              changed = true;
            }
          });
        });

        return changed ? tr.setMeta("addToHistory", false) : null;
      },
    }),
);

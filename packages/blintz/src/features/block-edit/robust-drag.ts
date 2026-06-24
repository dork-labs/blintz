import { Fragment, Slice } from "@milkdown/kit/prose/model";
import { NodeSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { canJoin } from "@milkdown/kit/prose/transform";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const LIST_TYPES = new Set(["bullet_list", "ordered_list"]);

/**
 * Make the "::" block-handle drag-reorder of **list items** behave.
 *
 * Two cooperating problems with the reused `BlockService`
 * (`@milkdown/kit/plugin/block`), both rooted in how it starts a move:
 * `view.dragging = { slice: nodeSelection.content(), move: true }` — a **bare
 * `list_item` slice**, and **no `node`**. ProseMirror's native drop
 * (`prosemirror-view` `handleDrop`) then:
 *
 *   1. **Deletes the wrong block.** With no `dragging.node`, the move branch
 *      runs `tr.deleteSelection()` — it removes whatever the *current selection*
 *      is at drop time, not the block that was picked up. That selection can
 *      DRIFT (most reproducibly when you re-grab a handle right after a drag,
 *      since the React node views have just re-rendered), so the dragged block
 *      gets **duplicated** and an ordered list visibly mis-numbers + splits.
 *
 *   2. **Wrong-types an ejected list item.** A bare `list_item` slice has
 *      `openStart == openEnd == 0`, so on drop it's inserted verbatim. Dropped
 *      *inside* a list it fits fine, but dropped at a **doc-level** position
 *      (e.g. onto a blank paragraph above the list, or the trailing paragraph
 *      below it) a `list_item` isn't valid there, so PM's fitter wraps it — and
 *      it always picks `bullet_list` (the schema's first list type). An ordered
 *      item dragged "to the top" becomes a stray `* item` bullet split off the
 *      list. (This is the `* Banana` / `1. Apple / 2. Cherry` corruption.)
 *
 * Fixes (engine-only `$prose`, no React; applies to every draggable block):
 *
 *   - **`dragstart` (view):** stamp the source `NodeSelection` onto
 *     `view.dragging.node` so the drop takes the robust `node.replace(tr)`
 *     branch (deletes the *tracked* node, by the position captured at
 *     drag-start) instead of the drift-prone `deleteSelection()`. And when the
 *     dragged node is a `list_item`, replace the bare slice with its **parent
 *     list (type + attrs) wrapping the item, open on both ends** — so the drop
 *     fits as a list item *inside* a target list (reorder) and, when it lands at
 *     doc level, materializes as a list of the **same type** rather than a
 *     wrong-type bullet. Non-list blocks keep their bare-node slice (Crepe
 *     behavior, which already works).
 *
 *   - **`appendTransaction` (merge):** an item ejected just past its list's edge
 *     lands as a separate same-type list directly adjacent to the original. On a
 *     drop (`uiEvent === "drop"`) only, join directly-adjacent same-type lists —
 *     turning "dropped below the list" into a clean append to the list's end.
 *     Gated to drops so it never mutates a freshly-loaded doc (two intentionally
 *     separate same-type lists are only joined by an explicit drag, preserving
 *     markdown round-trip on load); lists separated by any block stay separate.
 */
export const robustBlockDragMove = $prose(
  () =>
    new Plugin({
      key: new PluginKey("MARKDOWN_EDITOR_ROBUST_BLOCK_DRAG"),
      view: (editorView: EditorView) => {
        const onDragStart = () => {
          // PM's runtime `Dragging` carries a `node`, but its public type omits
          // it — hence the cast to read/write it.
          const dragging = editorView.dragging as
            | (NonNullable<EditorView["dragging"]> & { node?: NodeSelection })
            | null;
          // Only a block-move that hasn't already got a tracked node.
          if (!dragging || dragging.node) return;
          const { selection } = editorView.state;
          if (!(selection instanceof NodeSelection)) return;

          let slice = dragging.slice;
          const node = selection.node;
          if (node.type.name === "list_item") {
            const parentList = selection.$from.parent;
            if (LIST_TYPES.has(parentList.type.name)) {
              // Wrap the item in its own list type (open both ends): fits as a
              // list item when dropped inside a list, and as a same-type list
              // when dropped at doc level — never a wrong-type bullet.
              const wrapped = parentList.type.create(
                parentList.attrs,
                Fragment.from(node),
              );
              slice = new Slice(Fragment.from(wrapped), 1, 1);
            }
          }

          editorView.dragging = {
            ...dragging,
            slice,
            node: selection,
          } as EditorView["dragging"];
        };

        document.addEventListener("dragstart", onDragStart);
        return {
          destroy: () => document.removeEventListener("dragstart", onDragStart),
        };
      },
      appendTransaction: (
        transactions: readonly Transaction[],
        _oldState: EditorState,
        newState: EditorState,
      ) => {
        if (!transactions.some((tr) => tr.getMeta("uiEvent") === "drop"))
          return null;

        const tr = newState.tr;
        let joined = false;
        // Re-scan after each join (positions shift); join the first adjacent
        // same-type list pair until none remain.
        for (;;) {
          let boundary: number | null = null;
          tr.doc.descendants((node, pos, parent, index) => {
            if (boundary !== null) return false;
            if (!parent || !LIST_TYPES.has(node.type.name)) return true;
            const next =
              index + 1 < parent.childCount ? parent.child(index + 1) : null;
            if (next && next.type === node.type) {
              const at = pos + node.nodeSize;
              if (canJoin(tr.doc, at)) {
                boundary = at;
                return false;
              }
            }
            return true;
          });
          if (boundary === null) break;
          tr.join(boundary);
          joined = true;
        }

        return joined ? tr : null;
      },
    }),
);

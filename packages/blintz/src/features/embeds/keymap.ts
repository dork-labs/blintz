import { keymap } from "@milkdown/kit/prose/keymap";
import type { ResolvedPos } from "@milkdown/kit/prose/model";
import { NodeSelection, type Command } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { embedContainerId } from "./schema";

/**
 * A container embed behaves like a blockquote (Enter on an empty last line
 * leaves it), except at its edges: Backspace at its very start, or Delete
 * just before it, would lift its content out and silently drop the directive
 * with its name and attributes. Those keys select the container instead, so
 * a second press removes it deliberately.
 */
export const embedContainerKeymap = $prose(() =>
  keymap({ Backspace: selectContainerBefore, Delete: selectContainerAfter }),
);

const selectContainerBefore: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parentOffset !== 0) return false;
  for (let depth = $from.depth - 1; depth > 0; depth--) {
    if ($from.index(depth) !== 0) return false;
    if ($from.node(depth).type.name === embedContainerId) {
      dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, $from.before(depth))));
      return true;
    }
  }
  return false;
};

const selectContainerAfter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  const next = nextBlockAfter($from);
  if (next?.node.type.name !== embedContainerId) return false;
  dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, next.pos)));
  return true;
};

/** The block that follows the caret's textblock, climbing out of last children. */
function nextBlockAfter($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const after = $pos.after(depth);
    const node = $pos.doc.resolve(after).nodeAfter;
    if (node) return { node, pos: after };
  }
  return null;
}

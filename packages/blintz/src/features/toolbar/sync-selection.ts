import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Commit the browser's visible text range before focus moves into a toolbar.
 * Native Shift+Arrow selectionchange delivery can lag behind the focus event;
 * mapping the live DOM range through ProseMirror's public API avoids applying
 * formatting to the previous range. Selections outside this editor are ignored. */
export function syncToolbarSelection(view: EditorView): void {
  const selection = view.dom.ownerDocument.getSelection();
  if (!view.editable || !selection || selection.isCollapsed) return;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  if (
    !anchorNode ||
    !focusNode ||
    !view.dom.contains(anchorNode) ||
    !view.dom.contains(focusNode)
  )
    return;
  const anchor = view.posAtDOM(anchorNode, anchorOffset);
  const head = view.posAtDOM(focusNode, focusOffset);
  const next = TextSelection.between(
    view.state.doc.resolve(anchor),
    view.state.doc.resolve(head),
  );
  if (!next.eq(view.state.selection))
    view.dispatch(view.state.tr.setSelection(next));
}

import { findNodeInSelection } from "@milkdown/kit/prose";
import type { Node } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { $command } from "@milkdown/kit/utils";

import { mathInlineSchema } from "./schema";

/**
 * Toggle inline math over the current selection — verbatim port of Crepe's
 * `latex/command.ts` (pure, no Vue). With no math node in the selection it wraps
 * the selected text into a `math_inline` atom (value = the text); when the
 * selection already contains one it unwraps it back to its source text.
 */
export const toggleLatexCommand = $command("ToggleLatex", (ctx) => {
  return () => (state, dispatch) => {
    const {
      hasNode: hasLatex,
      pos: latexPos,
      target: latexNode,
    } = findNodeInSelection(state, mathInlineSchema.type(ctx));

    const { selection, doc, tr } = state;
    if (!hasLatex) {
      const text = doc.textBetween(selection.from, selection.to);
      const _tr = tr.replaceSelectionWith(
        mathInlineSchema.type(ctx).create({ value: text }),
      );
      if (dispatch) {
        dispatch(
          _tr.setSelection(NodeSelection.create(_tr.doc, selection.from)),
        );
      }
      return true;
    }

    const { from, to } = selection;
    if (!latexNode || latexPos < 0) return false;

    let _tr = tr.delete(latexPos, latexPos + 1);
    const content = (latexNode as Node).attrs.value as string;
    _tr = _tr.insertText(content, latexPos);
    if (dispatch) {
      dispatch(
        _tr.setSelection(
          TextSelection.create(_tr.doc, from, to + content.length - 1),
        ),
      );
    }
    return true;
  };
});

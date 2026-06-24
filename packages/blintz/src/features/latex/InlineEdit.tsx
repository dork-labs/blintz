import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { confirmIcon } from "../../icons";
import { Icon } from "../../shared/Icon";
import { useEditorCtx } from "../../shared/editor-ctx";
import { latexInlineEditStoreCtx } from "./slices";
import type { LatexInlineEditSnapshot, LatexInlineEditStore } from "./store";

const EMPTY: LatexInlineEditSnapshot = {
  value: "",
  token: 0,
  onConfirm: () => {},
};
const FALLBACK_STORE: LatexInlineEditStore = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY,
  set: () => {},
};

/**
 * The inline-math edit popover — React rebuild of Crepe's Vue `LatexTooltip`
 * (`latex/inline-tooltip/component.tsx`). Crepe embedded a nested ProseMirror
 * editor for the LaTeX source; we use a plain input (consistent with the link
 * edit tooltip), preserving the UX — type the LaTeX, hit Enter or the confirm
 * button, the inline atom re-renders.
 *
 * The seed value + confirm come from the external store the plugin-view closure
 * writes when a `math_inline` node is selected; `token` bumps when a *different*
 * node is targeted so the controlled input re-seeds. Keydown is
 * `stopPropagation`'d so ProseMirror's keymap doesn't capture the typing.
 */
export function LatexInlineEdit() {
  const ctx = useEditorCtx();
  const store = ctx.get(latexInlineEditStoreCtx.key) ?? FALLBACK_STORE;
  const { value, token, onConfirm } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  const [text, setText] = useState(value);
  // Re-seed only when a new node is targeted (token bump), not on every parent
  // transaction — so confirming (which re-runs the selection test) won't clobber
  // what the user just typed.
  useEffect(() => setText(value), [token, value]);

  const confirm = () => onConfirm(text);

  const onKeydown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    }
  };

  const onConfirmPointerDown = (e: ReactPointerEvent) => {
    // Keep the input focused (don't let the press blur it before confirm runs).
    e.preventDefault();
    confirm();
  };

  return (
    <div className="container">
      <input
        className="latex-input"
        placeholder="Enter LaTeX..."
        value={text}
        onKeyDown={onKeydown}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className="button" onPointerDown={onConfirmPointerDown}>
        <Icon icon={confirmIcon} />
      </button>
    </div>
  );
}

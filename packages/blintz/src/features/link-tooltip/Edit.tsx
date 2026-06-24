import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Icon } from "../../shared/Icon";
import { useEditorCtx } from "../../shared/editor-ctx";
import { linkEditStoreCtx, linkTooltipConfig } from "./slices";
import type { LinkEditSnapshot, LinkEditStore } from "./store";

const EMPTY: LinkEditSnapshot = {
  src: "",
  token: 0,
  onConfirm: () => {},
  onCancel: () => {},
};
const FALLBACK_STORE: LinkEditStore = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY,
  set: () => {},
};

/**
 * React port of Crepe's Vue `EditLink` (`link-tooltip/edit/component.tsx`): an
 * input to set/replace a link's href plus a confirm button (shown only once the
 * input is non-empty, mirroring Crepe).
 *
 * The seed value + confirm/cancel come from the external store the edit
 * plugin-view closure writes; `token` bumps each enter-edit so the controlled
 * input re-seeds even when the same href is edited again (Crepe used a Vue
 * `watch(src)`). Keydown is `stopPropagation`'d so ProseMirror's keymap doesn't
 * capture the typing; Enter confirms, Escape cancels.
 */
export function LinkEdit() {
  const ctx = useEditorCtx();
  const store = ctx.get(linkEditStoreCtx.key) ?? FALLBACK_STORE;
  const { src, token, onConfirm, onCancel } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const config = ctx.get(linkTooltipConfig.key);

  const [value, setValue] = useState(src);
  // Re-seed whenever edit mode is (re-)entered, keyed on the per-show token.
  useEffect(() => setValue(src), [token, src]);

  const confirm = () => onConfirm(value);

  const onKeydown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const onConfirmPointerDown = (e: ReactPointerEvent) => {
    // Keep the input focused (don't let the press blur it before confirm runs).
    e.preventDefault();
    confirm();
  };

  return (
    <div className="link-edit">
      <input
        className="input-area"
        placeholder={config.inputPlaceholder}
        value={value}
        onKeyDown={onKeydown}
        onChange={(e) => setValue(e.target.value)}
      />
      {value ? (
        <Icon
          className="button confirm"
          icon={config.confirmButton}
          onPointerDown={onConfirmPointerDown}
        />
      ) : null}
    </div>
  );
}

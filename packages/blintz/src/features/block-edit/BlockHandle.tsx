import { useRef } from "react";

import { Icon } from "../../shared/Icon";
import { useEditorCtx } from "../../shared/editor-ctx";
import { menuIcon, plusIcon } from "../../icons";
import { blockHandleAPI } from "./slices";

/**
 * React port of Crepe's Vue `BlockHandle` (`block-edit/handle/component.tsx`):
 * the floating control to the left of the hovered block — a "+" add button and
 * a "::" drag handle.
 *
 * Positioning, show/hide and draggability are the engine's job: the
 * `BlockProvider` (see `plugins.ts`) appends this component's host, positions it
 * via floating-ui, toggles `data-show`, and sets `draggable = true` so the
 * `BlockService` can HTML5-drag the block to reorder it. This component only
 * renders the two buttons.
 *
 * The "+" runs `blockHandleAPI.onAdd` (bound in the closure, where the provider's
 * active block lives) and **stops pointer propagation** so pressing it never
 * starts a drag. The drag handle deliberately does NOT stop propagation — its
 * pointer events must reach the host the `BlockService` is dragging.
 */
export function BlockHandle() {
  const ctx = useEditorCtx();
  const addButtonRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        ref={addButtonRef}
        className="operation-item"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          addButtonRef.current?.classList.add("active");
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          addButtonRef.current?.classList.remove("active");
          ctx.get(blockHandleAPI.key).onAdd();
        }}
      >
        <Icon icon={plusIcon} />
      </div>
      <div className="operation-item">
        <Icon icon={menuIcon} />
      </div>
    </>
  );
}

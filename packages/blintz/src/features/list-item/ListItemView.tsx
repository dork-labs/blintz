import { useEditorEditable } from "../../shared/editor-ctx";
import { useNodeViewContext } from "@prosemirror-adapter/react";

import { Icon } from "../../shared/Icon";
import { cx } from "../../shared/cx";
import { renderListItemLabel } from "./render-label";

/**
 * React node view for `list_item` — the smallest node view, proving
 * `useNodeViewFactory` + `contentRef` + the checkbox toggle. Replaces Crepe's
 * Vue `ListItem` (`components/list-item-block/component.tsx`).
 *
 * The factory creates the semantic `<li>`; this renders its custom marker
 * and editable children. `contentRef` hosts the item's paragraph/children (PM's contentDOM).
 */
export function ListItemView() {
  const { node, view, getPos, selected, contentRef } = useNodeViewContext();
  const { label, checked, listType } = node.attrs as {
    label: string;
    checked: boolean | null;
    listType: string;
  };
  const readonly = !useEditorEditable(view);

  const toggleChecked = () => {
    if (!view.editable) return;
    const pos = getPos();
    if (pos == null) return;
    view.dispatch(view.state.tr.setNodeAttribute(pos, "checked", !checked));
  };

  const labelClass =
    checked == null
      ? listType === "bullet"
        ? "bullet"
        : "ordered"
      : checked
        ? "checked"
        : "unchecked";

  return (
    <div
      className={cx(
        "milkdown-list-item-content",
        selected && "ProseMirror-selectednode",
      )}
    >
      {checked == null ? (
        <span
          className="label-wrapper"
          contentEditable={false}
          aria-hidden="true"
        >
          <Icon
            className={cx("label", labelClass)}
            icon={renderListItemLabel({ label, listType, checked })}
          />
        </span>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={node.textContent || "Task"}
          disabled={readonly}
          className="label-wrapper task-checkbox"
          contentEditable={false}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleChecked();
          }}
        >
          <Icon
            className={cx("label", labelClass)}
            icon={renderListItemLabel({ label, listType, checked })}
          />
        </button>
      )}
      <div className="children" ref={contentRef} />
    </div>
  );
}

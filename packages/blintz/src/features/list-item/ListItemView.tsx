import { useNodeViewContext } from "@prosemirror-adapter/react";

import { Icon } from "../../shared/Icon";
import { cx } from "../../shared/cx";
import { renderListItemLabel } from "./render-label";

/**
 * React node view for `list_item` — the smallest node view, proving
 * `useNodeViewFactory` + `contentRef` + the checkbox toggle. Replaces Crepe's
 * Vue `ListItem` (`components/list-item-block/component.tsx`).
 *
 * The host `<div class="milkdown-list-item-block">` is created by the factory's
 * `as` option; this renders the inner `<li>` with the label and the editable
 * children. `contentRef` hosts the item's paragraph/children (PM's contentDOM).
 */
export function ListItemView() {
  const { node, view, getPos, selected, contentRef } = useNodeViewContext();
  const { label, checked, listType } = node.attrs as {
    label: string;
    checked: boolean | null;
    listType: string;
  };
  const readonly = !view.editable;

  const toggleChecked = () => {
    if (!view.editable) return;
    const pos = getPos();
    if (pos == null) return;
    if (!view.hasFocus()) view.focus();
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
    <li className={cx("list-item", selected && "ProseMirror-selectednode")}>
      <div
        className="label-wrapper"
        contentEditable={false}
        onPointerDown={(e) => {
          // Toggle only on checkboxes; keep the editor selection intact.
          e.preventDefault();
          e.stopPropagation();
          if (checked != null) toggleChecked();
        }}
      >
        <Icon
          className={cx("label", readonly && "readonly", labelClass)}
          icon={renderListItemLabel({ label, listType, checked, readonly })}
        />
      </div>
      <div className="children" ref={contentRef} />
    </li>
  );
}

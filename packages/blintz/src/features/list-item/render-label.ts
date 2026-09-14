import { checkBoxCheckedIcon, checkBoxUncheckedIcon } from "../../icons";

interface RenderLabelProps {
  label: string;
  listType: string;
  checked?: boolean | null;
  readonly?: boolean;
}

/**
 * The leading label for a list item, ported from Crepe's `renderLabel`
 * (`feature/list-item/index.ts`): a filled-circle SVG for bullets, the number
 * text for ordered items, and a checked/unchecked checkbox SVG for todo items.
 * Pure function of the node's attrs — no ctx — so the React view calls it
 * directly instead of round-tripping through the `listItemBlockConfig` slice.
 */
export function renderListItemLabel({
  label,
  listType,
  checked,
}: RenderLabelProps): string {
  if (checked == null) {
    if (listType === "bullet")
      return '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="2.5" /></svg>';
    return label;
  }
  if (checked) return checkBoxCheckedIcon;
  return checkBoxUncheckedIcon;
}

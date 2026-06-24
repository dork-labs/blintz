import { Fragment, useMemo } from "react";
import { EditorStatus, editorCtx } from "@milkdown/kit/core";
import { usePluginViewContext } from "@prosemirror-adapter/react";

import { Icon } from "../../shared/Icon";
import { cx } from "../../shared/cx";
import { useEditorCtx } from "../../shared/editor-ctx";
import { buildToolbarGroups } from "./config";

/**
 * React port of Crepe's Vue `Toolbar` (`feature/toolbar/component.tsx`): a flat
 * row of `toolbar-item` buttons grouped by purpose, joined by dividers, each
 * reflecting whether its mark is active on the selection.
 *
 * Reactivity: Crepe drove active-state refresh from a Vue `shallowRef(selection)`.
 * Here, reading `usePluginViewContext()` subscribes this component to the
 * adapter's per-update context refresh, so a selection change re-renders the
 * toolbar and `item.active(ctx)` recomputes. Positioning + show/hide stay with
 * the reused `TooltipProvider` (see `plugin.ts`).
 */
export function Toolbar() {
  // Subscribe to the plugin-view context so each editor update re-renders us.
  usePluginViewContext();
  const ctx = useEditorCtx();
  const groups = useMemo(() => buildToolbarGroups(), []);

  // Calling commands before the editor is Created throws (Crepe guards the same).
  if (ctx.get(editorCtx).status !== EditorStatus.Created) return null;

  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group.key}>
          {index > 0 && <div className="divider" />}
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cx("toolbar-item", item.active(ctx) && "active")}
              // Pointerdown + preventDefault so the editor selection survives.
              onPointerDown={(e) => {
                e.preventDefault();
                item.onRun?.(ctx);
              }}
            >
              <Icon icon={item.icon} />
            </button>
          ))}
        </Fragment>
      ))}
    </>
  );
}

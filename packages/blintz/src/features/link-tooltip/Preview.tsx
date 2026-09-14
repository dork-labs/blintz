import type { MouseEvent as ReactPointerEvent } from "react";
import { useSyncExternalStore } from "react";

import { Icon } from "../../shared/Icon";
import { useEditorCtx } from "../../shared/editor-ctx";
import { linkPreviewStoreCtx, linkTooltipConfig } from "./slices";
import type { LinkPreviewSnapshot, LinkPreviewStore } from "./store";

const EMPTY: LinkPreviewSnapshot = {
  href: "",
  onEdit: () => {},
  onRemove: () => {},
};
// Belt-and-suspenders: the real store is published in `configureLinkPreview`
// before this view ever mounts, but a no-op keeps the hooks unconditional.
const FALLBACK_STORE: LinkPreviewStore = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY,
  set: () => {},
};

/**
 * React port of Crepe's Vue `PreviewLink` (`link-tooltip/preview/component.tsx`):
 * the hover popover over a link — a copy button (the link icon), the URL as a
 * clickable `<a target="_blank">`, and edit / remove buttons.
 *
 * The href + edit/remove actions come from the external store the preview's
 * plugin-view closure writes (see `store.ts` / `plugins.ts`); config (icons +
 * the copy callback) is read from the editor `Ctx`. Positioning + show/hide
 * belong to the reused `TooltipProvider`, which toggles the host's `data-show`.
 */
export function LinkPreview() {
  const ctx = useEditorCtx();
  const store = ctx.get(linkPreviewStoreCtx.key) ?? FALLBACK_STORE;
  const { href, onEdit, onRemove } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const config = ctx.get(linkTooltipConfig.key);

  // Pointerdown (not click) + preventDefault so the editor selection survives,
  // matching Crepe's Vue `Icon` onClick→onPointerdown binding.
  const onCopy = (e: ReactPointerEvent) => {
    e.preventDefault();
    if (navigator.clipboard && href) {
      navigator.clipboard
        .writeText(href)
        .then(() => config.onCopyLink(href))
        .catch((err) => console.error(err));
    }
  };
  const onClickEdit = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit();
  };
  const onClickRemove = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  };

  return (
    <div className="link-preview">
      <button
        type="button"
        className="button link-icon"
        aria-label="Copy link"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onCopy}
      >
        <Icon icon={config.linkIcon} />
      </button>
      <a href={href} target="_blank" rel="noreferrer" className="link-display">
        {href}
      </a>
      <button
        type="button"
        className="button link-edit-button"
        aria-label="Edit link"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onClickEdit}
      >
        <Icon icon={config.editButton} />
      </button>
      <button
        type="button"
        className="button link-remove-button"
        aria-label="Remove link"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onClickRemove}
      >
        <Icon icon={config.removeButton} />
      </button>
    </div>
  );
}

import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { TooltipProvider } from "@milkdown/kit/plugin/tooltip";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { posToDOMRect } from "@milkdown/kit/prose";
import type { Mark } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { usePluginViewFactory } from "@prosemirror-adapter/react";

import { sanitize } from "../../shared/sanitize";
import { LinkEdit } from "./Edit";
import { LinkPreview } from "./Preview";
import { toggleLinkCommand } from "./command";
import {
  linkEditStoreCtx,
  linkPreviewStoreCtx,
  linkTooltipAPI,
  linkTooltipConfig,
  linkTooltipState,
} from "./slices";
import { createLinkEditStore, createLinkPreviewStore } from "./store";
import { linkEditTooltip, linkPreviewTooltip } from "./tooltips";
import { findMarkPosition, shouldShowPreviewWhenHover } from "./utils";

type PluginViewFactory = ReturnType<typeof usePluginViewFactory>;

/** Trailing-edge debounce (Crepe uses lodash-es; this avoids the direct dep). */
function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const DELAY = 50;

/**
 * Preview tooltip (the hover popover). React port of Crepe's `LinkPreviewTooltip`
 * (`link-tooltip/preview/preview-view.ts` + `preview-configure.ts`): the reused
 * `TooltipProvider` does positioning + `data-show`, the adapter renders
 * `<LinkPreview>` into the same host, and a debounced `mousemove` (registered as
 * the tooltip's `handleDOMEvents` props) drives `show`/`hide`. Returns the
 * preview's `hide` so the edit view can dismiss it when edit mode opens.
 */
function configureLinkPreview(
  ctx: Ctx,
  pluginViewFactory: PluginViewFactory,
): { hide: () => void } {
  const store = createLinkPreviewStore();
  ctx.set(linkPreviewStoreCtx.key, store);

  let provider: TooltipProvider | undefined;
  let host: HTMLElement | undefined;
  let editorView: EditorView | undefined;
  let hovering = false;

  // Idempotent host (see the toolbar): the adapter calls `root` more than once
  // and the same element is the provider's `content`.
  const getHost = () => {
    if (!host) {
      host = document.createElement("div");
      host.className = "milkdown-link-preview";
      host.dataset.show = "false";
    }
    return host;
  };

  const onMouseEnter = () => {
    hovering = true;
  };
  const onMouseLeave = () => {
    hovering = false;
  };

  const doHide = () => {
    provider?.hide();
    provider?.element.removeEventListener("mouseenter", onMouseEnter);
    provider?.element.removeEventListener("mouseleave", onMouseLeave);
  };

  // Keep the popover open while the pointer is over it (the hover-bridge).
  const hide = () => {
    if (hovering) return;
    doHide();
  };

  const show = (mark: Mark, from: number, to: number, rect: DOMRect) => {
    if (!provider || !editorView) return;
    store.set({
      href: mark.attrs.href as string,
      onEdit: () => ctx.get(linkTooltipAPI.key).editLink(mark, from, to),
      onRemove: () => {
        ctx.get(linkTooltipAPI.key).removeLink(from, to);
        doHide();
      },
    });
    provider.show({ getBoundingClientRect: () => rect }, editorView);
    provider.element.addEventListener("mouseenter", onMouseEnter);
    provider.element.addEventListener("mouseleave", onMouseLeave);
  };

  // Mount the React component, then create the TooltipProvider eagerly at
  // view-creation (mirroring Crepe's `LinkPreviewTooltip` constructor) so the
  // popover is live on load — a hover before the first transaction still finds a
  // provider. Visibility is driven by hover, not `shouldShow`, so we must NOT
  // re-pump `provider.update` on each txn (that would hide a shown popover).
  const factoryView = pluginViewFactory({
    component: LinkPreview,
    root: () => getHost(),
  });
  const view = (pmView: EditorView) => {
    const inner = factoryView(pmView);
    editorView = pmView;
    provider = new TooltipProvider({
      content: getHost(),
      debounce: 0,
      shouldShow: () => false,
    });
    provider.update(pmView);
    return {
      update: (v: EditorView, prev: EditorState) => {
        editorView = v;
        inner.update?.(v, prev);
      },
      destroy: () => {
        doHide();
        inner.destroy?.();
        provider?.destroy();
        provider = undefined;
        host = undefined;
        editorView = undefined;
      },
    };
  };

  const onMouseMove = debounce((v: EditorView, event: MouseEvent) => {
    if (!provider) return;
    if (!v.hasFocus()) return;
    if (ctx.get(linkTooltipState.key).mode === "edit") return;

    const result = shouldShowPreviewWhenHover(ctx, v, event);
    if (result) {
      const position = v.state.doc.resolve(result.pos);
      const markPosition = findMarkPosition(
        result.mark,
        result.node,
        v.state.doc,
        position.before(),
        position.after(),
      );
      const from = markPosition.start;
      const to = markPosition.end;
      show(result.mark, from, to, posToDOMRect(v, from, to));
      return;
    }
    hide();
  }, DELAY);

  const onMouseLeaveDom = () => {
    setTimeout(() => hide(), DELAY);
  };

  ctx.set(linkPreviewTooltip.key, {
    props: {
      handleDOMEvents: {
        mousemove: onMouseMove,
        mouseleave: onMouseLeaveDom,
      },
    },
    view,
  });

  return { hide: doHide };
}

/**
 * Edit tooltip (set/replace the href). React port of Crepe's `LinkEditTooltip`
 * (`link-tooltip/edit/edit-view.ts` + `edit-configure.ts`): the reused
 * `TooltipProvider` + `<LinkEdit>`, with the framework-agnostic logic
 * transplanted — `addLink`/`editLink`/`removeLink` wired onto `linkTooltipAPI`,
 * the enter-edit state machine (select range, show, focus input), confirm
 * (insert/replace the link mark, DOMPurify the href) and a capture-phase
 * outside-click reset.
 */
function configureLinkEdit(
  ctx: Ctx,
  pluginViewFactory: PluginViewFactory,
  hidePreview: () => void,
): void {
  const store = createLinkEditStore();
  ctx.set(linkEditStoreCtx.key, store);

  let provider: TooltipProvider | undefined;
  let host: HTMLElement | undefined;
  let token = 0;
  let data: { from: number; to: number; mark: Mark | null } = {
    from: -1,
    to: -1,
    mark: null,
  };

  const getHost = () => {
    if (!host) {
      host = document.createElement("div");
      host.className = "milkdown-link-edit";
      host.dataset.show = "false";
    }
    return host;
  };

  const onOutsidePointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target) return;
    if (getHost().contains(target)) return;
    reset();
  };
  const startOutsideClick = () =>
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
  const stopOutsideClick = () =>
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);

  function reset() {
    stopOutsideClick();
    provider?.hide();
    ctx.update(linkTooltipState.key, (s) => ({ ...s, mode: "preview" as const }));
    data = { from: -1, to: -1, mark: null };
  }

  const confirmEdit = (href: string) => {
    const view = ctx.get(editorViewCtx);
    const { from, to, mark } = data;
    const type = linkSchema.type(ctx);
    const link = sanitize(href);
    if (mark && mark.attrs.href === link) {
      reset();
      return;
    }

    const tr = view.state.tr;
    if (mark) tr.removeMark(from, to, mark);

    if (from === to) {
      if (!link) {
        reset();
        return;
      }
      const linkMark = type.create({ href: link });
      tr.insertText(link, from);
      tr.addMark(from, from + link.length, linkMark);
    } else {
      tr.addMark(from, to, type.create({ href: link }));
    }
    view.dispatch(tr);
    reset();
  };

  const enterEditMode = (value: string, from: number, to: number) => {
    hidePreview();
    token += 1;
    store.set({ src: value, token, onConfirm: confirmEdit, onCancel: reset });
    ctx.update(linkTooltipState.key, (s) => ({ ...s, mode: "edit" as const }));
    const view = ctx.get(editorViewCtx);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)),
    );
    provider?.show(
      { getBoundingClientRect: () => posToDOMRect(view, from, to) },
      view,
    );
    startOutsideClick();
    requestAnimationFrame(() => {
      getHost().querySelector("input")?.focus();
    });
  };

  ctx.update(linkTooltipAPI.key, (api) => ({
    ...api,
    addLink: (from, to) => {
      data = { from, to, mark: null };
      enterEditMode("", from, to);
    },
    editLink: (mark, from, to) => {
      data = { from, to, mark };
      enterEditMode((mark.attrs.href as string) ?? "", from, to);
    },
    removeLink: (from, to) => {
      const view = ctx.get(editorViewCtx);
      const tr = view.state.tr;
      tr.removeMark(from, to, linkSchema.type(ctx));
      view.dispatch(tr);
      reset();
    },
  }));

  // Eager provider creation (Crepe's `LinkEditTooltip` constructor): so the
  // edit popover is ready when `toggleLinkCommand` / the preview's edit button
  // fires, even before the first transaction.
  const factoryView = pluginViewFactory({
    component: LinkEdit,
    root: () => getHost(),
  });
  const view = (pmView: EditorView) => {
    const inner = factoryView(pmView);
    provider = new TooltipProvider({
      content: getHost(),
      debounce: 0,
      shouldShow: () => false,
    });
    provider.onHide = () => {
      requestAnimationFrame(() => pmView.dom.focus({ preventScroll: true }));
    };
    provider.update(pmView);
    return {
      update: (v: EditorView, prev: EditorState) => {
        inner.update?.(v, prev);
        // Crepe's edit-view `update`: drop out of edit mode if the selection
        // moves off the edited range. Skip when not editing (data unset) to
        // avoid churning the state slice on every selection change.
        if (data.from === -1 && data.to === -1) return;
        const { selection } = v.state;
        if (!(selection instanceof TextSelection)) return;
        const { from, to } = selection;
        if (from === data.from && to === data.to) return;
        reset();
      },
      destroy: () => {
        stopOutsideClick();
        inner.destroy?.();
        provider?.destroy();
        provider = undefined;
        host = undefined;
      },
    };
  };

  ctx.set(linkEditTooltip.key, { view });
}

/**
 * link-tooltip — the link preview + edit popovers over `link` marks. Reuses the
 * locally-owned (Vue-free) engine slices/command/tooltips; the two PluginView
 * classes are rebuilt React-side with the reused `TooltipProvider`. Also exports
 * `toggleLinkCommand`, which the toolbar's link button calls.
 */
export function linkTooltipFeature(
  editor: Editor,
  pluginViewFactory: PluginViewFactory,
): void {
  editor
    .config((ctx) => {
      const preview = configureLinkPreview(ctx, pluginViewFactory);
      configureLinkEdit(ctx, pluginViewFactory, preview.hide);
    })
    .use(linkTooltipState)
    .use(linkTooltipAPI)
    .use(linkTooltipConfig)
    .use(linkPreviewStoreCtx)
    .use(linkEditStoreCtx)
    .use(linkPreviewTooltip)
    .use(linkEditTooltip)
    .use(toggleLinkCommand);
}

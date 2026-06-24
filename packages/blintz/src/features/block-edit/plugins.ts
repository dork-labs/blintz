import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import {
  BlockProvider,
  block,
  blockConfig,
} from "@milkdown/kit/plugin/block";
import { SlashProvider, slashFactory } from "@milkdown/kit/plugin/slash";
import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { findParent } from "@milkdown/kit/prose";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { usePluginViewFactory } from "@prosemirror-adapter/react";

import { isInCodeBlock, isInList } from "../../shared/checker";
import { BlockHandle } from "./BlockHandle";
import { SlashMenu } from "./SlashMenu";
import { robustBlockDragMove } from "./robust-drag";
import { blockHandleAPI, menuAPI, slashStoreCtx } from "./slices";
import { createSlashMenuStore } from "./store";

type PluginViewFactory = ReturnType<typeof usePluginViewFactory>;

/** The slash plugin bundle (`[spec, plugin]` with a `.key`) — Crepe's `menu`. */
const menu = slashFactory("CREPE_MENU");

/**
 * Block handle = the floating "+"/"::" control. React port of Crepe's
 * `configureBlockHandle` + `BlockHandleView` (`block-edit/handle/index.ts`).
 *
 * The `BlockProvider` (engine) lives in the plugin-view closure — same shape as
 * the toolbar's `TooltipProvider` — and owns positioning, show/hide and drag. The
 * host returned by `root` is **memoized (idempotent)**: the adapter reads `root`
 * more than once and hands the same element to the provider as `content`, so a
 * fresh div per call would split the React portal from the positioned element.
 */
function configureBlockHandle(ctx: Ctx, pluginViewFactory: PluginViewFactory) {
  let blockProvider: BlockProvider | undefined;
  let host: HTMLElement | undefined;

  const getHost = () => {
    if (!host) {
      host = document.createElement("div");
      host.className = "milkdown-block-handle";
      host.dataset.show = "false";
    }
    return host;
  };

  // Ported verbatim from Crepe's `onAdd` (handle/index.ts): insert an empty
  // paragraph after the active block, move the caret into it, then open the menu
  // there. Bound here (closure), where the provider's `active` block lives, and
  // published on a ctx slice so the React "+" button can call it.
  const onAdd = () => {
    const view = ctx.get(editorViewCtx);
    if (!view.hasFocus()) view.focus();

    const active = blockProvider?.active;
    if (!active) return;

    const { state, dispatch } = view;
    const pos = active.$pos.pos + active.node.nodeSize;
    let tr = state.tr.insert(pos, paragraphSchema.type(ctx).create());
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
    dispatch(tr.scrollIntoView());

    blockProvider?.hide();
    ctx.get(menuAPI.key).show(tr.selection.from);
  };
  ctx.set(blockHandleAPI.key, { onAdd });

  // Stricter than plugin-block's default: never target table cells, quotes, or
  // inline math (Crepe's filterNodes).
  ctx.set(blockConfig.key, {
    filterNodes: (pos) => {
      const blocked = findParent((node) =>
        ["table", "blockquote", "math_inline"].includes(node.type.name),
      )(pos);
      return !blocked;
    },
  });

  // Mount the React component via the adapter, then create the BlockProvider at
  // view-creation time (mirroring Crepe's `BlockHandleView` constructor, which
  // calls `this.update()`) — so the handle is live on load instead of only after
  // the first transaction, and is ready when the "+" needs `provider.active`.
  const factoryView = pluginViewFactory({
    component: BlockHandle,
    root: () => getHost(),
  });
  ctx.set(block.key, {
    view: (editorView: EditorView) => {
      const inner = factoryView(editorView);
      blockProvider = new BlockProvider({
        ctx,
        content: getHost(),
        getOffset: () => 16,
        getPlacement: ({ active, blockDom }) => {
          if (active.node.type.name === "heading") return "left";

          let totalDescendant = 0;
          active.node.descendants((node) => {
            totalDescendant += node.childCount;
          });
          const dom = active.el;
          const domRect = dom.getBoundingClientRect();
          const handleRect = blockDom.getBoundingClientRect();
          const style = window.getComputedStyle(dom);
          const paddingTop = Number.parseInt(style.paddingTop, 10) || 0;
          const paddingBottom = Number.parseInt(style.paddingBottom, 10) || 0;
          const height = domRect.height - paddingTop - paddingBottom;
          const handleHeight = handleRect.height;
          return totalDescendant > 2 || handleHeight < height
            ? "left-start"
            : "left";
        },
      });
      blockProvider.update();
      return {
        update: (view, prevState) => {
          inner.update?.(view, prevState);
          blockProvider?.update();
        },
        destroy: () => {
          inner.destroy?.();
          blockProvider?.destroy();
          blockProvider = undefined;
          host = undefined;
        },
      };
    },
  });
}

/**
 * Slash menu = the "/" command palette. React port of Crepe's `configureMenu` +
 * `MenuView` (`block-edit/menu/index.ts`).
 *
 * The `SlashProvider` (engine) lives in the closure and drives positioning +
 * `data-show`. Crepe's Vue refs (`show`, `filter`) become an external store
 * (`store.ts`) the closure writes and the React `SlashMenu` reads — published on
 * a ctx slice. `shouldShow` is ported faithfully (including writing `filter` as a
 * side effect and the `#programmaticallyPos` path the "+" button relies on).
 */
function configureMenu(ctx: Ctx, pluginViewFactory: PluginViewFactory) {
  const store = createSlashMenuStore();
  ctx.set(slashStoreCtx.key, store);

  let provider: SlashProvider | undefined;
  let host: HTMLElement | undefined;
  let programmaticPos: number | null = null;

  const getHost = () => {
    if (!host) {
      host = document.createElement("div");
      host.className = "milkdown-slash-menu";
      host.dataset.show = "false";
    }
    return host;
  };

  const shouldShow = (view: EditorView): boolean => {
    if (isInCodeBlock(view.state.selection) || isInList(view.state.selection))
      return false;

    const currentText = provider?.getContent(view, (node) =>
      ["paragraph", "heading"].includes(node.type.name),
    );
    if (currentText == null) return false;
    if (!isSelectionAtEndOfNode(view.state.selection)) return false;

    store.set({
      filter: currentText.startsWith("/")
        ? currentText.slice(1)
        : currentText,
    });

    if (typeof programmaticPos === "number") {
      const maxSize = view.state.doc.nodeSize - 2;
      const validPos = Math.min(programmaticPos, maxSize);
      if (
        view.state.doc.resolve(validPos).node() !==
        view.state.doc.resolve(view.state.selection.from).node()
      ) {
        programmaticPos = null;
        return false;
      }
      return true;
    }

    if (!currentText.startsWith("/")) return false;
    return true;
  };

  const hide = () => {
    programmaticPos = null;
    provider?.hide();
  };
  const showAt = (pos: number) => {
    programmaticPos = pos;
    store.set({ filter: "" });
    provider?.show();
  };
  ctx.set(menuAPI.key, { show: showAt, hide });

  // Same eager pattern as the block handle (Crepe's `MenuView` constructor):
  // create the SlashProvider at view creation so the "+" button's
  // `menuAPI.show()` finds a live provider even before any transaction.
  const factoryView = pluginViewFactory({
    component: SlashMenu,
    root: () => getHost(),
  });
  ctx.set(menu.key, {
    view: (editorView: EditorView) => {
      const inner = factoryView(editorView);
      provider = new SlashProvider({
        content: getHost(),
        debounce: 20,
        shouldShow,
        offset: 10,
      });
      provider.onShow = () => store.set({ show: true });
      provider.onHide = () => store.set({ show: false });
      provider.update(editorView);
      return {
        update: (view, prevState) => {
          inner.update?.(view, prevState);
          provider?.update(view, prevState);
        },
        destroy: () => {
          inner.destroy?.();
          provider?.destroy();
          provider = undefined;
          host = undefined;
          programmaticPos = null;
        },
      };
    },
  });
}

function isSelectionAtEndOfNode(selection: Selection): boolean {
  if (!(selection instanceof TextSelection)) return false;
  const { $head } = selection;
  return $head.parentOffset === $head.parent.content.size;
}

/**
 * block-edit — slash menu + "+"/"::" block handle (the "Notion feel").
 *
 * Two coordinated plugin-view widgets sharing the `menuAPI` ctx slice (the "+"
 * button opens the menu). Mirrors Crepe's `blockEdit` feature, minus the Vue
 * mounts and the `crepeFeatureConfig` flag plumbing. Drag-to-reorder comes free
 * from the reused `BlockService`/`BlockProvider`.
 */
export function blockEditFeature(
  editor: Editor,
  pluginViewFactory: PluginViewFactory,
): void {
  editor
    .config((ctx) => configureBlockHandle(ctx, pluginViewFactory))
    .config((ctx) => configureMenu(ctx, pluginViewFactory))
    .use(menuAPI)
    .use(blockHandleAPI)
    .use(slashStoreCtx)
    .use(block)
    .use(menu)
    // Make the block drag delete the tracked source node (not the drifting
    // selection) — fixes duplicate-on-reorder. See robust-drag.ts.
    .use(robustBlockDragMove);
}

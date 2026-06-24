import type { Editor } from "@milkdown/kit/core";
import { TooltipProvider, tooltipFactory } from "@milkdown/kit/plugin/tooltip";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { usePluginViewFactory } from "@prosemirror-adapter/react";

import { Toolbar } from "./Toolbar";

type PluginViewFactory = ReturnType<typeof usePluginViewFactory>;

const toolbarTooltip = tooltipFactory("CREPE_TOOLBAR");

/**
 * Ported verbatim from Crepe's `ToolbarView.shouldShow` (`feature/toolbar/
 * index.ts`): show only over a non-empty text selection, while focused (or
 * focus is inside the toolbar itself), and editable. `getRootNode()` keeps the
 * shadow-DOM case working and collapses to `document` otherwise.
 */
function shouldShow(view: EditorView, host: HTMLElement): boolean {
  const { doc, selection } = view.state;
  const { empty, from, to } = selection;

  const isEmptyTextBlock =
    !doc.textBetween(from, to).length && selection instanceof TextSelection;
  const isNotTextBlock = !(selection instanceof TextSelection);

  const root = view.dom.getRootNode() as ShadowRoot | Document;
  const isTooltipChildren = host.contains(root.activeElement);
  const notHasFocus = !view.hasFocus() && !isTooltipChildren;

  const isReadonly = !view.editable;

  if (notHasFocus || isNotTextBlock || empty || isEmptyTextBlock || isReadonly)
    return false;

  return true;
}

/**
 * The toolbar plugin view: the adapter renders <Toolbar/> into our own host
 * `<div class="milkdown-toolbar">` (passed via `root`), while the reused
 * `TooltipProvider` (floating-ui) appends + positions that host over the
 * selection and toggles `data-show`. This is the React equivalent of Crepe's
 * `ToolbarView` — same seam (the tooltip ctx slice's `view`), Vue mount swapped
 * for the React factory.
 */
function createToolbarView(pluginViewFactory: PluginViewFactory) {
  let provider: TooltipProvider | undefined;
  let host: HTMLElement | undefined;

  // Must be idempotent: the adapter calls `root` more than once to get the
  // portal target, and the same element is handed to TooltipProvider as
  // `content`. If `root` minted a fresh div each call, React would render into
  // one element while the provider attached/positioned another (empty) one.
  const getHost = () => {
    if (!host) {
      host = document.createElement("div");
      host.className = "milkdown-toolbar";
      host.dataset.show = "false";
    }
    return host;
  };

  return pluginViewFactory({
    component: Toolbar,
    root: () => getHost(),
    update: (view, prevState) => {
      if (!provider) {
        provider = new TooltipProvider({
          content: getHost(),
          debounce: 20,
          offset: 10,
          shouldShow: (v) => shouldShow(v, getHost()),
        });
      }
      provider.update(view, prevState);
    },
    destroy: () => {
      provider?.destroy();
      provider = undefined;
      host = undefined;
    },
  });
}

/** toolbar — floating selection-format bar (plugin-view reference pattern). */
export function toolbarFeature(
  editor: Editor,
  pluginViewFactory: PluginViewFactory,
): void {
  editor
    .config((ctx) => {
      ctx.set(toolbarTooltip.key, {
        view: createToolbarView(pluginViewFactory),
      });
    })
    .use(toolbarTooltip);
}

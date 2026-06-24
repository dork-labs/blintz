import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { TooltipProvider } from "@milkdown/kit/plugin/tooltip";
import { NodeSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { usePluginViewFactory } from "@prosemirror-adapter/react";

import { codeBlockConfig } from "../code-block/config";
import { LatexInlineEdit } from "./InlineEdit";
import { toggleLatexCommand } from "./command";
import { mathInlineId } from "./constants";
import { mathBlockInputRule, mathInlineInputRule } from "./input-rule";
import { remarkMathBlockPlugin, remarkMathPlugin } from "./remark";
import { renderLatexPreview } from "./render";
import { blockLatexSchema, mathInlineSchema } from "./schema";
import { latexInlineEditStoreCtx } from "./slices";
import { createLatexInlineEditStore } from "./store";
import { inlineLatexTooltip } from "./tooltips";

type PluginViewFactory = ReturnType<typeof usePluginViewFactory>;

/**
 * The inline-math edit tooltip's plugin view — React port of Crepe's
 * `LatexInlineTooltip` (`latex/inline-tooltip/view.ts`). Selection-driven like
 * the toolbar (not command-driven like the link edit tooltip): it shows whenever
 * a `math_inline` atom is node-selected. The reused `TooltipProvider` positions
 * the host + toggles `data-show`; the adapter renders `<LatexInlineEdit/>` into
 * the same host; `shouldShow` publishes the selected node's source + a confirm
 * callback (closed over its position) to the store the component reads.
 */
function createInlineLatexView(ctx: Ctx, pluginViewFactory: PluginViewFactory) {
  const store = createLatexInlineEditStore();
  ctx.set(latexInlineEditStoreCtx.key, store);

  let provider: TooltipProvider | undefined;
  let host: HTMLElement | undefined;
  let token = 0;
  let shownPos = -1;

  // Idempotent host (see the toolbar): the adapter calls `root` more than once
  // and the same element is the provider's `content`.
  const getHost = () => {
    if (!host) {
      host = document.createElement("div");
      host.className = "milkdown-latex-inline-edit";
      host.dataset.show = "false";
    }
    return host;
  };

  const confirm = (pos: number) => (value: string) => {
    const view = ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.setNodeAttribute(pos, "value", value));
    requestAnimationFrame(() => view.focus());
  };

  // Mirrors Crepe's `#shouldShow`: visible only over a node-selected math atom.
  // When the target changes (pos differs), bump `token` + re-seed the store so
  // the input re-seeds; reset on hide so re-selecting the same node re-reads its
  // actual value (not stale un-confirmed text).
  const shouldShow = (view: EditorView): boolean => {
    if (!view.editable) {
      shownPos = -1;
      return false;
    }
    const { selection } = view.state;
    if (
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== mathInlineId
    ) {
      shownPos = -1;
      return false;
    }
    const pos = selection.from;
    if (pos !== shownPos) {
      shownPos = pos;
      token += 1;
      store.set({
        value: (selection.node.attrs.value as string) ?? "",
        token,
        onConfirm: confirm(pos),
      });
    }
    return true;
  };

  return pluginViewFactory({
    component: LatexInlineEdit,
    root: () => getHost(),
    update: (view: EditorView, prevState?: EditorState) => {
      if (!provider) {
        provider = new TooltipProvider({
          content: getHost(),
          debounce: 0,
          offset: 10,
          floatingUIOptions: { placement: "bottom" },
          shouldShow,
        });
      }
      provider.update(view, prevState);
    },
    destroy: () => {
      provider?.destroy();
      provider = undefined;
      host = undefined;
      shownPos = -1;
    },
  });
}

/**
 * latex — inline `$…$` math (an atom rendered by KaTeX + an edit tooltip) and
 * block `$$…$$` math (a LaTeX-language code block reusing the CodeMirror view +
 * a KaTeX preview). Reuses the locally-owned, Vue-free engine pieces (schemas,
 * remark, input rules, command); only the edit tooltip is rebuilt React-side.
 *
 * MUST be registered AFTER `codeMirrorFeature` (and the CodeMirror feature must
 * be enabled): the block-math preview is installed by *wrapping* the existing
 * `codeBlockConfig.renderPreview`, so it depends on code-mirror's config already
 * being set when this feature's `.config()` runs.
 */
export function latexFeature(
  editor: Editor,
  pluginViewFactory: PluginViewFactory,
): void {
  editor
    .config((ctx) => {
      // Wrap the code-block preview so LaTeX-language blocks render via KaTeX;
      // every other language falls through to the previous renderer.
      ctx.update(codeBlockConfig.key, (prev) => ({
        ...prev,
        renderPreview: (
          language: string,
          content: string,
          applyPreview: (value: null | string | HTMLElement) => void,
        ) => {
          if (language.toLowerCase() === "latex" && content.length > 0) {
            return renderLatexPreview(content);
          }
          return prev.renderPreview(language, content, applyPreview);
        },
      }));

      ctx.set(inlineLatexTooltip.key, {
        view: createInlineLatexView(ctx, pluginViewFactory),
      });
    })
    .use(remarkMathPlugin)
    .use(remarkMathBlockPlugin)
    .use(mathInlineSchema)
    .use(inlineLatexTooltip)
    .use(mathInlineInputRule)
    .use(mathBlockInputRule)
    .use(blockLatexSchema)
    .use(toggleLatexCommand)
    .use(latexInlineEditStoreCtx);
}

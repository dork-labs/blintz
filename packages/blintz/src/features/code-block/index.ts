import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $view } from "@milkdown/kit/utils";
import type { useNodeViewFactory } from "@prosemirror-adapter/react";

import {
  chevronDownIcon,
  clearIcon,
  copyIcon,
  editIcon,
  searchIcon,
  visibilityOffIcon,
} from "../../icons";
import { CodeBlockView } from "./CodeBlockView";
import { codeBlockConfig, defaultConfig } from "./config";
import { findControllerAt } from "./controller";

type NodeViewFactory = ReturnType<typeof useNodeViewFactory>;

/**
 * code-mirror — replaces ProseMirror's default `code_block` node view with one
 * embedding a CodeMirror 6 editor + Crepe's tools bar (language picker, copy,
 * optional preview). React rebuild of Crepe's `code-mirror` feature.
 *
 * The `code_block` schema, the ```lang input rule, the create/update commands and
 * the keymap all come from `.use(commonmark)` already on the editor — the
 * commonmark base preset is NOT Vue-coupled, so we import `codeBlockSchema` from
 * it directly. We deliberately do NOT `.use(codeBlockComponent)` from
 * `@milkdown/kit/component/code-block` (that single bundle imports Vue, even for
 * the pure config/loader/node-view-logic). Instead we own the local Vue-free
 * ports (`config.ts`, `loader.ts`, `controller.ts`) and register a React `$view`.
 *
 * Markdown round-trip: the node + its serializer (` ```lang ` fence) are
 * unchanged commonmark; we only swap the *view*, so the fence round-trips intact.
 */
export function codeMirrorFeature(
  editor: Editor,
  nodeViewFactory: NodeViewFactory,
): void {
  const codeBlockView = $view(codeBlockSchema.node, () =>
    nodeViewFactory({
      component: CodeBlockView,
      // The `.milkdown-code-block` host; the React component renders the tools +
      // CodeMirror host into it. NO contentAs/contentRef — there is no PM
      // contentDOM; all code text lives inside CodeMirror.
      //
      // `contentEditable = false` is REQUIRED: a non-leaf node (`code_block` has
      // `content: "text*"`) whose node view exposes no contentDOM is not auto-
      // marked non-editable by ProseMirror, so the nested CodeMirror's own
      // `contenteditable=true` resolves focus to the OUTER ProseMirror instead of
      // CM. Without this, CM never holds focus → `forwardUpdate`'s `cm.hasFocus`
      // guard blocks every CM→PM sync, so typed code never reaches the document
      // (no round-trip, no preview). Marking the wrapper opaque makes CM its own
      // editable island; `stopEvent`/`setSelection`/`maybeEscape` handle crossing.
      as: () => {
        const el = document.createElement("div");
        el.className = "milkdown-code-block";
        el.contentEditable = "false";
        return el;
      },
      // PM must ignore CodeMirror's internal events; selection crossing is
      // handled manually by the controller's keymap / setSelection.
      stopEvent: () => true,
      // These overrides are shared closures with no per-instance handle, so they
      // route to the right controller via the per-EditorView registry (by
      // position). selectNode/setSelection focus CM (force-initializing it if it
      // was never mounted).
      selectNode: () => {
        const view = editor.ctx.get(editorViewCtx);
        const sel = view.state.selection;
        findControllerAt(view, sel.from)?.selectNode();
      },
      setSelection: (anchor, head) => {
        // anchor/head are CM-local; locate the controller by the PM selection.
        const view = editor.ctx.get(editorViewCtx);
        const sel = view.state.selection;
        findControllerAt(view, sel.from)?.setSelection(anchor, head);
      },
    }),
  );

  editor
    .config((ctx) => {
      const extensions: Extension[] = [
        keymap.of(defaultKeymap.concat(indentWithTab)),
        basicSetup,
        oneDark,
      ];

      ctx.update(codeBlockConfig.key, () => ({
        extensions,
        languages,
        expandIcon: chevronDownIcon,
        searchIcon,
        clearSearchIcon: clearIcon,
        searchPlaceholder: "Search language",
        copyText: "Copy",
        copyIcon,
        onCopy: () => {},
        noResultText: "No result",
        renderLanguage: defaultConfig.renderLanguage,
        renderPreview: defaultConfig.renderPreview,
        previewToggleButton: (previewOnlyMode: boolean) => {
          const icon = previewOnlyMode ? editIcon : visibilityOffIcon;
          const text = previewOnlyMode ? "Edit" : "Hide";
          return [icon, text].map((v) => v.trim()).join(" ");
        },
        previewLabel: defaultConfig.previewLabel,
        previewLoading: defaultConfig.previewLoading,
        previewOnlyByDefault: defaultConfig.previewOnlyByDefault,
      }));
    })
    .use(codeBlockConfig)
    .use(codeBlockView);
}

import { useEffect, useRef } from "react";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { gfm } from "@milkdown/kit/preset/gfm";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { indent } from "@milkdown/kit/plugin/indent";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { upload } from "@milkdown/kit/plugin/upload";
import { replaceAll } from "@milkdown/kit/utils";
import { nord } from "@milkdown/theme-nord";
import { useEditor, useInstance } from "@milkdown/react";
import type {
  useNodeViewFactory,
  usePluginViewFactory,
} from "@prosemirror-adapter/react";

import type { CtxHolder } from "./shared/editor-ctx";
import { blockEditFeature } from "./features/block-edit/plugins";
import { codeMirrorFeature } from "./features/code-block";
import { cursorFeature } from "./features/cursor";
import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "./features/empty-paragraphs";
import { imageBlockFeature } from "./features/image-block";
import { latexFeature } from "./features/latex";
import { linkTooltipFeature } from "./features/link-tooltip/plugins";
import { listItemFeature } from "./features/list-item";
import { placeholderFeature } from "./features/placeholder";
import { tableFeature } from "./features/table";
import { toolbarFeature } from "./features/toolbar/plugin";

interface UseCrepeEditorArgs {
  /** Current markdown — seeds the editor and, on external change, resets it. */
  value: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  nodeViewFactory: ReturnType<typeof useNodeViewFactory>;
  pluginViewFactory: ReturnType<typeof usePluginViewFactory>;
  /** Stable holder the factory fills with the live `Ctx` for view components. */
  ctxHolder: CtxHolder;
}

/**
 * The engine baseline + feature registration — the React rebuild of Crepe's
 * `CrepeBuilder` core, assembled from `@milkdown/kit` (NOT `@milkdown/crepe`) so
 * no Vue reaches the bundle: commonmark + gfm + history + indent + trailing +
 * clipboard + upload + listener, then the P0 feature views.
 *
 * Factory bridge: the adapter factory hooks are called in render (in the
 * component using this hook) and closed over here, then handed to each feature
 * so it can register its node/plugin view inside the `useEditor` factory.
 * `ctxHolder.current` is filled with the live `Ctx` so view components can reach
 * commands/config via React context.
 */
export function useBlintzEditor({
  value,
  onChange,
  placeholder,
  nodeViewFactory,
  pluginViewFactory,
  ctxHolder,
}: UseCrepeEditorArgs): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // The markdown the editor currently holds: the seed at mount, then whatever
  // the editor last emitted — lets us distinguish an external reset from our
  // own emissions (no feedback loop).
  const editorValueRef = useRef(value);
  // Captured once: useEditor runs the factory a single time, so don't let the
  // seed chase the changing `value` prop.
  const seedRef = useRef(value);
  const placeholderRef = useRef(placeholder);

  useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, seedRef.current);
        ctxHolder.current = ctx;
        ctx.get(listenerCtx).markdownUpdated((_ctx: Ctx, md, prevMd) => {
          if (md === prevMd) return;
          editorValueRef.current = md;
          onChangeRef.current?.(md);
        });
      })
      // Base prose typography. The visual theme is otherwise driven by the
      // `--crepe-*` CSS custom properties (see theme/vars.css) — consumers
      // re-theme by overriding those tokens, not by swapping this config.
      .config(nord)
      // commonmark, minus its empty-line `<br />` round-trip hack (we store
      // clean markdown), plus a parse-time strip of legacy `<br />` artifacts.
      .use(commonmarkWithoutEmptyLinePreservation)
      .use(stripEmptyLineBreaks)
      .use(gfm)
      .use(history)
      .use(indent)
      .use(trailing)
      .use(clipboard)
      .use(upload)
      .use(listener);

    // Features (share the engine above; each registers its own views/plugins).
    cursorFeature(editor);
    placeholderFeature(editor, {
      text: placeholderRef.current ?? "Type / for commands",
      mode: "block",
    });
    listItemFeature(editor, nodeViewFactory);
    imageBlockFeature(editor, nodeViewFactory);
    codeMirrorFeature(editor, nodeViewFactory);
    tableFeature(editor, nodeViewFactory);
    toolbarFeature(editor, pluginViewFactory);
    blockEditFeature(editor, pluginViewFactory);
    linkTooltipFeature(editor, pluginViewFactory);
    // After codeMirrorFeature: block-math wraps codeBlockConfig's renderPreview.
    latexFeature(editor, pluginViewFactory);

    return editor;
  });

  const [loading, getInstance] = useInstance();

  // External value changes (e.g. "reset to seed") → push into the editor.
  useEffect(() => {
    if (loading) return;
    if (value === editorValueRef.current) return;
    const editor = getInstance();
    if (!editor) return;
    editorValueRef.current = value;
    // Defer the doc replacement out of React's commit phase. `replaceAll`
    // dispatches a transaction that re-renders the React node views, and
    // @prosemirror-adapter/react renders them synchronously via
    // `ReactDOM.flushSync` — which React forbids inside a lifecycle method
    // (the dev-only "flushSync was called from inside a lifecycle method"
    // warning). A microtask runs it right after commit, outside the lifecycle
    // (mirrors how @milkdown/react itself defers editor creation via a promise).
    let cancelled = false;
    queueMicrotask(() => {
      // Skip if unmounted/superseded or a newer value already landed.
      if (cancelled || editorValueRef.current !== value) return;
      editor.action(replaceAll(value));
    });
    return () => {
      cancelled = true;
    };
  }, [value, loading, getInstance]);
}

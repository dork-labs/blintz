import { useEffect, useRef } from "react";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { gfm } from "@milkdown/kit/preset/gfm";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { indent } from "@milkdown/kit/plugin/indent";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { upload } from "@milkdown/kit/plugin/upload";
import { replaceAll } from "@milkdown/kit/utils";
import { useEditor, useInstance } from "@milkdown/react";
import type {
  useNodeViewFactory,
  usePluginViewFactory,
} from "@prosemirror-adapter/react";

import type { CtxHolder } from "./shared/editor-ctx";
import type { BlintzPlugin } from "./plugin";
import { DEFAULT_EDITABLE, editablePredicate } from "./read-only";
import { blockEditFeature } from "./features/block-edit/plugins";
import { codeMirrorFeature } from "./features/code-block";
import { cursorFeature } from "./features/cursor";
import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "./features/empty-paragraphs";
import { frontmatterFeature } from "./features/frontmatter";
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
  /** Read-only when `false` (default `true`). Synced live by the reactivity
   * effect, so toggling it flips editability in place — no rebuild. */
  editable?: boolean;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  nodeViewFactory: ReturnType<typeof useNodeViewFactory>;
  pluginViewFactory: ReturnType<typeof usePluginViewFactory>;
  /** Stable holder the factory fills with the live `Ctx` for view components. */
  ctxHolder: CtxHolder;
  /** Consumer extensions, registered after the built-in features. */
  plugins?: BlintzPlugin[];
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
  editable = DEFAULT_EDITABLE,
  onChange,
  placeholder,
  nodeViewFactory,
  pluginViewFactory,
  ctxHolder,
  plugins,
}: UseCrepeEditorArgs): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Captured once: useEditor runs the factory a single time, so the registered
  // plugin set is fixed at mount (same as the built-in features). Changing the
  // `plugins` prop later does not re-register — remount to swap extensions.
  const pluginsRef = useRef(plugins);

  // The markdown the editor currently holds: the seed at mount, then whatever
  // the editor last emitted — lets us distinguish an external reset from our
  // own emissions (no feedback loop).
  const editorValueRef = useRef(value);
  // Captured once: useEditor runs the factory a single time, so don't let the
  // seed chase the changing `value` prop.
  const seedRef = useRef(value);
  const placeholderRef = useRef(placeholder);
  // The read-only master switch, kept in a ref because ProseMirror's `editable`
  // option is wired as a getter that reads it live on every state update. The
  // effect below syncs this ref to the `editable` prop and forces a view refresh
  // so editability flips IN PLACE — no editor rebuild, no remount. (Only
  // editability is reactive; `value` resets and `plugins` stay their own model.)
  const editableRef = useRef(editable);

  useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, seedRef.current);
        ctxHolder.current = ctx;
        // Read-only master switch. ProseMirror calls this getter on each state
        // update, so `view.editable` tracks it — and the toolbar, placeholder,
        // table, list-item, image-block, code-block, and latex features already
        // gate their editing affordances on `view.editable`. (block-edit is the
        // lone exception; it is gated by registration below.)
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: editablePredicate(() => editableRef.current),
        }));
        ctx.get(listenerCtx).markdownUpdated((_ctx: Ctx, md, prevMd) => {
          if (md === prevMd) return;
          editorValueRef.current = md;
          onChangeRef.current?.(md);
        });
      })
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
    // frontmatter first: pure grammar (remark + schema), nothing depends on it.
    frontmatterFeature(editor);
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
    // block-edit (slash menu + "+/::" block handle + drag-to-reorder) is pure
    // editing chrome. It is ALWAYS registered and no-ops while read-only, so a
    // host that mounts read-only and later enables editing (the common "view
    // then edit" flow) gets a working slash menu / handle / drag with no
    // remount. Three runtime guards keep it dormant when not editable: the
    // upstream BlockService already gates its hover/drag DOM handlers on
    // `view.editable` (handleDOMEvents.mousemove), and our slash-menu
    // `shouldShow` and "+"-handle `onAdd` add matching `view.editable` guards
    // (see features/block-edit/plugins.ts). Gating by registration instead would
    // strand the chrome permanently off after a read-only mount.
    blockEditFeature(editor, pluginViewFactory);
    linkTooltipFeature(editor, pluginViewFactory);
    // After codeMirrorFeature: block-math wraps codeBlockConfig's renderPreview.
    latexFeature(editor, pluginViewFactory);

    // Consumer extensions last, so they layer over the built-in features (and
    // can override their config). Each gets the same seam the features use.
    pluginsRef.current?.forEach((plugin) => {
      plugin({ editor, nodeViewFactory, pluginViewFactory });
    });

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

  // Reactive editability: sync the ref the `editable` getter reads, then force
  // ProseMirror to re-run that getter so `view.editable` — and the root's
  // `contenteditable`, which is what actually routes keystrokes — flips in
  // place. `view.setProps` re-reads every view prop (including our live
  // `editable` getter) via `updateStateInner`; it is the clean, Milkdown-
  // supported refresh, and unlike dispatching a transaction it mutates no doc,
  // so it fires no `markdownUpdated` / `onChange`. Also re-asserts once the
  // editor finishes loading (that flip re-runs this effect).
  useEffect(() => {
    // Sync immediately so the live getter is correct even before the refresh.
    editableRef.current = editable;
    if (loading) return;
    const editor = getInstance();
    if (!editor) return;
    // Defer the refresh out of React's commit phase, exactly as the value effect
    // above does: `setProps` re-renders the adapter's React node views via
    // `ReactDOM.flushSync`, which React forbids inside a lifecycle method.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.setProps({
          editable: editablePredicate(() => editableRef.current),
        });
        view.dom.dispatchEvent(new Event("blintz:editable"));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [editable, loading, getInstance]);
}

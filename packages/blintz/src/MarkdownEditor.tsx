import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Ctx } from "@milkdown/kit/ctx";
import { Milkdown, MilkdownProvider } from "@milkdown/react";
import {
  ProsemirrorAdapterProvider,
  useNodeViewFactory,
  usePluginViewFactory,
} from "@prosemirror-adapter/react";

import { EditorCtxProvider } from "./shared/editor-ctx";
import { EmbedRegistryProvider, type EmbedRegistry } from "./features/embeds/registry";
import { WikiLinkProvider, type WikiLinkOptions } from "./features/wiki-links/options";
import type { MermaidLoader } from "./features/mermaid";
import { MermaidProvider } from "./features/mermaid/context";
import { BlintzThemeProvider } from "./shared/theme-ctx";
import type { CtxHolder } from "./shared/editor-ctx";
import { cx } from "./shared/cx";
import type { SourceCallbacks } from "./source-controller";
import type { BlintzPlugin } from "./plugin";
import { useBlintzEditor } from "./useBlintzEditor";

import "./theme/index.css";

export interface MarkdownEditorProps extends SourceCallbacks {
  /** Host raw-source revision. Equal text with a new revision invalidates old locations. */
  sourceRevision?: string;
  /**
   * Current markdown. Seeds the editor on mount; when it diverges from the last
   * value the editor emitted (e.g. an external "reset"), the editor resets to it.
   */
  value: string;
  /**
   * Whether the document can be edited. Defaults to `true`. When `false`, the
   * editor renders read-only: ProseMirror editing is disabled and the editing
   * chrome (slash menu, block handle, selection toolbar, drag handles,
   * link-edit popovers, placeholder) is suppressed, while the content (lists,
   * code with highlighting, tables, images, links, math) still renders.
   *
   * Reactive: toggling this on a mounted editor takes effect immediately, with
   * no remount — `contenteditable` flips and the editing chrome turns on or off
   * in place, preserving scroll and selection. (`plugins`, by contrast, is
   * captured at mount.)
   */
  editable?: boolean;
  /** Called with the new markdown on every edit. */
  onChange?: (markdown: string) => void;
  /** Prompt shown in an empty block. Defaults to "Type / for commands". */
  placeholder?: string;
  /** Explicit palette, or auto: nearest host theme followed by the OS preference. */
  theme?: "light" | "dark" | "auto";
  /** Extra class on the host element. */
  className?: string;
  /**
   * Extensions registered after the built-in features, so they layer on top.
   * Each receives the editor and the React view factories (see {@link BlintzPlugin}).
   * Captured at mount: remount the editor to change the set.
   */
  plugins?: BlintzPlugin[];
  /**
   * The embed catalog: directive name → React component (plus optional
   * validator and slash-menu details). `::chart{src="q3"}` renders
   * `embeds.chart.component`; `:::name … :::` containers receive their editable
   * content as `children`. Unregistered names render a placeholder and still
   * round-trip unchanged. Reactive: changing it re-renders embeds in place.
   */
  embeds?: EmbedRegistry;
  /**
   * Wiki links (`[[target]]`, `[[target#heading|label]]`, `![[target]]`):
   * `resolve` says where a link points and whether the page exists, `search`
   * feeds the `[[` suggestion menu, and `onOpen` handles opening one. The
   * markdown always keeps what the author typed. Reactive: no remount.
   */
  wikiLinks?: WikiLinkOptions;
  /**
   * Draw ` ```mermaid ` code blocks as diagrams: pass a loader such as
   * `() => import("mermaid")` (mermaid 10 or later). It is called the first
   * time a diagram needs drawing, so documents without diagrams never load
   * mermaid. Without it, mermaid blocks stay ordinary code blocks.
   */
  mermaid?: MermaidLoader;
}

const NO_EMBEDS: EmbedRegistry = {};

/**
 * A Vue-free, markdown-round-tripping prose editor: `@milkdown/react` over the
 * commonmark/gfm engine, with Crepe's polished chrome rebuilt as React
 * components.
 *
 * Provider stack (order matters): `MilkdownProvider` owns the editor instance;
 * `ProsemirrorAdapterProvider` (NOT bundled by `@milkdown/react` — a direct dep)
 * supplies the node/plugin view factory hooks. `EditorCtxProvider` sits above
 * both so the adapter's portal-rendered views can read the live Milkdown `Ctx`.
 */
export function MarkdownEditor({
  value,
  editable,
  onChange,
  placeholder,
  className,
  theme = "auto",
  plugins,
  embeds = NO_EMBEDS,
  wikiLinks,
  mermaid,
  sourceRevision,
  onSourceReady,
  onSourceSelection,
  onTaskToggleRequest,
}: MarkdownEditorProps) {
  const ctxHolder = useRef<Ctx | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const resolve = () => {
      if (theme !== "auto") {
        setResolvedTheme(theme);
        return;
      }
      let ancestor = hostRef.current?.parentElement;
      while (ancestor) {
        const signal = ancestor.getAttribute("data-theme");
        if (signal === "light" || signal === "dark") {
          setResolvedTheme(signal);
          return;
        }
        if (ancestor.classList.contains("dark")) {
          setResolvedTheme("dark");
          return;
        }
        if (ancestor.classList.contains("light")) {
          setResolvedTheme("light");
          return;
        }
        ancestor = ancestor.parentElement;
      }
      setResolvedTheme(media?.matches ? "dark" : "light");
    };
    resolve();
    // Hosts commonly toggle a class on <html>; resolve the nearest signal so a
    // local light/dark surface can override a differently themed outer shell.
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class", "data-theme"],
    });
    media?.addEventListener("change", resolve);
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", resolve);
    };
  }, [theme]);

  const effectiveTheme = theme === "auto" ? resolvedTheme : theme;

  // Hosts often pass the loader inline (a new function each render). Diagrams
  // only need to know whether one exists; a stable wrapper calls the latest,
  // so host re-renders never re-draw them.
  const mermaidRef = useRef(mermaid);
  useLayoutEffect(() => {
    mermaidRef.current = mermaid;
  }, [mermaid]);
  const stableMermaid = useCallback<MermaidLoader>(() => mermaidRef.current!(), []);
  const mermaidLoader = mermaid ? stableMermaid : undefined;

  return (
    <div
      ref={hostRef}
      className={cx("milkdown-editor-host", className)}
      data-blintz-theme={effectiveTheme}
    >
      <EditorCtxProvider value={ctxHolder}>
        <BlintzThemeProvider value={effectiveTheme}>
          <EmbedRegistryProvider value={embeds}>
            <WikiLinkProvider options={wikiLinks}>
              <MermaidProvider value={mermaidLoader}>
                <MilkdownProvider>
                  <ProsemirrorAdapterProvider>
                    <EditorInner
                      value={value}
                      editable={editable}
                      onChange={onChange}
                      placeholder={placeholder}
                      ctxHolder={ctxHolder}
                      plugins={plugins}
                        sourceRevision={sourceRevision}
                      onSourceReady={onSourceReady}
                      onSourceSelection={onSourceSelection}
                      onTaskToggleRequest={onTaskToggleRequest}
                    />
                  </ProsemirrorAdapterProvider>
                </MilkdownProvider>
              </MermaidProvider>
            </WikiLinkProvider>
          </EmbedRegistryProvider>
        </BlintzThemeProvider>
      </EditorCtxProvider>
    </div>
  );
}

interface EditorInnerProps extends SourceCallbacks {
  sourceRevision?: string;
  value: string;
  editable?: boolean;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  ctxHolder: CtxHolder;
  plugins?: BlintzPlugin[];
}

function EditorInner({
  value,
  editable,
  onChange,
  placeholder,
  ctxHolder,
  plugins,
  sourceRevision,
  onSourceReady,
  onSourceSelection,
  onTaskToggleRequest,
}: EditorInnerProps) {
  // Factory hooks must run in render, under both providers; useBlintzEditor
  // closes over them inside the `useEditor` factory (the factory bridge).
  const nodeViewFactory = useNodeViewFactory();
  const pluginViewFactory = usePluginViewFactory();

  useBlintzEditor({
    value,
    editable,
    onChange,
    placeholder,
    nodeViewFactory,
    pluginViewFactory,
    ctxHolder,
    plugins,
    sourceRevision,
    onSourceReady,
    onSourceSelection,
    onTaskToggleRequest,
  });

  return <Milkdown />;
}

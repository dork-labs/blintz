import { useEffect, useRef, useState } from "react";
import type { Ctx } from "@milkdown/kit/ctx";
import { Milkdown, MilkdownProvider } from "@milkdown/react";
import {
  ProsemirrorAdapterProvider,
  useNodeViewFactory,
  usePluginViewFactory,
} from "@prosemirror-adapter/react";

import { EditorCtxProvider } from "./shared/editor-ctx";
import type { CtxHolder } from "./shared/editor-ctx";
import { cx } from "./shared/cx";
import type { BlintzPlugin } from "./plugin";
import { useBlintzEditor } from "./useBlintzEditor";

import "./theme/index.css";

export interface MarkdownEditorProps {
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
}

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

  return (
    <div
      ref={hostRef}
      className={cx("milkdown-editor-host", className)}
      data-blintz-theme={theme === "auto" ? resolvedTheme : theme}
    >
      <EditorCtxProvider value={ctxHolder}>
        <MilkdownProvider>
          <ProsemirrorAdapterProvider>
            <EditorInner
              value={value}
              editable={editable}
              onChange={onChange}
              placeholder={placeholder}
              ctxHolder={ctxHolder}
              plugins={plugins}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>
      </EditorCtxProvider>
    </div>
  );
}

interface EditorInnerProps {
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
  });

  return <Milkdown />;
}

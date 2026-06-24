import { useRef } from "react";
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
import { useBlintzEditor } from "./useBlintzEditor";

import "@milkdown/theme-nord/style.css";
import "./theme/index.css";

export interface MarkdownEditorProps {
  /**
   * Current markdown. Seeds the editor on mount; when it diverges from the last
   * value the editor emitted (e.g. an external "reset"), the editor resets to it.
   */
  value: string;
  /** Called with the new markdown on every edit. */
  onChange?: (markdown: string) => void;
  /** Prompt shown in an empty block. Defaults to "Type / for commands". */
  placeholder?: string;
  /** Extra class on the host element. */
  className?: string;
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
  onChange,
  placeholder,
  className,
}: MarkdownEditorProps) {
  const ctxHolder = useRef<Ctx | null>(null);

  return (
    <div className={cx("milkdown-editor-host", className)}>
      <EditorCtxProvider value={ctxHolder}>
        <MilkdownProvider>
          <ProsemirrorAdapterProvider>
            <EditorInner
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              ctxHolder={ctxHolder}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>
      </EditorCtxProvider>
    </div>
  );
}

interface EditorInnerProps {
  value: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  ctxHolder: CtxHolder;
}

function EditorInner({
  value,
  onChange,
  placeholder,
  ctxHolder,
}: EditorInnerProps) {
  // Factory hooks must run in render, under both providers; useBlintzEditor
  // closes over them inside the `useEditor` factory (the factory bridge).
  const nodeViewFactory = useNodeViewFactory();
  const pluginViewFactory = usePluginViewFactory();

  useBlintzEditor({
    value,
    onChange,
    placeholder,
    nodeViewFactory,
    pluginViewFactory,
    ctxHolder,
  });

  return <Milkdown />;
}

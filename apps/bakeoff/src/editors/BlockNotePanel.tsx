import { useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { EditorPanelProps } from "../libraries";

/**
 * BlockNote — Notion-style BLOCK editor. The cautionary data point of the
 * bake-off: its markdown export is explicitly LOSSY.
 *
 * Internally the document is a tree of typed blocks (JSON), not markdown. So:
 *   - on mount / external reset we `tryParseMarkdownToBlocks()` (async, lossy in)
 *     and replace the document,
 *   - on every edit we `blocksToMarkdownLossy()` (async, lossy out) and emit.
 *
 * Editing the SAME content here and watching the Markdown output panel reveals
 * the drift: tables, nested lists, code fences and whitespace can all reshape.
 */
export default function BlockNotePanel({
  markdown,
  onChange,
  theme,
}: EditorPanelProps) {
  const editor = useCreateBlockNote();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track the markdown the editor last emitted, so an external value change
  // (reset to seed) re-parses, but our own emissions don't cause a reload loop.
  const lastEmittedRef = useRef<string | null>(null);

  // Load markdown into blocks on mount and whenever it changes from outside.
  useEffect(() => {
    if (markdown === lastEmittedRef.current) return;
    let cancelled = false;
    void (async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(markdown);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
      lastEmittedRef.current = markdown;
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, markdown]);

  return (
    <div className="blocknote-wrap">
      <BlockNoteView
        editor={editor}
        theme={theme}
        onChange={() => {
          void (async () => {
            const md = await editor.blocksToMarkdownLossy(editor.document);
            lastEmittedRef.current = md;
            onChangeRef.current(md);
          })();
        }}
      />
    </div>
  );
}

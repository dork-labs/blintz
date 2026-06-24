import { useEffect, useRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  InsertCodeBlock,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import type { EditorPanelProps } from "../libraries";

/**
 * MDXEditor — markdown-native WYSIWYG on Lexical.
 *
 * `markdown` is the initial value; `onChange` returns the serialized markdown.
 * MDXEditor doesn't re-read the `markdown` prop after mount, so to support the
 * external "reset to seed" button we imperatively push the new value through the
 * editor ref whenever the parent's markdown diverges from what the editor holds.
 */
export default function MdxEditorPanel({
  markdown,
  onChange,
  theme,
}: EditorPanelProps) {
  const ref = useRef<MDXEditorMethods>(null);

  // Keep the editor in sync when markdown is changed from outside (e.g. reset).
  useEffect(() => {
    const current = ref.current?.getMarkdown();
    if (current !== undefined && current !== markdown) {
      ref.current?.setMarkdown(markdown);
    }
  }, [markdown]);

  return (
    <div className="mdx-wrap">
      <MDXEditor
        ref={ref}
        markdown={markdown}
        onChange={onChange}
        className={theme === "dark" ? "dark-theme dark-editor" : undefined}
        contentEditableClassName="mdx-content"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "ts" }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              ts: "TypeScript",
              js: "JavaScript",
              tsx: "TSX",
              json: "JSON",
              bash: "Bash",
              md: "Markdown",
              "": "Plain text",
            },
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                <InsertTable />
                <InsertThematicBreak />
                <InsertCodeBlock />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}

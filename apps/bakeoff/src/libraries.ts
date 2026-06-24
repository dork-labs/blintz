import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

/** The shape every editor panel receives. One shared markdown string + setter. */
export interface EditorPanelProps {
  markdown: string;
  onChange: (next: string) => void;
  /** "dark" | "light". Panels that support theming should respect this. */
  theme: "dark" | "light";
}

export type RoundTrip = "faithful" | "mostly" | "lossy" | "n/a (viewer)";

export interface LibraryMeta {
  id: string;
  name: string;
  /** npm package(s) actually installed for this panel. */
  packages: string[];
  /** Editor category. */
  kind:
    | "source + preview"
    | "markdown-native WYSIWYG"
    | "block WYSIWYG"
    | "viewer + raw textarea";
  /** Rough installed bundle weight, for the comparison table. */
  bundle: string;
  /** Round-trip expectation, the headline metric of this bakeoff. */
  roundTrip: RoundTrip;
  license: string;
  docsUrl: string;
  npmUrl: string;
  /** One-paragraph profile shown in the UI + README. */
  blurb: string;
  /** Lazy-loaded panel; mounts only when this library is selected. */
  Panel: LazyExoticComponent<ComponentType<EditorPanelProps>>;
}

export const LIBRARIES: LibraryMeta[] = [
  {
    id: "milkdown-react",
    name: "Blintz",
    packages: ["blintz"],
    kind: "markdown-native WYSIWYG",
    bundle: "~650 KB (ProseMirror + remark; no Vue)",
    roundTrip: "faithful",
    license: "MIT",
    docsUrl: "https://github.com/dork-labs/blintz",
    npmUrl: "https://www.npmjs.com/package/blintz",
    blurb:
      "Blintz is this repo's editor: Milkdown's Crepe rebuilt in React, with no Vue in the bundle. It ships the full Crepe surface (slash menu, a block drag handle that reorders, a selection toolbar, code blocks, math, images, tables) and treats markdown as the source of truth, so edits round-trip back to clean markdown. Built on @milkdown/kit (ProseMirror and remark), with the view layer in React through @prosemirror-adapter/react.",
    Panel: lazy(() => import("./editors/MilkdownReactPanel")),
  },
  {
    id: "react-md-editor",
    name: "@uiw/react-md-editor",
    packages: ["@uiw/react-md-editor@4.1.1"],
    kind: "source + preview",
    bundle: "~250 KB (incl. CodeMirror highlight)",
    roundTrip: "faithful",
    license: "MIT",
    docsUrl: "https://uiwjs.github.io/react-md-editor/",
    npmUrl: "https://www.npmjs.com/package/@uiw/react-md-editor",
    blurb:
      "A classic split markdown editor: a raw source textarea on the left with a live rendered preview on the right. Because you edit the markdown source directly, round-trip fidelity is perfect by construction: the string you type is the string you store. Controlled via value/onChange (onChange hands you the markdown), themed by setting data-color-mode on a wrapper, and styled from a single imported CSS file. The pragmatic, lowest-risk choice when the source IS the truth.",
    Panel: lazy(() => import("./editors/ReactMdEditorPanel")),
  },
  {
    id: "mdxeditor",
    name: "@mdxeditor/editor",
    packages: ["@mdxeditor/editor@4.0.4"],
    kind: "markdown-native WYSIWYG",
    bundle: "~600 KB (Lexical + CodeMirror)",
    roundTrip: "mostly",
    license: "MIT",
    docsUrl: "https://mdxeditor.dev/",
    npmUrl: "https://www.npmjs.com/package/@mdxeditor/editor",
    blurb:
      "A true WYSIWYG editor built on Lexical that is markdown-native: it parses markdown in and serializes markdown out, so round-tripping is a first-class goal rather than an afterthought. Everything is opt-in through a plugins array (headings, lists, quote, thematic break, markdown shortcuts, links, tables, code blocks via CodeMirror, and a configurable toolbar). Requires its style.css. The strongest WYSIWYG candidate for a markdown-backed store, though serialization can still normalize whitespace and some constructs.",
    Panel: lazy(() => import("./editors/MdxEditorPanel")),
  },
  {
    id: "blocknote",
    name: "@blocknote/react",
    packages: [
      "@blocknote/core@0.51.4",
      "@blocknote/react@0.51.4",
      "@blocknote/mantine@0.51.4",
    ],
    kind: "block WYSIWYG",
    bundle: "~1 MB (ProseMirror + Mantine)",
    roundTrip: "lossy",
    license: "MPL-2.0 (AGPL for some pro features)",
    docsUrl: "https://www.blocknotejs.org/",
    npmUrl: "https://www.npmjs.com/package/@blocknote/react",
    blurb:
      "A polished Notion-style BLOCK editor: content is a tree of typed blocks, not a text buffer, which gives a delightful editing UX (slash menu, drag handles, nested blocks). Its internal model is JSON; markdown is a secondary export. The API is explicit about this: blocksToMarkdownLossy() and tryParseMarkdownToBlocks() both carry 'lossy' in the name. For a markdown-backed store this is the cautionary data point of the bake-off: superb to write in, but every save/load risks dropping or reshaping markdown the block model can't represent.",
    Panel: lazy(() => import("./editors/BlockNotePanel")),
  },
  {
    id: "react-markdown",
    name: "react-markdown",
    packages: ["react-markdown@10.1.0", "remark-gfm@4.0.1"],
    kind: "viewer + raw textarea",
    bundle: "~120 KB (+ remark-gfm)",
    roundTrip: "n/a (viewer)",
    license: "MIT",
    docsUrl: "https://github.com/remarkjs/react-markdown",
    npmUrl: "https://www.npmjs.com/package/react-markdown",
    blurb:
      "Not an editor at all: a render-only viewer that turns a markdown string into React elements (no dangerouslySetInnerHTML), with GFM tables/strikethrough/etc. via remark-gfm. Paired here with a plain textarea so it represents the 'store markdown, edit the raw source, render read-only' approach. Round-trip is a non-question: the textarea is the source of truth and the renderer never touches it. The safest, lightest option when you do not need WYSIWYG.",
    Panel: lazy(() => import("./editors/ReactMarkdownPanel")),
  },
];

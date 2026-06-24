# Blintz

A React port of [Milkdown](https://milkdown.dev)'s _Crepe_ editor: a Notion-style WYSIWYG markdown editor (selection toolbar, slash menu, block drag handle, rich node views) that round-trips clean markdown, with no Vue in the bundle.

> Why "Blintz"? A blintz is a thin crêpe folded around a filling. That's the idea here: Milkdown's Crepe, wrapped up for React, with a few fillings of our own. Blintz is an independent derivative. It isn't affiliated with or endorsed by the Milkdown project.

```bash
npm install blintz
# peer deps: react >=18, react-dom >=18
```

```tsx
import { MarkdownEditor } from "blintz";
import "blintz/styles.css"; // the component imports this too, so this line is optional

function Example() {
  const [md, setMd] = useState("# Hello\n\nType `/` for commands.");
  return <MarkdownEditor value={md} onChange={setMd} />;
}
```

The whole public surface is one controlled `<MarkdownEditor value onChange />` component, plus `placeholder` and `className`. The Milkdown engine, the Crepe-derived feature views, and the theme CSS sit behind it.

## Why Blintz

Milkdown's [Crepe](https://milkdown.dev) is its ready-made editor on top of ProseMirror. Crepe builds its UI (toolbars, menus, node views) in Vue, so dropping it into a React app means bundling and bridging a second framework. Blintz gives you the same editing experience in React, and it treats markdown as the source of truth, so what you type comes back as clean markdown when you save (handy when you store the markdown).

It works at the seam Milkdown itself draws. The engine is framework-agnostic: ProseMirror and remark, the schema, commands, input rules, keymaps, and the provider controllers that drive tooltips, menus, and handles. Blintz keeps all of that from `@milkdown/kit`. It rewrites only the view layer in React, mounting components through [`@prosemirror-adapter/react`](https://github.com/prosemirror-adapter/prosemirror-adapter)'s node-view and plugin-view factory hooks.

## Design goals

1. **Round-trip fidelity comes first.** Load markdown, edit, save markdown, and the result stays faithful and clean. Blintz turns off Milkdown's empty-line `<br />` behavior so stored prose stays free of HTML noise: blank lines collapse the markdown-native way, and any legacy `<br />` is stripped on load.
2. No Vue. Blintz never imports `@milkdown/crepe`, the Vue-bundled `@milkdown/kit/component/*`, or `createApp`. The build is checked for Vue runtime markers; the only allowed `vue` string is CodeMirror's `.vue` syntax pack.
3. A small, host-agnostic API: one controlled component, no router or store assumptions, themed with CSS variables.
4. Works on React 18 and 19. `react` and `react-dom` are peer deps.

## Features

- Block editing: a slash `/` command menu and a floating `+`/`::` block handle. Drag-to-reorder keeps list items in the right list and renumbers them.
- Lists: ordered, bullet, and task lists with live numbering.
- Code blocks: a real CodeMirror editor per block, with a language picker and a preview.
- Math: inline `$…$` and block math via KaTeX, round-tripping to `$$…$$`.
- Images: uploader or URL input, with captions.
- Tables: GFM tables with column and row drag handles, and drag-to-reorder.
- Links: hover preview and an inline edit tooltip.
- A selection toolbar (bold, italic, strikethrough, code, link), a block placeholder, a virtual cursor, and dark mode.

Icons come from [Lucide](https://lucide.dev), rendered through a sanitized `<Icon>`.

## Theming

Visual styling runs on `--crepe-*` CSS custom properties (the token names are inherited from Crepe), scoped to `.milkdown`. Override them on any ancestor to re-theme. Dark mode turns on two ways: the OS `prefers-color-scheme: dark`, and an explicit `.dark` or `[data-theme="dark"]` ancestor, so you can force it regardless of OS.

```html
<div data-theme="dark">
  <!-- <MarkdownEditor /> renders dark here -->
</div>
```

## Architecture

- `src/MarkdownEditor.tsx`: the public component and the provider stack (`MilkdownProvider` over `ProsemirrorAdapterProvider`, with an `EditorCtxProvider` so portal-rendered views can read the live Milkdown `Ctx`).
- `src/useBlintzEditor.ts`: the engine baseline and feature registration, a React rebuild of Crepe's `CrepeBuilder` core, assembled from `@milkdown/kit` (commonmark, gfm, history, indent, trailing, clipboard, upload, listener), then each feature.
- `src/features/*`: one folder per feature. Each reuses the engine (schema, commands, providers) and rewrites only the view.
- `src/shared/*`: the sanitized `Icon`, the ctx-to-React bridge, and `GroupBuilder`.
- `src/theme/*`: feature CSS, the `--crepe-*` tokens, and the dark-mode variables.

## Development

The repo ships a playground that mounts Blintz next to other React markdown editors and shows live markdown output for round-trip comparison.

```bash
npm install
npm run typecheck   # the package and its React 18/19 consumers
npm test            # vitest, including the empty-paragraph round-trip guard
```

## License and attribution

[MIT](./LICENSE), © Dork Labs. Blintz is a derivative of Milkdown's Crepe (MIT, © Mirone) and bundles other open-source work: ProseMirror, remark, KaTeX, CodeMirror, Lucide, Floating UI, and DOMPurify. See [ATTRIBUTION.md](./ATTRIBUTION.md) for the full credits and the upstream-sync notes.

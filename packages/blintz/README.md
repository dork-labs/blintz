# Blintz

A React port of [Milkdown](https://milkdown.dev)'s _Crepe_ editor: a Notion-style WYSIWYG markdown editor (selection toolbar, slash menu, block drag handle, rich node views) that round-trips clean markdown, with no Vue in the bundle.

> Why "Blintz"? A blintz is a thin crêpe folded around a filling. That's the idea here: Milkdown's Crepe, wrapped up for React, with a few fillings of our own. Blintz is an independent derivative. It isn't affiliated with or endorsed by the Milkdown project.

```bash
npm install blintz
# peer deps: react >=18, react-dom >=18
```

```tsx
import { MarkdownEditor } from "blintz";
import "blintz/styles.css"; // required when consuming the built package

function Example() {
  const [md, setMd] = useState("# Hello\n\nType `/` for commands.");
  return <MarkdownEditor value={md} onChange={setMd} />;
}
```

The whole public surface is one controlled `<MarkdownEditor value onChange />` component, plus `editable`, `placeholder`, `theme`, and `className`. The Milkdown engine, the Crepe-derived feature views, and the theme CSS sit behind it.

## Read-only mode

Pass `editable={false}` to render a document read-only. The content still renders with full fidelity (lists, code with highlighting, tables, images, links, math), but editing is off: ProseMirror's `contenteditable` is disabled and the editing chrome is suppressed (the slash menu, the `+`/`::` block handle and drag-to-reorder, the selection toolbar, the link-edit popovers, and the placeholder).

```tsx
<MarkdownEditor value={md} editable={false} />
```

`editable` defaults to `true`, so existing consumers are unaffected. It is reactive: toggle it on a mounted editor and the change takes effect right away, with no remount. The editor turns editable or read-only in place, so scroll position and selection are kept and the editing chrome (slash menu, block handle, drag) works the moment editing is enabled.

```tsx
<MarkdownEditor value={md} editable={mode === "edit"} onChange={setMd} />
```

(The `plugins` prop is the exception: it is read once at mount, so changing the extension set still needs a remount.)

## Why Blintz

Milkdown's [Crepe](https://milkdown.dev) is its ready-made editor on top of ProseMirror. Crepe builds its UI (toolbars, menus, node views) in Vue, so dropping it into a React app means bundling and bridging a second framework. Blintz gives you the same editing experience in React, and it treats markdown as the source of truth, so what you type comes back as clean markdown when you save (handy when you store the markdown).

It works at the seam Milkdown itself draws. The engine is framework-agnostic: ProseMirror and remark, the schema, commands, input rules, keymaps, and the provider controllers that drive tooltips, menus, and handles. Blintz keeps all of that from `@milkdown/kit`. It rewrites only the view layer in React, mounting components through [`@prosemirror-adapter/react`](https://github.com/prosemirror-adapter/prosemirror-adapter)'s node-view and plugin-view factory hooks.

## Design goals

1. **Round-trip fidelity comes first.** Load markdown, edit, save markdown, and the result stays faithful and clean. Blintz turns off Milkdown's empty-line `<br />` behavior so stored prose stays free of HTML noise: blank lines collapse the markdown-native way, and standalone legacy `<br />` artifacts are stripped on load. Inline HTML breaks become markdown hard breaks.
2. No Vue. Blintz never imports `@milkdown/crepe`, the Vue-bundled `@milkdown/kit/component/*`, or `createApp`. The build is checked for Vue runtime markers; the only allowed `vue` string is CodeMirror's `.vue` syntax pack.
3. A small, host-agnostic API: one controlled component, no router or store assumptions, themed with CSS variables.
4. Works on React 18 and 19. `react` and `react-dom` are peer deps.

## Features

- Block editing: a slash `/` command menu and a floating `+`/`::` block handle. Drag-to-reorder keeps list items in the right list and renumbers them.
- Lists: ordered, bullet, and task lists with live numbering.
- Code blocks: a real CodeMirror editor per block, with a language picker and a preview.
- Math: inline `$…$` and block math via KaTeX, round-tripping to `$$…$$`.
- Images: uploader or URL input, with captions.
- Tables: GFM tables with column and row drag handles, plus a keyboard and touch menu to add, move or delete rows and columns.
- Links: hover preview and an inline edit tooltip.
- A selection toolbar (bold, italic, strikethrough, code, link), a block placeholder, a virtual cursor, and dark mode.

Icons come from [Lucide](https://lucide.dev), rendered through a sanitized `<Icon>`.

## Theming

Blintz ships its own scoped typography, so importing its stylesheet does not reset the host app. Body text is 16px with a 1.65 line height, lists have one marker, and code, tables and editing controls share one palette.

Use `theme="light"` or `theme="dark"` to set the palette. The default, `theme="auto"`, follows the nearest `.light`, `.dark`, or `data-theme="light|dark"` ancestor, then the OS preference. A theme change updates the mounted editor without resetting content, selection or history.

```tsx
<MarkdownEditor value={md} onChange={setMd} theme={appTheme} />
```

Set public `--blintz-*` variables on the editor's `className` or any ancestor to match your app. Variables contain complete CSS colors, not raw HSL channels. Both theme palettes respect these overrides.

```css
.document-editor {
  --blintz-color-background: var(--app-background);
  --blintz-color-on-background: var(--app-text);
  --blintz-color-surface: var(--app-surface);
  --blintz-color-on-surface: var(--app-text);
  --blintz-color-primary: var(--app-link);
  --blintz-font-default: var(--app-font);
  --blintz-font-title: var(--app-font);
  --blintz-font-code: var(--app-monospace);
}
```

Color inputs: `--blintz-color-` followed by `background`, `on-background`, `surface`, `surface-low`, `on-surface`, `on-surface-variant`, `outline`, `primary`, `secondary`, `on-secondary`, `inverse`, `on-inverse`, `inline-code`, `error`, `hover`, `selected`, or `inline-area`. Supply contrasting foreground/background pairs together.

Syntax inputs: `--blintz-code-keyword`, `--blintz-code-string`, `--blintz-code-number`, `--blintz-code-comment`, `--blintz-code-function`, `--blintz-code-type`, and `--blintz-code-operator`. CodeMirror reads these live, including when switching themes.

Layout inputs: `--blintz-font-size`, `--blintz-padding`, `--blintz-readonly-padding`, and `--crepe-block-handle-gutter`. The default gutter shrinks on narrow screens. Read-only documents do not reserve room for editing handles. `--blintz-shadow-1` and `--blintz-shadow-2` customize floating controls.

Existing `--crepe-*` feature variables remain available as outputs. Legacy overrides must target `.milkdown` directly with sufficient specificity; ancestor overrides should use the new `--blintz-*` inputs. Remove external `.prose` classes and Nord-specific CSS from the editor surface, since Blintz now owns the complete prose styling.

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

## Dependency troubleshooting

ProseMirror plugins must share the same installed `prosemirror-model`, `prosemirror-state`, and `prosemirror-view` versions. An older pnpm lockfile can retain separate copies after updating Blintz. The editor may render correctly until a node selection throws an error such as `DecorationGroup` or `localsInner`, because objects from the two copies fail identity checks.

Run `pnpm why prosemirror-model`, `pnpm why prosemirror-state`, and `pnpm why prosemirror-view` to inspect the dependency paths. Update and deduplicate compatible versions together. If the host still retains separate copies, use its `pnpm.overrides` to select one compatible version of each package for the whole app, then reinstall. Avoid forcing versions outside the dependent packages' supported ranges. Restart the dev server and clear its dependency prebundle cache after changing the graph.

## License and attribution

[MIT](./LICENSE), © Dork Labs. Blintz is a derivative of Milkdown's Crepe (MIT, © Mirone) and bundles other open-source work: ProseMirror, remark, KaTeX, CodeMirror, Lucide, Floating UI, and DOMPurify. See [ATTRIBUTION.md](./ATTRIBUTION.md) for the full credits and the upstream-sync notes.

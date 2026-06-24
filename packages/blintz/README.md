# Blintz

**A Vue-free React port of [Milkdown](https://milkdown.dev)'s _Crepe_ editor** —
the polished, Notion-style WYSIWYG markdown editing experience (selection toolbar,
slash menu, block drag handle, rich node views), rebuilt as React components, with
**clean markdown round-tripping**.

> _Blintz?_ A blintz is a thin crêpe folded around a filling — which is just what
> this is: Milkdown's **Crepe**, wrapped up for **React** (with a few fillings of
> our own). Blintz is an independent derivative and is **not** affiliated with or
> endorsed by the Milkdown project.

```bash
npm install blintz
# peer deps: react >=18, react-dom >=18
```

```tsx
import { MarkdownEditor } from "blintz";
import "blintz/styles.css"; // also imported by the component; explicit is fine

function Example() {
  const [md, setMd] = useState("# Hello\n\nType `/` for commands.");
  return <MarkdownEditor value={md} onChange={setMd} />;
}
```

That's the whole public surface: one controlled `<MarkdownEditor value onChange />`
component (plus `placeholder` and `className`). Everything else — the Milkdown
engine baseline, the Crepe-derived feature views, the theme CSS — is an
implementation detail behind it.

## Why Blintz

[Milkdown's **Crepe**](https://milkdown.dev) is a beautiful, batteries-included
writing UX on top of ProseMirror. But Crepe ships its UI (toolbars, menus, node
views) as **Vue** components — so dropping it into a React app means bundling and
bridging a second UI framework. Blintz gives you Crepe's UX **natively in React,
with no Vue in the bundle**, and treats **markdown as the source of truth** so what
you type round-trips back to clean markdown (ideal when you store the markdown).

It works by taking Milkdown apart at the seam Milkdown itself draws:

- **Reuse the engine as-is** — Milkdown's core is framework-agnostic (ProseMirror +
  remark; the schema, commands, input rules, keymaps, and the "provider"
  controllers that drive tooltips/menus/handles). Blintz keeps all of it
  (`@milkdown/kit`, **not** `@milkdown/crepe`).
- **Rewrite only the view layer in React** — Crepe's Vue components become React
  components mounted through
  [`@prosemirror-adapter/react`](https://github.com/prosemirror-adapter/prosemirror-adapter)'s
  node-view / plugin-view factory hooks.

## Design goals

1. **Markdown round-trip fidelity is non-negotiable.** Load markdown → edit → save
   markdown, faithfully and *cleanly*. Blintz even disables Milkdown's empty-line
   `<br />` hack so stored prose stays free of HTML noise (blank lines collapse the
   markdown-native way; legacy `<br />` is stripped on load).
2. **Zero Vue.** Never imports `@milkdown/crepe`, the Vue-bundled
   `@milkdown/kit/component/*`, or `createApp`. The build is checked for Vue
   runtime markers; the only allowed `vue` string is CodeMirror's `.vue` syntax pack.
3. **Crepe-parity UX.** A real writing experience, not a textarea.
4. **A tiny, host-agnostic API.** One controlled component, no router/store
   assumptions, themeable via CSS variables.
5. **React 18 and 19.** `react` / `react-dom` are peer deps.

## Features

- **Block editing** — slash `/` command menu and the floating `+`/`::` block
  handle, with **drag-to-reorder** that keeps list items in the right list and
  renumbers correctly.
- **Lists** — ordered / bullet / task lists with live, correct numbering.
- **Code blocks** — a real **CodeMirror** editor per block, language picker, preview.
- **Math (LaTeX)** — inline `$…$` and block math via **KaTeX**, round-tripping to `$$…$$`.
- **Images** — uploader / URL input with captions.
- **Tables** — GFM tables with column/row drag handles and **drag-to-reorder**.
- **Links** — hover preview + inline edit tooltip.
- **Selection toolbar** — bold / italic / strike / code / link.
- **Polish** — block placeholder, a virtual cursor, and **dark mode**.

Icons are [Lucide](https://lucide.dev), rendered through a sanitized `<Icon>`.

## Theming

All visual styling is driven by `--crepe-*` CSS custom properties (the token names
are inherited from Crepe), scoped to `.milkdown`. Override them on any ancestor to
re-theme. **Dark mode** activates two ways: the OS `prefers-color-scheme: dark`,
**and** an explicit `.dark` / `[data-theme="dark"]` ancestor — so you can force it
regardless of OS:

```html
<div data-theme="dark">
  <!-- <MarkdownEditor /> renders dark here -->
</div>
```

## Architecture

- `src/MarkdownEditor.tsx` — the public component + provider stack
  (`MilkdownProvider > ProsemirrorAdapterProvider`, with an `EditorCtxProvider` so
  portal-rendered views can read the live Milkdown `Ctx`).
- `src/useBlintzEditor.ts` — the engine baseline + feature registration (a React
  rebuild of Crepe's `CrepeBuilder` core), assembled from `@milkdown/kit`:
  commonmark + gfm + history + indent + trailing + clipboard + upload + listener,
  then each feature.
- `src/features/*` — one folder per feature; reuses the engine
  (schema / commands / providers) and rewrites only the view.
- `src/shared/*` — the sanitized `Icon`, the ctx→React bridge, `GroupBuilder`.
- `src/theme/*` — feature CSS + the `--crepe-*` tokens and dark-mode variables.

## Development

The repo includes a cross-library **playground** that mounts Blintz alongside other
React markdown editors and shows live markdown output for round-trip comparison.

```bash
npm install
npm run typecheck   # the package + its React 18/19 consumers
npm test            # vitest (includes the empty-paragraph round-trip guard)
```

## License & attribution

[MIT](./LICENSE) © Dork Labs. Blintz is a derivative of Milkdown's Crepe (MIT, ©
Mirone) and bundles other open-source work (ProseMirror, remark, KaTeX, CodeMirror,
Lucide, Floating UI, DOMPurify, …). See [ATTRIBUTION.md](./ATTRIBUTION.md) for full
credits and the upstream-sync notes.

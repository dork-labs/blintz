<div align="center">

# Blintz

A React port of [Milkdown](https://milkdown.dev)'s _Crepe_ editor: a Notion-style WYSIWYG markdown editor that round-trips clean markdown (with no Vue in the bundle).

</div>

> Why "Blintz"? A blintz is a thin crêpe folded around a filling. That's the idea here: Milkdown's Crepe, wrapped up for React, with a few fillings of our own. Blintz is an independent derivative. It isn't affiliated with or endorsed by the Milkdown project.

```bash
npm install blintz   # peer deps: react >=18, react-dom >=18
```

```tsx
import { MarkdownEditor } from "blintz";
import "blintz/styles.css";

function Example() {
  const [md, setMd] = useState("# Hello\n\nType `/` for commands.");
  return <MarkdownEditor value={md} onChange={setMd} />;
}
```

## Why Blintz

Milkdown's [Crepe](https://milkdown.dev) is its ready-made editor: a full writing UI on top of ProseMirror. Crepe builds that UI in Vue, so using it inside a React app means shipping a second framework. Blintz gives you the same editing experience in React, and it treats markdown as the source of truth, so what you type comes back as clean markdown when you save.

It reuses Milkdown's framework-agnostic engine (`@milkdown/kit`) as is and rewrites only Crepe's view layer in React, through [`@prosemirror-adapter/react`](https://github.com/prosemirror-adapter/prosemirror-adapter). No Vue reaches the bundle.

## Features

- Slash `/` command menu, plus a `+`/`::` block handle with drag-to-reorder
- A selection toolbar (bold, italic, strikethrough, code, link)
- Ordered, bullet, and task lists with live numbering
- CodeMirror code blocks with a language picker
- KaTeX math, inline and block
- Images, GFM tables with drag-to-reorder, and link tooltips
- Dark mode

See [`packages/blintz/README.md`](./packages/blintz/README.md) for the package docs and [`ATTRIBUTION.md`](./packages/blintz/ATTRIBUTION.md) for credits.

## Repo layout

A monorepo (npm workspaces):

```
packages/
  blintz/        the library, published to npm as `blintz`
apps/
  bakeoff/       a playground that compares Blintz against other React markdown
                 editors, with a markdown-output panel for judging round-trip
examples/
  basic/         the smallest Vite + React usage
```

## Development

```bash
npm install
npm run dev         # the bakeoff (the main dev surface) at http://localhost:5180
npm run typecheck   # all workspaces
npm test            # vitest, including the empty-paragraph round-trip guard
npm run build       # build the library (dist: ESM + .d.ts + CSS)
```

The apps read the library from TypeScript source, so edits hot-reload with no build step. Iterate in `apps/bakeoff` against live source.

## License

[MIT](./LICENSE), © Dork Labs. A derivative of Milkdown's Crepe (MIT, © Mirone). See [ATTRIBUTION.md](./packages/blintz/ATTRIBUTION.md).

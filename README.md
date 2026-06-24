<div align="center">

# Blintz

**A Vue-free React port of [Milkdown](https://milkdown.dev)'s _Crepe_ editor** —
a polished, Notion-style WYSIWYG markdown editor, with clean markdown round-tripping.

</div>

> _Blintz?_ A blintz is a thin crêpe folded around a filling — which is just what
> this is: Milkdown's **Crepe**, wrapped up for **React** (with a few fillings of
> our own). Blintz is an independent derivative and is **not** affiliated with or
> endorsed by the Milkdown project.

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

[Milkdown's **Crepe**](https://milkdown.dev) is a beautiful, batteries-included
writing UX on top of ProseMirror — but it ships its UI as **Vue** components, so
using it in React means bundling a second framework. Blintz gives you Crepe's UX
**natively in React, with no Vue in the bundle**, and treats **markdown as the
source of truth** so what you type round-trips back to clean markdown.

It reuses Milkdown's framework-agnostic engine (`@milkdown/kit`) as-is and
re-implements Crepe's Vue view layer in React (via
[`@prosemirror-adapter/react`](https://github.com/prosemirror-adapter/prosemirror-adapter)).

**Features:** slash `/` command menu · `+`/`::` block handle with drag-to-reorder ·
selection toolbar · lists (ordered / bullet / task) · CodeMirror code blocks · KaTeX
math · images · GFM tables with drag-to-reorder · link tooltips · dark mode.

See [`packages/blintz/README.md`](./packages/blintz/README.md) for the full
package docs, and [`ATTRIBUTION.md`](./packages/blintz/ATTRIBUTION.md) for credits.

## Repo layout

This is a monorepo (npm workspaces):

```
packages/
  blintz/        the library — published to npm as `blintz`
apps/
  bakeoff/       a live comparison playground: Blintz vs. other React markdown
                 editors, with a markdown-output panel for round-trip fidelity
examples/
  basic/         the smallest possible Vite + React usage
```

## Development

```bash
npm install
npm run dev         # the bakeoff (the primary dev surface) at http://localhost:5180
npm run typecheck   # all workspaces
npm test            # vitest (includes the empty-paragraph round-trip guard)
npm run build       # build the library (dist: ESM + .d.ts + CSS)
```

The apps consume the library directly from TypeScript source (no build step needed
for local dev — edits hot-reload), so iterate in `apps/bakeoff` against live source.

## License

[MIT](./LICENSE) © Dork Labs. A derivative of Milkdown's Crepe (MIT, © Mirone) —
see [ATTRIBUTION.md](./packages/blintz/ATTRIBUTION.md).

# Markdown editor bake-off

A standalone playground for comparing **5 React markdown editor / viewer
libraries** by editing the **same** content in each and judging them — with a
special focus on **markdown round-trip fidelity**.

This matters because in this project the database stores experiment prose as
**markdown text** (`docs/experiments/*.md` and the `runs`/experiment contracts).
An editor that silently rewrites or drops markdown on save is **disqualifying**,
no matter how nice it feels to type in. So the headline question here is not
"which is prettiest" but **"does what you stored come back unchanged?"**

> This app is intentionally **outside the monorepo workspaces**. The root
> `package.json` only globs `packages/*` and `apps/*`; `playgrounds/*` is
> deliberately excluded. It has its own `package.json` and its own
> `node_modules` — install and run it on its own.

## Run it

```bash
cd playgrounds/markdown-editors
npm install
npm run dev      # Vite dev server on http://localhost:5180
```

Other scripts:

```bash
npm run build      # tsc -b && vite build  (type-checks then bundles)
npm run typecheck  # tsc -b --noEmit
npm run preview    # serve the production build
```

## How it works

- A single shared `markdown` string lives in `App.tsx`, seeded with
  `src/seed.ts` — representative content (loosely based on a real experiment
  write-up) that deliberately stresses round-tripping: h1/h2/h3, bold/italic,
  ordered + unordered (and nested) lists, a link, inline `code`, a fenced
  ```ts``` block, a blockquote, a GFM table, and a horizontal rule.
- A **switcher** picks which of the 5 libraries is active. Each editor is a
  lazy/dynamic import, so it mounts **only when selected** — keeping them
  isolated and the initial load light. (You can see this in the build output:
  each panel is its own chunk.)
- A persistent **"Markdown output"** panel shows the live shared string. While
  you edit in a WYSIWYG editor, watch this panel to see exactly what markdown it
  produces. It has:
  - a **Raw** view of the current markdown,
  - a **Diff vs seed** view (line-level add/remove), and
  - char/line delta stats plus a **drift vs seed / matches seed** badge,
  - a **Reset to seed** button.
- A static, hand-authored **comparison table** (data in `src/libraries.ts`).
- A per-library **notes box** persisted to `localStorage`, so you can jot
  evaluation notes while testing.
- A **light/dark toggle** (persisted); every panel is theme-aware.

## Evaluation criteria

When judging each library, weigh:

1. **Round-trip fidelity** — _the_ criterion. Edit, then diff the output against
   the seed. Did headings, lists, code fences, the table, and whitespace survive
   a round trip through the editor's model? For a markdown-backed store, a lossy
   editor is out.
2. **Editing UX** — how good does it feel to actually write? (slash menus, drag
   handles, inline formatting, keyboard shortcuts).
3. **Bundle weight** — what does it cost the client? (see the per-panel chunks).
4. **Setup ergonomics** — how fiddly was integration? CSS imports, plugin
   wiring, imperative vs declarative lifecycle.
5. **Theming** — does dark mode work, and how hard was it?
6. **Extensibility** — can you add custom blocks / marks / toolbar items?
7. **Maintenance & license** — release cadence, and license fit (MIT vs
   MPL/AGPL matters for a product).

## The five libraries

- **@uiw/react-md-editor** (`source + preview`) — a classic split editor: a raw
  markdown textarea with a live preview beside it. Because you edit the source
  directly, round-trip is **perfect by construction** — the string you type is
  the string you store. Controlled `value`/`onChange` (onChange returns the
  markdown), themed via `data-color-mode`, one CSS import
  (`markdown-editor.css`). The lowest-risk option when the source _is_ the truth.

- **@mdxeditor/editor** (`markdown-native WYSIWYG`, Lexical) — a true WYSIWYG
  editor that is markdown-native: it parses markdown in and serializes markdown
  out, so round-tripping is a first-class goal. Everything is opt-in via a
  `plugins` array (headings, lists, quote, thematic break, markdown shortcuts,
  links, tables, code blocks via CodeMirror, a configurable toolbar). Needs
  `@mdxeditor/editor/style.css`. The strongest WYSIWYG candidate for a
  markdown-backed store — though serialization can still normalize whitespace
  and some constructs (watch the diff).

- **Milkdown (`@milkdown/react`)** (`markdown-native WYSIWYG`, ProseMirror + remark)
  — Milkdown is a headless WYSIWYG framework. We use the official **`@milkdown/react`**
  bindings (`MilkdownProvider` + `useEditor` + `<Milkdown/>`) with the commonmark +
  gfm presets, the listener plugin (`markdownUpdated → onChange`), and the nord
  theme; `defaultValueCtx` seeds it and `useInstance` + `replaceAll` handles external
  resets. Round-trips through remark, so fidelity is good. **Deliberately not Crepe**
  (its batteries-included distribution): Crepe's built-in UI chrome is built with
  **Vue 3**, and we want React only. No Vue is shipped in the bundle here (we never
  import Milkdown's Vue-based `@milkdown/components`), though `@milkdown/react` still
  installs `vue` in `node_modules` transitively via `@milkdown/kit`. The trade-off:
  you build the toolbar/slash-menu UI yourself — which is the plan (rebuild Crepe's
  polished surface in React).

- **@blocknote/react** (`block WYSIWYG`, ProseMirror + Mantine) — a polished,
  Notion-style **block** editor (slash menu, drag handles, nested blocks). Its
  internal model is a JSON block tree, **not** markdown; markdown is a secondary
  export, and the API says so out loud: `blocksToMarkdownLossy()` and
  `tryParseMarkdownToBlocks()`. This is the **cautionary data point** of the
  bake-off: superb to write in, but every save/load risks reshaping markdown the
  block model can't represent. (Note the license: MPL-2.0, with AGPL for some
  pro features.)

- **react-markdown** + **remark-gfm** (`viewer + raw textarea`) — not an editor
  at all: a render-only viewer (no `dangerouslySetInnerHTML`) that turns a
  markdown string into React elements, with GFM tables/strikethrough/task lists
  via `remark-gfm`. Paired here with a plain `<textarea>` to represent the
  "store markdown, edit the raw source, render read-only" approach. Round-trip is
  a non-question — the textarea is the source of truth and the renderer never
  touches it. The lightest, safest option when you don't need WYSIWYG, and the
  closest fit to how this project's prose is actually stored.

## Round-trip takeaways (what to expect)

- **react-md-editor** and **react-markdown** are loss-free by design — they don't
  re-serialize, they edit the source.
- **MDXEditor** and **Milkdown** are markdown-native and round-trip well, but
  watch the diff for normalized whitespace, list markers, and table padding.
- **BlockNote** is the one to scrutinize: parse markdown in, edit, export back,
  and compare to the seed — the drift is the whole lesson.

## Layout

```
src/
  App.tsx                 shared markdown state, switcher, theme, layout
  seed.ts                 the representative seed markdown
  libraries.ts            library metadata + lazy panel imports (table data)
  diff.ts                 tiny line-level LCS diff for the diff view
  index.css               dark/light theming + per-editor host styles
  components/
    MarkdownOutput.tsx    live markdown panel + raw/diff views + reset
    ComparisonTable.tsx   static comparison table
    NotesBox.tsx          per-library notes, persisted to localStorage
  editors/
    ReactMdEditorPanel.tsx
    MdxEditorPanel.tsx
    MilkdownPanel.tsx
    BlockNotePanel.tsx
    ReactMarkdownPanel.tsx
```

Every panel implements the same `EditorPanelProps` (`markdown`, `onChange`,
`theme`) so they're interchangeable against the shared state.

# Bakeoff

A side-by-side playground for React markdown editors, built around one question: when you edit, does your markdown come back unchanged?

Blintz leads the lineup. The other editors are here for comparison, so you can watch how Blintz holds up against the alternatives on round-trip fidelity, editing feel, and bundle weight.

## Run it

From the monorepo root:

```bash
npm install
npm run dev      # http://localhost:5180
```

Or from this directory:

```bash
npm run dev
npm run build      # type-check, then bundle
npm run typecheck
```

## How it works

One shared `markdown` string lives in `App.tsx`, seeded from `src/seed.ts` with content that stresses round-tripping: headings, bold and italic, ordered and nested lists, a link, inline code, a fenced code block, a blockquote, a GFM table, and a rule.

A switcher picks the active editor, and each panel is a lazy import that mounts only when selected. A persistent "Markdown output" panel shows the live shared string as you type. It has a raw view, a line-level diff against the seed, char and line deltas, a "matches seed" badge, and a reset button. A comparison table (`src/libraries.ts`) and a per-editor notes box (saved to `localStorage`) fill out the page, with a light/dark toggle on top.

## The lineup

- **Blintz** (`blintz`). This repo's editor: Milkdown's Crepe rebuilt in React, no Vue in the bundle. A full WYSIWYG surface (slash menu, drag handle, selection toolbar, code/math/image/table views) that round-trips through remark.
- **@uiw/react-md-editor**. A raw source textarea with a live preview. You edit the markdown directly, so round-trip is exact by construction. The baseline.
- **@mdxeditor/editor**. A markdown-native WYSIWYG on Lexical. It parses markdown in and serializes markdown out; watch the diff for normalized whitespace.
- **@blocknote/react**. A Notion-style block editor. Its model is a JSON block tree, and markdown is a lossy export (`blocksToMarkdownLossy`). Lovely to write in, risky for a markdown store.
- **react-markdown**. Not an editor: a render-only viewer paired with a textarea, standing in for the "store markdown, edit the source, render read-only" approach.

## What to watch

Round-trip fidelity is the headline. Edit in a panel, then read the output panel and the diff. Did headings, lists, code fences, the table, and whitespace survive the editor's model? For a markdown-backed store, an editor that drifts on every save is the thing to catch.

## Layout

```
src/
  App.tsx                 shared markdown state, switcher, theme, layout
  seed.ts                 the seed markdown
  libraries.ts            editor metadata + lazy panel imports
  diff.ts                 line-level diff for the output panel
  components/             MarkdownOutput, ComparisonTable, NotesBox
  editors/                one panel per editor (MilkdownReactPanel renders Blintz)
```

Every panel implements the same `EditorPanelProps` (`markdown`, `onChange`, `theme`), so they swap against the shared state.

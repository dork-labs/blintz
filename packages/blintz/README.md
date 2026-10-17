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

The whole public surface is one controlled `<MarkdownEditor value onChange />` component, plus `editable`, `placeholder`, `theme`, `className`, `embeds`, `wikiLinks`, `mermaid` and `plugins`. The Milkdown engine, the Crepe-derived feature views, and the theme CSS sit behind it.

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

## Embeds

Embeds put your own React components inside a document while the document stays plain markdown. Write a block directive, and Blintz renders the component you registered under that name:

```md
::chart[Tasks closed]{kind="bar" src="tasks/q3"}

:::callout{tone="warn"}
Anything in here is **ordinary markdown**, editable in place.
:::
```

```tsx
import { MarkdownEditor, type EmbedProps, type EmbedRegistry } from "blintz";

function Chart({ attributes, label }: EmbedProps) {
  return <MyChart src={attributes.src} kind={attributes.kind} title={label} />;
}

function Callout({ attributes, children }: EmbedProps) {
  return <aside data-tone={attributes.tone}>{children}</aside>;
}

const embeds: EmbedRegistry = {
  chart: { component: Chart, title: "Chart", defaultAttributes: { kind: "bar" } },
  callout: { component: Callout, kind: "container" },
};

<MarkdownEditor value={md} onChange={setMd} embeds={embeds} />;
```

- `::name{…}` is a leaf embed. `:::name … :::` is a container whose markdown content arrives as `children`. Put `children` where the editable content should go. If a component doesn't render `children` (or renders them later), the content shows below it, so it is never hidden.
- Inside a container, Enter on an empty last line leaves it, as in a quote. Backspace at its very start selects the whole embed instead of unwrapping it; press it again to delete the embed.
- A component gets `name`, `attributes` (all strings), `label` (the `[…]` text), `editable`, and, while the document is editable, `updateAttributes(next)`, which writes new attributes back to the markdown as one undoable step. Render from these props alone, so the same component can render a published page on the server.
- `validate` takes a [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType and others) or a plain function returning `{ issues }`. Invalid attributes show the problems instead of the component.
- A name with nothing registered shows a placeholder and stays in the markdown unchanged. A component that throws shows an error in its place; the rest of the editor keeps working.
- Registered embeds appear in the slash menu under **Embeds**. `hideFromMenu` leaves one out.
- `embeds` is reactive: changing it re-renders embeds in place, with no remount.

Only block directives are recognized. Inline `:name[…]` directives are not, so text such as `:smile:` or `note:this` is never touched, and neither is a line like `::: note` or `::std::cout`. What does change meaning:

- A line that is a complete directive (`::name`, `::name[label]{attrs}` or `:::name…`, with nothing after it) becomes an embed, even inside a paragraph. When you mean it as text, write `\::name`.
- Attributes are written back as double-quoted `key="value"` pairs in their written order. Other spellings still parse and are rewritten in that form: `key=value`, `#id`, `.class`. A repeated key keeps its last value, and `{a=""}` is written `{a}`.

### Rendering directives without the editor

`blintz/markdown` holds every grammar Blintz adds (directives and wiki links) as remark plugins, with no React or ProseMirror; `blintz/directives` holds the directive part alone. Use them to publish documents or read them on a server:

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { remarkBlockDirectives, remarkWikiLinks, validateEmbedAttributes } from "blintz/markdown";

const tree = unified().use(remarkParse).use(remarkWikiLinks).use(remarkBlockDirectives).parse(markdown);
// `leafDirective` and `containerDirective` nodes carry `name` and `attributes`;
// `wikiLink` nodes carry `target`, `heading`, `label` and `embed`.
```

When writing markdown, `remarkBlockDirectives` wraps the paragraph handler so text that looks like a directive stays text. Register any plugin with its own paragraph handler *before* it, so the guard wraps that handler instead of being replaced.

## Wiki links

`[[Page]]`, `[[Page#Heading]]`, `[[Page|label]]` and `![[Page]]` are links between documents. The markdown keeps exactly what the author typed; where a link points is up to you:

```tsx
<MarkdownEditor
  value={md}
  onChange={setMd}
  wikiLinks={{
    resolve: async ({ target, heading }) => {
      const page = await pages.find(target);
      return page
        ? { exists: true, href: `/docs/${page.id}${heading ? `#${heading}` : ""}`, title: page.title }
        : { exists: false };
    },
    search: (query) => pages.search(query).map((page) => ({ target: page.title, description: page.space })),
    onOpen: (link, resolution) => router.push(resolution?.href ?? `/new?title=${link.target}`),
  }}
/>
```

- `resolve` gets `{ target, heading, label, embed }` and returns `{ exists, href?, title? }`, sync or async. Each distinct target, heading and link/embed kind is resolved once while the function stays the same (failures included), so pass a stable function, and a new one to refresh every link. A link to a page that doesn't exist is shown as missing. Only `http:`, `https:`, `mailto:` and relative `href`s are used.
- `search` feeds a suggestion menu that opens when you type `[[`. Arrow keys move through it, Enter or Tab inserts the page, Escape closes it.
- Typing the closing `]]` of `[[…]]` also makes a link.
- Clicking opens a link in a read-only document; while editing, Cmd/Ctrl-click opens it. `onOpen` handles opening; without it, the browser follows `href`.
- Everything is optional and reactive. With no `wikiLinks`, links still parse, render and round-trip.

Parsing is exact: `[[a#b|c]]` reads as target `a`, heading `b`, label `c` (split at the first `|`, then the first `#`) and writes back unchanged. Inside a table, a label's pipe is written `\|` (`[[a\|c]]`, as Obsidian does), and that form reads the same anywhere. Commonmark keeps its meaning where it has one: `[[a]](url)`, and `[[a]][ref]` with `ref` defined, stay ordinary links; `[[a]]` stays a reference link when the document defines `[a]:`; `\[\[a]]` stays text. A link can't sit inside a code span: applying code formatting over one splits the span around it. `remarkWikiLinks` from `blintz/markdown` is the same grammar for servers.

## Diagrams

Pass a mermaid loader and ` ```mermaid ` code blocks are drawn as diagrams under their source:

```tsx
<MarkdownEditor value={md} onChange={setMd} mermaid={() => import("mermaid")} />
```

- `mermaid` is an optional peer dependency (version 10 or later); install it in your app. Blintz calls the loader the first time a diagram needs drawing, so documents without diagrams never load it, and your app can share the same copy: Blintz draws with your mermaid settings (its own are `securityLevel` and `theme`, and theme colours come from the editor's palette rather than your `themeVariables`) and puts them back after each diagram. The loader can be an inline function; re-rendering your component won't re-draw diagrams.
- Diagrams follow the editor's light or dark theme and re-draw when it changes, and when you pause typing. Rendering is strict (`securityLevel: "strict"`), the SVG is sanitized before it's shown, and a link in a diagram opens in a new tab. A load or a drawing that hangs is given up on after a few seconds, so it never holds up other diagrams.
- A diagram with a syntax error shows the error instead.
- The slash menu gains a **Diagram** item, and the language picker a `mermaid` entry, so any code block can become a diagram.
- Without `mermaid`, these blocks stay ordinary code blocks; passing or removing it later updates them in place. Either way the markdown is unchanged.

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
- Diagrams: ` ```mermaid ` blocks drawn with your copy of mermaid, loaded only when needed (see [Diagrams](#diagrams)).
- Math: inline `$…$` and block math via KaTeX, round-tripping to `$$…$$`.
- Images: uploader or URL input, with captions.
- Tables: GFM tables with column and row drag handles, plus a keyboard and touch menu to add, move or delete rows and columns.
- Links: hover preview and an inline edit tooltip.
- Wiki links: `[[Page#Heading|label]]` with host resolution and a `[[` suggestion menu (see [Wiki links](#wiki-links)).
- Embeds: block directives (`::chart{…}`, `:::callout … :::`) rendered by your own React components (see [Embeds](#embeds)).
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

## Original-source locations

Hosts can ask where a selection or task came from in the original markdown. Add `onSourceReady` to receive a stable `MarkdownSourcePort`. Add `onSourceSelection` to receive selection changes.

A mapped result includes an opaque `generation`. Its ranges use UTF-16 string offsets: `start` is inclusive and `end` is exclusive. Slice the exact snapshot text with those offsets. Lines and columns start at one. CRLF counts as one line break; the initial BOM counts as one column. These are not UTF-8 byte offsets.

Mappings come from the parser's AST positions and the editor model. Blintz never searches rendered text or the DOM for a matching task. Repeated tasks keep separate ranges. Decoded entities, escaped text, generated breaks, code and frontmatter may return `unavailable` instead of a guessed selection.

Every model edit invalidates the old generation. Use `port.generation()` to read the current one. A request carrying an older generation returns `stale`. A retained port returns `disposed` after unmount.

After a host confirms new raw text, call `port.bindSource(text, port.generation())`. Blintz parses that exact text independently. It accepts the new mapping only if the parsed document equals the live editor model, allowing the built-in heading IDs and empty trailing paragraph generated by the unextended default editor. Authored tail content and custom trailing configurations must match exactly. Otherwise it returns `model-mismatch`. This call never replaces the document, moves the selection or clears Undo history. It is not a save receipt. The host must supply the actual text and verify its own file version.

The optional `sourceRevision` prop identifies an external source revision, including equal-text replacements. Changing callbacks or this revision does not remount the editor.

### Mapping any range

`port.range(from, to)` maps an editor range (ProseMirror positions, `[from, to)`) to raw markdown ranges, with the same evidence rules as `selection()`. For example, `@blintz/comments` gives a thread's range so an agent can quote it from the file.

Any entry in `plugins` normally makes `bindSource` require an exact model match, because a plugin could change how markdown is parsed. A plugin that only adds decorations, views or key handling can say so with `preservesSourceMapping: true` (e.g. `Object.assign(myPlugin, { preservesSourceMapping: true })`); `@blintz/comments` does.

### Document resets

When `value` changes to something the editor didn't emit, Blintz replaces the whole document in one transaction tagged with `DOCUMENT_RESET_META` (exported). That replacement is kept out of undo history, so undo never turns the new document back into the old one. A plugin that tracks positions can check `tr.getMeta(DOCUMENT_RESET_META)` to tell a newly loaded document from a user who selected everything and typed.

### Host-controlled tasks

Pass `onTaskToggleRequest` to handle task changes outside the editor. The callback receives `{ generation, task, done }` before any local checkbox change. `task.marker` identifies the exact `[ ]`, `[x]` or `[X]` span.

Blintz does not change the checkbox or report a save when this callback exists. The host must perform its authorized write and verify the acknowledgement. Then call `port.applyConfirmedTaskToggle(request, confirmedText)` with the original request and the exact confirmed raw text. Blintz accepts only the requested single marker-character change against the current mapped task; stale requests and changes to unrelated text refuse. A no-op preserves an existing uppercase `[X]`.

A successful result updates the current task node and raw mapping in place. It preserves the editor, selection, focus, scroll position and prior Undo history, and does not add the already-persisted marker to local Undo history. This confirmation does not call `onChange` and therefore does not initiate a second full-content save. Later user edits still call `onChange` normally. Update the controlled `value` and `sourceRevision` to the acknowledged text and revision; the corresponding acknowledgement update preserves the mapping. An independent subsequent revision, including an equal-text revision, invalidates older requests.

The method is a UI update, not a persistence receipt or write permission. If it returns `unavailable`, reconcile against the current host source instead of applying an old request to a new file revision. Failed writes leave the checkbox unchanged. Unmapped tasks show a static indicator. Read-only tasks have no checkbox control.

Without this callback, editable tasks keep their normal local toggle behavior. Source locations never grant write permission and do not verify a server-side file version.

Source callbacks become active after their React render commits. Suspended render
attempts cannot remove the current task interceptor. A late or replaced
`onSourceReady` receives the current port without recreating the editor. Each
actual editor lifetime has its own port; Activity hide/show can recreate the
editor from the latest committed host source and revision, and ports from the
destroyed lifetime remain disposed. Suspended source updates do not become seeds.

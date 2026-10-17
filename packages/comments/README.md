# @blintz/comments

Google-Docs-style comments for the [Blintz](https://github.com/dork-labs/blintz) editor: threads anchored to text, kept out of the markdown.

```bash
npm install @blintz/comments blintz
```

You own the threads: where they're stored, who wrote them, the replies and the sidebar. This package owns where they sit in the text. It highlights them, keeps them attached as the document is edited, finds them again when the document is reopened, and tells you when a thread's text is gone.

```tsx
import { MarkdownEditor } from "blintz";
import { useBlintzComments } from "@blintz/comments";
import "@blintz/comments/styles.css";

function Doc({ md, setMd, threads, store }) {
  const comments = useBlintzComments({
    threads, // [{ id, anchor, resolved? }] from your store
    activeThreadId: openThread,
    onThreadClick: (ids) => openSidebarAt(ids[0]),
    onAnchorsChange: (updates) => store.saveAnchors(updates),
    onOrphanedChange: (ids) => setOrphaned(ids),
  });

  const startThread = async () => {
    const anchor = comments.anchorSelection();
    if (anchor) await store.create({ anchor, body: draft });
  };

  return <MarkdownEditor value={md} onChange={setMd} plugins={[comments.plugin]} />;
}
```

## How anchoring works

A thread's `anchor` is opaque to your store: save it as JSON and hand it back. It is a [W3C text-quote selector](https://www.w3.org/TR/annotation-model/#text-quote-selector): the quoted words, a little text before and after them, and the position they were at.

- **While the document is open,** a thread follows its words through every edit. Typing at either edge doesn't extend it.
- **When the document opens,** each thread finds its words again. It prefers the occurrence with the most matching context, then the one nearest the old position. Edits elsewhere don't matter. `rangeOf(id).match` says how sure that was. `ambiguous` means another occurrence fit as well, or little of the context survived; that's worth flagging in your UI.
- **`onAnchorsChange`** sends fresh anchors shortly after editing pauses. Save them, so tomorrow's document finds today's text.
- **A thread whose words were deleted or can't be found is orphaned.** `onOrphanedChange` lists those threads. Keep them and show them apart; a lost comment is worse than a homeless one. A deleted thread never jumps to the same words elsewhere. It comes back if its words do, with their context (undo, say). A thread that wasn't found keeps being looked for as the document changes, for example once a newly opened document arrives. Handing over a different anchor tries again too.
- **Threads follow collaborators' edits** (with `blintz/collab`). A collaborator's change reaches the editor as one replacement, and threads are mapped through a word-by-word diff of it, so an agent rewriting text around a comment leaves the comment in place. A rewrite too large to diff (more than about 500 changed words in one write) finds each affected thread again by its words with all of their context, and a thread it orphaned comes back the same way if the rewrite is reverted. One limit: identical copies of a commented passage, with identical text around them, can't be told apart. If a collaborator deletes the other copy, the thread may be orphaned even though its words remain; after a rewrite too large to diff, a thread whose copy was deleted may move to the surviving one.

Comments never change the document: no marks, no markdown, no history entries. The editor's source mapping (`onSourceReady`) keeps working, and `port.range(...comments.rangeOf(id))` gives a thread's exact span in the raw markdown, so an agent can quote or address it.

## API

`useBlintzComments(options)` returns:

| Member | What it does |
| --- | --- |
| `plugin` | Pass in `<MarkdownEditor plugins={[comments.plugin]}>`. Stable across renders. |
| `anchorSelection()` | Returns an anchor for the current selection, to create a thread. Returns `null` if the selection covers no text. |
| `rangeOf(id)` | Returns a thread's current `{ from, to, match }` in the editor, or `null` if it's orphaned. |
| `threadsAtSelection()` | Lists the threads at the caret, innermost first. |
| `reveal(id)` | Selects a thread's text and scrolls to it. |

Options:

| Option | Meaning |
| --- | --- |
| `threads` | `{ id, anchor, resolved? }[]`. |
| `activeThreadId` | The thread to emphasize. |
| `showResolved` | Show resolved threads faintly. Defaults to `false`. |
| `onThreadClick(ids)` | Called when someone clicks highlighted text, with every thread under the click, innermost first. |
| `onAnchorsChange(updates)` | Called with fresh anchors to save. |
| `onOrphanedChange(ids)` | Called when the set of orphaned threads changes. |

One hook serves one editor; give each editor its own `useBlintzComments`.

Highlights are styled by `.blintz-comment`, `.is-active` and `.is-resolved` in `styles.css`.

## Without an editor

`@blintz/comments/core` finds threads and makes anchors on plain markdown, with no editor, no DOM and no React, so a server or an agent can work on commented documents. It uses the same document as the editor (Blintz's headless model from `blintz/collab`), the same matching, and the same mapping to raw markdown as the editor's source port, so a thread lands in the same place on the server and in the editor.

```ts
import { createMarkdownModel } from "blintz/collab";
import { createAnchor, resolveAnchor } from "@blintz/comments/core";

const model = await createMarkdownModel(); // once per process or worker

// An agent comments on raw markdown: the anchor is what the editor would make.
const start = markdown.indexOf("Friday");
const anchor = createAnchor(model, markdown, start, start + "Friday".length);

// Later, on whatever the document has become:
const found = resolveAnchor(model, latest, anchor);
// null: orphaned. Otherwise { match, from, to, source }, where
// source = { start, end, ranges } in `latest`, or null when part of the text
// has no exact source (a wiki link, an escape, an entity).
```

- **`resolveAnchor(model, markdown, anchor)`** finds a thread as the editor does on opening the document. `from`/`to` are positions in `model.document(markdown)`, equal to the editor's `rangeOf(id)`. `source.ranges` equals the editor's `port.range(from, to)`: one raw range per text run, with markup between runs (`**`) left out. `source.start`/`source.end` span them all.
- **`createAnchor(model, markdown, start, end)`** anchors the text inside a raw range, as the editor would from that selection. Ends inside markup snap inward to the text (`**bold**` anchors `bold`), and atoms the range covers whole (wiki links, images, math) are included. An anchor needs at least one character of text, as in the editor, so an image or a formula on its own can't be anchored.
- **Many threads, one parse:** pass `model.source(markdown)` in place of the markdown.

Some text has no character-for-character source in the markdown: a text run containing an escape (`snake\_case`) or an entity (`&amp;`), a paragraph wrapped over several lines (both often a whole paragraph), and inline code, code blocks and frontmatter. Such a run is addressed only whole, delimiters included (a range ending in a code span's backticks doesn't snap inward the way it does at `**`):

- `createAnchor` includes it when the range covers it whole, and returns `null` when the range starts or ends inside it, rather than anchoring fewer words than asked.
- `resolveAnchor` still finds a thread on it, but with `source: null`, exactly as the editor's `port.range` refuses it. So does a thread spanning more than 100 text runs.

`createMarkdownModel` comes from `blintz/collab`, so a server needs `yjs`, `y-prosemirror` and `y-protocols` installed (the optional peers of `blintz`) even without collaboration. React isn't needed for `core`; it's an optional peer, required only by the editor half.

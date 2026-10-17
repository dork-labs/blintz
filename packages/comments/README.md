# @blintz/comments

Google-Docs-style comments for the [Blintz](https://github.com/dork-labs/blintz) editor: threads anchored to text, kept out of the markdown.

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
- **When the document opens,** each thread finds its words again. It prefers the occurrence with the most matching context, then the one nearest the old position. Edits elsewhere don't matter.
- **`onAnchorsChange`** sends fresh anchors shortly after editing pauses. Save them, so tomorrow's document finds today's text.
- **A thread whose words were deleted or can't be found is orphaned.** `onOrphanedChange` lists those threads. Keep them and show them apart; a lost comment is worse than a homeless one. Handing over a different anchor for an orphaned thread tries again.

Comments never change the document: no marks, no markdown, no history entries. The editor's source mapping (`onSourceReady`) keeps working, and `port.range(...comments.rangeOf(id))` gives a thread's exact span in the raw markdown, so an agent can quote or address it.

## API

`useBlintzComments(options)` returns:

| Member | What it does |
| --- | --- |
| `plugin` | Pass in `<MarkdownEditor plugins={[comments.plugin]}>`. Stable across renders. |
| `anchorSelection()` | Returns an anchor for the current selection, to create a thread. Returns `null` if the selection covers no text. |
| `rangeOf(id)` | Returns a thread's current `{ from, to }` in the editor, or `null` if it's orphaned. |
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

Highlights are styled by `.blintz-comment`, `.is-active` and `.is-resolved` in `styles.css`.

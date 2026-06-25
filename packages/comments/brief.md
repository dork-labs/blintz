# @blintz/comments: feature brief

Google-Docs-style comments for the [Blintz](https://github.com/dork-labs/blintz) editor. Highlight a span of text, attach a thread, reply, and resolve. This brief sets the goals and the shape of the work before any code lands. It is a plan, not a spec, so expect the details to shift once we build.

## The problem

People review prose by talking about specific words, not whole documents. "This sentence is the claim, can we soften it?" needs an anchor on that sentence and a place to discuss it. Markdown has no syntax for that, and the editor today has no way to attach a conversation to a range. A reviewer's only option is to edit the text itself, which destroys the thing being reviewed.

We want the editor to carry comment threads anchored to text, the way Google Docs and Notion do, without those threads leaking into the markdown the editor produces.

## Goals

- Select a range and start a comment thread on it.
- Show every active range as a highlight, and reveal its thread on click or hover.
- Reply within a thread, resolve it, and reopen it.
- Survive edits: a thread stays attached to its text as the surrounding document changes, and re-attaches on reload even though the comment is not stored in the markdown.
- Stay framework-honest: load into Blintz through the public plugin seam, not a fork.

## Non-goals

- We do not own storage. The host app decides where threads live (its database, a CRDT, local files).
- We do not own identity. The app supplies the current user and author names.
- We do not own the sidebar. The app renders the thread list and composer using data and callbacks this package hands it. A minimal popover may ship for demos, but the real UI is the app's.
- No real-time presence or cursors in v1. That is a separate, larger effort.
- No comment syntax in markdown. See "Why comments stay out of markdown" below.

## Design direction

The work splits cleanly along one line: what the editor must know versus what the application must own.

**The editor-side primitive lives in this package.** It is a Blintz plugin built from three Milkdown pieces:

1. A `comment` mark that tags a range. The mark carries one thing, a `threadId`. It is configured `inclusive: false` so typing at the edge of a commented range does not extend the comment, and `excludes: ""` so several comments can overlap the same words. The mark is invisible on its own; it exists to remember which characters belong to which thread.

2. A `$prose` decoration plugin that reads the marks in the current document and paints the highlights. Keeping the visible highlight in a decoration, rather than in the mark's own rendering, means we can restyle it (resolved vs active, hovered, selected) without rewriting the document, and we can show overlaps with layered backgrounds.

3. Commands: add a thread on the current selection, resolve, reopen, and delete. These are Milkdown `$command`s so they compose with the editor's history and can be triggered from the toolbar, a slash item, or the app.

**The app-side concerns stay in the consuming application,** wired in through a React context this package exports (call it `CommentAPI`). The context is the seam between "there is a thread with id X on this range" (ours) and "here is who wrote it, what the replies say, and where it is saved" (theirs). The app provides:

- the current author,
- a thread store (load, create, append reply, resolve), which can be async,
- and a renderer for the thread popover or sidebar panel.

This package never imports a database client or an auth library. It calls the callbacks the app gave it.

## How it loads into Blintz

Blintz exposes a plugin seam as of v0.1.0+: the `plugins` prop on `<MarkdownEditor>`, plus the `BlintzPlugin` type and the `useEditorCtx` hook (for reading the live Milkdown `Ctx` from inside a view component). A `BlintzPlugin` receives the editor mid-assembly and the React view factories, the same seam the built-in features use.

So the integration reads roughly:

```tsx
import { MarkdownEditor } from "blintz";
import { commentsPlugin, CommentProvider } from "@blintz/comments";

<CommentProvider author={me} store={myThreadStore} renderThread={MyPanel}>
  <MarkdownEditor value={md} onChange={setMd} plugins={[commentsPlugin]} />
</CommentProvider>
```

The provider holds the app's data and callbacks. The plugin registers the mark, the highlight decorations, and the commands, and renders its popover through the adapter factory so it can read the thread data from context.

## Persistence and anchoring

### Why comments stay out of markdown

Markdown is the document's portable form, and a comment thread is not part of the document. There is no markdown construct for "this range has a discussion attached," and inventing one (an HTML span, a footnote convention) would corrupt the file for every other tool that reads it and would round-trip badly through the editor's own clean-markdown guarantee. Comments are metadata about the text, so they persist beside the text, keyed to the document.

### The re-anchoring problem

If the comment is not in the markdown, then on reload we have a saved thread that says "this was attached to such-and-such text" and a fresh document with no marks in it. We have to find the range again. Positions alone do not survive edits, so we follow the W3C Web Annotation model (the same approach Hypothesis uses): store a **text-quote selector** for each thread, made of the exact quoted string plus a short prefix and suffix of surrounding text. On load, search the document for that quote, disambiguated by its prefix and suffix, and re-apply the mark at the match.

This is fuzzy by nature. The quoted text may have been edited, duplicated, or deleted. The plan:

- Exact match with matching prefix/suffix: re-anchor silently.
- Multiple candidate matches: use prefix/suffix to pick one; if still ambiguous, attach to the best and flag low confidence.
- No acceptable match: mark the thread "orphaned" and surface it in the sidebar detached from the text, rather than dropping it. A lost comment is worse than a homeless one.

During a single editing session, while the marks exist in the document, ProseMirror's mapping keeps highlights attached through edits for free. Re-anchoring is only needed across loads (and across edits made by other tools while the doc was closed).

## Considerations and open questions

- **Anchor freshness.** The stored quote should track the live text so a comment made today still re-anchors after tomorrow's edits. We likely re-capture the selector from the current document on save, not just at creation.
- **Overlapping threads.** Two comments on overlapping ranges need readable highlights and a way to pick which thread a click opens. Layered translucent backgrounds plus a small picker when ranges overlap.
- **Resolved threads.** Keep the highlight faint, or hide it behind a toggle? Resolved comments still anchor; they are just visually quiet.
- **Read-only mode.** Comments should be viewable (and arguably still answerable) when the document itself is not editable. The mark and decorations must not depend on editability.
- **Markdown export with comments present.** Stripping comment marks on serialize is the safe default, and the marks are invisible to remark anyway, but we should assert it with a round-trip test.
- **Store shape.** Define the `CommentThread` and `CommentReply` types and the store interface here, narrow enough that a plain in-memory implementation and a real backend both satisfy it.
- **Demo UI scope.** Ship enough of a popover to make the package usable out of the box, without pretending to be a design system.

## Concerns and risks

- **Re-anchoring is the hard part and the part most likely to disappoint.** Heavy edits will orphan comments. We should treat orphaning as a designed-for state, test it with realistic edit sequences, and be honest in the docs about the limits.
- **Scope creep toward a full collaboration suite.** Presence, live cursors, and multi-user merge are tempting and out of scope. The context seam should make them addable later without forcing them now.
- **Coupling to Milkdown internals.** The plugin leans on mark schema details, decoration plugins, and the adapter factories. If Blintz tracks a new `@milkdown/kit`, this package may need matching updates. Pin a compatible Blintz peer range and cover the seam with tests.
- **Performance on long documents.** Recomputing decorations on every transaction can get expensive with many threads. Plan to derive decorations incrementally from the mark set rather than rescanning the whole document each time.
- **Accessibility.** Highlights need sufficient contrast, threads need keyboard reach, and the popover needs focus management. Easy to defer, costly to retrofit.

## Rough phasing

1. Types and store interface (`CommentThread`, `CommentReply`, the store and context contracts). No editor yet.
2. The mark, decorations, and commands as a `BlintzPlugin`, with an in-memory store and a bare popover. Single session, no persistence.
3. Persistence and re-anchoring: text-quote selectors, load-time matching, the orphaned state.
4. Polish: overlaps, resolved styling, read-only, accessibility, and the round-trip test that proves comments never touch the markdown.

Track the build in the [Blintz repo](https://github.com/dork-labs/blintz).

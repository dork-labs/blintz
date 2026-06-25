# @blintz/comments

Google-Docs-style comments for the [Blintz](https://github.com/dork-labs/blintz) editor: highlight a range of text, attach a thread, reply, and resolve.

**Status: planned, not released.** This package is scaffolded; the implementation is in progress. Track it in the [Blintz repo](https://github.com/dork-labs/blintz).

## Design direction

The work splits in two. The editor-side primitive lives here: a `comment` mark over the highlighted range, highlight decorations derived from it, and commands to add, resolve, and delete threads. It loads into Blintz as a plugin.

The app-side concerns stay in your application: where threads are stored, who the authors are, and the thread sidebar UI. This package exposes a React context that you wire your data layer into, so the package never owns a database or auth.

Comments stay out of the markdown, because markdown has no way to represent a thread. They persist separately, keyed to the document, and re-anchor to their text on load by matching the quoted text plus a little surrounding context (the W3C Web Annotation / Hypothesis approach).

Loading this into Blintz uses the editor's plugin seam: the `plugins` prop on `<MarkdownEditor>`, available since Blintz v0.1.0+. See [brief.md](./brief.md) for the full feature plan.

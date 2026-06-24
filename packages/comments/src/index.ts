// @blintz/comments
//
// Google-Docs-style comments for the Blintz editor: highlight a range, attach a
// thread, resolve it. Planned; not yet implemented.
//
// Design direction (see README.md): the comment anchor primitive (a `comment`
// mark, highlight decorations, and add/resolve/delete commands) ships here as a
// Blintz plugin. The thread store and the thread UI live in the consuming app,
// wired through a context this package exports. Comments stay out of the
// markdown; they persist separately and re-anchor by quoted text on load.

export {};

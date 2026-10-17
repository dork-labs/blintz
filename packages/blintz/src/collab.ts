// Public API of `blintz/collab`: real-time collaboration through Yjs, and the
// editor's document model on a server.
//
// `collaboration()` binds an editor to a shared Y.XmlFragment. The headless
// half (`createMarkdownModel`, `applyMarkdownToYDoc`, `yDocToMarkdown`) runs
// with no DOM and no React, in Node, a worker or the browser, so a server can
// seed documents and merge agents' markdown writes into live sessions.
//
// `yjs`, `y-prosemirror` and `y-protocols` are optional peer dependencies:
// only this entry imports them.
export { collaboration } from "./collab/plugin";
export type { CollaborationOptions, CollaborationUser } from "./collab/plugin";
export { applyMarkdownToYDoc, readYDoc, yDocToMarkdown, DEFAULT_FIELD } from "./collab/ydoc";
export type { YDocOptions, YDocSnapshot } from "./collab/ydoc";
export { createMarkdownModel } from "./headless";
export type { MarkdownModel, MarkdownSource } from "./headless";
export type { RawSourceRange } from "./source-location";

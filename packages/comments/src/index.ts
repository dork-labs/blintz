// @blintz/comments: comment threads anchored to text in a Blintz editor.
//
// You own the threads (storage, authors, replies, the sidebar); this package
// owns where they sit in the text. Threads never touch the markdown: they are
// highlights over the document, kept attached through edits, re-attached on
// load from a text-quote anchor, and reported as orphaned when their text is
// gone.
import "./styles.css";

export { useBlintzComments } from "./useBlintzComments";
export type { BlintzComments, UseBlintzCommentsOptions } from "./useBlintzComments";
export type { CommentThreadRef } from "./plugin";
export { anchorFromRange, docText, locateAnchor, CONTEXT_LENGTH } from "./anchor";
export type { AnchorMatch, CommentAnchor, DocText } from "./anchor";

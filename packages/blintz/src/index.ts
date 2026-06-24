// Public API of blintz.
//
// One component + its types. Everything else (the Milkdown engine baseline, the
// Crepe-rebuilt feature views, the ported theme CSS) is an implementation
// detail behind this surface, so consumers — this repo's apps/web today, other
// projects later — depend only on `<MarkdownEditor>`.
export { MarkdownEditor } from "./MarkdownEditor";
export type { MarkdownEditorProps } from "./MarkdownEditor";

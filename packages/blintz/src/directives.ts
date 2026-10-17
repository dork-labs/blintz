// Public API of `blintz/directives`: the editor-free half of Blintz embeds.
//
// Publishing pipelines, servers, and agents that read or render DorkOS Docs
// need the same grammar the editor uses, without React or ProseMirror. This
// entry carries only the remark plugin, the attribute validator, and their
// types, so a unified/remark pipeline can parse and stringify block directives
// exactly as `<MarkdownEditor embeds={...}>` does.
export {
  remarkBlockDirectives,
  validateEmbedAttributes,
} from "./features/embeds/grammar";
export type {
  EmbedAttributes,
  EmbedIssue,
  EmbedValidationResult,
  EmbedValidator,
  StandardSchemaV1,
} from "./features/embeds/grammar";

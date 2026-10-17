// Public API of `blintz/markdown`: every markdown grammar Blintz adds on top
// of CommonMark and GFM, as remark plugins with no React or ProseMirror, so
// servers, publishing pipelines and agents parse and write documents exactly
// as `<MarkdownEditor>` does.
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
export {
  parseWikiLinkBody,
  remarkWikiLinks,
  stringifyWikiLink,
} from "./features/wiki-links/grammar";
export type { WikiLink, WikiLinkNode } from "./features/wiki-links/grammar";

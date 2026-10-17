// Public API of blintz.
//
// The editor component is the core surface. Everything else (the Milkdown
// engine baseline, the Crepe-rebuilt feature views, the ported theme CSS) is an
// implementation detail behind it, so consumers — this repo's apps/web today,
// other projects later — depend only on `<MarkdownEditor>`.
//
// The plugin seam is the second surface: a `plugins` prop plus the types and
// the `useEditorCtx` hook an extension needs, so a package like @blintz/comments
// can register nodes, marks, ProseMirror plugins, commands, and React views
// without forking the editor.
export { MarkdownEditor } from "./MarkdownEditor";
export type { MarkdownEditorProps } from "./MarkdownEditor";

export type { BlintzPlugin, BlintzPluginContext } from "./plugin";
export { DOCUMENT_RESET_META } from "./document-reset";

// Embeds: block directives (`::name{…}`, `:::name … :::`) rendered by
// host-registered components. The editor-free grammar and validator also ship
// on their own as `blintz/directives`.
export type {
  EmbedDefinition,
  EmbedProps,
  EmbedRegistry,
} from "./features/embeds/registry";
export {
  remarkBlockDirectives,
  validateEmbedAttributes,
} from "./directives";
// Diagrams: ```mermaid code blocks drawn through a host-provided loader.
export type { MermaidLoader, MermaidModule } from "./features/mermaid";

// Wiki links: `[[target#heading|label]]` resolved and suggested by the host.
export type {
  WikiLinkOptions,
  WikiLinkResolution,
  WikiLinkSuggestion,
} from "./features/wiki-links/options";
export { remarkWikiLinks } from "./markdown";
export type { WikiLink } from "./markdown";
export type {
  EmbedAttributes,
  EmbedIssue,
  EmbedValidationResult,
  EmbedValidator,
  StandardSchemaV1,
} from "./directives";

// For plugin view components: read the live Milkdown `Ctx` (commands, config)
// from inside a node/plugin view rendered under <MarkdownEditor>.
export { useEditorCtx } from "./shared/editor-ctx";
export type { CtxHolder } from "./shared/editor-ctx";

export type {
  MarkdownSourcePort,
  SourceSnapshot,
  RawSourceRange,
  SourceLocationResult,
  SourceSelection,
  SourceTask,
  SourceTaskToggleRequest,
} from "./source-location";

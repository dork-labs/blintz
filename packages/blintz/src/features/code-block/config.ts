import type { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { $ctx } from "@milkdown/kit/utils";

/**
 * The code-block config slice, re-implemented locally (verbatim port of
 * `@milkdown/components/code-block/config.ts`). We re-create it rather than
 * import from `@milkdown/kit/component/code-block` because that package compiles
 * to a single bundle with `import { ... } from "vue"` at the top — the pure
 * config/loader/node-view logic and the Vue components share ONE file, so
 * importing *any* export (even `codeBlockConfig`) drags Vue into the build (and
 * `LanguageLoader` isn't even exported). Owning these tiny pure pieces keeps the
 * bundle provably Vue-free, exactly like the link-tooltip feature.
 *
 * Extends the upstream `CodeBlockConfig` with the Crepe-layer extras (`theme`,
 * preview toggle icon/text) so the feature's `.config()` can carry them through.
 */
export interface CodeBlockConfig {
  /** CodeMirror extensions (keymap, basicSetup, theme, …) merged into every CM. */
  extensions: Extension[];
  /** The registered CodeMirror language descriptions (the picker's list). */
  languages: LanguageDescription[];
  expandIcon: string;
  searchIcon: string;
  clearSearchIcon: string;
  searchPlaceholder: string;
  noResultText: string;
  copyText: string;
  copyIcon: string;
  onCopy?: (text: string) => void;
  renderLanguage: (language: string, selected: boolean) => string;
  /**
   * Optional preview renderer (Mermaid/KaTeX/etc). Returns sync HTML/Element, or
   * `undefined` to signal an async render that calls `applyPreview` later, or
   * `null` for "no preview". v1 defaults to `() => null` (no renderer shipped);
   * the panel plumbing works the moment a renderer is configured.
   */
  renderPreview: (
    language: string,
    content: string,
    applyPreview: (value: null | string | HTMLElement) => void,
  ) => void | null | string | HTMLElement;
  previewToggleButton: (previewOnlyMode: boolean) => string;
  previewLabel: string;
  previewOnlyByDefault?: boolean;
  previewLoading: string | HTMLElement;
}

export const defaultConfig: CodeBlockConfig = {
  extensions: [],
  languages: [],
  expandIcon: "⬇",
  searchIcon: "🔍",
  clearSearchIcon: "⌫",
  searchPlaceholder: "Search language",
  noResultText: "No result",
  copyText: "Copy",
  copyIcon: "📋",
  onCopy: () => {},
  renderLanguage: (language) => language,
  renderPreview: () => null,
  previewToggleButton: (previewOnlyMode) => (previewOnlyMode ? "Edit" : "Hide"),
  previewLabel: "Preview",
  previewLoading: "Loading...",
};

export const codeBlockConfig = $ctx(defaultConfig, "codeBlockConfigCtx");

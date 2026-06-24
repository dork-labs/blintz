import type { KatexOptions } from "katex";
import katex from "katex";

/**
 * Render block LaTeX to an HTML string for the code-block preview panel — the
 * `renderPreview` body Crepe installs onto `codeBlockConfig`. `displayMode` is
 * the centered block style; `throwOnError: false` renders parse errors inline
 * (red) instead of throwing. The panel sanitizes this string (DOMPurify) before
 * injecting it.
 */
export function renderLatexPreview(
  content: string,
  options?: KatexOptions,
): string {
  return katex.renderToString(content, {
    ...options,
    throwOnError: false,
    displayMode: true,
  });
}

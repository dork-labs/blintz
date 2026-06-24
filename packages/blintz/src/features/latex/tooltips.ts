import { tooltipFactory } from "@milkdown/kit/plugin/tooltip";

/** The inline-math edit tooltip's plugin slot (Crepe's `INLINE_LATEX`). The
 * plugin-view (positioning + the React mount) is registered onto this in
 * `plugins.ts`. */
export const inlineLatexTooltip = tooltipFactory("CREPE_INLINE_LATEX");

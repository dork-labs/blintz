import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { nodeRule } from "@milkdown/kit/prose";
import { textblockTypeInputRule } from "@milkdown/kit/prose/inputrules";
import { $inputRule } from "@milkdown/kit/utils";

import { mathInlineSchema } from "./schema";

/**
 * Input rules — verbatim ports of Crepe's `latex/input-rule.ts` (pure, no Vue).
 *
 * `mathInlineInputRule`: typing `$E=mc^2$` creates an inline math atom.
 * `mathBlockInputRule`: typing `$$ ` at the start of a block converts it to a
 * code block with language LaTeX (which the CodeMirror view + KaTeX preview
 * then render; it serializes back to `$$ … $$` via `blockLatexSchema`).
 */
export const mathInlineInputRule = $inputRule((ctx) =>
  nodeRule(/(?:\$)([^$]+)(?:\$)$/, mathInlineSchema.type(ctx), {
    getAttr: (match) => ({ value: match[1] ?? "" }),
  }),
);

export const mathBlockInputRule = $inputRule((ctx) =>
  textblockTypeInputRule(/^\$\$[\s\n]$/, codeBlockSchema.type(ctx), () => ({
    language: "LaTeX",
  })),
);

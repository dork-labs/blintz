import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $nodeSchema } from "@milkdown/kit/utils";
import katex from "katex";

import { mathInlineId } from "./constants";

/**
 * The latex schemas, re-implemented locally (verbatim ports of Crepe's
 * `latex/inline-latex.ts` + `block-latex.ts`). Both are pure — no Vue — so we own
 * them directly rather than importing from `@milkdown/kit/component/*` (those
 * single bundles drag Vue in). They reuse the Vue-free commonmark
 * `codeBlockSchema` for the block case.
 */

/**
 * Inline math node — an `atom` inline node carrying the LaTeX source in
 * `attrs.value`, rendered by KaTeX directly in `toDOM` (no React/Vue node view;
 * the only UI is the edit tooltip in `plugins.ts`). Round-trips through remark's
 * `inlineMath` mdast node, i.e. `$a^2 + b^2 = c^2$`.
 */
export const mathInlineSchema = $nodeSchema(mathInlineId, () => ({
  group: "inline",
  inline: true,
  draggable: true,
  atom: true,
  attrs: {
    value: {
      default: "",
    },
  },
  parseDOM: [
    {
      tag: `span[data-type="${mathInlineId}"]`,
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).dataset.value ?? "",
      }),
    },
  ],
  toDOM: (node) => {
    const code = (node.attrs.value as string) ?? "";
    const dom = document.createElement("span");
    dom.dataset.type = mathInlineId;
    dom.dataset.value = code;
    // KaTeX renders into our own trusted element (errors render as red text, not
    // throws); the source is escaped by KaTeX, so no extra sanitization needed.
    katex.render(code, dom, { throwOnError: false });
    return dom;
  },
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === mathInlineId,
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, node.attrs.value as string);
    },
  },
}));

/**
 * Block math — NOT a separate node: it's the commonmark `code_block` with
 * `language: 'LaTeX'`, so it reuses the CodeMirror node view + the KaTeX preview
 * (wired in `plugins.ts` via the `renderPreview` override). We only override the
 * serializer so a LaTeX-language code block round-trips back to a remark `math`
 * node (`$$ … $$`) instead of a fenced code block. Verbatim from Crepe.
 */
export const blockLatexSchema = codeBlockSchema.extendSchema((prev) => {
  return (ctx) => {
    const baseSchema = prev(ctx);
    return {
      ...baseSchema,
      toMarkdown: {
        match: baseSchema.toMarkdown.match,
        runner: (state, node) => {
          const language = (node.attrs.language as string) ?? "";
          if (language.toLowerCase() === "latex") {
            state.addNode(
              "math",
              undefined,
              node.content.firstChild?.text || "",
            );
          } else {
            return baseSchema.toMarkdown.runner(state, node);
          }
        },
      },
    };
  };
});

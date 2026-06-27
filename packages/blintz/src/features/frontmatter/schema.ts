import { $nodeSchema } from "@milkdown/kit/utils";

export const frontmatterId = "frontmatter";

/**
 * Frontmatter node — a dedicated block node that holds the raw YAML as editable
 * text (`code: true`, so inline markdown is not parsed and whitespace is kept),
 * rendered as a `<pre>` region the user edits directly.
 *
 * It is a DEDICATED node rather than a `yaml`-language code block on purpose: a
 * `code_block` carrying `language: 'yaml'` would be indistinguishable from a
 * body ```` ```yaml ```` fence on the way out, so frontmatter and ordinary YAML
 * code would serialize to the same thing. A separate node keeps the two apart.
 *
 * It round-trips through remark-frontmatter's mdast `yaml` node (see remark.ts):
 * parse reads `node.value` (the YAML between the fences) into the node's text;
 * serialize emits a `yaml` node whose value is that text, which remark wraps
 * back in `---` fences.
 */
export const frontmatterSchema = $nodeSchema(frontmatterId, () => ({
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  code: true,
  parseDOM: [
    {
      tag: `pre[data-type="${frontmatterId}"]`,
      preserveWhitespace: "full",
    },
  ],
  toDOM: () => [
    "pre",
    { "data-type": frontmatterId, class: "milkdown-frontmatter" },
    ["code", { spellcheck: "false" }, 0],
  ],
  parseMarkdown: {
    match: (node) => node.type === "yaml",
    runner: (state, node, type) => {
      const value = (node.value as string) ?? "";
      state.openNode(type);
      if (value.length > 0) state.addText(value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === frontmatterId,
    runner: (state, node) => {
      state.addNode("yaml", undefined, node.textContent);
    },
  },
}));

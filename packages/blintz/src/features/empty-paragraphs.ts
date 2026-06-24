import {
  commonmark,
  remarkPreserveEmptyLinePlugin,
} from "@milkdown/kit/preset/commonmark";
import { $remark } from "@milkdown/kit/utils";

/**
 * Clean markdown for empty paragraphs — drop Milkdown's `<br />` round-trip hack.
 *
 * Milkdown's commonmark preset ships `remarkPreserveEmptyLinePlugin`. With it
 * registered, the paragraph serializer emits an mdast `html` node `<br />` for
 * every **empty, non-last** paragraph (see `preset-commonmark` `paragraph`
 * `toMarkdown`, gated on `shouldPreserveEmptyLine(ctx)` — which is true **iff**
 * that plugin's ctx slice exists). That makes blank lines survive a round-trip,
 * but it litters stored prose with `<br />` — e.g. a blank line a user leaves
 * between two paragraphs serializes to `…\n\n<br />\n\n…`, and a phantom empty
 * paragraph above a list serializes to a leading `<br />`. For an editor whose
 * job is to *store clean markdown*, that's noise: markdown represents paragraph
 * breaks with blank lines, not `<br />`, and most markdown tooling collapses
 * stray blank paragraphs. So we turn the preservation off — empty paragraphs
 * serialize to nothing (they collapse), which is the markdown-native behavior.
 *
 * `commonmarkWithoutEmptyLinePreservation` is the preset with the preserve
 * plugin filtered out. A `$remark` returns `[options, plugin]` (with `.plugin`/
 * `.options`/`.id` props) that `commonmark` flattens in, so removing **both**
 * elements un-registers the `.id` slice → `shouldPreserveEmptyLine` is false →
 * no `<br />` is ever emitted. Use this in place of `commonmark`.
 */
export const commonmarkWithoutEmptyLinePreservation = commonmark.filter(
  (plugin) =>
    plugin !== remarkPreserveEmptyLinePlugin.plugin &&
    plugin !== remarkPreserveEmptyLinePlugin.options,
);

const BR_VALUES = new Set(["<br />", "<br>", "<br >", "<br/>"]);

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

/** Recursively drop bare `<br />` html nodes from an mdast tree (in place). */
function stripBreakHtmlNodes(node: MdastNode): void {
  if (!Array.isArray(node.children)) return;
  node.children = node.children.filter(
    (child) =>
      !(child.type === "html" && BR_VALUES.has((child.value ?? "").trim())),
  );
  for (const child of node.children) stripBreakHtmlNodes(child);
}

/**
 * Backward-compat for prose that was saved **before** this fix: strip any
 * literal `<br />` on parse so it doesn't render as visible `<br />` text.
 *
 * With `remarkPreserveEmptyLinePlugin` removed we also lose its parse half
 * (`visitEmptyLine`), which used to turn a serialized `<br />` back into an
 * empty paragraph. Without that, a standalone `<br />` parses to an inline
 * `html` atom that renders the literal text "`<br />`". This `$remark` runs on
 * parse and removes those html nodes (the empty paragraph that remains then
 * collapses on the next serialize) — so old `<br />` artifacts migrate to clean
 * markdown the first time the prose is edited. Safe: real hard breaks serialize
 * as `\`-newline (backslash) form, **not** `<br />`, so this never touches them.
 */
export const stripEmptyLineBreaks = $remark(
  "markdownEditorStripEmptyLineBreaks",
  () => () => (tree: MdastNode) => {
    stripBreakHtmlNodes(tree);
  },
);

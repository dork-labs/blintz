import { $remark } from "@milkdown/kit/utils";
import remarkMath from "remark-math";
import type { Node, Parent } from "unist";
import { visit } from "unist-util-visit";

/**
 * The remark plugins that bridge `$…$` / `$$…$$` markdown ↔ the editor schema.
 * Verbatim ports of Crepe's `latex/remark.ts` — pure (no Vue).
 *
 * `remarkMathPlugin` adds `remark-math`: it both PARSES `$`/`$$` into mdast
 * `inlineMath`/`math` nodes and STRINGIFIES them back, so round-trip fidelity is
 * remark-owned.
 *
 * `remarkMathBlockPlugin` rewrites every mdast `math` (block) node into a `code`
 * node with `lang: 'LaTeX'` on the way in — that's why block math becomes a
 * CodeMirror code block in the editor. The serializer override in `schema.ts`
 * (`blockLatexSchema`) maps it back to a `math` node on the way out.
 */

interface MathNode extends Node {
  value?: string;
}

export const remarkMathPlugin = $remark<"remarkMath", undefined>(
  "remarkMath",
  () => remarkMath,
);

function visitMathBlock(ast: Node) {
  return visit(ast, "math", (node: MathNode, index, parent: Parent | null) => {
    if (index == null || !parent) return;
    parent.children.splice(index, 1, {
      type: "code",
      lang: "LaTeX",
      value: node.value ?? "",
    } as Node);
  });
}

/** Turn each math block into a code block with language LaTeX. */
export const remarkMathBlockPlugin = $remark(
  "remarkMathBlock",
  () => () => visitMathBlock,
);

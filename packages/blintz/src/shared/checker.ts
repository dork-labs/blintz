import type { Selection } from "@milkdown/kit/prose/state";

/**
 * Ported verbatim from Crepe (`crepe/src/utils/checker.ts`). Used by the
 * placeholder plugin to suppress the prompt inside code blocks and list items.
 */
export function isInCodeBlock(selection: Selection) {
  const type = selection.$from.parent.type;
  return type.name === "code_block";
}

export function isInList(selection: Selection) {
  const type = selection.$from.node(selection.$from.depth - 1)?.type;
  return type?.name === "list_item";
}

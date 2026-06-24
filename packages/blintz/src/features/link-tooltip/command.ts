import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { $command } from "@milkdown/kit/utils";

import { linkTooltipAPI } from "./slices";

/**
 * Toggle a link over the current selection — ported verbatim from
 * `@milkdown/components/link-tooltip/command.ts`. If the selection already has a
 * link it removes it; otherwise it opens the edit tooltip to add one. The
 * toolbar's link button calls this.
 */
export const toggleLinkCommand = $command("CrepeToggleLink", (ctx) => {
  return () => (state) => {
    const { doc, selection } = state;
    const mark = linkSchema.type(ctx);
    const hasLink = doc.rangeHasMark(selection.from, selection.to, mark);
    if (hasLink) {
      ctx.get(linkTooltipAPI.key).removeLink(selection.from, selection.to);
      return true;
    }
    ctx.get(linkTooltipAPI.key).addLink(selection.from, selection.to);
    return true;
  };
});

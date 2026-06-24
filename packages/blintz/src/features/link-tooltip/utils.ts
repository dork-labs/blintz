import type { Ctx } from "@milkdown/kit/ctx";
import type { Mark, Node } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { linkSchema } from "@milkdown/kit/preset/commonmark";

import { linkPreviewTooltip } from "./tooltips";

/**
 * Pure hover/range helpers, ported verbatim from
 * `@milkdown/components/link-tooltip/utils.ts` (which the package does not
 * re-export, so we own them here). No framework, no side effects.
 */

/** Find the document range a given link mark covers, scanning [from, to). */
export function findMarkPosition(
  mark: Mark,
  node: Node,
  doc: Node,
  from: number,
  to: number,
): { start: number; end: number } {
  let markPos = { start: -1, end: -1 };
  doc.nodesBetween(from, to, (n, pos) => {
    // Stop recursing once we've found it.
    if (markPos.start > -1) return false;
    if (markPos.start === -1 && mark.isInSet(n.marks) && node === n) {
      markPos = {
        start: pos,
        end: pos + Math.max(n.textContent.length, 1),
      };
    }
    return undefined;
  });
  return markPos;
}

/** Whether a hover at the event's coords lands on a link mark, and if so the
 * mark + node + position to show the preview for. */
export function shouldShowPreviewWhenHover(
  ctx: Ctx,
  view: EditorView,
  event: MouseEvent,
): { show: true; pos: number; node: Node; mark: Mark } | undefined {
  const $pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!$pos) return;

  const { pos } = $pos;
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;

  const mark = node.marks.find(
    (mark) => mark.type === linkSchema.mark.type(ctx),
  );
  if (!mark) return;

  const key = linkPreviewTooltip.pluginKey();
  if (!key) return;

  return { show: true, pos, node, mark };
}

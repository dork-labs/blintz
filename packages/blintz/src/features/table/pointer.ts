import type { EditorView } from "@milkdown/kit/prose/view";

import { computePosition, offset } from "@floating-ui/dom";

import type { Refs } from "./types";
import {
  computeColHandlePositionByIndex,
  computeRowHandlePositionByIndex,
  findPointerIndex,
  getRelatedDOM,
} from "./utils";

/**
 * Hover detection → handle positioning — ported from
 * `@milkdown/components/table-block/view/pointer.ts`. Vue `Ref.value` →
 * React `.current`. Deliberately imperative (mutates `dataset.show`/`style` +
 * floating-ui, NOT React state) and throttled ~20ms, to keep hover responsive
 * without re-render thrash — exactly as upstream did.
 *
 * `lodash-es`'s `throttle` isn't a dep here, so the leading-edge throttle is
 * inlined below (trailing call coalesced via a timer; matches the default
 * `{ leading: true, trailing: true }` lodash behaviour closely enough for hover).
 */

function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let trailingArgs: A | null = null;

  const invoke = (args: A) => {
    last = Date.now();
    fn(...args);
  };

  return (...args: A) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke(args);
    } else {
      trailingArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (trailingArgs) {
            const a = trailingArgs;
            trailingArgs = null;
            invoke(a);
          }
        }, remaining);
      }
    }
  };
}

function createPointerMoveHandler(
  refs: Refs,
  view?: EditorView,
): (e: PointerEvent) => void {
  return throttle((e: PointerEvent) => {
    if (!view?.editable) return;
    const {
      contentWrapperRef,
      yLineHandleRef,
      xLineHandleRef,
      colHandleRef,
      rowHandleRef,
      hoverIndex,
      lineHoverIndex,
    } = refs;
    const yHandle = yLineHandleRef.current;
    if (!yHandle) return;
    const xHandle = xLineHandleRef.current;
    if (!xHandle) return;
    const content = contentWrapperRef.current;
    if (!content) return;
    const rowHandle = rowHandleRef.current;
    if (!rowHandle) return;
    const colHandle = colHandleRef.current;
    if (!colHandle) return;

    const index = findPointerIndex(e, view);
    if (!index) return;

    const dom = getRelatedDOM(contentWrapperRef, index);
    if (!dom) return;

    const [rowIndex, colIndex] = index;
    const boundary = dom.col.getBoundingClientRect();
    const closeToBoundaryLeft = Math.abs(e.clientX - boundary.left) < 8;
    const closeToBoundaryRight = Math.abs(boundary.right - e.clientX) < 8;
    const closeToBoundaryTop = Math.abs(e.clientY - boundary.top) < 8;
    const closeToBoundaryBottom = Math.abs(boundary.bottom - e.clientY) < 8;

    const closeToBoundary =
      closeToBoundaryLeft ||
      closeToBoundaryRight ||
      closeToBoundaryTop ||
      closeToBoundaryBottom;

    const rowButtonGroup =
      rowHandle.querySelector<HTMLElement>(".button-group");
    const colButtonGroup =
      colHandle.querySelector<HTMLElement>(".button-group");
    if (rowButtonGroup) rowButtonGroup.dataset.show = "false";
    if (colButtonGroup) colButtonGroup.dataset.show = "false";

    if (closeToBoundary) {
      const contentBoundary = content.getBoundingClientRect();
      rowHandle.dataset.show = "false";
      colHandle.dataset.show = "false";
      xHandle.dataset.displayType = "tool";
      yHandle.dataset.displayType = "tool";

      const yHandleWidth = yHandle.getBoundingClientRect().width;
      const xHandleHeight = xHandle.getBoundingClientRect().height;

      // display vertical line handle (add-col)
      if (closeToBoundaryLeft || closeToBoundaryRight) {
        lineHoverIndex.current[1] = closeToBoundaryLeft
          ? colIndex
          : colIndex + 1;
        computePosition(dom.col, yHandle, {
          placement: closeToBoundaryLeft ? "left" : "right",
          middleware: [offset(closeToBoundaryLeft ? -1 * yHandleWidth : 0)],
        })
          .then(({ x }) => {
            yHandle.dataset.show = "true";
            Object.assign(yHandle.style, {
              height: `${contentBoundary.height}px`,
              left: `${x}px`,
            });
          })
          .catch(console.error);
      } else {
        yHandle.dataset.show = "false";
      }

      // display horizontal line handle (add-row); never on the header row
      if (index[0] !== 0 && (closeToBoundaryTop || closeToBoundaryBottom)) {
        lineHoverIndex.current[0] = closeToBoundaryTop
          ? rowIndex
          : rowIndex + 1;
        computePosition(dom.row, xHandle, {
          placement: closeToBoundaryTop ? "top" : "bottom",
          middleware: [offset(closeToBoundaryTop ? -1 * xHandleHeight : 0)],
        })
          .then(({ y }) => {
            xHandle.dataset.show = "true";
            Object.assign(xHandle.style, {
              width: `${contentBoundary.width}px`,
              top: `${y}px`,
            });
          })
          .catch(console.error);
      } else {
        xHandle.dataset.show = "false";
      }

      return;
    }

    lineHoverIndex.current = [-1, -1];

    yHandle.dataset.show = "false";
    xHandle.dataset.show = "false";
    rowHandle.dataset.show = "true";
    colHandle.dataset.show = "true";

    computeRowHandlePositionByIndex({ refs, index });
    computeColHandlePositionByIndex({ refs, index });
    hoverIndex.current = index;
  }, 20);
}

function createPointerLeaveHandler(refs: Refs): () => void {
  return () => {
    const { rowHandleRef, colHandleRef, yLineHandleRef, xLineHandleRef } = refs;
    setTimeout(() => {
      const rowHandle = rowHandleRef.current;
      if (!rowHandle) return;
      const colHandle = colHandleRef.current;
      if (!colHandle) return;
      const yHandle = yLineHandleRef.current;
      if (!yHandle) return;
      const xHandle = xLineHandleRef.current;
      if (!xHandle) return;

      rowHandle.dataset.show = "false";
      colHandle.dataset.show = "false";
      yHandle.dataset.show = "false";
      xHandle.dataset.show = "false";
    }, 200);
  };
}

export function createPointerHandlers(
  refs: Refs,
  view?: EditorView,
): {
  pointerMove: (e: PointerEvent) => void;
  pointerLeave: () => void;
} {
  return {
    pointerMove: createPointerMoveHandler(refs, view),
    pointerLeave: createPointerLeaveHandler(refs),
  };
}

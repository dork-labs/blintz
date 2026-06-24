import type { Ctx } from "@milkdown/kit/ctx";

import { computePosition, offset } from "@floating-ui/dom";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  moveColCommand,
  moveRowCommand,
  selectColCommand,
  selectRowCommand,
} from "@milkdown/kit/preset/gfm";

import type { CellIndex, DragContext, Refs } from "./types";
import {
  computeColHandlePositionByIndex,
  computeRowHandlePositionByIndex,
  getRelatedDOM,
} from "./utils";

/**
 * Table drag-to-reorder — the Vue-free rebuild of Crepe's `table-block/dnd/*` +
 * `view/drag.ts`. Consolidated into one file (the table feature dir is the only
 * place this agent may write; the upstream split across five tiny modules buys
 * nothing here).
 *
 * Mechanism (faithful to Crepe):
 * - The col/row handles are native `draggable` elements. `dragstart` snapshots
 *   the dragged index into `refs.dragInfo` and renders a floating clone of the
 *   dragged row/column into `.drag-preview` (the visual the user "carries").
 * - A window `dragover` listener (throttled ~20ms) moves the preview to follow
 *   the pointer and re-positions the relevant line handle (`x`/`y`) as a drop
 *   indicator over the row/col currently under the pointer, updating
 *   `dragInfo.endIndex`.
 * - `drop` dispatches `selectRow/ColCommand` (to establish the CellSelection the
 *   move command operates on) then `moveRow/ColCommand({ from, to, pos })` —
 *   gfm's move commands build the reorder transaction. `dragend` clears the
 *   preview.
 *
 * All of this is imperative (mutates `dataset`/`style`, floating-ui, and the
 * `dragInfo` ref — never React state) so a drag never re-renders the node view.
 *
 * Simplification vs Crepe: identical behavior, but the clone-into-preview uses
 * the same `cloneNode(true)` approach; no live-screenshot/canvas preview (Crepe
 * doesn't do that either — it clones the DOM rows/cells).
 */

/** Lightweight leading+trailing throttle (lodash isn't a dep here). */
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

// ---------------------------------------------------------------------------
// prepare-dnd-context — resolve the live DOM the drag handlers need.
// ---------------------------------------------------------------------------

function prepareDndContext(refs: Refs): DragContext | undefined {
  const {
    dragPreviewRef,
    tableWrapperRef,
    contentWrapperRef,
    yLineHandleRef,
    xLineHandleRef,
    colHandleRef,
    rowHandleRef,
  } = refs;

  const preview = dragPreviewRef.current;
  if (!preview) return;
  const wrapper = tableWrapperRef.current;
  if (!wrapper) return;
  const content = contentWrapperRef.current;
  if (!content) return;
  const contentRoot = content.querySelector("tbody");
  if (!contentRoot) return;
  const previewRoot = preview.querySelector("tbody");
  if (!previewRoot) return;
  const yHandle = yLineHandleRef.current;
  if (!yHandle) return;
  const xHandle = xLineHandleRef.current;
  if (!xHandle) return;
  const colHandle = colHandleRef.current;
  if (!colHandle) return;
  const rowHandle = rowHandleRef.current;
  if (!rowHandle) return;

  return {
    preview,
    wrapper,
    content,
    contentRoot,
    previewRoot,
    yHandle,
    xHandle,
    colHandle,
    rowHandle,
  };
}

// ---------------------------------------------------------------------------
// calc-drag-over — find which row/col the pointer is currently over.
// ---------------------------------------------------------------------------

function findDragOverElement(
  elements: Element[],
  pointer: number,
  axis: "x" | "y",
): [Element, number] | undefined {
  const startProp = axis === "x" ? "left" : "top";
  const endProp = axis === "x" ? "right" : "bottom";
  const lastIndex = elements.length - 1;

  const index = elements.findIndex((el, i) => {
    const rect = el.getBoundingClientRect();
    const boundaryStart = rect[startProp];
    const boundaryEnd = rect[endProp];

    // Pointer within this element's boundary.
    if (boundaryStart <= pointer && pointer <= boundaryEnd) return true;
    // Pointer beyond the last element.
    if (i === lastIndex && pointer > boundaryEnd) return true;
    // Pointer before the first element.
    if (i === 0 && pointer < boundaryStart) return true;

    return false;
  });

  const element = elements[index];
  return element ? [element, index] : undefined;
}

function getDragOverColumn(
  tbody: Element,
  pointerX: number,
): [element: Element, index: number] | undefined {
  const firstRow = tbody.querySelector("tr");
  if (!firstRow) return;
  const cells = Array.from(firstRow.children);
  return findDragOverElement(cells, pointerX, "x");
}

function getDragOverRow(
  tbody: Element,
  pointerY: number,
): [element: Element, index: number] | undefined {
  const rows = Array.from(tbody.querySelectorAll("tr"));
  return findDragOverElement(rows, pointerY, "y");
}

// ---------------------------------------------------------------------------
// preview — clone the dragged row/col into the floating `.drag-preview`.
// ---------------------------------------------------------------------------

function clearPreview(previewRoot: HTMLElement): void {
  while (previewRoot.firstChild) previewRoot.removeChild(previewRoot.firstChild);
}

function renderPreview(
  axis: "x" | "y",
  preview: HTMLElement,
  previewRoot: HTMLElement,
  tableContent: HTMLElement,
  index: number,
): void {
  const tbody = tableContent.querySelector("tbody");
  if (!tbody) return;
  const { width: tableWidth, height: tableHeight } =
    tbody.getBoundingClientRect();

  if (axis === "y") {
    const rows = tableContent.querySelectorAll("tr");
    const row = rows[index];
    if (!row) return;

    previewRoot.appendChild(row.cloneNode(true));
    const height = row.getBoundingClientRect().height;

    Object.assign(preview.style, {
      width: `${tableWidth}px`,
      height: `${height}px`,
    });
    preview.dataset.show = "true";
    return;
  }

  // axis === "x": clone the single column out of every row.
  const rows = tableContent.querySelectorAll("tr");
  let width: number | undefined;

  Array.from(rows).forEach((row) => {
    const col = row.children[index];
    if (!col) return;
    if (width === undefined) width = col.getBoundingClientRect().width;
    const parent = col.parentElement;
    if (!parent) return;
    const tr = parent.cloneNode(false);
    const clone = col.cloneNode(true);
    tr.appendChild(clone);
    previewRoot.appendChild(tr);
  });

  Object.assign(preview.style, {
    width: `${width ?? 0}px`,
    height: `${tableHeight}px`,
  });
  preview.dataset.show = "true";
}

// ---------------------------------------------------------------------------
// create-drag-handler — the `dragstart` handlers bound on the col/row handles.
// ---------------------------------------------------------------------------

function hideButtonGroup(handle: HTMLElement): void {
  handle.querySelector(".button-group")?.setAttribute("data-show", "false");
}

function updateDragInfo(
  axis: "x" | "y",
  event: DragEvent,
  context: DragContext,
  refs: Refs,
): void {
  const { xHandle, yHandle, colHandle, rowHandle, preview } = context;
  xHandle.dataset.displayType = axis === "y" ? "indicator" : "none";
  yHandle.dataset.displayType = axis === "x" ? "indicator" : "none";

  if (axis === "y") {
    colHandle.dataset.show = "false";
    hideButtonGroup(rowHandle);
  } else {
    rowHandle.dataset.show = "false";
    hideButtonGroup(colHandle);
  }

  const { hoverIndex, dragInfo } = refs;
  const [rowIndex, colIndex] = hoverIndex.current;

  dragInfo.current = {
    startCoords: [event.clientX, event.clientY],
    startIndex: axis === "y" ? rowIndex : colIndex,
    endIndex: axis === "y" ? rowIndex : colIndex,
    type: axis === "y" ? "row" : "col",
  };

  preview.dataset.direction = axis === "y" ? "vertical" : "horizontal";
}

function handleDrag(
  refs: Refs,
  event: DragEvent,
  ctx: Ctx | undefined,
  fn: (context: DragContext) => void,
): void {
  const view = ctx?.get(editorViewCtx);
  if (!view?.editable) return;

  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";

  const context = prepareDndContext(refs);
  if (!context) return;

  // rAF to dodge a Chrome bug where dragend/dragenter/dragleave fire immediately
  // if the drag source's DOM mutates synchronously in dragstart.
  requestAnimationFrame(() => {
    fn(context);
  });
}

function createDragRowHandler(
  refs: Refs,
  ctx?: Ctx,
): (event: DragEvent) => void {
  return (event: DragEvent) => {
    handleDrag(refs, event, ctx, (context) => {
      updateDragInfo("y", event, context, refs);
      const { preview, content, previewRoot } = context;
      clearPreview(previewRoot);
      const [rowIndex] = refs.hoverIndex.current;
      renderPreview("y", preview, previewRoot, content, rowIndex);
    });
  };
}

function createDragColHandler(
  refs: Refs,
  ctx?: Ctx,
): (event: DragEvent) => void {
  return (event: DragEvent) => {
    handleDrag(refs, event, ctx, (context) => {
      updateDragInfo("x", event, context, refs);
      const { preview, content, previewRoot } = context;
      const [, colIndex] = refs.hoverIndex.current;
      clearPreview(previewRoot);
      renderPreview("x", preview, previewRoot, content, colIndex);
    });
  };
}

// ---------------------------------------------------------------------------
// drag-over-handler — follow the pointer + position the drop indicator.
// ---------------------------------------------------------------------------

function createDragOverHandler(refs: Refs): (e: DragEvent) => void {
  return throttle((e: DragEvent) => {
    const context = prepareDndContext(refs);
    if (!context) return;
    const { preview, content, contentRoot, xHandle, yHandle } = context;
    const { dragInfo, hoverIndex } = refs;

    if (preview.dataset.show === "false") return;
    const dom = getRelatedDOM(refs.contentWrapperRef, hoverIndex.current);
    if (!dom) return;
    const firstRow = contentRoot.querySelector("tr");
    if (!firstRow) return;
    const info = dragInfo.current;
    if (!info) return;

    const offsetParent = contentRoot.offsetParent as HTMLElement | null;
    if (!offsetParent) return;

    const wrapperOffsetTop = offsetParent.offsetTop;
    const wrapperOffsetLeft = offsetParent.offsetLeft;

    if (info.type === "col") {
      const width = dom.col.getBoundingClientRect().width;
      const { left, width: fullWidth } = contentRoot.getBoundingClientRect();
      const leftGap = wrapperOffsetLeft - left;
      const previewLeft = e.clientX + leftGap - width / 2;

      const [startX] = info.startCoords;
      const direction = startX < e.clientX ? "right" : "left";

      preview.style.top = `${wrapperOffsetTop}px`;
      const previewLeftOffset =
        previewLeft < left + leftGap - 20
          ? left + leftGap - 20
          : previewLeft > left + fullWidth + leftGap - width + 20
            ? left + fullWidth + leftGap - width + 20
            : previewLeft;
      preview.style.left = `${previewLeftOffset}px`;

      const dragOverColumn = getDragOverColumn(contentRoot, e.clientX);
      if (dragOverColumn) {
        const [col, index] = dragOverColumn;
        const yHandleWidth = yHandle.getBoundingClientRect().width;
        const contentBoundary = content.getBoundingClientRect();
        info.endIndex = index;

        computePosition(col, yHandle, {
          placement: direction === "left" ? "left" : "right",
          middleware: [offset(direction === "left" ? -1 * yHandleWidth : 0)],
        })
          .then(({ x }) => {
            yHandle.dataset.show = "true";
            Object.assign(yHandle.style, {
              height: `${contentBoundary.height}px`,
              left: `${x}px`,
              top: `${wrapperOffsetTop}px`,
            });
          })
          .catch(console.error);
      }
    } else if (info.type === "row") {
      const height = dom.row.getBoundingClientRect().height;
      const { top, height: fullHeight } = contentRoot.getBoundingClientRect();

      const topGap = wrapperOffsetTop - top;
      const previewTop = e.clientY + topGap - height / 2;

      const [, startY] = info.startCoords;
      const direction = startY < e.clientY ? "down" : "up";

      const previewTopOffset =
        previewTop < top + topGap - 20
          ? top + topGap - 20
          : previewTop > top + fullHeight + topGap - height + 20
            ? top + fullHeight + topGap - height + 20
            : previewTop;
      preview.style.top = `${previewTopOffset}px`;
      preview.style.left = `${wrapperOffsetLeft}px`;

      const dragOverRow = getDragOverRow(contentRoot, e.clientY);
      if (dragOverRow) {
        const [row, index] = dragOverRow;
        const xHandleHeight = xHandle.getBoundingClientRect().height;
        const contentBoundary = content.getBoundingClientRect();
        info.endIndex = index;

        computePosition(row, xHandle, {
          placement: direction === "up" ? "top" : "bottom",
          middleware: [offset(direction === "up" ? -1 * xHandleHeight : 0)],
        })
          .then(({ y }) => {
            xHandle.dataset.show = "true";
            Object.assign(xHandle.style, {
              width: `${contentBoundary.width}px`,
              top: `${y}px`,
            });
          })
          .catch(console.error);
      }
    }
  }, 20);
}

// ---------------------------------------------------------------------------
// useDragHandlers (React) — wire the window drag lifecycle + return the
// `dragstart` handlers the col/row handles bind. Ported from `view/drag.ts`'s
// `useDragHandlers`, with Vue's `onMounted`/`onUnmounted` replaced by the caller
// (TableView) registering these inside a StrictMode-symmetric `useEffect`.
// ---------------------------------------------------------------------------

export interface DragHandlers {
  /** Bind to the col handle's `onDragStart`. */
  dragCol: (event: DragEvent) => void;
  /** Bind to the row handle's `onDragStart`. */
  dragRow: (event: DragEvent) => void;
  /** Window `dragover` listener (follows the pointer, moves the indicator). */
  onDragOver: (e: DragEvent) => void;
  /** Window `dragend` listener (clears the preview). */
  onDragEnd: () => void;
  /** Window `drop` listener (dispatches the move transaction). */
  onDrop: () => void;
}

export function createDragHandlers(
  refs: Refs,
  ctx?: Ctx,
  getPos?: () => number | undefined,
): DragHandlers {
  const { dragPreviewRef, yLineHandleRef, xLineHandleRef, dragInfo } = refs;

  const dragRow = createDragRowHandler(refs, ctx);
  const dragCol = createDragColHandler(refs, ctx);
  const onDragOver = createDragOverHandler(refs);

  const onDragEnd = () => {
    const preview = dragPreviewRef.current;
    if (!preview) return;
    if (preview.dataset.show === "false") return;

    const previewRoot = preview.querySelector("tbody");
    while (previewRoot?.firstChild)
      previewRoot.removeChild(previewRoot.firstChild);

    preview.dataset.show = "false";
    dragInfo.current = undefined;
  };

  const onDrop = () => {
    const preview = dragPreviewRef.current;
    if (!preview) return;
    const yHandle = yLineHandleRef.current;
    if (!yHandle) return;
    const xHandle = xLineHandleRef.current;
    if (!xHandle) return;
    const info = dragInfo.current;
    if (!info) return;
    if (!ctx) return;
    if (preview.dataset.show === "false") return;
    if (!refs.colHandleRef.current) return;
    if (!refs.rowHandleRef.current) return;

    yHandle.dataset.show = "false";
    xHandle.dataset.show = "false";

    // Tear down the preview + drag state HERE, before the move dispatch: the
    // browser fires `dragend` immediately after `drop`, so clearing now (and
    // setting data-show="false") makes `onDragEnd`'s guard short-circuit instead
    // of walking a preview subtree the dispatch may have detached via a node-view
    // re-render. Keeps drop/dragend idempotent. (Upstream relies on dragend alone;
    // this is strictly more defensive.)
    const previewRoot = preview.querySelector("tbody");
    while (previewRoot?.firstChild) previewRoot.removeChild(previewRoot.firstChild);
    preview.dataset.show = "false";
    dragInfo.current = undefined;

    if (info.startIndex === info.endIndex) return;

    // Never move the GFM header row out of position 0, nor a body row above it:
    // the first row is a `table_header_row` (header cells), so reordering it
    // breaks the table's header/body split and its `| --- |` markdown round-trip
    // — and round-trip fidelity is non-negotiable here. (Upstream Crepe doesn't
    // guard this; we do, since the header is structurally special. Columns have
    // no equivalent, so only rows are guarded.) A drop onto row 0 is a no-op;
    // the user can drop one row lower.
    if (info.type === "row" && (info.startIndex === 0 || info.endIndex === 0)) {
      return;
    }

    const commands = ctx.get(commandsCtx);
    const payload = {
      from: info.startIndex,
      to: info.endIndex,
      pos: (getPos?.() ?? 0) + 1,
    };
    if (info.type === "col") {
      commands.call(selectColCommand.key, {
        pos: payload.pos,
        index: info.startIndex,
      });
      commands.call(moveColCommand.key, payload);
      const index: CellIndex = [0, info.endIndex];
      computeColHandlePositionByIndex({ refs, index });
    } else {
      commands.call(selectRowCommand.key, {
        pos: payload.pos,
        index: info.startIndex,
      });
      commands.call(moveRowCommand.key, payload);
      const index: CellIndex = [info.endIndex, 0];
      computeRowHandlePositionByIndex({ refs, index });
    }

    requestAnimationFrame(() => {
      ctx.get(editorViewCtx).focus();
    });
  };

  return { dragCol, dragRow, onDragOver, onDragEnd, onDrop };
}

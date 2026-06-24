import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";

import { computePosition } from "@floating-ui/dom";
import { findParent } from "@milkdown/kit/prose";
import { CellSelection, findTable } from "@milkdown/kit/prose/tables";

import type { CellIndex, MutRef, Refs } from "./types";

/**
 * Cell-index math + floating-handle placement — ported from
 * `@milkdown/components/table-block/view/utils.ts`, Vue `Ref.value` → React
 * `.current`. Drag-only helpers from the original are omitted (deferred).
 */

function findNodeIndex(parent: Node, child: Node): number {
  for (let i = 0; i < parent.childCount; i++) {
    if (parent.child(i) === child) return i;
  }
  return -1;
}

/** Resolve the [row, col] of the cell under the pointer (or undefined). */
export function findPointerIndex(
  event: PointerEvent,
  view?: EditorView,
): CellIndex | undefined {
  if (!view) return;

  try {
    const posAtCoords = view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (!posAtCoords) return;
    const pos = posAtCoords.inside;
    if (pos == null || pos < 0) return;

    const $pos = view.state.doc.resolve(pos);
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;

    const cellType = ["table_cell", "table_header"];
    const rowType = ["table_row", "table_header_row"];

    const cell = cellType.includes(node.type.name)
      ? node
      : findParent((n) => cellType.includes(n.type.name))($pos)?.node;
    const row = findParent((n) => rowType.includes(n.type.name))($pos)?.node;
    const table = findParent((n) => n.type.name === "table")($pos)?.node;
    if (!cell || !row || !table) return;

    const columnIndex = findNodeIndex(row, cell);
    const rowIndex = findNodeIndex(table, row);

    return [rowIndex, columnIndex];
  } catch {
    return undefined;
  }
}

/** Locate the DOM `<tr>`/`<td>`/header cell for a given [row, col]. */
export function getRelatedDOM(
  contentWrapperRef: MutRef<HTMLElement | null>,
  [rowIndex, columnIndex]: CellIndex,
):
  | { row: Element; col: Element; headerCol: Element }
  | undefined {
  const content = contentWrapperRef.current;
  if (!content) return;
  const rows = content.querySelectorAll("tr");
  const row = rows[rowIndex];
  if (!row) return;

  const firstRow = rows[0];
  if (!firstRow) return;

  const headerCol = firstRow.children[columnIndex];
  if (!headerCol) return;

  const col = row.children[columnIndex];
  if (!col) return;

  return { row, col, headerCol };
}

/**
 * After a structural command re-creates the table NodeView, re-open the relevant
 * popover so it survives the update (e.g. clicking "select col" should leave the
 * col popover open). Ported verbatim (minus Vue refs).
 */
export function recoveryStateBetweenUpdate(
  refs: Refs,
  view?: EditorView,
  node?: Node,
): void {
  if (!node) return;
  if (!view) return;
  const { selection } = view.state;
  if (!(selection instanceof CellSelection)) return;

  const { $from } = selection;
  const table = findTable($from);
  if (!table || table.node !== node) return;

  if (selection.isColSelection()) {
    const { $head } = selection;
    const colIndex = $head.index($head.depth - 1);
    computeColHandlePositionByIndex({
      refs,
      index: [0, colIndex],
      before: (handleDOM) => {
        handleDOM
          .querySelector(".button-group")
          ?.setAttribute("data-show", "true");
      },
    });
    return;
  }
  if (selection.isRowSelection()) {
    const { $head } = selection;
    const rowNode = findParent(
      (n) =>
        n.type.name === "table_row" || n.type.name === "table_header_row",
    )($head);
    if (!rowNode) return;
    const rowIndex = findNodeIndex(table.node, rowNode.node);
    computeRowHandlePositionByIndex({
      refs,
      index: [rowIndex, 0],
      before: (handleDOM) => {
        if (rowIndex > 0)
          handleDOM
            .querySelector(".button-group")
            ?.setAttribute("data-show", "true");
      },
    });
  }
}

interface ComputeHandlePositionByIndexProps {
  refs: Refs;
  index: CellIndex;
  before?: (handleDOM: HTMLDivElement) => void;
  after?: (handleDOM: HTMLDivElement) => void;
}

export function computeColHandlePositionByIndex({
  refs,
  index,
  before,
  after,
}: ComputeHandlePositionByIndexProps): void {
  const { contentWrapperRef, colHandleRef, hoverIndex } = refs;
  const colHandle = colHandleRef.current;
  if (!colHandle) return;

  hoverIndex.current = index;
  const dom = getRelatedDOM(contentWrapperRef, index);
  if (!dom) return;
  const { headerCol: col } = dom;
  colHandle.dataset.show = "true";
  if (before) before(colHandle);
  computePosition(col, colHandle, { placement: "top" })
    .then(({ x, y }) => {
      Object.assign(colHandle.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
      if (after) after(colHandle);
    })
    .catch(console.error);
}

export function computeRowHandlePositionByIndex({
  refs,
  index,
  before,
  after,
}: ComputeHandlePositionByIndexProps): void {
  const { contentWrapperRef, rowHandleRef, hoverIndex } = refs;
  const rowHandle = rowHandleRef.current;
  if (!rowHandle) return;

  hoverIndex.current = index;
  const dom = getRelatedDOM(contentWrapperRef, index);
  if (!dom) return;
  const { row } = dom;
  rowHandle.dataset.show = "true";
  if (before) before(rowHandle);
  computePosition(row, rowHandle, { placement: "left" })
    .then(({ x, y }) => {
      Object.assign(rowHandle.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
      if (after) after(rowHandle);
    })
    .catch(console.error);
}

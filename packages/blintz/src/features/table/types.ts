/**
 * Table-block view types — ported from
 * `@milkdown/components/table-block/view/types.ts`, with Vue `Ref<T>` swapped for
 * plain `{ current: T }` React refs (`React.MutableRefObject`-shaped). The
 * handle/hover machinery is intentionally imperative (mutates `.current` +
 * `dataset`/`style` directly, NOT React state) to avoid per-pointermove
 * re-renders — so a tiny ref holder is all we need.
 *
 * The drag-to-reorder fields (`DragInfo`/`DragContext` + `dragPreviewRef`/
 * `tableWrapperRef`/`dragInfo`) are now included — see `drag.ts`. Like the hover
 * machinery, the drag state is imperative: `dragInfo` is a plain ref mutated in
 * place during a drag (no React state → no per-`dragover` re-render).
 */

export type CellIndex = [row: number, col: number];

/** A `{ current }` holder — matches `React.RefObject`/`MutableRefObject` shape. */
export interface MutRef<T> {
  current: T;
}

/**
 * In-flight drag state. Set on `dragstart`, mutated (`endIndex`) on `dragover`,
 * read on `drop`. Ported from `table-block/view/types.ts` `DragInfo`.
 */
export interface DragInfo {
  /** Pointer coords where the drag began — used to infer drag direction. */
  startCoords: [x: number, y: number];
  /** The row/col index being dragged. */
  startIndex: number;
  /** The row/col index the pointer is currently over (the drop target). */
  endIndex: number;
  type: "row" | "col";
}

/**
 * The resolved set of live DOM nodes a drag operation needs — assembled by
 * `prepareDndContext` from the refs (so the drag handlers don't each re-null-check
 * every ref). Ported from `table-block/view/types.ts` `DragContext`.
 */
export interface DragContext {
  /** The floating `.drag-preview` element (hosts a clone of the dragged row/col). */
  preview: HTMLDivElement;
  /** The `<tbody>` inside `.drag-preview` we clone rows/cells into. */
  previewRoot: HTMLTableSectionElement;
  /** The `.table-wrapper` (drag-preview + handles are positioned within it). */
  wrapper: HTMLDivElement;
  /** The `<table class="children">` whose `<tbody>` is PM's contentDOM. */
  content: HTMLElement;
  /** That table's `<tbody>` (the live rows/cells). */
  contentRoot: HTMLTableSectionElement;
  yHandle: HTMLDivElement;
  xHandle: HTMLDivElement;
  colHandle: HTMLDivElement;
  rowHandle: HTMLDivElement;
}

/**
 * The bag of imperative refs the pointer/operation/drag/utils helpers read &
 * mutate. The DOM-element refs are `current: T | null` (React `useRef<T>(null)`);
 * the index refs + `dragInfo` hold plain values mutated in place.
 */
export interface Refs {
  /** The `<table class="children">` whose `<tbody>` is PM's contentDOM. */
  contentWrapperRef: MutRef<HTMLElement | null>;
  /** The `.table-wrapper` host (positions the drag-preview + line handles). */
  tableWrapperRef: MutRef<HTMLDivElement | null>;
  /** The floating `.drag-preview` element shown while dragging a row/col. */
  dragPreviewRef: MutRef<HTMLDivElement | null>;
  /** The vertical (between-columns) add-col line handle. */
  yLineHandleRef: MutRef<HTMLDivElement | null>;
  /** The horizontal (between-rows) add-row line handle. */
  xLineHandleRef: MutRef<HTMLDivElement | null>;
  /** The floating column handle (top of a column) + its button-group popover. */
  colHandleRef: MutRef<HTMLDivElement | null>;
  /** The floating row handle (left of a row) + its button-group popover. */
  rowHandleRef: MutRef<HTMLDivElement | null>;
  /** [row, col] of the cell the col/row handles currently point at. */
  hoverIndex: MutRef<CellIndex>;
  /** [row, col] insertion index the line handles' + buttons act on (-1 = none). */
  lineHoverIndex: MutRef<CellIndex>;
  /** The in-flight drag (undefined when not dragging). */
  dragInfo: MutRef<DragInfo | undefined>;
}

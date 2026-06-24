import { useNodeViewContext } from "@prosemirror-adapter/react";
import { useEffect, useRef } from "react";

import { Icon } from "../../shared/Icon";
import { useEditorCtx } from "../../shared/editor-ctx";
import { tableBlockConfig } from "./config";
import { createDragHandlers } from "./drag";
import { createOperations } from "./operation";
import { createPointerHandlers } from "./pointer";
import type { CellIndex, DragInfo, Refs } from "./types";
import { recoveryStateBetweenUpdate } from "./utils";

/**
 * React node view for the GFM `table` node — the Vue-free rebuild of Crepe's
 * `table-block/view/component.tsx`. ProseMirror owns the `<tbody>` cells (PM's
 * contentDOM, routed through `contentRef`); React owns only the chrome: the
 * floating column/row handles (each opening a button-group popover) and the
 * add-row/add-col line handles.
 *
 * The host `<div class="milkdown-table-block">` is the factory's `as` element;
 * the cell-click-to-select-cell logic lives in the feature's `stopEvent`
 * (see index.ts), not here. All handle positioning is imperative (floating-ui +
 * `dataset.show`/`style`, throttled), driven by pointer events — NOT React state.
 *
 * DnD reorder (drag a col/row to move it) IS wired (see `drag.ts`): the col/row
 * handles are native `draggable` elements; dragstart renders a floating clone
 * into `.drag-preview`, dragover follows the pointer + shows a line drop
 * indicator, and drop dispatches gfm's `moveCol/RowCommand` to reorder. The
 * window-level drag listeners are bound imperatively in a StrictMode-symmetric
 * effect (clean add/remove) — same shape as the pointer-handler effect.
 */
export function TableView() {
  const { node, view, getPos, contentRef } = useNodeViewContext();
  const ctx = useEditorCtx();
  const config = ctx.get(tableBlockConfig.key);

  // Imperative ref bag — the pointer/operation/drag/utils helpers mutate these
  // directly (no React state), to keep hover + drag responsive without
  // re-render thrash.
  const contentWrapperRef = useRef<HTMLTableElement | null>(null);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);
  const colHandleRef = useRef<HTMLDivElement | null>(null);
  const rowHandleRef = useRef<HTMLDivElement | null>(null);
  const xLineHandleRef = useRef<HTMLDivElement | null>(null);
  const yLineHandleRef = useRef<HTMLDivElement | null>(null);
  const hoverIndex = useRef<CellIndex>([0, 0]);
  const lineHoverIndex = useRef<CellIndex>([-1, -1]);
  const dragInfo = useRef<DragInfo | undefined>(undefined);

  const refs: Refs = {
    contentWrapperRef,
    tableWrapperRef,
    dragPreviewRef,
    yLineHandleRef,
    xLineHandleRef,
    colHandleRef,
    rowHandleRef,
    hoverIndex,
    lineHoverIndex,
    dragInfo,
  };

  const { onAddRow, onAddCol, selectCol, selectRow, deleteSelected, onAlign } =
    createOperations(refs, ctx, getPos);

  // The `<table class="children">` is both PM's content host (the adapter's
  // `contentRef` appends the `<tbody>` contentDOM into it) AND the element the
  // pointer/utils helpers walk for `<tr>`/`<td>` geometry (`contentWrapperRef`).
  // A combined callback ref wires both onto the same node.
  const setTableRef = (el: HTMLTableElement | null) => {
    contentWrapperRef.current = el;
    contentRef(el);
  };

  // Build the pointer handlers fresh inside the effect (StrictMode-safe symmetric
  // lifecycle): the throttle closure must own a single timer, and the handlers
  // close over `view`. We bind them on the wrapper element imperatively (rather
  // than React props) so we can `removeEventListener` exactly on cleanup.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const { pointerMove, pointerLeave } = createPointerHandlers(refs, view);
    const onMove = (e: PointerEvent) => pointerMove(e);
    const onLeave = () => pointerLeave();
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
    // `refs` is a fresh object each render but holds stable `.current` refs; the
    // handlers only read `view` (stable per view) + those refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Drag-to-reorder lifecycle (StrictMode-symmetric): build the handlers fresh
  // inside the effect (the throttle closure must own a single timer), bind the
  // col/row `dragstart` on their handle elements, and listen on `window` for the
  // `dragover`/`dragend`/`drop` phases (native HTML5 DnD dispatches those on the
  // document, not the source element). Everything is removed on cleanup so the
  // StrictMode double-mount can't leave a duplicate listener or a stale closure.
  useEffect(() => {
    const colHandle = colHandleRef.current;
    const rowHandle = rowHandleRef.current;
    if (!colHandle || !rowHandle) return;

    const { dragCol, dragRow, onDragOver, onDragEnd, onDrop } =
      createDragHandlers(refs, ctx, getPos);

    colHandle.addEventListener("dragstart", dragCol);
    rowHandle.addEventListener("dragstart", dragRow);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("drop", onDrop);
    return () => {
      colHandle.removeEventListener("dragstart", dragCol);
      rowHandle.removeEventListener("dragstart", dragRow);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("drop", onDrop);
    };
    // Stable per view; refs are stable holders, ctx/getPos stable per node view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // After every PM update (a new `node`), re-open the popover that was open so
  // clicking "select col/row" keeps it visible across the NodeView re-create.
  useEffect(() => {
    requestAnimationFrame(() => {
      if (view.editable) recoveryStateBetweenUpdate(refs, view, node);
    });
    // Run on each node change; refs are stable holders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, view]);

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  // Suppress the browser's native text/element drag on the editing surface so
  // only the handle-initiated row/col drag fires (matches Crepe's outer wrapper).
  const preventDrag = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <div
      ref={wrapperRef}
      onDragStart={preventDrag}
      onDragOver={preventDrag}
      onDragLeave={preventDrag}
    >
      <div
        data-show="false"
        contentEditable={false}
        draggable
        data-role="col-drag-handle"
        className="handle cell-handle"
        onClick={selectCol}
        onPointerDown={stop}
        onPointerMove={stop}
        ref={colHandleRef}
      >
        <Icon icon={config.renderButton("col_drag_handle")} />
        <div className="button-group" data-show="false" onPointerMove={stop}>
          <button type="button" onPointerDown={onAlign("left")}>
            <Icon icon={config.renderButton("align_col_left")} />
          </button>
          <button type="button" onPointerDown={onAlign("center")}>
            <Icon icon={config.renderButton("align_col_center")} />
          </button>
          <button type="button" onPointerDown={onAlign("right")}>
            <Icon icon={config.renderButton("align_col_right")} />
          </button>
          <button type="button" onPointerDown={deleteSelected}>
            <Icon icon={config.renderButton("delete_col")} />
          </button>
        </div>
      </div>

      <div
        data-show="false"
        contentEditable={false}
        draggable
        data-role="row-drag-handle"
        className="handle cell-handle"
        onClick={selectRow}
        onPointerDown={stop}
        onPointerMove={stop}
        ref={rowHandleRef}
      >
        <Icon icon={config.renderButton("row_drag_handle")} />
        <div className="button-group" data-show="false" onPointerMove={stop}>
          <button type="button" onPointerDown={deleteSelected}>
            <Icon icon={config.renderButton("delete_row")} />
          </button>
        </div>
      </div>

      <div className="table-wrapper" ref={tableWrapperRef}>
        {/* The floating clone of the dragged row/column (the "carried" preview);
            its inner `<tbody>` is (re)filled imperatively during a drag. */}
        <div
          data-show="false"
          className="drag-preview"
          data-direction="vertical"
          ref={dragPreviewRef}
        >
          <table>
            <tbody />
          </table>
        </div>
        <div
          data-show="false"
          contentEditable={false}
          data-display-type="tool"
          data-role="x-line-drag-handle"
          className="handle line-handle"
          onPointerMove={stop}
          ref={xLineHandleRef}
        >
          <button type="button" onClick={onAddRow} className="add-button">
            <Icon icon={config.renderButton("add_row")} />
          </button>
        </div>
        <div
          data-show="false"
          contentEditable={false}
          data-display-type="tool"
          data-role="y-line-drag-handle"
          className="handle line-handle"
          onPointerMove={stop}
          ref={yLineHandleRef}
        >
          <button type="button" onClick={onAddCol} className="add-button">
            <Icon icon={config.renderButton("add_col")} />
          </button>
        </div>
        {/* PM owns the cells: contentRef appends the `<tbody>` contentDOM here. */}
        <table className="children" ref={setTableRef} />
      </div>
    </div>
  );
}

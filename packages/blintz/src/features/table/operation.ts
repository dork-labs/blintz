import type { Ctx } from "@milkdown/kit/ctx";
import type { PointerEvent as ReactPointerEvent } from "react";

import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  deleteSelectedCellsCommand,
  selectColCommand,
  selectRowCommand,
  setAlignCommand,
} from "@milkdown/kit/preset/gfm";

import type { Refs } from "./types";

/**
 * The structural-edit wiring — ported from
 * `@milkdown/components/table-block/view/operation.ts`. Each op delegates to a
 * GFM table command (imported from the Vue-free `@milkdown/kit/preset/gfm`). Vue
 * `Ref.value` → React `.current`; `ctx`/`getPos` are passed in from the view.
 *
 * Every op is guarded on `view.editable`. Add/delete/align follow GFM's pattern
 * of `selectColCommand`/`selectRowCommand` (to establish a CellSelection) then
 * the mutating command. Returns plain handlers the React component binds via
 * `onPointerDown` (so the live PM selection survives the click).
 */

export interface TableOperations {
  onAddRow: () => void;
  onAddCol: () => void;
  selectCol: () => void;
  selectRow: () => void;
  deleteSelected: (e: ReactPointerEvent) => void;
  onAlign: (
    direction: "left" | "center" | "right",
  ) => (e: ReactPointerEvent) => void;
}

export function createOperations(
  refs: Refs,
  ctx?: Ctx,
  getPos?: () => number | undefined,
): TableOperations {
  const {
    xLineHandleRef,
    contentWrapperRef,
    colHandleRef,
    rowHandleRef,
    hoverIndex,
    lineHoverIndex,
  } = refs;

  const onAddRow = () => {
    if (!ctx) return;
    const xHandle = xLineHandleRef.current;
    if (!xHandle) return;

    const [rowIndex] = lineHoverIndex.current;
    if (rowIndex < 0) return;

    if (!ctx.get(editorViewCtx).editable) return;

    const rows = Array.from(
      contentWrapperRef.current?.querySelectorAll("tr") ?? [],
    );
    const commands = ctx.get(commandsCtx);
    const pos = (getPos?.() ?? 0) + 1;
    if (rows.length === rowIndex) {
      commands.call(selectRowCommand.key, { pos, index: rowIndex - 1 });
      commands.call(addRowAfterCommand.key);
    } else {
      commands.call(selectRowCommand.key, { pos, index: rowIndex });
      commands.call(addRowBeforeCommand.key);
    }

    commands.call(selectRowCommand.key, { pos, index: rowIndex });
    xHandle.dataset.show = "false";
  };

  const onAddCol = () => {
    if (!ctx) return;
    const xHandle = xLineHandleRef.current;
    if (!xHandle) return;

    const [, colIndex] = lineHoverIndex.current;
    if (colIndex < 0) return;

    if (!ctx.get(editorViewCtx).editable) return;

    const cols = Array.from(
      contentWrapperRef.current?.querySelector("tr")?.children ?? [],
    );
    const commands = ctx.get(commandsCtx);

    const pos = (getPos?.() ?? 0) + 1;
    if (cols.length === colIndex) {
      commands.call(selectColCommand.key, { pos, index: colIndex - 1 });
      commands.call(addColAfterCommand.key);
    } else {
      commands.call(selectColCommand.key, { pos, index: colIndex });
      commands.call(addColBeforeCommand.key);
    }

    commands.call(selectColCommand.key, { pos, index: colIndex });
  };

  const selectCol = () => {
    if (!ctx) return;
    const [, colIndex] = hoverIndex.current;
    const commands = ctx.get(commandsCtx);
    const pos = (getPos?.() ?? 0) + 1;
    commands.call(selectColCommand.key, { pos, index: colIndex });
    const buttonGroup =
      colHandleRef.current?.querySelector<HTMLElement>(".button-group");
    if (buttonGroup)
      buttonGroup.dataset.show =
        buttonGroup.dataset.show === "true" ? "false" : "true";
  };

  const selectRow = () => {
    if (!ctx) return;
    const [rowIndex] = hoverIndex.current;
    const commands = ctx.get(commandsCtx);
    const pos = (getPos?.() ?? 0) + 1;
    commands.call(selectRowCommand.key, { pos, index: rowIndex });
    const buttonGroup =
      rowHandleRef.current?.querySelector<HTMLElement>(".button-group");
    if (buttonGroup && rowIndex > 0)
      buttonGroup.dataset.show =
        buttonGroup.dataset.show === "true" ? "false" : "true";
  };

  const deleteSelected = (e: ReactPointerEvent) => {
    if (!ctx) return;

    if (!ctx.get(editorViewCtx).editable) return;

    e.preventDefault();
    e.stopPropagation();
    const commands = ctx.get(commandsCtx);
    commands.call(deleteSelectedCellsCommand.key);
    requestAnimationFrame(() => {
      ctx.get(editorViewCtx).focus();
    });
  };

  const onAlign =
    (direction: "left" | "center" | "right") => (e: ReactPointerEvent) => {
      if (!ctx) return;

      if (!ctx.get(editorViewCtx).editable) return;

      e.preventDefault();
      e.stopPropagation();
      const commands = ctx.get(commandsCtx);
      commands.call(setAlignCommand.key, direction);
      requestAnimationFrame(() => {
        ctx.get(editorViewCtx).focus();
      });
    };

  return {
    onAddRow,
    onAddCol,
    selectCol,
    selectRow,
    deleteSelected,
    onAlign,
  };
}

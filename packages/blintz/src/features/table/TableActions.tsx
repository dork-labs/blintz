import { useEffect, useRef, useState } from "react";
import { commandsCtx } from "@milkdown/kit/core";
import {
  addColAfterCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand,
  moveColCommand,
  moveRowCommand,
  selectColCommand,
  selectRowCommand,
} from "@milkdown/kit/preset/gfm";
import { useNodeViewContext } from "@prosemirror-adapter/react";
import { useEditorCtx, useEditorEditable } from "../../shared/editor-ctx";

/** Keyboard and touch alternative to the table's pointer-only edge handles. */
export function TableActions() {
  const { node, view, getPos } = useNodeViewContext();
  const ctx = useEditorCtx();
  const editable = useEditorEditable(view);
  const [open, setOpen] = useState(false);
  const [cell, setCell] = useState({ row: 0, col: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !hostRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (!editable) setOpen(false);
  }, [editable]);

  const toggle = () => {
    if (!view.editable) return;
    const { $from } = view.state.selection;
    const pos = getPos();
    let row = 0;
    let col = 0;
    if (pos != null && $from.pos > pos && $from.pos < pos + node.nodeSize) {
      for (let depth = 0; depth <= $from.depth; depth++) {
        if ($from.node(depth).type.name === "table") {
          row = $from.index(depth);
          col = depth < $from.depth ? $from.index(depth + 1) : 0;
          break;
        }
      }
    }
    setCell({ row, col });
    setOpen(!open);
  };

  const run = (
    action:
      | "add-row"
      | "add-col"
      | "delete-row"
      | "delete-col"
      | "row-up"
      | "row-down"
      | "col-left"
      | "col-right",
  ) => {
    if (!view.editable) return;
    const start = getPos();
    if (start == null) return;
    const commands = ctx.get(commandsCtx);
    const pos = start + 1;
    if (action === "add-row" || action === "delete-row") {
      commands.call(selectRowCommand.key, { pos, index: cell.row });
      commands.call(
        action === "add-row"
          ? addRowAfterCommand.key
          : deleteSelectedCellsCommand.key,
      );
    } else if (action === "add-col" || action === "delete-col") {
      commands.call(selectColCommand.key, { pos, index: cell.col });
      commands.call(
        action === "add-col"
          ? addColAfterCommand.key
          : deleteSelectedCellsCommand.key,
      );
    } else if (action === "row-up" || action === "row-down") {
      commands.call(selectRowCommand.key, { pos, index: cell.row });
      commands.call(moveRowCommand.key, {
        pos,
        from: cell.row,
        to: cell.row + (action === "row-up" ? -1 : 1),
      });
    } else {
      commands.call(selectColCommand.key, { pos, index: cell.col });
      commands.call(moveColCommand.key, {
        pos,
        from: cell.col,
        to: cell.col + (action === "col-left" ? -1 : 1),
      });
    }
    setOpen(false);
    view.focus();
  };

  if (!editable) return null;
  const rows = node.childCount;
  const cols = node.firstChild?.childCount ?? 0;
  return (
    <div
      className="milkdown-table-actions"
      contentEditable={false}
      ref={hostRef}
    >
      <button
        type="button"
        ref={triggerRef}
        aria-label="Table actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        •••
      </button>
      {open && (
        <div
          className="milkdown-table-actions-menu"
          role="menu"
          aria-label="Table actions"
          ref={menuRef}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              event.stopPropagation();
              const buttons = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ) ?? [],
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              buttons[
                (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length
              ]?.focus();
            }
          }}
        >
          <div className="milkdown-table-actions-context">
            Row {cell.row + 1} · Column {cell.col + 1}
          </div>
          <button role="menuitem" type="button" onClick={() => run("add-row")}>
            Add row below
          </button>
          <button role="menuitem" type="button" onClick={() => run("add-col")}>
            Add column right
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={cell.row <= 1}
            onClick={() => run("row-up")}
          >
            Move row up
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={cell.row === 0 || cell.row >= rows - 1}
            onClick={() => run("row-down")}
          >
            Move row down
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={cell.col === 0}
            onClick={() => run("col-left")}
          >
            Move column left
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={cell.col >= cols - 1}
            onClick={() => run("col-right")}
          >
            Move column right
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={cell.row === 0}
            onClick={() => run("delete-row")}
          >
            Delete row
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={cols <= 1}
            onClick={() => run("delete-col")}
          >
            Delete column
          </button>
        </div>
      )}
    </div>
  );
}

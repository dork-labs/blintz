import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  clearTextInCurrentBlockCommand,
  codeBlockSchema,
  headingSchema,
  hrSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  selectTextNearPosCommand,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { createTable } from "@milkdown/kit/preset/gfm";

import { imageBlockSchema } from "../image-block/schema";
import { GroupBuilder, type MenuItemGroup } from "../../shared/group-builder";
import {
  bulletListIcon,
  codeIcon,
  dividerIcon,
  functionsIcon,
  h1Icon,
  h2Icon,
  h3Icon,
  h4Icon,
  h5Icon,
  h6Icon,
  imageIcon,
  orderedListIcon,
  quoteIcon,
  tableIcon,
  textIcon,
  todoListIcon,
} from "../../icons";

/** A single slash-menu command (label + icon; `onRun`/`index`/`key` added by GroupBuilder). */
export type SlashMenuItem = {
  label: string;
  icon: string;
};

/**
 * Build the slash menu's grouped, filterable commands — the React port of
 * Crepe's `getGroups` (`block-edit/menu/config.ts`). Each item's `onRun` clears
 * the current block then applies a pure commonmark/gfm command via
 * `commandsCtx`, exactly as Crepe does (engine reused as-is).
 *
 * Feature gating: Crepe conditionally shows Image/Table/Math via a `FeaturesCtx`
 * feature-flag array (only items whose feature was registered appear). Blintz does
 * NOT port that — **every feature is always registered** (see `useBlintzEditor`),
 * so this menu config is the single source of truth for which items appear and all
 * of them are always live. If feature registration ever becomes configurable, this
 * is where item gating would need to be reintroduced (mirroring `crepeFeatureConfig`).
 *
 * After building, items get a flat `index` and groups a `[start, end)` `range`
 * (used by keyboard nav) — assigned by mutation, same as Crepe.
 */
export function getGroups(filter: string) {
  const groupBuilder = new GroupBuilder<SlashMenuItem>();

  const textGroup = groupBuilder.addGroup("text", "Text");
  textGroup.addItem("text", {
    label: "Text",
    icon: textIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const paragraph = paragraphSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(setBlockTypeCommand.key, { nodeType: paragraph });
    },
  });
  const headings: Array<[string, string, number]> = [
    ["h1", h1Icon, 1],
    ["h2", h2Icon, 2],
    ["h3", h3Icon, 3],
    ["h4", h4Icon, 4],
    ["h5", h5Icon, 5],
    ["h6", h6Icon, 6],
  ];
  for (const [key, icon, level] of headings) {
    textGroup.addItem(key, {
      label: `Heading ${level}`,
      icon,
      onRun: (ctx) => {
        const commands = ctx.get(commandsCtx);
        const heading = headingSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(setBlockTypeCommand.key, {
          nodeType: heading,
          attrs: { level },
        });
      },
    });
  }
  textGroup.addItem("quote", {
    label: "Quote",
    icon: quoteIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const blockquote = blockquoteSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquote });
    },
  });
  textGroup.addItem("divider", {
    label: "Divider",
    icon: dividerIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const hr = hrSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(addBlockTypeCommand.key, { nodeType: hr });
    },
  });

  const listGroup = groupBuilder.addGroup("list", "List");
  listGroup.addItem("bullet-list", {
    label: "Bullet List",
    icon: bulletListIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const bulletList = bulletListSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(wrapInBlockTypeCommand.key, { nodeType: bulletList });
    },
  });
  listGroup.addItem("ordered-list", {
    label: "Ordered List",
    icon: orderedListIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const orderedList = orderedListSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(wrapInBlockTypeCommand.key, { nodeType: orderedList });
    },
  });
  listGroup.addItem("task-list", {
    label: "Task List",
    icon: todoListIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const listItem = listItemSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(wrapInBlockTypeCommand.key, {
        nodeType: listItem,
        attrs: { checked: false },
      });
    },
  });

  const advancedGroup = groupBuilder.addGroup("advanced", "Advanced");
  // Image (P2): inserts an empty image-block; its node view shows the uploader.
  advancedGroup.addItem("image", {
    label: "Image",
    icon: imageIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const imageBlock = imageBlockSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(addBlockTypeCommand.key, { nodeType: imageBlock });
    },
  });
  advancedGroup.addItem("code", {
    label: "Code",
    icon: codeIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const codeBlock = codeBlockSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(setBlockTypeCommand.key, { nodeType: codeBlock });
    },
  });
  // Table (P3): a 3×3 GFM table. Mirrors Crepe's `advancedGroup.table` —
  // `createTable` builds the node, `addBlockTypeCommand` inserts it, then the
  // caret is restored near where "/table" was typed (it's a NodeSelection
  // otherwise, which would replace the table on the next keystroke).
  advancedGroup.addItem("table", {
    label: "Table",
    icon: tableIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const view = ctx.get(editorViewCtx);
      commands.call(clearTextInCurrentBlockCommand.key);
      const { from } = view.state.selection;
      commands.call(addBlockTypeCommand.key, {
        nodeType: createTable(ctx, 3, 3),
      });
      commands.call(selectTextNearPosCommand.key, { pos: from });
    },
  });
  // Block math (latex, P3): a code block with language LaTeX — the CodeMirror
  // view edits the source, a KaTeX preview renders it, and it round-trips to
  // `$$ … $$`. Mirrors Crepe's `advancedGroup.math` (gated on the Latex feature).
  advancedGroup.addItem("math", {
    label: "Math",
    icon: functionsIcon,
    onRun: (ctx) => {
      const commands = ctx.get(commandsCtx);
      const codeBlock = codeBlockSchema.type(ctx);
      commands.call(clearTextInCurrentBlockCommand.key);
      commands.call(addBlockTypeCommand.key, {
        nodeType: codeBlock,
        attrs: { language: "LaTeX" },
      });
    },
  });

  let groups = groupBuilder.build();

  if (filter) {
    const needle = filter.toLowerCase();
    groups = groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }

  const items = groups.flatMap((group) => group.items);
  items.forEach((item, index) => {
    Object.assign(item, { index });
  });
  groups.reduce((acc, group) => {
    const end = acc + group.items.length;
    Object.assign(group, { range: [acc, end] });
    return end;
  }, 0);

  return {
    groups: groups as MenuItemGroup<SlashMenuItem>[],
    size: items.length,
  };
}

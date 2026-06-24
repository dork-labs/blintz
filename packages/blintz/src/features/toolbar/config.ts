import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx } from "@milkdown/kit/core";
import {
  emphasisSchema,
  inlineCodeSchema,
  isMarkSelectedCommand,
  linkSchema,
  strongSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  strikethroughSchema,
  toggleStrikethroughCommand,
} from "@milkdown/kit/preset/gfm";

import {
  boldIcon,
  codeIcon,
  italicIcon,
  linkIcon,
  strikethroughIcon,
} from "../../icons";
import { toggleLinkCommand } from "../link-tooltip/command";
import { GroupBuilder } from "../../shared/group-builder";
import type { MenuItemGroup } from "../../shared/group-builder";

export interface ToolbarItem {
  icon: string;
  active: (ctx: Ctx) => boolean;
  onRun: (ctx: Ctx) => void;
}

/**
 * The toolbar's command groups, ported from Crepe's `getGroups`
 * (`feature/toolbar/config.ts`): Formatting (bold / italic / strikethrough) +
 * Function (inline code + link). The `link` button toggles a link over the
 * selection via the link-tooltip feature's `toggleLinkCommand` (P2); `latex`/`ai`
 * are out of scope. All commands/schemas are reused as-is from commonmark/gfm.
 */
export function buildToolbarGroups(): MenuItemGroup<ToolbarItem, false>[] {
  const builder = new GroupBuilder<ToolbarItem>();

  builder
    .addGroup("formatting", "Formatting")
    .addItem("bold", {
      icon: boldIcon,
      active: (ctx) =>
        Boolean(
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, strongSchema.type(ctx)),
        ),
      onRun: (ctx) => {
        ctx.get(commandsCtx).call(toggleStrongCommand.key);
      },
    })
    .addItem("italic", {
      icon: italicIcon,
      active: (ctx) =>
        Boolean(
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, emphasisSchema.type(ctx)),
        ),
      onRun: (ctx) => {
        ctx.get(commandsCtx).call(toggleEmphasisCommand.key);
      },
    })
    .addItem("strikethrough", {
      icon: strikethroughIcon,
      active: (ctx) =>
        Boolean(
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, strikethroughSchema.type(ctx)),
        ),
      onRun: (ctx) => {
        ctx.get(commandsCtx).call(toggleStrikethroughCommand.key);
      },
    });

  builder
    .addGroup("function", "Function")
    .addItem("code", {
      icon: codeIcon,
      active: (ctx) =>
        Boolean(
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, inlineCodeSchema.type(ctx)),
        ),
      onRun: (ctx) => {
        ctx.get(commandsCtx).call(toggleInlineCodeCommand.key);
      },
    })
    .addItem("link", {
      icon: linkIcon,
      active: (ctx) =>
        Boolean(
          ctx
            .get(commandsCtx)
            .call(isMarkSelectedCommand.key, linkSchema.type(ctx)),
        ),
      onRun: (ctx) => {
        ctx.get(commandsCtx).call(toggleLinkCommand.key);
      },
    });

  return builder.build();
}

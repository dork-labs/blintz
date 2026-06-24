import { tooltipFactory } from "@milkdown/kit/plugin/tooltip";

/**
 * The two tooltip plugin slots, ported verbatim from
 * `@milkdown/components/link-tooltip/tooltips.ts`. `tooltipFactory` is the
 * framework-agnostic `@milkdown/plugin-tooltip` helper the toolbar already uses;
 * each returns `[ctxSpec, prosePlugin]`. The spec's value (`{ props?, view }`)
 * is filled in `plugins.ts`.
 */
export const linkPreviewTooltip = tooltipFactory("CREPE_LINK_PREVIEW");
export const linkEditTooltip = tooltipFactory("CREPE_LINK_EDIT");

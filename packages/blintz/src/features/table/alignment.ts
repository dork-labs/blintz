import { tableCellSchema, tableHeaderSchema } from "@milkdown/kit/preset/gfm";
import type { $NodeSchema } from "@milkdown/kit/utils";

/**
 * Table cells and headers whose `alignment` defaults to `null` (no colon in
 * the delimiter row) instead of gfm's `"left"`. A cell parsed from `| - |`
 * already carries `null`; the default only matters where an attr is absent,
 * and Yjs (y-prosemirror) never stores `null` attrs. With a `"left"` default
 * every unaligned table would come back from a collaborator as `| :- |`.
 * New tables are therefore written unaligned too.
 */
const withNullAlignment = <T extends string>(schema: $NodeSchema<T>) =>
  schema.extendSchema((prev) => (ctx) => {
    const base = prev(ctx);
    return {
      ...base,
      attrs: { ...base.attrs, alignment: { ...base.attrs?.alignment, default: null } },
    };
  });

export const tableCellNullAlignment = withNullAlignment(tableCellSchema);
export const tableHeaderNullAlignment = withNullAlignment(tableHeaderSchema);

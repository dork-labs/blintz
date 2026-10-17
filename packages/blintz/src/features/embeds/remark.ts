import { $remark } from "@milkdown/kit/utils";

import { remarkBlockDirectives } from "./grammar";

/** The block-directive grammar on the editor's remark processor (see grammar.ts). */
export const remarkBlockDirectivesPlugin = $remark(
  "remarkBlockDirectives",
  () => remarkBlockDirectives,
);

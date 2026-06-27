import type { Editor } from "@milkdown/kit/core";

import { remarkFrontmatterPlugin } from "./remark";
import { frontmatterSchema } from "./schema";

export { frontmatterId } from "./schema";

/**
 * frontmatter — round-trips a leading `---\n…\n---` YAML block as an editable
 * raw-text region (its own `code: true` node) instead of letting commonmark
 * shred the fences into a thematic break plus a setext heading.
 *
 * Pure grammar (a remark plugin plus a node schema); no React view, no
 * dependency on other features, so registration order does not matter.
 */
export function frontmatterFeature(editor: Editor): void {
  editor.use(remarkFrontmatterPlugin).use(frontmatterSchema);
}

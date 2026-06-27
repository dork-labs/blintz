import { $remark } from "@milkdown/kit/utils";
import remarkFrontmatter from "remark-frontmatter";

/**
 * remark-frontmatter teaches the markdown processor the `---\n…\n---` YAML
 * frontmatter block: it PARSES a leading fenced block into an mdast `yaml` node
 * and STRINGIFIES that node back to the exact fences, so round-trip fidelity is
 * remark-owned (the same pattern `latex/remark.ts` uses to wrap remark-math).
 *
 * Default preset is `yaml` (the `---` fence). We deliberately do not enable
 * `toml` (`+++`): the canvas and Obsidian both speak YAML frontmatter, and a
 * narrower grammar means fewer ways for a body fence to be misread.
 */
export const remarkFrontmatterPlugin = $remark(
  "remarkFrontmatter",
  () => remarkFrontmatter,
  // The `yaml` preset (the `---` fence). Without an explicit preset Milkdown
  // hands the plugin an empty `{}`, which micromark reads as a typeless matter
  // and rejects ("Missing `type` in matter").
  "yaml",
);

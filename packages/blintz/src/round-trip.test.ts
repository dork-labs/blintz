/**
 * @vitest-environment jsdom
 *
 * Blintz markdown round-trip fidelity contract.
 *
 * Mounts a headless editor with the EXACT grammar plugins `useBlintzEditor`
 * loads (commonmark minus the empty-line `<br />` hack, plus gfm and the
 * frontmatter feature), seeds a document, and serializes it straight back. The
 * React feature views are editing chrome and do not affect serialization, so
 * this is a faithful measure of what survives a parse -> serialize trip.
 *
 * The point of this file is to make fidelity OBSERVED, not assumed. It pins
 * three tiers of behavior so a `@milkdown/kit` bump that changes any of them
 * fails loudly:
 *   1. Faithful — byte-identical round-trip (safe to edit and write back).
 *   2. Normalized — content survives, formatting is rewritten (noisy git diff).
 *   3. Unrepresentable — the grammar cannot hold it; the HOST must preserve it
 *      out-of-band (e.g. Obsidian `[[wikilinks]]`, which commonmark escapes).
 */
import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";

import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "./features/empty-paragraphs";
import { frontmatterFeature } from "./features/frontmatter";

async function roundTrip(markdown: string): Promise<string> {
  const root = document.createElement("div");
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmarkWithoutEmptyLinePreservation)
    .use(stripEmptyLineBreaks)
    .use(gfm);
  frontmatterFeature(editor);
  await editor.create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

describe("Blintz round-trip fidelity", () => {
  describe("tier 1: faithful (byte-identical, safe to write back)", () => {
    const FAITHFUL: Array<{ name: string; md: string }> = [
      { name: "fenced code with language", md: "```js\nconst x = 1;\n```\n" },
      { name: "blockquote", md: "> quote line one\n> quote line two\n" },
      { name: "gfm strikethrough", md: "~~struck~~ text\n" },
      { name: "latex block", md: "$$\nE = mc^2\n$$\n" },
      { name: "latex inline", md: "An equation $a^2 + b^2 = c^2$ inline.\n" },
      {
        name: "block-level HTML",
        md: '<div class="note">\n  <p>Inner</p>\n</div>\n\nAfter.\n',
      },
    ];

    it.each(FAITHFUL)("preserves $name byte-for-byte", async ({ md }) => {
      expect(await roundTrip(md)).toBe(md);
    });

    it("preserves inline HTML elements (but drops void <br>)", async () => {
      const out = await roundTrip(
        "Text with <strong>bold</strong> and a <br> tag.\n",
      );
      expect(out).toContain("<strong>bold</strong>");
      // stripEmptyLineBreaks intentionally removes <br> artifacts.
      expect(out).not.toContain("<br>");
    });

    it("preserves YAML frontmatter (now a first-class editable block)", async () => {
      // Previously tier 3: the `---` fences were shredded into a thematic break
      // plus a setext heading. The frontmatter feature now round-trips them, so
      // the host no longer needs to strip and re-glue frontmatter out-of-band.
      const md =
        "---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body\n\nSome text.\n";
      expect(await roundTrip(md)).toBe(md);
    });

    it("preserves multiline and nested YAML frontmatter verbatim", async () => {
      // remark-frontmatter holds the block between the fences as opaque text, so
      // arbitrary YAML (nested maps, sequences) round-trips byte-for-byte.
      const md =
        "---\ntitle: Hello\nlist:\n  - one\n  - two\nnested:\n  key: value\n---\n\n# Body\n";
      expect(await roundTrip(md)).toBe(md);
    });
  });

  describe("tier 2: normalized (content survives, formatting rewritten)", () => {
    it("keeps table cells but normalizes the delimiter row", async () => {
      const out = await roundTrip("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
      expect(out).toContain("| A | B |");
      expect(out).toContain("| 1 | 2 |");
    });

    it("keeps task-list state through marker/spacing normalization", async () => {
      const out = await roundTrip("- [ ] todo\n- [x] done\n");
      expect(out).toContain("[ ] todo");
      expect(out).toContain("[x] done");
    });

    it("keeps nested-list structure through bullet normalization", async () => {
      const out = await roundTrip("- a\n  - b\n    - c\n");
      // `-` becomes `*` and tight lists become loose, but nesting depth holds.
      expect(out).toContain("* a");
      expect(out).toContain("  * b");
      expect(out).toContain("    * c");
    });

    it("rewrites setext headings to ATX (semantically identical)", async () => {
      const out = await roundTrip("Title\n=====\n\nSub\n---\n");
      expect(out).toContain("# Title");
      expect(out).toContain("## Sub");
    });
  });

  describe("tier 3: unrepresentable (host must preserve out-of-band)", () => {
    it("escapes Obsidian wikilinks (breaks them)", async () => {
      const out = await roundTrip("See [[Other Note]] for details.\n");
      expect(out).toContain("\\[\\[Other Note]]");
    });
  });
});

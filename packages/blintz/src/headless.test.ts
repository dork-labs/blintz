// Runs in plain Node: no DOM globals, no jsdom.
import { describe, expect, it } from "vitest";

import { createMarkdownModel } from "./headless";

describe("createMarkdownModel (Node, no DOM)", () => {
  it("has no DOM to lean on", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("adds only the three event functions, and keeps them working after timers time out", async () => {
    await createMarkdownModel();
    expect(typeof (globalThis as { addEventListener?: unknown }).addEventListener).toBe("function");
    expect(typeof document).toBe("undefined");
    // Milkdown timers call removeEventListener from a 3 s timeout.
    await new Promise((resolve) => setTimeout(resolve, 3200));
  }, 10_000);

  it("round-trips the editor's grammar byte for byte", async () => {
    const model = await createMarkdownModel();
    const md = [
      "---\ntitle: Doc\n---",
      "# Heading",
      "Some **bold**, *em*, `code`, ~~gone~~, [link](https://x.dev) and [[Wiki#h|label]].",
      "* a\n* b\n  * nested",
      "* [ ] task\n* [x] done",
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "```js\nconst x = 1;\n```",
      "$$\nE = mc^2\n$$",
      "Inline $a^2$ math.",
      '::chart{src="q3"}',
      ':::callout{tone="warn"}\nInside.\n:::',
      "![alt](img.png)",
      "> quote",
    ].join("\n\n") + "\n";
    const out = model.serialize(model.parse(md));
    expect(model.serialize(model.parse(out))).toBe(out);
    expect(out).toContain("[[Wiki#h|label]]");
    expect(out).toContain('::chart{src="q3"}');
    expect(out).toContain("$$\nE = mc^2\n$$");
    expect(out).toContain("---\ntitle: Doc\n---");
  });

  it("builds independent instances", async () => {
    const [a, b] = await Promise.all([createMarkdownModel(), createMarkdownModel()]);
    expect(a.schema).not.toBe(b.schema);
    expect(a.serialize(a.parse("Hi\n"))).toBe("Hi\n");
  });
});

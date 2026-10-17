import { describe, expect, it } from "vitest";
import type { Paragraph } from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified, type Processor } from "unified";

import { remarkBlockDirectives } from "../../directives";

describe("blintz/directives without the editor", () => {
  const run = (md: string, ...before: Array<(this: Processor) => void>) => {
    const processor = unified().use(remarkParse);
    for (const plugin of before) processor.use(plugin);
    return String(processor.use(remarkBlockDirectives).use(remarkStringify).processSync(md));
  };

  it("round-trips directives and leaves prose alone", () => {
    const md = ':::callout{tone="warn"}\nHi :smile:\n:::\n\n::chart{src="q3"}\n\n::: note\n';
    expect(run(md)).toBe(md);
  });

  it("wraps a paragraph handler registered earlier instead of replacing it", () => {
    function shout(this: Processor) {
      (this.data().toMarkdownExtensions ??= []).push({
        handlers: {
          paragraph: (node: Paragraph, _parent, state, info) =>
            state.containerPhrasing(node, info).toUpperCase(),
        },
      });
    }
    expect(run("hello\n", shout)).toBe("HELLO\n");
    // Still guarded: directive-shaped prose stays prose.
    expect(run("\\::note\n", shout)).toBe("\\::NOTE\n");
  });
});

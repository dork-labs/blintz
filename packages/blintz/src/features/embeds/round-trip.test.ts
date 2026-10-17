/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";

import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "../empty-paragraphs";
import { frontmatterFeature } from "../frontmatter";
import { embedGrammarFeature } from "./grammar-feature";

async function withEditor<T>(markdown: string, read: (editor: Editor) => T): Promise<T> {
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
  embedGrammarFeature(editor);
  await editor.create();
  const out = read(editor);
  await editor.destroy();
  return out;
}

const roundTrip = (md: string) => withEditor(md, (e) => e.action(getMarkdown()));

describe("embed directives round-trip", () => {
  const FAITHFUL = [
    { name: "leaf with attributes", md: '::chart{src="tasks/q3" kind="bar"}\n' },
    { name: "leaf without attributes", md: "::divider\n" },
    { name: "leaf with label", md: '::chart[Q3 *tasks*]{src="a"}\n' },
    { name: "id and class written long-hand", md: '::chart{id="42" class="wide" src="a"}\n' },
    { name: "unknown leaf", md: '::nobody-registered-this{x="1"}\n' },
    { name: "container", md: ':::callout{tone="warn"}\nHello **world**\n\n* a\n* b\n:::\n' },
    { name: "container with label", md: ":::details[More]\nHidden text.\n:::\n" },
    { name: "empty container", md: ":::note\n:::\n" },
    { name: "nested containers", md: "::::outer\n:::inner\nx\n:::\n::::\n" },
    {
      name: "embeds between prose",
      md: '# Report\n\nBefore.\n\n::chart{src="q3"}\n\nAfter.\n',
    },
  ];

  it.each(FAITHFUL)("preserves $name byte-for-byte", async ({ md }) => {
    expect(await roundTrip(md)).toBe(md);
  });

  it("leaves colons in prose alone (no inline directives)", async () => {
    const md = "Emoji :smile: here, foo:bar, a:b at 10:30.\n";
    expect(await roundTrip(md)).toBe(md);
  });

  it("keeps an escaped leading :: as prose, stable on a second trip", async () => {
    const once = await roundTrip("\\::not-a-directive\n");
    expect(once).toBe(":\\:not-a-directive\n");
    expect(await roundTrip(once)).toBe(once);
    const types = await withEditor(once, (e) =>
      e.action((ctx) => ctx.get(editorViewCtx).state.doc.child(0).type.name),
    );
    expect(types).toBe("paragraph");
  });

  it("normalizes attribute quoting and shorthand (content survives)", async () => {
    expect(await roundTrip("::chart{src='x' kind=bar}\n")).toBe(
      '::chart{src="x" kind="bar"}\n',
    );
    expect(await roundTrip("::chart{#main .wide}\n")).toBe(
      '::chart{id="main" class="wide"}\n',
    );
  });

  it("parses into embed nodes with name, attributes and label", async () => {
    const nodes = await withEditor(
      '::chart[Q3]{src="a"}\n\n:::callout{tone="warn"}\nBody\n:::\n',
      (e) =>
        e.action((ctx) => {
          const doc = ctx.get(editorViewCtx).state.doc;
          return [doc.child(0), doc.child(1)].map((n) => ({
            type: n.type.name,
            name: n.attrs.name,
            attributes: n.attrs.attributes,
            text: n.textContent,
          }));
        }),
    );
    expect(nodes).toEqual([
      { type: "embed", name: "chart", attributes: { src: "a" }, text: "" },
      { type: "embed_container", name: "callout", attributes: { tone: "warn" }, text: "Body" },
    ]);
  });
});

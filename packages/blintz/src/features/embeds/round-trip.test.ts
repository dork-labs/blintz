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

  // Lines that start with colons but are not complete directives were
  // escaped by the upstream serializer rule; they must come back unchanged.
  it.each([
    "::\n",
    ":::\n",
    "::::\n",
    ":: note\n",
    "::: note\n",
    "::std::cout << x;\n",
    "x\n\n:::\n\ny\n",
    "Some text\n::: not a fence\n",
    "::x y\n",
    '::x{a="line1\nline2"}\n',
    "::chart-\n",
    '::x{:a="x"}\n',
  ])("leaves the colon-led prose %j byte-identical", async (md) => {
    expect(await roundTrip(md)).toBe(md);
  });

  it.each([
    "\\::1abc\n",
    "\\::é\n",
    "\\::日本\n",
    '\\::x{a="*b*"}\n',
  ])("keeps the escaped directive-shaped prose %j as a paragraph", async (md) => {
    const once = await roundTrip(md);
    expect(once).toBe(md);
    const type = await withEditor(once, (e) =>
      e.action((ctx) => ctx.get(editorViewCtx).state.doc.child(0).type.name),
    );
    expect(type).toBe("paragraph");
  });

  it.each([
    '::x{1a="x"}\n',
    '::x{é="1"}\n',
    '::x{日="1"}\n',
    '::x{-a="1"}\n',
    "::日本\n",
    "::1abc\n",
  ])("keeps the grammar-valid directive %j byte-identical", async (md) => {
    expect(await roundTrip(md)).toBe(md);
    const type = await withEditor(md, (e) =>
      e.action((ctx) => ctx.get(editorViewCtx).state.doc.child(0).type.name),
    );
    expect(type).toBe("embed");
  });

  it("escapes a paragraph whose directive-shaped line spans marks", async () => {
    const out = await withEditor("Start.\n", (e) =>
      e.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { schema } = view.state;
        const em = schema.marks.emphasis!.create();
        const paragraph = schema.nodes.paragraph!.create(null, [
          schema.text('::x{a="'),
          schema.text("b", [em]),
          schema.text('"}'),
        ]);
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph));
        return getMarkdown()(ctx);
      }),
    );
    expect(out.startsWith("\\::x{a=")).toBe(true);
    const type = await withEditor(out, (e) =>
      e.action((ctx) => ctx.get(editorViewCtx).state.doc.child(0).type.name),
    );
    expect(type).toBe("paragraph");
  });

  it("keeps a label made of inline HTML and an image", async () => {
    const md = '::chart[<b>Q3</b> ![i](a.png)]{src="a"}\n';
    expect(await roundTrip(md)).toBe(md);
  });

  it("leaves colons in prose alone (no inline directives)", async () => {
    const md = "Emoji :smile: here, foo:bar, a:b at 10:30.\n";
    expect(await roundTrip(md)).toBe(md);
  });

  it("keeps an escaped directive-shaped line as prose, stable on a second trip", async () => {
    const once = await roundTrip("\\::not-a-directive\n");
    expect(once).toBe("\\::not-a-directive\n");
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

  it("pins how a directive line inside a paragraph splits it", async () => {
    // A line that is a complete directive interrupts a paragraph, so prose
    // that happened to contain one becomes an embed (content survives).
    expect(await roundTrip("foo\n::bar\n")).toBe("foo\n\n::bar\n");
    expect(await roundTrip("::x\ntext\n")).toBe("::x\n\ntext\n");
  });

  it("pins nested containers written with equal fences", async () => {
    // The first bare `:::` closes the inner container AND the outer one, so the
    // second `:::` is a stray paragraph. Its text survives as written.
    expect(await roundTrip(":::x\n:::y\nz\n:::\n:::\n")).toBe(
      "::::x\n:::y\nz\n:::\n::::\n\n:::\n",
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

/**
 * @vitest-environment jsdom
 *
 * Embeds against the editor's other contracts: source mapping (`bindSource`
 * after edits) and untrusted pasted HTML.
 */
import { afterEach, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { gfm } from "@milkdown/kit/preset/gfm";
import { DOMParser } from "@milkdown/kit/prose/model";
import { getMarkdown } from "@milkdown/kit/utils";

import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "../empty-paragraphs";
import { frontmatterFeature } from "../frontmatter";
import { SourceController } from "../../source-controller";
import { sourcePlugin } from "../../source-plugin";
import { embedGrammarFeature } from "./grammar-feature";

const editors: Editor[] = [];
afterEach(async () => {
  for (const editor of editors.splice(0)) await editor.destroy();
  document.body.replaceChildren();
});

async function fixture(text: string) {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = new SourceController();
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, text);
    })
    .use(commonmarkWithoutEmptyLinePreservation)
    .use(stripEmptyLineBreaks)
    .use(gfm)
    .use(sourcePlugin(controller));
  frontmatterFeature(editor);
  embedGrammarFeature(editor);
  editors.push(editor);
  await editor.create();
  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  return { editor, port: controller.port, view };
}

it.each([
  ["a labelled leaf", 'Intro.\n\n::chart[Q3 *x*]{src="a"}\n'],
  ["a labelled container", "Intro.\n\n:::c[L *x*]\nBody\n:::\n"],
])("bindSource still maps %s after an edit above it", async (_, raw) => {
  const h = await fixture(raw);
  h.view.dispatch(h.view.state.tr.insertText("More ", 1));
  const saved = h.editor.action(getMarkdown());
  expect(saved.startsWith("More Intro.")).toBe(true);
  expect(h.port.bindSource(saved, h.port.generation()).kind).toBe("mapped");
});

function paste(view: import("@milkdown/kit/prose/view").EditorView, html: string) {
  const dom = document.createElement("div");
  dom.innerHTML = html;
  const slice = DOMParser.fromSchema(view.state.schema).parseSlice(dom);
  view.dispatch(view.state.tr.replaceSelection(slice));
}

it.each([
  ['[{"type":"bogus"}]'],
  ['"str"'],
  ['{"a":1}'],
  ['[{"type":"html","value":"<script>alert(1)</script>"}]'],
  ['[{"type":"text","value":{"x":1}}]'],
])("a pasted label %s is dropped, never breaking serialization", async (label) => {
  const h = await fixture("Start.\n");
  paste(h.view, `<div data-type="embed" data-name="chart" data-attributes='{"src":"a"}' data-label='${label}'></div>`);
  const md = h.editor.action(getMarkdown());
  expect(md).toContain('::chart{src="a"}');
  expect(md).not.toContain("script");
});

it("keeps a well-formed pasted label", async () => {
  const h = await fixture("Start.\n");
  paste(
    h.view,
    `<div data-type="embed" data-name="chart" data-attributes='{}' data-label='[{"type":"text","value":"Q3"},{"type":"emphasis","children":[{"type":"text","value":"x"}]}]'></div>`,
  );
  expect(h.editor.action(getMarkdown())).toContain("::chart[Q3*x*]");
});

it("cleans pasted attributes to string values under valid keys", async () => {
  const h = await fixture("Start.\n");
  paste(
    h.view,
    `<div data-type="embed" data-name="chart" data-attributes='{"ok":"1","b":{"c":2},"a}":"x","":"y","n":3}'></div>`,
  );
  expect(h.editor.action(getMarkdown())).toContain('::chart{ok="1"}');
});

it("ignores pasted attributes that are not an object", async () => {
  const h = await fixture("Start.\n");
  paste(h.view, `<div data-type="embed" data-name="chart" data-attributes='"str"'></div>`);
  expect(h.editor.action(getMarkdown())).toContain("::chart\n");
});

it("refuses a pasted embed whose name the grammar cannot write", async () => {
  const h = await fixture("Start.\n");
  paste(h.view, `<div data-type="embed" data-name="a b" data-attributes='{}'></div>`);
  const md = h.editor.action(getMarkdown());
  expect(md).not.toContain("::a b");
  expect(h.view.state.doc.textContent).not.toContain("a b");
});

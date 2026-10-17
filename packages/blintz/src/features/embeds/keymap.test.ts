/**
 * @vitest-environment jsdom
 */
import { afterEach, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { gfm } from "@milkdown/kit/preset/gfm";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getMarkdown } from "@milkdown/kit/utils";

import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "../empty-paragraphs";
import { embedGrammarFeature } from "./grammar-feature";
import { embedContainerKeymap } from "./keymap";

const editors: Editor[] = [];
afterEach(async () => {
  for (const editor of editors.splice(0)) await editor.destroy();
});

async function fixture(markdown: string) {
  const root = document.createElement("div");
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmarkWithoutEmptyLinePreservation)
    .use(stripEmptyLineBreaks)
    .use(gfm)
    .use(history);
  embedGrammarFeature(editor);
  editor.use(embedContainerKeymap);
  editors.push(editor);
  await editor.create();
  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  return { editor, view };
}

function press(view: EditorView, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  view.dom.dispatchEvent(event);
}

function caretAt(view: EditorView, text: string, end = false) {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) {
      found = end ? pos + 1 + node.content.size : pos + 1;
    }
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, found)));
}

it("Backspace at a container's start selects it instead of dropping the directive", async () => {
  const h = await fixture(':::callout{tone="warn"}\nonly\n:::\n');
  caretAt(h.view, "only");
  press(h.view, "Backspace");
  expect(h.view.state.selection).toBeInstanceOf(NodeSelection);
  expect((h.view.state.selection as NodeSelection).node.type.name).toBe("embed_container");
  expect(h.editor.action(getMarkdown())).toBe(':::callout{tone="warn"}\nonly\n:::\n');
});

it("Backspace elsewhere in a container still edits normally", async () => {
  const h = await fixture(":::c\nfirst\n\nsecond\n:::\n");
  caretAt(h.view, "second");
  press(h.view, "Backspace");
  expect(h.view.state.selection).not.toBeInstanceOf(NodeSelection);
});

it.each([
  ["a first list item", ":::box\n* item\n:::\n", "item"],
  ["a heading", ":::box\n# Head\n:::\n", "Head"],
  ["a quote", ":::box\n> quoted\n:::\n", "quoted"],
])("Backspace at the start of %s inside a container keeps its own behavior", async (_, md, text) => {
  const h = await fixture(md);
  caretAt(h.view, text);
  press(h.view, "Backspace");
  expect(h.view.state.selection).not.toBeInstanceOf(NodeSelection);
});

it("Delete just before a container selects it", async () => {
  const h = await fixture('before\n\n:::callout{tone="warn"}\nonly\n:::\n');
  caretAt(h.view, "before", true);
  press(h.view, "Delete");
  expect((h.view.state.selection as NodeSelection).node?.type.name).toBe("embed_container");
  expect(h.editor.action(getMarkdown())).toBe('before\n\n:::callout{tone="warn"}\nonly\n:::\n');
});

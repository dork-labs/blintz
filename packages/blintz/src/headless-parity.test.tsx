/**
 * @vitest-environment jsdom
 *
 * The headless model must match the real editor exactly: collaborators sync
 * documents node by node, so a missing node type or attr would corrupt them.
 */
import { afterEach, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import type { Schema } from "@milkdown/kit/prose/model";

import { MarkdownEditor } from "./MarkdownEditor";
import { createMarkdownModel } from "./headless";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Range.prototype.getClientRects ??= () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

async function editorFor(value: string): Promise<Editor> {
  let editor: Editor | null = null;
  const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), {
    preservesSourceMapping: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<MarkdownEditor value={value} plugins={[capture]} />));
  const start = Date.now();
  while (!editor || !host.querySelector(".ProseMirror")) {
    if (Date.now() - start > 2000) throw new Error("timed out");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  return editor as Editor;
}

function shape(schema: Schema) {
  const nodes = Object.fromEntries(
    Object.entries(schema.nodes).map(([name, type]) => [
      name,
      Object.entries(type.spec.attrs ?? {})
        .map(([attr, spec]) => `${attr}=${JSON.stringify((spec as { default?: unknown }).default)}`)
        .sort(),
    ]),
  );
  const marks = Object.fromEntries(
    Object.entries(schema.marks).map(([name, type]) => [name, Object.keys(type.spec.attrs ?? {}).sort()]),
  );
  return { nodes, marks };
}

const CORPUS =
  [
    "---\ntitle: x\n---",
    "# Heading",
    "Text **b** *i* `c` ~~s~~ [l](u) [[W#h|l]] $m$.",
    "* a\n* [ ] t",
    "| a | b |\n| - | - |\n| 1 | 2 |",
    "```js\nx\n```",
    "$$\nE\n$$",
    '::chart{src="q"}',
    ":::note\nIn.\n:::",
    "![i](x.png)",
    "> q",
  ].join("\n\n") + "\n";

it("has the editor's exact node and mark types and attrs", async () => {
  const editor = await editorFor("");
  const model = await createMarkdownModel();
  const live = editor.action((ctx) => ctx.get(editorViewCtx).state.schema);
  expect(shape(model.schema)).toEqual(shape(live));
});

it("builds the document exactly as the live editor holds it", async () => {
  const editor = await editorFor(CORPUS + "\n# Heading\n\n> q\n");
  const model = await createMarkdownModel();
  const live = editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
  expect(model.document(CORPUS + "\n# Heading\n\n> q\n").toJSON()).toEqual(live.toJSON());
});

it("writes markdown exactly as the editor does", async () => {
  const editor = await editorFor(CORPUS);
  const model = await createMarkdownModel();
  const { getMarkdown } = await import("@milkdown/kit/utils");
  expect(model.serialize(model.document(CORPUS))).toBe(editor.action(getMarkdown()));
});

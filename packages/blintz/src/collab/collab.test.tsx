/**
 * @vitest-environment jsdom
 *
 * Two real editors bound to two Y.Docs that exchange updates, plus a
 * "server" doc where an agent writes markdown: remote edits, concurrent
 * typing, per-person undo, and markdown output.
 */
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { undo } from "y-prosemirror";
import * as Y from "yjs";

import { MarkdownEditor } from "../MarkdownEditor";
import { createMarkdownModel } from "../headless";
import { collaboration } from "./plugin";
import { applyMarkdownToYDoc, readYDoc, yDocToMarkdown } from "./ydoc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Range.prototype.getClientRects ??= () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const mounted: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
});

async function waitFor(check: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timed out: ${check.toString().slice(0, 120)}`);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

/** Connect Y.Docs so every update reaches every other doc at once. */
function network(...docs: Y.Doc[]) {
  for (const doc of docs) {
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "network") return;
      for (const other of docs) if (other !== doc) Y.applyUpdate(other, update, "network");
    });
  }
}

async function editorOn(ydoc: Y.Doc, onChange?: (md: string) => void, value = "") {
  let editor: Editor | null = null;
  const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), {
    preservesSourceMapping: true,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const plugins = [collaboration({ fragment: ydoc.getXmlFragment("prosemirror") }), capture];
  await act(async () => root.render(<MarkdownEditor value={value} onChange={onChange} plugins={plugins} />));
  await waitFor(() => !!editor && !!host.querySelector(".ProseMirror"));
  const view = (): EditorView => (editor as Editor).action((ctx) => ctx.get(editorViewCtx));
  const rerender = (next: string) =>
    act(async () => root.render(<MarkdownEditor value={next} onChange={onChange} plugins={plugins} />));
  return { host, view, rerender };
}

const DOC = "# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n";

function typeAt(view: EditorView, text: string, find: string) {
  let pos = -1;
  view.state.doc.descendants((node, at) => {
    if (pos < 0 && node.isText && node.text!.includes(find)) pos = at + node.text!.indexOf(find) + find.length;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).insertText(text));
}

it("shows the seeded document and carries edits between editors", async () => {
  const model = await createMarkdownModel();
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, DOC);
  const [a, b] = [new Y.Doc(), new Y.Doc()];
  Y.applyUpdate(a, Y.encodeStateAsUpdate(server));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(server));
  network(server, a, b);
  const changes = vi.fn();
  const one = await editorOn(a);
  const two = await editorOn(b, changes);
  await waitFor(() => one.host.textContent!.includes("Second paragraph."));
  await waitFor(() => two.host.textContent!.includes("Second paragraph."));
  await act(async () => typeAt(one.view(), " Typed in A.", "First paragraph."));
  await waitFor(() => two.host.textContent!.includes("Typed in A."));
  await waitFor(() => changes.mock.calls.some(([md]) => md.includes("First paragraph. Typed in A.")));
  expect(yDocToMarkdown(model, server)).toContain("First paragraph. Typed in A.");
});

it("merges an agent's markdown write into a live session without losing typing", async () => {
  const model = await createMarkdownModel();
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, DOC);
  const a = new Y.Doc();
  Y.applyUpdate(a, Y.encodeStateAsUpdate(server));
  network(server, a);
  const one = await editorOn(a);
  await waitFor(() => one.host.textContent!.includes("Second paragraph."));
  // The agent reads, then the person keeps typing, then the agent writes.
  const read = readYDoc(model, server);
  await act(async () => typeAt(one.view(), " Still typing", "Second paragraph."));
  const edited = read.markdown.replace("First paragraph.", "First paragraph, revised by the agent.");
  await act(async () => applyMarkdownToYDoc(model, server, edited, { base: read.base }));
  await waitFor(() => one.host.textContent!.includes("revised by the agent"));
  expect(one.host.textContent).toContain("Still typing");
});

it("undoes only this person's own edits", async () => {
  const model = await createMarkdownModel();
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, DOC);
  const [a, b] = [new Y.Doc(), new Y.Doc()];
  Y.applyUpdate(a, Y.encodeStateAsUpdate(server));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(server));
  network(server, a, b);
  const one = await editorOn(a);
  const two = await editorOn(b);
  await waitFor(() => two.host.textContent!.includes("Second paragraph."));
  await act(async () => typeAt(one.view(), " Mine.", "First paragraph."));
  await act(async () => typeAt(two.view(), " Theirs.", "Second paragraph."));
  await waitFor(() => one.host.textContent!.includes("Theirs."));
  await act(async () => void undo(one.view().state));
  await waitFor(() => !one.host.textContent!.includes("Mine."));
  expect(one.host.textContent).toContain("Theirs.");
  await waitFor(() => !two.host.textContent!.includes("Mine."));
});

it("ignores the host's value while collaborating", async () => {
  const model = await createMarkdownModel();
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, DOC);
  const a = new Y.Doc();
  Y.applyUpdate(a, Y.encodeStateAsUpdate(server));
  network(server, a);
  const one = await editorOn(a);
  await waitFor(() => one.host.textContent!.includes("Second paragraph."));
  await one.rerender("# Something else entirely\n");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(one.host.textContent).toContain("Second paragraph.");
  expect(yDocToMarkdown(model, server)).toContain("Second paragraph.");
});

it("doesn't report an empty document before the shared one arrives", async () => {
  const model = await createMarkdownModel();
  const a = new Y.Doc();
  const changes = vi.fn();
  const one = await editorOn(a, changes, "# Saved file\n\nWith content.\n");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(changes.mock.calls.some(([md]) => md.trim() === "")).toBe(false);
  // Then the provider syncs the real document.
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, DOC);
  network(server, a);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(server), "network");
  await waitFor(() => one.host.textContent!.includes("Second paragraph."));
  await waitFor(() => changes.mock.calls.some(([md]) => md.includes("Second paragraph.")));
});

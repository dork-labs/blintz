/**
 * @vitest-environment jsdom
 *
 * Comments in a collaborative session: collaborators' edits arrive as
 * whole-document replacements (y-prosemirror), and threads must stay on
 * their words through them.
 */
import { afterEach, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { MarkdownEditor } from "blintz";
import { applyMarkdownToYDoc, collaboration, createMarkdownModel } from "blintz/collab";
import * as Y from "yjs";

import { docText, positionAt } from "./anchor";
import type { CommentThreadRef } from "./plugin";
import { useBlintzComments, type BlintzComments } from "./useBlintzComments";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Range.prototype.getClientRects ??= () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

async function waitFor(check: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

it("keeps a thread on its words while a collaborator edits elsewhere", async () => {
  const model = await createMarkdownModel();
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, "Intro line.\n\nThe launch is on Friday.\n");
  const mine = new Y.Doc();
  Y.applyUpdate(mine, Y.encodeStateAsUpdate(server));
  server.on("update", (update: Uint8Array, origin: unknown) => origin !== "net" && Y.applyUpdate(mine, update, "net"));
  mine.on("update", (update: Uint8Array, origin: unknown) => origin !== "net" && Y.applyUpdate(server, update, "net"));

  let editor: Editor | null = null;
  let api: BlintzComments | null = null;
  const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), { preservesSourceMapping: true });
  const collab = collaboration({ fragment: mine.getXmlFragment("prosemirror") });
  function Harness({ threads }: { threads: CommentThreadRef[] }) {
    api = useBlintzComments({ threads });
    return <MarkdownEditor value="" plugins={[collab, api.plugin, capture]} />;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness threads={[]} />));
  await waitFor(() => !!editor && host!.textContent!.includes("Friday"));
  const view = (): EditorView => (editor as Editor).action((ctx) => ctx.get(editorViewCtx));
  const model2 = docText(view().state.doc);
  const at = model2.text.indexOf("Friday");
  view().dispatch(
    view().state.tr.setSelection(
      TextSelection.create(view().state.doc, positionAt(model2, at, "start")!, positionAt(model2, at + 6, "end")!),
    ),
  );
  const anchor = api!.anchorSelection()!;
  await act(async () => root!.render(<Harness threads={[{ id: "t", anchor }]} />));
  await waitFor(() => host!.querySelector('[data-comment-id="t"]')?.textContent === "Friday");

  // A collaborator rewrites the intro on the server.
  await act(async () => applyMarkdownToYDoc(model, server, "A much longer intro, rewritten.\n\nThe launch is on Friday.\n"));
  await waitFor(() => host!.textContent!.includes("rewritten"));
  expect(host.querySelector('[data-comment-id="t"]')?.textContent).toBe("Friday");
  expect(api!.rangeOf("t")).not.toBeNull();
});

it("orphans a thread a collaborator deleted, never moving it, and restores it on their undo", async () => {
  const model = await createMarkdownModel();
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, "Standup moved to Friday too.\n\nThe launch is on Friday.\n");
  const mine = new Y.Doc();
  Y.applyUpdate(mine, Y.encodeStateAsUpdate(server));
  server.on("update", (update: Uint8Array, origin: unknown) => origin !== "net" && Y.applyUpdate(mine, update, "net"));
  mine.on("update", (update: Uint8Array, origin: unknown) => origin !== "net" && Y.applyUpdate(server, update, "net"));

  let editor: Editor | null = null;
  let api: BlintzComments | null = null;
  const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), { preservesSourceMapping: true });
  const collab = collaboration({ fragment: mine.getXmlFragment("prosemirror") });
  function Harness({ threads }: { threads: CommentThreadRef[] }) {
    api = useBlintzComments({ threads });
    return <MarkdownEditor value="" plugins={[collab, api.plugin, capture]} />;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness threads={[]} />));
  await waitFor(() => !!editor && host!.textContent!.includes("launch"));
  const view = (): EditorView => (editor as Editor).action((ctx) => ctx.get(editorViewCtx));
  const text = docText(view().state.doc);
  const at = text.text.lastIndexOf("Friday");
  view().dispatch(
    view().state.tr.setSelection(
      TextSelection.create(view().state.doc, positionAt(text, at, "start")!, positionAt(text, at + 6, "end")!),
    ),
  );
  const anchor = api!.anchorSelection()!;
  await act(async () => root!.render(<Harness threads={[{ id: "t", anchor }]} />));
  await waitFor(() => api!.rangeOf("t") !== null);

  // A collaborator deletes the commented word, with an undo manager.
  const fragment = server.getXmlFragment("prosemirror");
  const undoManager = new Y.UndoManager(fragment);
  const second = (fragment.get(1) as Y.XmlElement).get(0) as Y.XmlText;
  await act(async () => second.delete("The launch is on ".length, 6));
  await waitFor(() => api!.rangeOf("t") === null);
  // Someone types elsewhere: the thread must not jump to the other "Friday".
  await act(async () => ((fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(0, "Note: "));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  expect(api!.rangeOf("t")).toBeNull();
  // The collaborator undoes their deletion: the thread comes back in place.
  await act(async () => void undoManager.undo());
  await waitFor(() => host!.querySelector('[data-comment-id="t"]')?.textContent === "Friday");
  const range = api!.rangeOf("t")!;
  expect(view().state.doc.textBetween(range.from - 17, range.from)).toBe("The launch is on ");
});

it.each([
  [
    "in other paragraphs",
    "Top line.\n\nThe launch is on Friday.\n\nBottom line.\n",
    "A new top line, rewritten.\n\nThe launch is on Friday.\n\nA new bottom line.\n",
  ],
  [
    "in the same paragraph",
    "The launch is on Friday, at noon.\n",
    "Big news: the launch is on Friday, at 3pm.\n",
  ],
])("keeps a thread through one agent write that edits both sides of it %s", async (_, seed, rewrite) => {
  const model = await createMarkdownModel();
  const server = new Y.Doc();
  applyMarkdownToYDoc(model, server, seed);
  const mine = new Y.Doc();
  Y.applyUpdate(mine, Y.encodeStateAsUpdate(server));
  server.on("update", (update: Uint8Array, origin: unknown) => origin !== "net" && Y.applyUpdate(mine, update, "net"));

  let editor: Editor | null = null;
  let api: BlintzComments | null = null;
  const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), { preservesSourceMapping: true });
  const collab = collaboration({ fragment: mine.getXmlFragment("prosemirror") });
  function Harness({ threads }: { threads: CommentThreadRef[] }) {
    api = useBlintzComments({ threads });
    return <MarkdownEditor value="" plugins={[collab, api.plugin, capture]} />;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness threads={[]} />));
  await waitFor(() => !!editor && host!.textContent!.includes("Friday"));
  const view = (): EditorView => (editor as Editor).action((ctx) => ctx.get(editorViewCtx));
  const text = docText(view().state.doc);
  const at = text.text.indexOf("Friday");
  view().dispatch(
    view().state.tr.setSelection(
      TextSelection.create(view().state.doc, positionAt(text, at, "start")!, positionAt(text, at + 6, "end")!),
    ),
  );
  const anchor = api!.anchorSelection()!;
  await act(async () => root!.render(<Harness threads={[{ id: "t", anchor }]} />));
  await waitFor(() => host!.querySelector('[data-comment-id="t"]')?.textContent === "Friday");

  // One write, one Yjs transaction, changes on both sides of the words.
  await act(async () => applyMarkdownToYDoc(model, server, rewrite));
  await waitFor(() => host!.textContent!.includes(rewrite.includes("3pm") ? "3pm" : "rewritten"));
  expect(host.querySelector('[data-comment-id="t"]')?.textContent).toBe("Friday");
  expect(api!.rangeOf("t")).not.toBeNull();
});

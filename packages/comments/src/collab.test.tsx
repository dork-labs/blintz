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

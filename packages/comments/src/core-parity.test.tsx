/**
 * @vitest-environment jsdom
 *
 * The headless anchors (`@blintz/comments/core`) against a live editor, over
 * a corpus: the same document, the same anchors from the same selections, the
 * same places for the same threads, and the same raw markdown as the editor's
 * source port.
 */
import { afterEach, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { MarkdownEditor, type MarkdownSourcePort } from "blintz";
import { createMarkdownModel } from "blintz/collab";

import { anchorFromRange, docText, positionAt, type CommentAnchor } from "./anchor";
import { createAnchor, resolveAnchor } from "./core";
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

const CORPUS = [
  "# Launch plan\n\nThe launch is on **Friday**, after the _final_ review.\n\nShip on Friday too.\n",
  "---\ntitle: Notes\n---\n\nSee [the docs](https://example.com) and `inline code` here.\n\n> A quoted line\n> that wraps.\n",
  "- [ ] write the brief\n- [x] book the room\n  - nested item with **bold** text\n\n1. first\n2. second\n",
  "| Name | Role |\n| - | - |\n| Ada | Engineer |\n| Grace | Admiral |\n\nAfter the table.\n",
  "Tom &amp; Jerry \\*escaped\\* text, see [[Cast|the cast]] and $E=mc^2$ inline.\n\n```js\nconst x = 1;\n```\n",
  "Repeat words. Repeat words. Repeat words again.\n\n## Repeat words\n\nA footnote[^1] here.\n\n[^1]: The footnote text.\n",
  "Line one  \nline two after a hard break.\n\n***\n\n![alt text](image.png)\n\nLast paragraph.\n",
];

/** Ranges to comment on: every word, a few word pairs, and spans across blocks. */
function rangesIn(text: string): Array<[number, number]> {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => [m.index!, m.index! + m[0].length] as [number, number]);
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i += 3) out.push([words[i]![0], words[i + 1]![1]]);
  for (let i = 0; i + 6 < words.length; i += 7) out.push([words[i]![0], words[i + 6]![1]]);
  return out;
}

it.each(CORPUS.map((markdown, index) => [index, markdown]))("matches the editor on document %i", async (_, markdown) => {
  const model = await createMarkdownModel();
  const source = model.source(markdown);

  let editor: Editor | null = null;
  let port: MarkdownSourcePort | null = null;
  let api: BlintzComments | null = null;
  const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), { preservesSourceMapping: true });
  function Harness({ threads }: { threads: CommentThreadRef[] }) {
    api = useBlintzComments({ threads });
    return <MarkdownEditor value={markdown} onSourceReady={(p) => (port = p)} plugins={[api.plugin, capture]} />;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness threads={[]} />));
  await waitFor(() => !!editor && !!port && port.snapshot().kind === "mapped");
  const view = (): EditorView => (editor as Editor).action((ctx) => ctx.get(editorViewCtx));

  // The editor adds its trailing paragraph on the first transaction.
  view().dispatch(view().state.tr);
  // The same document (built from a separate schema, so compared as JSON).
  expect(source.doc.toJSON()).toEqual(view().state.doc.toJSON());

  // The same anchors from the same selections, by document range and by raw range.
  const text = docText(view().state.doc);
  const threads: Array<CommentThreadRef & { range: [number, number] }> = [];
  let rawChecked = 0;
  for (const [start, end] of rangesIn(text.text)) {
    const from = positionAt(text, start, "start")!;
    const to = positionAt(text, end, "end")!;
    view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, from, to)));
    const { from: selFrom, to: selTo } = view().state.selection;
    const anchor = api!.anchorSelection();
    const raw = port!.range(selFrom, selTo);
    if (raw.kind === "mapped") {
      const ranges = raw.value.ranges;
      expect(createAnchor(model, source, ranges[0]!.start, ranges.at(-1)!.end), `raw ${start}-${end}`).toEqual(anchor);
      rawChecked++;
    }
    if (anchor) threads.push({ id: `t${threads.length}`, anchor: anchor as CommentAnchor, range: [selFrom, selTo] });
  }
  expect(threads.length).toBeGreaterThan(5);
  expect(rawChecked).toBeGreaterThan(0);

  // The same places for the same threads, and the same raw markdown.
  await act(async () => root!.render(<Harness threads={threads} />));
  await waitFor(() => threads.every((thread) => api!.rangeOf(thread.id) !== null || !resolveAnchor(model, source, thread.anchor)));
  for (const thread of threads) {
    const live = api!.rangeOf(thread.id);
    const headless = resolveAnchor(model, source, thread.anchor);
    expect(headless && { from: headless.from, to: headless.to, match: headless.match }, thread.anchor.quote).toEqual(live);
    if (!live || !headless) continue;
    const raw = port!.range(live.from, live.to);
    expect(headless.source?.ranges ?? null, thread.anchor.quote).toEqual(raw.kind === "mapped" ? raw.value.ranges : null);
  }
});

it.each(CORPUS.map((markdown, index) => [index, markdown]))(
  "places threads like the editor after an agent rewrites document %i",
  async (_, markdown) => {
    const model = await createMarkdownModel();
    // Anchors made on the original, resolved on a rewrite: a new opening
    // paragraph, a word changed, and a paragraph dropped at the end.
    const original = model.source(markdown);
    const text = docText(original.doc);
    const anchors = rangesIn(text.text)
      .map(([start, end]) => anchorFromRangeOf(original.doc, text, start, end))
      .filter((anchor): anchor is CommentAnchor => anchor !== null);
    const rewritten = `An opening paragraph the agent added.\n\n${markdown.replace(/words|launch|item|Grace/, "changed")}`
      .replace(/\n\n[^\n]+\n$/, "\n");
    const threads = anchors.map((anchor, index) => ({ id: `t${index}`, anchor }));

    let api: BlintzComments | null = null;
    let port: MarkdownSourcePort | null = null;
    function Harness() {
      api = useBlintzComments({ threads });
      return <MarkdownEditor value={rewritten} onSourceReady={(p) => (port = p)} plugins={[api.plugin]} />;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    await waitFor(() => !!port && port.snapshot().kind === "mapped" && threads.some((t) => api!.rangeOf(t.id) !== null));
    const source = model.source(rewritten);
    let placed = 0;
    for (const thread of threads) {
      const live = api!.rangeOf(thread.id);
      const headless = resolveAnchor(model, source, thread.anchor);
      expect(headless && { from: headless.from, to: headless.to, match: headless.match }, thread.anchor.quote).toEqual(live);
      if (!live || !headless) continue;
      placed++;
      const raw = port!.range(live.from, live.to);
      expect(headless.source?.ranges ?? null).toEqual(raw.kind === "mapped" ? raw.value.ranges : null);
    }
    expect(placed).toBeGreaterThan(0);
  },
);

function anchorFromRangeOf(doc: Parameters<typeof docText>[0], text: ReturnType<typeof docText>, start: number, end: number) {
  const from = positionAt(text, start, "start");
  const to = positionAt(text, end, "end");
  return from === null || to === null ? null : anchorFromRange(doc, from, to, text);
}

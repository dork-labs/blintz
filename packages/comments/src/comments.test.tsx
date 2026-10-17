/**
 * @vitest-environment jsdom
 *
 * Comments through the public surface: `useBlintzComments` + `<MarkdownEditor
 * plugins>`. Highlights, edits, reloads, orphaning, anchors back to the host,
 * clicks, and the guarantee that comments never touch the markdown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { undo } from "@milkdown/kit/prose/history";
import type { EditorView } from "@milkdown/kit/prose/view";
import { MarkdownEditor, type MarkdownSourcePort } from "blintz";

import { docText, positionAt } from "./anchor";
import type { CommentAnchor } from "./anchor";
import type { CommentThreadRef } from "./plugin";
import { useBlintzComments, type BlintzComments, type UseBlintzCommentsOptions } from "./useBlintzComments";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Range.prototype.getClientRects ??= () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let editor: Editor | null = null;
let api: BlintzComments | null = null;
let port: MarkdownSourcePort | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = host = null;
  editor = null;
  api = null;
  port = null;
});

async function waitFor(check: () => boolean, timeout = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

// The test's own window into the editor; it leaves the model alone too.
const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), {
  preservesSourceMapping: true,
});

const view = (): EditorView => editor!.action((ctx) => ctx.get(editorViewCtx));

function Harness(props: { value: string; options: UseBlintzCommentsOptions; onChange?: (md: string) => void }) {
  const comments = useBlintzComments(props.options);
  api = comments;
  return (
    <MarkdownEditor
      value={props.value}
      onChange={props.onChange}
      onSourceReady={(p) => (port = p)}
      plugins={[comments.plugin, capture]}
    />
  );
}

async function mount(value: string, options: UseBlintzCommentsOptions, onChange?: (md: string) => void) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness value={value} options={options} onChange={onChange} />));
  await waitFor(() => !!editor && host!.querySelector(".ProseMirror") !== null);
  return host;
}

async function rerender(value: string, options: UseBlintzCommentsOptions, onChange?: (md: string) => void) {
  await act(async () => root!.render(<Harness value={value} options={options} onChange={onChange} />));
}

/** An anchor for the first occurrence of `quote`, built through the API. */
function anchorFor(quote: string): CommentAnchor {
  const v = view();
  const model = docText(v.state.doc);
  const start = model.text.indexOf(quote);
  const from = positionAt(model, start, "start")!;
  const to = positionAt(model, start + quote.length, "end")!;
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, from, to)));
  return api!.anchorSelection()!;
}

const highlighted = (el: HTMLElement, id: string) =>
  [...el.querySelectorAll(`[data-comment-id="${id}"]`)].map((n) => n.textContent).join("");

const DOC = "# Plan\n\nThe launch is on Friday. Marketing is ready.\n\nShip it.\n";

describe("useBlintzComments", () => {
  it("highlights a thread created from the selection", async () => {
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("launch is on Friday");
    const threads: CommentThreadRef[] = [{ id: "t1", anchor }];
    await rerender(DOC, { threads });
    await waitFor(() => highlighted(el, "t1") === "launch is on Friday");
  });

  it("re-attaches threads on load from their anchors", async () => {
    await mount(DOC, { threads: [] });
    const anchor = anchorFor("Marketing is ready");
    await act(async () => root!.unmount());
    host!.remove();
    const moved = "# Plan\n\nA new intro line.\n\nThe launch is on Friday. Marketing is ready.\n\nShip it.\n";
    const el = await mount(moved, { threads: [{ id: "t1", anchor }] });
    await waitFor(() => highlighted(el, "t1") === "Marketing is ready");
  });

  it("keeps a thread attached through edits and reports its fresh anchor", async () => {
    const onAnchorsChange = vi.fn();
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("Marketing is ready");
    const options = { threads: [{ id: "t1", anchor }], onAnchorsChange };
    await rerender(DOC, options);
    await waitFor(() => highlighted(el, "t1") === "Marketing is ready");
    await act(async () => view().dispatch(view().state.tr.insertText("Big news: ", 9)));
    await waitFor(() => highlighted(el, "t1") === "Marketing is ready");
    await waitFor(() => onAnchorsChange.mock.calls.length > 0, 3000);
    const updates = onAnchorsChange.mock.calls[0]![0] as Array<{ id: string; anchor: CommentAnchor }>;
    expect(updates[0]!).toMatchObject({ id: "t1", anchor: { quote: "Marketing is ready" } });
    expect(updates[0]!.anchor.start).toBeGreaterThan(anchor.start);
  });

  it("orphans a thread whose text was deleted, and keeps reporting it", async () => {
    const onOrphanedChange = vi.fn();
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("Ship it.");
    await rerender(DOC, { threads: [{ id: "t1", anchor }], onOrphanedChange });
    await waitFor(() => highlighted(el, "t1") === "Ship it.");
    const v = view();
    const last = v.state.doc.lastChild!;
    await act(async () =>
      v.dispatch(v.state.tr.delete(v.state.doc.content.size - last.nodeSize, v.state.doc.content.size)),
    );
    await waitFor(() => onOrphanedChange.mock.calls.some(([ids]) => ids.includes("t1")));
    expect(el.querySelector('[data-comment-id="t1"]')).toBeNull();
  });

  it("finds threads again after the host replaces the document", async () => {
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("Marketing is ready");
    const options = { threads: [{ id: "t1", anchor }] };
    await rerender(DOC, options);
    await waitFor(() => highlighted(el, "t1") === "Marketing is ready");
    await rerender("Reset.\n\nMarketing is ready.\n", options);
    await waitFor(() => highlighted(el, "t1") === "Marketing is ready");
  });

  it("never changes the markdown", async () => {
    const onChange = vi.fn();
    const el = await mount(DOC, { threads: [] }, onChange);
    const anchor = anchorFor("launch is on Friday");
    await rerender(DOC, { threads: [{ id: "t1", anchor }], activeThreadId: "t1" }, onChange);
    await waitFor(() => el.querySelector(".blintz-comment.is-active") !== null);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(onChange).not.toHaveBeenCalled();
    expect(port!.bindSource(DOC, port!.generation())).toMatchObject({ kind: "mapped" });
  });

  it("styles resolved and active threads, hiding resolved by default", async () => {
    const el = await mount(DOC, { threads: [] });
    const a = anchorFor("launch is on Friday");
    const b = anchorFor("Marketing is ready");
    const threads = [{ id: "a", anchor: a }, { id: "b", anchor: b, resolved: true }];
    await rerender(DOC, { threads, activeThreadId: "a" });
    await waitFor(() => el.querySelector('[data-comment-id="a"].is-active') !== null);
    expect(el.querySelector('[data-comment-id="b"]')).toBeNull();
    await rerender(DOC, { threads, showResolved: true });
    await waitFor(() => el.querySelector('[data-comment-id="b"].is-resolved') !== null);
  });

  it("reports every thread under a click, innermost first", async () => {
    const onThreadClick = vi.fn();
    const el = await mount(DOC, { threads: [] });
    const outer = anchorFor("The launch is on Friday");
    const inner = anchorFor("Friday");
    await rerender(DOC, { threads: [{ id: "outer", anchor: outer }, { id: "inner", anchor: inner }], onThreadClick });
    await waitFor(() => el.querySelector('[data-comment-id="inner"]') !== null);
    const v = view();
    const range = api!.rangeOf("inner")!;
    v.someProp("handleClick", (f) => f(v, range.from + 1, new MouseEvent("click")));
    expect(onThreadClick).toHaveBeenCalledWith(["inner", "outer"]);
  });

  it("maps a thread's range to raw markdown through the source port", async () => {
    await mount(DOC, { threads: [] });
    const anchor = anchorFor("launch is on Friday");
    await rerender(DOC, { threads: [{ id: "t1", anchor }] });
    await waitFor(() => api!.rangeOf("t1") !== null);
    const { from, to } = api!.rangeOf("t1")!;
    const mapped = port!.range(from, to);
    expect(mapped.kind).toBe("mapped");
    if (mapped.kind === "mapped") {
      const [range] = mapped.value.ranges;
      expect(DOC.slice(range!.start, range!.end)).toBe("launch is on Friday");
    }
  });

  it("orphans a thread whose words were deleted even when the same words appear elsewhere", async () => {
    const onOrphanedChange = vi.fn();
    const doc = "The cat sat on the mat.\n\nShip the release on Friday.\n";
    const el = await mount(doc, { threads: [] });
    const v = view();
    const model = docText(v.state.doc);
    const at = model.text.indexOf("the release");
    const from = positionAt(model, at, "start")!;
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, from, from + 3)));
    const anchor = api!.anchorSelection()!;
    expect(anchor.quote).toBe("the");
    await rerender(doc, { threads: [{ id: "t", anchor }], onOrphanedChange });
    await waitFor(() => api!.rangeOf("t")?.from === from);
    await act(async () => view().dispatch(view().state.tr.delete(from, from + 3)));
    await waitFor(() => onOrphanedChange.mock.calls.some(([ids]) => ids.includes("t")));
    expect(api!.rangeOf("t")).toBeNull();
    expect(el.querySelector('[data-comment-id="t"]')).toBeNull();
  });

  it("brings an orphaned thread back when undo restores its words", async () => {
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("Marketing is ready");
    const options = { threads: [{ id: "t", anchor }] };
    await rerender(DOC, options);
    await waitFor(() => highlighted(el, "t") === "Marketing is ready");
    const range = api!.rangeOf("t")!;
    await act(async () => view().dispatch(view().state.tr.delete(range.from, range.to)));
    await waitFor(() => api!.rangeOf("t") === null);
    await act(async () => void undo(view().state, view().dispatch));
    await waitFor(() => highlighted(el, "t") === "Marketing is ready");
  });

  it("finds the new document's threads when value and threads change together", async () => {
    const onOrphanedChange = vi.fn();
    await mount(DOC, { threads: [] });
    const other = "# Other\n\nCompletely different words live here.\n";
    // Anchors for the other document, built in a scratch mount.
    await rerender(other, { threads: [] });
    await waitFor(() => view().state.doc.textContent.includes("different words"));
    const anchor = anchorFor("different words");
    await rerender(DOC, { threads: [] });
    await waitFor(() => view().state.doc.textContent.includes("launch"));
    await rerender(other, { threads: [{ id: "b", anchor }], onOrphanedChange });
    await waitFor(() => api!.rangeOf("b") !== null);
    expect(onOrphanedChange.mock.calls.at(-1)?.[0] ?? []).toEqual([]);
  });

  it("anchors a triple-click selection that runs into the next block", async () => {
    await mount(DOC, { threads: [] });
    const v = view();
    let start = -1;
    let next = -1;
    v.state.doc.forEach((node, offset) => {
      if (node.textContent.startsWith("The launch")) start = offset + 1;
      else if (start >= 0 && next < 0) next = offset + 1;
    });
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, start, next)));
    const anchor = api!.anchorSelection()!;
    expect(anchor.quote).toBe("The launch is on Friday. Marketing is ready.");
    await rerender(DOC, { threads: [{ id: "t", anchor }] });
    await waitFor(() => api!.rangeOf("t") !== null);
  });

  it("tells the host when a placement is a guess", async () => {
    await mount(DOC, { threads: [] });
    const anchor = { v: 1 as const, quote: "Friday", prefix: "unrelated context ", suffix: " elsewhere", start: 999, end: 1005 };
    await rerender(DOC, { threads: [{ id: "g", anchor }] });
    await waitFor(() => api!.rangeOf("g") !== null);
    expect(api!.rangeOf("g")!.match).toBe("ambiguous");
  });

  it("reports an edit back to the stored anchor when the host didn't write the last one back", async () => {
    const onAnchorsChange = vi.fn();
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("Marketing is ready");
    const options = { threads: [{ id: "t", anchor }], onAnchorsChange };
    await rerender(DOC, options);
    await waitFor(() => highlighted(el, "t") === "Marketing is ready");
    await act(async () => view().dispatch(view().state.tr.insertText("X", 9)));
    await waitFor(() => onAnchorsChange.mock.calls.length === 1, 3000);
    await act(async () => view().dispatch(view().state.tr.delete(9, 10)));
    await waitFor(() => onAnchorsChange.mock.calls.length === 2, 3000);
    expect(onAnchorsChange.mock.calls[1]![0][0].anchor).toEqual(anchor);
  });

  it("orphans threads when the user replaces everything, even if the words are typed again", async () => {
    const onOrphanedChange = vi.fn();
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("Marketing");
    await rerender(DOC, { threads: [{ id: "t", anchor }], onOrphanedChange });
    await waitFor(() => highlighted(el, "t") === "Marketing");
    const v = view();
    // Select-all + type: one step over the whole document, like a reset, but
    // not tagged as one.
    await act(async () => v.dispatch(v.state.tr.insertText("N", 0, v.state.doc.content.size)));
    await act(async () => view().dispatch(view().state.tr.insertText("ew plan. Marketing later.", 2)));
    await waitFor(() => onOrphanedChange.mock.calls.some(([ids]) => ids.includes("t")));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(api!.rangeOf("t")).toBeNull();
  });

  it("never lets a thread missing on load grab words typed later, and keeps its label", async () => {
    const el = await mount("Intro.\n\nShip it today.\n", { threads: [] });
    const anchor = anchorFor("Ship it");
    await act(async () => root!.unmount());
    host!.remove();
    await mount("Intro.\n\nNothing here yet.\n", { threads: [{ id: "t", anchor }] });
    await waitFor(() => !!editor);
    expect(api!.rangeOf("t")).toBeNull();
    await act(async () => view().dispatch(view().state.tr.insertText(" Ship it", 7)));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(api!.rangeOf("t")).toBeNull();
    void el;
  });

  it("keeps a placement's confidence label as the thread follows edits", async () => {
    await mount(DOC, { threads: [] });
    const anchor = { v: 1 as const, quote: "Friday", prefix: "unrelated context ", suffix: " elsewhere", start: 999, end: 1005 };
    await rerender(DOC, { threads: [{ id: "g", anchor }] });
    await waitFor(() => api!.rangeOf("g")?.match === "ambiguous");
    await act(async () => view().dispatch(view().state.tr.insertText("Note: ", 9)));
    expect(api!.rangeOf("g")!.match).toBe("ambiguous");
  });

  it("restores a thread on undo even when its words were deleted right after a nearby edit", async () => {
    const el = await mount(DOC, { threads: [] });
    const anchor = anchorFor("Marketing");
    await rerender(DOC, { threads: [{ id: "t", anchor }] });
    await waitFor(() => highlighted(el, "t") === "Marketing");
    const range = api!.rangeOf("t")!;
    // Edit next to it, then delete the words at once (before any debounce).
    await act(async () => {
      view().dispatch(view().state.tr.insertText("next ", range.from));
      const moved = api!.rangeOf("t")!;
      view().dispatch(view().state.tr.delete(moved.from, moved.to));
    });
    await waitFor(() => api!.rangeOf("t") === null);
    await act(async () => void undo(view().state, view().dispatch));
    await waitFor(() => highlighted(el, "t") === "Marketing");
  });
});

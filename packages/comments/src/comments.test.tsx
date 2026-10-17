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
});


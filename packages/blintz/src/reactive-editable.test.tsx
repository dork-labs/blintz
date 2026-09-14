/**
 * @vitest-environment jsdom
 *
 * Reactive `editable` contract — the behavior `read-only.test.ts` deferred to
 * "verified downstream". Where that suite pins the pure predicate wiring, this
 * one mounts the REAL editor (`useBlintzEditor`, every built-in feature) in
 * jsdom and drives the `editable` prop the way a host does: toggling it on a
 * mounted editor, with no remount.
 *
 * The contract under test:
 *   1. `editable={true}` at mount  → the ProseMirror root is contenteditable.
 *   2. `editable={false}` at mount → the root is NOT contenteditable.
 *   3. `false → true` live         → contenteditable flips on, AND the block-edit
 *      feature (slash menu / "+" handle / drag) is installed and its guard opens.
 *   4. `true → false` live         → contenteditable flips off.
 *
 * `view.editable` is ProseMirror's authoritative editability signal; the root's
 * `contenteditable` attribute is what actually routes keystrokes, so it is the
 * faithful "typing works / stops" proxy (and exactly the symptom DorkOS observed
 * live: `.milkdown [contenteditable]` stuck at `false` after clicking Edit).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Milkdown, MilkdownProvider } from "@milkdown/react";
import {
  ProsemirrorAdapterProvider,
  useNodeViewFactory,
  usePluginViewFactory,
} from "@prosemirror-adapter/react";

import { EditorCtxProvider } from "./shared/editor-ctx";
import type { CtxHolder } from "./shared/editor-ctx";
import { TextSelection } from "@milkdown/kit/prose/state";
import { syncToolbarSelection } from "./features/toolbar/sync-selection";
import { useBlintzEditor } from "./useBlintzEditor";
import { slashStoreCtx } from "./features/block-edit/slices";

// React's `act` requires this flag outside a test-framework that sets it (RTL).
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SEED = "# Title\n\nSome paragraph text.\n";

interface HarnessProps {
  value: string;
  editable: boolean;
  ctxHolder: CtxHolder;
  onChange?: (markdown: string) => void;
}

/** The provider stack `MarkdownEditor` uses, minus its CSS imports. */
function Harness({ value, editable, ctxHolder, onChange }: HarnessProps) {
  return (
    <EditorCtxProvider value={ctxHolder}>
      <MilkdownProvider>
        <ProsemirrorAdapterProvider>
          <Inner
            value={value}
            editable={editable}
            ctxHolder={ctxHolder}
            onChange={onChange}
          />
        </ProsemirrorAdapterProvider>
      </MilkdownProvider>
    </EditorCtxProvider>
  );
}

function Inner({ value, editable, ctxHolder, onChange }: HarnessProps) {
  const nodeViewFactory = useNodeViewFactory();
  const pluginViewFactory = usePluginViewFactory();
  useBlintzEditor({
    value,
    editable,
    onChange,
    nodeViewFactory,
    pluginViewFactory,
    ctxHolder,
  });
  return <Milkdown />;
}

function getView(ctxHolder: CtxHolder): EditorView | null {
  const ctx = ctxHolder.current;
  if (!ctx) return null;
  try {
    return ctx.get(editorViewCtx);
  } catch {
    return null; // editorViewCtx not populated until the view mounts
  }
}

/** The root `.ProseMirror` element's live `contenteditable`. */
function contentEditable(view: EditorView): string | null {
  return view.dom.getAttribute("contenteditable");
}

/** The editor's current document, serialized back to markdown. */
function markdownOf(ctxHolder: CtxHolder): string {
  const ctx = ctxHolder.current;
  if (!ctx) throw new Error("ctx not ready");
  return getMarkdown()(ctx);
}

describe("reactive editable", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom has no layout. The virtual cursor asks for Range geometry after
    // checkbox focus; layout itself is covered by the real-browser suite.
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    }
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = () => new DOMRect();
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function render(
    ctxHolder: CtxHolder,
    editable: boolean,
    onChange?: (markdown: string) => void,
    value = SEED,
  ) {
    await act(async () => {
      root.render(
        <Harness
          value={value}
          editable={editable}
          ctxHolder={ctxHolder}
          onChange={onChange}
        />,
      );
    });
  }

  /** Render, then pump act cycles until the editor view is created. */
  async function mount(
    editable: boolean,
    onChange?: (markdown: string) => void,
    value = SEED,
  ): Promise<{
    ctxHolder: CtxHolder;
    view: EditorView;
  }> {
    const ctxHolder: CtxHolder = { current: null };
    await render(ctxHolder, editable, onChange, value);
    for (let i = 0; i < 100; i++) {
      const view = getView(ctxHolder);
      if (view) return { ctxHolder, view };
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    }
    throw new Error("editor view never became ready");
  }

  it("initial editable=true → the root is contenteditable", async () => {
    const { view } = await mount(true);
    expect(view.editable).toBe(true);
    expect(contentEditable(view)).toBe("true");
  });

  it("initial editable=false → the root is not contenteditable", async () => {
    const { view } = await mount(false);
    expect(view.editable).toBe(false);
    expect(contentEditable(view)).toBe("false");
  });

  it("false → true enables editing live, with the block-edit feature active", async () => {
    const { ctxHolder, view } = await mount(false);
    expect(view.editable).toBe(false);
    expect(contentEditable(view)).toBe("false");

    // block-edit is registered even though the editor mounted read-only (the fix
    // stopped gating registration on the initial value): its slash store slice
    // exists and is a real store, not the null default.
    expect(ctxHolder.current?.get(slashStoreCtx.key)).toBeTruthy();

    await render(ctxHolder, true);

    expect(view.editable).toBe(true);
    expect(contentEditable(view)).toBe("true");
    // Still installed after the live enable; its guard (view.editable) is now
    // open, so the slash menu / handle / drag are functional.
    expect(ctxHolder.current?.get(slashStoreCtx.key)).toBeTruthy();
  });

  it("true → false disables editing live", async () => {
    const { ctxHolder, view } = await mount(true);
    expect(view.editable).toBe(true);
    expect(contentEditable(view)).toBe("true");

    await render(ctxHolder, false);

    expect(view.editable).toBe(false);
    expect(contentEditable(view)).toBe("false");
  });

  it("toggling editable emits no onChange and leaves the document untouched", async () => {
    const onChange = vi.fn();
    const { ctxHolder } = await mount(true, onChange);

    // The refresh is a `setProps` (no doc mutation), so a toggle must not look
    // like an edit: no `onChange`, and the serialized markdown is unchanged.
    const before = markdownOf(ctxHolder);
    onChange.mockClear(); // ignore any emission from initial creation

    await render(ctxHolder, false, onChange); // true -> false
    await render(ctxHolder, true, onChange); // false -> true

    expect(onChange).not.toHaveBeenCalled();
    expect(markdownOf(ctxHolder)).toBe(before);
  });
  it("uses semantic list children and one accessible checkbox per task", async () => {
    const { ctxHolder } = await mount(
      true,
      undefined,
      "- First\n  - Nested\n\n- [ ] Review draft\n",
    );
    const lists = Array.from(container.querySelectorAll(".ProseMirror ul"));
    expect(lists.length).toBeGreaterThan(1);
    for (const list of lists) {
      expect(
        Array.from(list.children).every((child) => child.tagName === "LI"),
      ).toBe(true);
    }
    const checkbox = container.querySelector<HTMLButtonElement>(
      'button[role="checkbox"]',
    );
    expect(checkbox?.getAttribute("aria-label")).toBe("Review draft");
    expect(checkbox?.getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      checkbox?.click();
    });
    expect(checkbox?.getAttribute("aria-checked")).toBe("true");
    expect(markdownOf(ctxHolder)).toContain("[x] Review draft");
  });

  it("cannot toggle a task in read-only mode", async () => {
    const { ctxHolder } = await mount(false, undefined, "- [ ] Locked task\n");
    const checkbox = container.querySelector<HTMLButtonElement>(
      'button[role="checkbox"]',
    );
    expect(checkbox?.disabled).toBe(true);
    await act(async () => {
      checkbox?.click();
    });
    expect(markdownOf(ctxHolder)).toContain("[ ] Locked task");
  });

  it("updates checkbox chrome when editability changes without a document edit", async () => {
    const value = "- [ ] Read draft\n";
    const { ctxHolder } = await mount(true, undefined, value);
    const checkbox = () =>
      container.querySelector<HTMLButtonElement>('button[role="checkbox"]');
    expect(checkbox()?.disabled).toBe(false);
    await render(ctxHolder, false, undefined, value);
    expect(checkbox()?.disabled).toBe(true);
    await render(ctxHolder, true, undefined, value);
    expect(checkbox()?.disabled).toBe(false);
  });
  it("formats the visible browser range when selectionchange has not reached ProseMirror", async () => {
    const { view } = await mount(true, undefined, "A strong thought\n");
    await act(async () => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 17)),
      );
      const text = view.dom.querySelector("p")!.firstChild!;
      // The user extended one character farther before tabbing into the toolbar.
      document.getSelection()!.setBaseAndExtent(text, 16, text, 0);
      syncToolbarSelection(view);
    });
    expect(view.state.selection.from).toBe(1);
    expect(view.state.selection.to).toBe(17);
    expect(view.state.selection.anchor).toBe(17);
  });
});

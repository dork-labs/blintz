/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, StrictMode, Suspense, startTransition, Activity } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, parserCtx, prosePluginsCtx } from "@milkdown/kit/core";
import { listenerCtx } from "@milkdown/kit/plugin/listener";
import { undo } from "@milkdown/kit/prose/history";
import { Plugin } from "@milkdown/kit/prose/state";
import { MarkdownEditor } from "./MarkdownEditor";
import type {
  MarkdownSourcePort,
  SourceTaskToggleRequest,
} from "./source-location";
import type { BlintzPlugin } from "./plugin";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
it("intercepts a mapped task once before mutation, keeps current callbacks and editor identity, and hides unmapped controls", async () => {
  let ctx: Ctx | undefined, port: MarkdownSourcePort | undefined;
  const plugins: BlintzPlugin[] = [
    ({ editor }) => {
      editor.config((value) => {
        ctx = value;
      });
    },
  ];
  const first = vi.fn<(request: SourceTaskToggleRequest) => void>();
  const second = vi.fn<(request: SourceTaskToggleRequest) => void>();
  const ready = vi.fn((value: MarkdownSourcePort) => {
    port = value;
  });
  const render = async (
    callback = first,
    editable = true,
    sourceRevision?: string,
  ) => {
    await act(async () =>
      root.render(
        <MarkdownEditor
          value={"- [ ] original\n\nTail\n"}
          editable={editable}
          sourceRevision={sourceRevision}
          plugins={plugins}
          onSourceReady={ready}
          onTaskToggleRequest={callback}
        />,
      ),
    );
  };
  await render();
  for (let i = 0; i < 100 && !port; i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  expect(port).toBeDefined();
  const view = ctx!.get(editorViewCtx),
    doc = view.state.doc;
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('button[role="checkbox"]')!
      .click();
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(view.state.doc).toBe(doc);
  expect(first.mock.calls[0]![0]).toMatchObject({
    done: true,
    task: { checked: false, line: 1 },
  });
  const stable = port;
  await render(second);
  expect(ctx!.get(editorViewCtx)).toBe(view);
  expect(port).toBe(stable);
  expect(ready).toHaveBeenCalledTimes(1);
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('button[role="checkbox"]')!
      .click();
  });
  expect(second).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(view.state.doc).toBe(doc);
  const equalRevisionGeneration = port!.generation();
  const equalRevisionSelection = view.state.selection;
  await render(second, true, "host-source-2");
  expect(ctx!.get(editorViewCtx)).toBe(view);
  expect(view.state.doc).toBe(doc);
  expect(view.state.selection).toBe(equalRevisionSelection);
  expect(port!.generation()).not.toBe(equalRevisionGeneration);
  expect(port!.taskAt(0, equalRevisionGeneration)).toMatchObject({
    kind: "unavailable",
    reason: "stale",
  });
  // The captured request before an independent same-byte host revision is stale too.
  expect(port!.applyConfirmedTaskToggle(second.mock.calls[0]![0], "- [x] original\n\nTail\n")).toMatchObject({ kind: "unavailable", reason: "stale" });
  // A clipboard or speculative parser call is not a host-confirmed source.
  const parsedLocal = ctx!.get(parserCtx)("- [ ] clipboard\n\nTail\n");
  await act(async () => {
    view.dispatch(
      view.state.tr.replaceWith(
        0,
        view.state.doc.content.size,
        parsedLocal.content,
      ),
    );
  });
  expect(port!.snapshot()).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
  expect(container.querySelector('button[role="checkbox"]')).toBeNull();
  await act(async () => {
    view.dispatch(
      view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content),
    );
    expect(
      port!.bindSource("- [ ] original\n\nTail\n", port!.generation()).kind,
    ).toBe("mapped");
  });
  const oldGeneration = port!.generation();
  await act(async () => {
    view.dispatch(view.state.tr.insertText("X", 3));
  });
  expect(port!.taskAt(0, oldGeneration)).toMatchObject({
    kind: "unavailable",
    reason: "stale",
  });
  expect(container.querySelector('button[role="checkbox"]')).toBeNull();
  const edited = view.state.doc,
    selection = view.state.selection;
  await act(async () => {
    expect(
      port!.bindSource("- [ ] Xoriginal\r\n\r\nTail\r\n", port!.generation())
        .kind,
    ).toBe("mapped");
  });
  expect(container.querySelector('button[role="checkbox"]')).not.toBeNull();
  expect(view.state.doc).toBe(edited);
  expect(view.state.selection).toBe(selection);
  await act(async () => {
    expect(undo(view.state, view.dispatch)).toBe(true);
  });
  expect(view.state.doc.eq(doc)).toBe(true);
  await render(second, false);
  expect(container.querySelector('button[role="checkbox"]')).toBeNull();
});

async function waitPort(get: () => MarkdownSourcePort | undefined) {
  for (let i = 0; i < 100 && !get(); i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  expect(get()).toBeDefined();
}
it("StrictMode real editor leaves live mapped port", async () => {
  let port: MarkdownSourcePort | undefined;
  await act(async () =>
    root.render(
      <StrictMode>
        <MarkdownEditor
          value="- [ ] original\n"
          onSourceReady={(p) => (port = p)}
          onTaskToggleRequest={() => {}}
        />
      </StrictMode>,
    ),
  );
  await waitPort(() => port);
  expect(port!.snapshot().kind).toBe("mapped");
  expect(container.querySelector('button[role="checkbox"]')).not.toBeNull();
});
it("replacement onSourceReady receives existing live port", async () => {
  const first = vi.fn();
  const second = vi.fn();
  await act(async () =>
    root.render(
      <MarkdownEditor value="- [ ] original\n" onSourceReady={first} />,
    ),
  );
  for (let i = 0; i < 100 && !first.mock.calls.length; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  expect(first).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(
      <MarkdownEditor value="- [ ] original\n" onSourceReady={second} />,
    ),
  );
  expect(second).toHaveBeenCalledTimes(1);
  expect(second.mock.calls[0]?.[0]).toBe(first.mock.calls[0]?.[0]);
});
it("removing host task callback restores local checkbox after model invalidation", async () => {
  let ctx: Ctx | undefined, port: MarkdownSourcePort | undefined;
  const plugins: BlintzPlugin[] = [
    ({ editor }) => {
      editor.config((c) => {
        ctx = c;
      });
    },
  ];
  const ready = (p: MarkdownSourcePort) => (port = p);
  const cb = vi.fn();
  await act(async () =>
    root.render(
      <MarkdownEditor
        value="- [ ] original\n"
        plugins={plugins}
        onSourceReady={ready}
        onTaskToggleRequest={cb}
      />,
    ),
  );
  await waitPort(() => port);
  const view = ctx!.get(editorViewCtx);
  await act(async () => view.dispatch(view.state.tr.insertText("X", 3)));
  expect(port!.snapshot().kind).toBe("unavailable");
  expect(container.querySelector('button[role="checkbox"]')).toBeNull();
  await act(async () =>
    root.render(
      <MarkdownEditor
        value="- [ ] original\n"
        plugins={plugins}
        onSourceReady={ready}
      />,
    ),
  );
  expect(container.querySelector('button[role="checkbox"]')).not.toBeNull();
});

it("suspended uncommitted callback removal cannot bypass committed host interception", async () => {
  let ctx: Ctx | undefined, port: MarkdownSourcePort | undefined;
  const plugins: BlintzPlugin[] = [
    ({ editor }) => {
      editor.config((c) => {
        ctx = c;
      });
    },
  ];
  const ready = (p: MarkdownSourcePort) => (port = p);
  const cb = vi.fn();
  const never = new Promise<void>(() => {});
  let attempted = false;
  function Block({ blocked }: { blocked: boolean }) {
    if (blocked) {
      attempted = true;
      throw never;
    }
    return null;
  }
  function UI({ blocked }: { blocked: boolean }) {
    return (
      <Suspense fallback={<span>loading</span>}>
        <MarkdownEditor
          value="- [ ] original\n"
          plugins={plugins}
          onSourceReady={ready}
          onTaskToggleRequest={blocked ? undefined : cb}
        />
        <Block blocked={blocked} />
      </Suspense>
    );
  }
  await act(async () => root.render(<UI blocked={false} />));
  await waitPort(() => port);
  const view = ctx!.get(editorViewCtx),
    doc = view.state.doc;
  const button = container.querySelector<HTMLButtonElement>(
    'button[role="checkbox"]',
  )!;
  await act(async () =>
    startTransition(() => root.render(<UI blocked={true} />)),
  );
  expect(attempted).toBe(true);
  expect(container.querySelector('button[role="checkbox"]')).toBe(button);
  expect(container.textContent).not.toContain("loading");
  await act(async () => button.click());
  expect(cb).toHaveBeenCalledTimes(1);
  expect(view.state.doc).toBe(doc);
});

it("suspended unrelated render retains host interception", async () => {
  let ctx: Ctx | undefined, port: MarkdownSourcePort | undefined;
  const plugins: BlintzPlugin[] = [
    ({ editor }) => {
      editor.config((c) => {
        ctx = c;
      });
    },
  ];
  const ready = (p: MarkdownSourcePort) => (port = p);
  const cb = vi.fn();
  const never = new Promise<void>(() => {});
  let attempted = false;
  function Block({ blocked }: { blocked: boolean }) {
    if (blocked) {
      attempted = true;
      throw never;
    }
    return null;
  }
  function UI({ blocked }: { blocked: boolean }) {
    return (
      <Suspense fallback={<span>loading</span>}>
        <MarkdownEditor
          value="- [ ] original\n"
          plugins={plugins}
          onSourceReady={ready}
          onTaskToggleRequest={cb}
        />
        <Block blocked={blocked} />
      </Suspense>
    );
  }
  await act(async () => root.render(<UI blocked={false} />));
  await waitPort(() => port);
  const view = ctx!.get(editorViewCtx),
    doc = view.state.doc;
  const button = container.querySelector<HTMLButtonElement>(
    'button[role="checkbox"]',
  )!;
  await act(async () =>
    startTransition(() => root.render(<UI blocked={true} />)),
  );
  expect(attempted).toBe(true);
  expect(container.querySelector('button[role="checkbox"]')).toBe(button);
  expect(container.textContent).not.toContain("loading");
  await act(async () => button.click());
  expect(cb).toHaveBeenCalledTimes(1);
  expect(view.state.doc).toBe(doc);
});

it("React Activity effect recreation retains usable source port", async () => {
  let port: MarkdownSourcePort | undefined;
  const ready = vi.fn((p: MarkdownSourcePort) => (port = p));
  const cb = vi.fn();
  const render = async (mode: "visible" | "hidden") => {
    await act(async () =>
      root.render(
        <Activity mode={mode}>
          <MarkdownEditor
            value="- [ ] original\n"
            onSourceReady={ready}
            onTaskToggleRequest={cb}
          />
        </Activity>,
      ),
    );
  };
  await render("visible");
  await waitPort(() => port);
  expect(port!.snapshot().kind).toBe("mapped");
  const oldPort = port!;
  await render("hidden");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  await render("visible");
  for (let i = 0; i < 100 && ready.mock.calls.length < 2; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  expect(ready).toHaveBeenCalledTimes(2);
  expect(port!.snapshot().kind).toBe("mapped");
  expect(port).not.toBe(oldPort);
  expect(oldPort.snapshot()).toEqual({
    kind: "unavailable",
    reason: "disposed",
  });
  expect(oldPort.bindSource("- [ ] original\n", oldPort.generation())).toEqual({
    kind: "unavailable",
    reason: "disposed",
  });
});

it("notifies a late ready subscriber with the existing port without recreating the editor", async () => {
  let ctx: Ctx | undefined;
  const plugins: BlintzPlugin[] = [
    ({ editor }) => {
      editor.config((value) => {
        ctx = value;
      });
    },
  ];
  await act(async () =>
    root.render(
      <MarkdownEditor value={"- [ ] original\n\nTail\n"} plugins={plugins} />,
    ),
  );
  for (let i = 0; i < 100 && !ctx; i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  const view = ctx!.get(editorViewCtx);
  const ready = vi.fn();
  await act(async () =>
    root.render(
      <MarkdownEditor
        value={"- [ ] original\n\nTail\n"}
        plugins={plugins}
        onSourceReady={ready}
      />,
    ),
  );
  expect(ready).toHaveBeenCalledTimes(1);
  expect(ready.mock.calls[0]![0].snapshot().kind).toBe("mapped");
  expect(ctx!.get(editorViewCtx)).toBe(view);
});

it.each([false, true])(
  "seeds each Activity editor lifetime from the latest committed host raw source and revision, changed=%s",
  async (changed) => {
    let port: MarkdownSourcePort | undefined;
    let value = "- [ ] original\n\nTail\n";
    let sourceRevision = "original";
    const ready = vi.fn((current: MarkdownSourcePort) => {
      port = current;
    });
    const render = async (mode: "visible" | "hidden") => {
      await act(async () =>
        root.render(
          <Activity mode={mode}>
            <MarkdownEditor
              value={value}
              sourceRevision={sourceRevision}
              onSourceReady={ready}
            />
          </Activity>,
        ),
      );
    };
    await render("visible");
    await waitPort(() => port);
    if (changed) {
      value = "\ufeff- [x] HOST_UPDATED😀\r\n\r\nTail\r\n";
      sourceRevision = "confirmed-2";
      await render("visible");
      expect(port!.snapshot()).toMatchObject({
        kind: "mapped",
        value: { text: value },
      });
      expect(container.textContent).toContain("HOST_UPDATED😀");
    }
    const oldPort = port!;
    await render("hidden");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await render("visible");
    for (let i = 0; i < 100 && ready.mock.calls.length < 2; i++)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    expect(ready).toHaveBeenCalledTimes(2);
    expect(port).not.toBe(oldPort);
    expect(port!.snapshot()).toMatchObject({
      kind: "mapped",
      value: { text: value },
    });
    expect(oldPort.snapshot()).toEqual({
      kind: "unavailable",
      reason: "disposed",
    });
    expect(oldPort.bindSource(value, oldPort.generation())).toEqual({
      kind: "unavailable",
      reason: "disposed",
    });
    if (changed) expect(container.textContent).toContain("HOST_UPDATED😀");
  },
);

it("default editor maps heading-bearing raw source and host task requests without remounting", async () => {
  const raw = "\ufeff# Café😀\r\n\r\n- [ ] original\r\n";
  let port: MarkdownSourcePort | undefined;
  const callback = vi.fn();
  const ready = (value: MarkdownSourcePort) => {
    port = value;
  };
  await act(async () =>
    root.render(
      <MarkdownEditor
        value={raw}
        onSourceReady={ready}
        onTaskToggleRequest={callback}
      />,
    ),
  );
  await waitPort(() => port);
  expect(port!.snapshot()).toMatchObject({
    kind: "mapped",
    value: { text: raw },
  });
  const element = container.querySelector(".ProseMirror"),
    generation = port!.generation();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[role="checkbox"]')!
      .click(),
  );
  expect(callback).toHaveBeenCalledTimes(1);
  const request = callback.mock.calls[0]![0];
  expect(raw.slice(request.task.marker.start, request.task.marker.end)).toBe(
    "[ ]",
  );
  await act(async () =>
    root.render(
      <MarkdownEditor
        value={raw}
        sourceRevision="confirmed"
        onSourceReady={ready}
        onTaskToggleRequest={callback}
      />,
    ),
  );
  expect(container.querySelector(".ProseMirror")).toBe(element);
  expect(port!.generation()).not.toBe(generation);
  expect(port!.snapshot().kind).toBe("mapped");
});
it("custom extension heading configuration remains conservatively unmapped", async () => {
  let port: MarkdownSourcePort | undefined;
  const plugins: BlintzPlugin[] = [() => {}];
  await act(async () =>
    root.render(
      <MarkdownEditor
        value="# Custom\n\n- [ ] task\n"
        plugins={plugins}
        onSourceReady={(value) => {
          port = value;
        }}
        onTaskToggleRequest={() => {}}
      />,
    ),
  );
  await waitPort(() => port);
  expect(port!.snapshot()).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
  expect(container.querySelector('button[role="checkbox"]')).toBeNull();
});

it("applies only a confirmed task marker without remount, caret/focus/scroll loss or clearing prior Undo", async () => {
  let ctx: Ctx | undefined, port: MarkdownSourcePort | undefined;
  let request: SourceTaskToggleRequest | undefined;
  const plugins: BlintzPlugin[] = [({ editor }) => { editor.config(value => { ctx = value; }); }];
  const render = async (value: string, revision: string) => {
    await act(async () => root.render(<MarkdownEditor value={value} sourceRevision={revision} plugins={plugins}
      onSourceReady={value => { port = value; }} onTaskToggleRequest={value => { request = value; }} />));
  };
  await render("- [ ] original\n\nTail\n", "file-1");
  await waitPort(() => port);
  const view = ctx!.get(editorViewCtx), dom = view.dom;
  await act(async () => { view.dispatch(view.state.tr.insertText("X", 3)); });
  const before = "- [ ] Xoriginal\n\nTail\n";
  await act(async () => { expect(port!.bindSource(before, port!.generation()).kind).toBe("mapped"); });
  view.focus(); container.scrollTop = 37;
  const selection = view.state.selection, focused = document.activeElement;
  await act(async () => { container.querySelector<HTMLButtonElement>('button[role="checkbox"]')!.click(); });
  expect(request).toBeDefined();
  const generation = port!.generation(), doc = view.state.doc;
  expect(port!.applyConfirmedTaskToggle(request!, "- [x] DIFFERENT\n\nTail\n")).toMatchObject({ kind: "unavailable", reason: "model-mismatch" });
  expect(view.state.doc).toBe(doc); expect(port!.generation()).toBe(generation);
  const confirmed = "- [x] Xoriginal\n\nTail\n";
  await act(async () => { expect(port!.applyConfirmedTaskToggle(request!, confirmed)).toMatchObject({ kind: "mapped", value: { text: confirmed } }); });
  expect(ctx!.get(editorViewCtx)).toBe(view); expect(view.dom).toBe(dom);
  expect(view.state.selection.eq(selection)).toBe(true);
  expect(document.activeElement).toBe(focused); expect(container.scrollTop).toBe(37);
  expect(container.querySelector('button[role="checkbox"]')!.getAttribute("aria-checked")).toBe("true");
  expect(port!.applyConfirmedTaskToggle(request!, confirmed)).toMatchObject({ kind: "unavailable", reason: "stale" });
  const acknowledgedDoc = view.state.doc, acknowledgedGeneration = port!.generation();
  await render(confirmed, "file-2");
  expect(view.state.doc).toBe(acknowledgedDoc); expect(port!.generation()).toBe(acknowledgedGeneration);
  expect(view.state.selection.eq(selection)).toBe(true); expect(view.dom).toBe(dom);
  // A later independent same-byte revision is not another acknowledgement carry.
  await render(confirmed, "file-3");
  expect(port!.generation()).not.toBe(acknowledgedGeneration);
  expect(port!.taskAt(0, acknowledgedGeneration)).toMatchObject({ kind: "unavailable", reason: "stale" });
  await act(async () => { expect(undo(view.state, view.dispatch)).toBe(true); });
  expect(view.state.doc.textContent).toContain("original");
  expect(view.state.doc.textContent).not.toContain("Xoriginal");
  let checked: unknown;
  view.state.doc.descendants(node => { if (node.type.name === "list_item") checked = node.attrs.checked; });
  expect(checked).toBe(true);
  // A synchronous host rebind during the source event cannot be returned as this acknowledgement.
  const currentText = "- [x] original\n\nTail\n";
  expect(port!.bindSource(currentText, port!.generation()).kind).toBe("mapped");
  const currentTask = port!.taskAt(1);
  expect(currentTask.kind).toBe("mapped");
  if (currentTask.kind !== "mapped") throw new Error("Expected task");
  const nextText = "- [ ] original\n\nTail\n";
  view.dom.addEventListener("blintz:source", () => { port!.bindSource(nextText, port!.generation()); }, { once: true });
  await act(async () => {
    expect(port!.applyConfirmedTaskToggle({ generation: currentTask.generation, task: currentTask.value, done: false }, nextText)).toMatchObject({ kind: "unavailable", reason: "stale" });
  });
});

it("does not autosave an acknowledged marker, but still reports a later user edit", async () => {
  let ctx: Ctx | undefined, port: MarkdownSourcePort | undefined;
  let request: SourceTaskToggleRequest | undefined;
  let serialized!: () => void;
  const notification = new Promise<void>((resolve) => { serialized = resolve; });
  const onChange = vi.fn();
  const plugins: BlintzPlugin[] = [({ editor }) => editor.config((value) => {
    ctx = value;
    value.get(listenerCtx).markdownUpdated(() => { serialized(); });
  })];
  await act(async () => root.render(<MarkdownEditor value={"- [ ] original\n\nTail\n"}
    plugins={plugins} onChange={onChange} onSourceReady={(value) => { port = value; }}
    onTaskToggleRequest={(value) => { request = value; }} />));
  await waitPort(() => port);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    // A real user transaction has an outstanding debounced serializer notification.
    // The host acknowledgement below confirms that edit and the requested marker.
    await act(async () => {
      const view = ctx!.get(editorViewCtx);
      view.dispatch(view.state.tr.insertText("X", 3));
      expect(port!.bindSource("- [ ] Xoriginal\n\nTail\n", port!.generation()).kind).toBe("mapped");
    });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[role="checkbox"]')!.click(); });
    await act(async () => {
      expect(port!.applyConfirmedTaskToggle(request!, "- [x] Xoriginal\n\nTail\n")).toMatchObject({ kind: "mapped" });
    });
    // Milkdown skips addToHistory=false transactions, but the pending genuine
    // user serializer notification must not resave its now-acknowledged model.
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await notification;
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { const view = ctx!.get(editorViewCtx); view.dispatch(view.state.tr.insertText("Z", 3)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toContain("ZXoriginal");
  } finally { vi.useRealTimers(); }
});
it("keeps exact BOM, CRLF, Unicode and uppercase-X bytes for an acknowledged no-op", async () => {
  let port: MarkdownSourcePort | undefined;
  const raw = "\ufeff- [X] café😀\r\n\r\nTail\r\n";
  const onChange = vi.fn();
  await act(async () => root.render(<MarkdownEditor value={raw} onChange={onChange}
    onSourceReady={(value) => { port = value; }} onTaskToggleRequest={() => {}} />));
  await waitPort(() => port);
  const task = port!.taskAt(1);
  expect(task.kind).toBe("mapped");
  if (task.kind !== "mapped") throw new Error("Expected original task mapping");
  await act(async () => {
    expect(port!.applyConfirmedTaskToggle({ generation: task.generation, task: task.value, done: true }, raw))
      .toMatchObject({ kind: "mapped", value: { text: raw } });
  });
  expect(port!.snapshot()).toMatchObject({ kind: "mapped", value: { text: raw } });
  expect(onChange).not.toHaveBeenCalled();
});


it("carries only the default derived tail through a confirmed terminal-list marker and its inverse", async () => {
  const before = "- [ ] original\n", after = "- [x] original\n";
  let port: MarkdownSourcePort | undefined;
  const onChange = vi.fn();
  await act(async () => root.render(<MarkdownEditor value={before} onChange={onChange}
    onSourceReady={(value) => { port = value; }} onTaskToggleRequest={() => {}} />));
  await waitPort(() => port);
  const surface = container.querySelector<HTMLElement>(".ProseMirror")!;
  const button = container.querySelector<HTMLButtonElement>('button[role="checkbox"]')!;
  button.focus();
  const task = port!.taskAt(1);
  if (task.kind !== "mapped") throw new Error("Expected original terminal task mapping");
  await act(async () => {
    expect(port!.applyConfirmedTaskToggle({ generation: task.generation, task: task.value, done: true }, after))
      .toMatchObject({ kind: "mapped", value: { text: after } });
  });
  expect(surface.querySelectorAll(":scope > p")).toHaveLength(1);
  expect(surface.lastElementChild?.textContent).toBe("");
  expect(container.querySelector(".ProseMirror")).toBe(surface);
  expect(container.querySelector('button[role="checkbox"]')).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute("aria-checked")).toBe("true");
  const inverse = port!.taskAt(1);
  if (inverse.kind !== "mapped") throw new Error("Expected confirmed inverse task mapping");
  await act(async () => {
    expect(port!.applyConfirmedTaskToggle({ generation: inverse.generation, task: inverse.value, done: false }, before))
      .toMatchObject({ kind: "mapped", value: { text: before } });
  });
  expect(port!.snapshot()).toMatchObject({ kind: "mapped", value: { text: before } });
  expect(button.getAttribute("aria-checked")).toBe("false");
  expect(surface.querySelectorAll(":scope > p")).toHaveLength(1);
  expect(onChange).not.toHaveBeenCalled();
});

it("refuses an unrelated custom appended model during a confirmed terminal-list marker", async () => {
  let port: MarkdownSourcePort | undefined;
  let appended = false;
  const plugins: BlintzPlugin[] = [({ editor }) => {
    editor.config((ctx) => ctx.update(prosePluginsCtx, (current) => [...current, new Plugin({
      appendTransaction(transactions, _previous, state) {
        if (appended || !transactions.some((transaction) => transaction.docChanged) ||
            state.doc.nodeAt(1)?.attrs.checked !== true) return;
        appended = true;
        return state.tr.insert(state.doc.content.size,
          state.schema.nodes.paragraph!.create(null, state.schema.text("unrelated")));
      },
    })]));
  }];
  await act(async () => root.render(<MarkdownEditor value={"- [ ] original\n"} plugins={plugins}
    onSourceReady={(value) => { port = value; }} onTaskToggleRequest={() => {}} />));
  await waitPort(() => port);
  const task = port!.taskAt(1);
  if (task.kind !== "mapped") throw new Error("Expected original terminal task mapping");
  await act(async () => {
    expect(port!.applyConfirmedTaskToggle({ generation: task.generation, task: task.value, done: true }, "- [x] original\n"))
      .toMatchObject({ kind: "unavailable", reason: "model-mismatch" });
  });
  expect(appended).toBe(true);
  expect(container.querySelector(".ProseMirror")?.textContent).toContain("unrelated");
  expect(port!.snapshot()).toMatchObject({ kind: "unavailable", reason: "unmapped" });
});

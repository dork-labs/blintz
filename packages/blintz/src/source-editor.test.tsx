/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, StrictMode, Suspense, startTransition, Activity } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { undo } from "@milkdown/kit/prose/history";
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

import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { mountSourceHost } from "./fixtures/source-host";
declare global {
  interface Window {
    sourceHost: ReturnType<typeof mountSourceHost>;
  }
}
const fixture = fileURLToPath(
  new URL("./fixtures/source-host.tsx", import.meta.url),
);
test("raw source task requests intercept before mutation and readonly has no task control", async ({
  page,
}) => {
  await page.goto("/playground");
  await page.evaluate(async (path) => {
    const module: typeof import("./fixtures/source-host") = await import(
      /* @vite-ignore */ `/@fs${path}`
    );
    window.sourceHost = module.mountSourceHost();
  }, fixture);
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("checkbox").first().click();
  const evidence = await page.evaluate(() => ({
    requests: window.sourceHost.requests(),
    raw: window.sourceHost.raw(),
    snapshot: window.sourceHost.snapshot(),
    selection: window.sourceHost.select(),
  }));
  expect(evidence.requests).toHaveLength(1);
  const request = evidence.requests[0]!;
  expect(
    evidence.raw.slice(request.task.marker.start, request.task.marker.end),
  ).toBe("[ ]");
  expect(request.task.line).toBe(5);
  expect(request.done).toBe(true);
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
  expect(evidence.snapshot).toMatchObject({
    kind: "mapped",
    value: { text: evidence.raw },
  });
  expect(evidence.selection).toMatchObject({
    kind: "mapped",
    value: { direction: "backward" },
  });
  if (evidence.selection.kind === "mapped")
    expect(
      evidence.selection.value.ranges.map((range) =>
        evidence.raw.slice(range.start, range.end),
      ),
    ).toEqual(["Tail"]);
  await page.screenshot({
    path: test.info().outputPath("source-editable.png"),
    fullPage: true,
  });
  await page.evaluate(() => window.sourceHost.readonly());
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator(".ProseMirror")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await page.screenshot({
    path: test.info().outputPath("source-readonly.png"),
    fullPage: true,
  });
});

test("real default heading editor retains parser-origin task ranges and refuses edited source", async ({
  page,
}) => {
  await page.goto("/playground");
  const controllerPath = fileURLToPath(
    new URL("../packages/blintz/src/source-controller.ts", import.meta.url),
  );
  const pluginPath = fileURLToPath(
    new URL("../packages/blintz/src/source-plugin.ts", import.meta.url),
  );
  // Use the same native editor assembly without modifying the browser fixture.
  const result = await page.evaluate(
    async ({ controllerPath, pluginPath }) => {
      const corePath = "/@id/@milkdown/kit/core",
        gfmPath = "/@id/@milkdown/kit/preset/gfm";
      const {
        Editor,
        rootCtx,
        defaultValueCtx,
        editorViewCtx,
      }: typeof import("@milkdown/kit/core") = await import(
        /* @vite-ignore */ corePath
      );
      const {
        SourceController,
      }: typeof import("../packages/blintz/src/source-controller") =
        await import(/* @vite-ignore */ `/@fs${controllerPath}`);
      const {
        sourceEditorAssembly,
      }: typeof import("../packages/blintz/src/source-plugin") = await import(
        /* @vite-ignore */ `/@fs${pluginPath}`
      );
      const { gfm }: typeof import("@milkdown/kit/preset/gfm") = await import(
        /* @vite-ignore */ gfmPath
      );
      const raw = "\ufeff# Café😀\r\n\r\n- [ ] original\r\n";
      const root = document.createElement("div");
      document.body.replaceChildren(root);
      const controller = new SourceController();
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, raw);
        })
        .use(sourceEditorAssembly(controller, []))
        .use(gfm);
      try {
        await editor.create();
        const view = editor.action((ctx) => ctx.get(editorViewCtx));
        let position = -1;
        view.state.doc.descendants((node, pos) => {
          if (node.type.name === "list_item") position = pos;
        });
        const task = controller.port.taskAt(position);
        const snapshot = controller.port.snapshot();
        const id = view.state.doc.firstChild!.attrs.id;
        view.dispatch(view.state.tr.insertText("X", 2));
        return { task, snapshot, id, raw, after: controller.port.snapshot() };
      } finally {
        await editor.destroy();
      }
    },
    { controllerPath, pluginPath },
  );
  expect(result.id).toBe("café😀");
  expect(result.snapshot).toMatchObject({
    kind: "mapped",
    value: { text: result.raw },
  });
  expect(result.task.kind).toBe("mapped");
  if (result.task.kind === "mapped")
    expect(
      result.raw.slice(
        result.task.value.marker.start,
        result.task.value.marker.end,
      ),
    ).toBe("[ ]");
  expect(result.after).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
});

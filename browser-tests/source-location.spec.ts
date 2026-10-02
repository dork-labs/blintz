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

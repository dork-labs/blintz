import { test, expect, type Page } from "@playwright/test";

async function openEmbeds(page: Page, specimen = "embeds", theme = "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/playground?specimen=${specimen}&theme=${theme}`);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  return { editor, errors };
}

async function source(page: Page) {
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  return page.getByRole("textbox", { name: "Markdown source" });
}

for (const theme of ["light", "dark"]) {
  test(`registered, invalid and unknown embeds render in ${theme}`, async ({ page }) => {
    const { editor, errors } = await openEmbeds(page, "embeds", theme);
    const chart = editor.getByTestId("sample-chart");
    await expect(chart).toHaveCount(1);
    await expect(chart.locator(".sample-chart-bars span")).toHaveCount(4);
    await expect(chart.locator("figcaption")).toHaveText("Tasks closed");
    await expect(editor.locator(".sample-callout strong")).toHaveText("editable markdown");
    await expect(editor.locator('[data-embed-state="invalid"]')).toContainText(
      "values: needs comma-separated numbers",
    );
    await expect(editor.locator('[data-embed-state="unknown"]')).toContainText(
      '::mystery-widget{id="42"}',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("typing inside a container embed edits its markdown", async ({ page }) => {
  const { editor } = await openEmbeds(page);
  const text = await source(page);
  const paragraph = editor.locator(".sample-callout p").first();
  await paragraph.click();
  // Put the caret at the paragraph's end (End only reaches a wrapped line's end).
  await paragraph.evaluate((p) => {
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type(" Still here.");
  await expect(text).toHaveValue(
    /:::callout\{tone="note"\}\nContainers keep \*\*editable markdown\*\* inside the host's component\. Still here\.\n:::/,
  );
  // The rest of the document is untouched.
  await expect(text).toHaveValue(/::chart\[Tasks closed\]\{kind="bar" values="12,19,7,24"\}/);
  await expect(text).toHaveValue(/::mystery-widget\{id="42"\}/);
});

test("the slash menu inserts a registered embed", async ({ page }) => {
  const { editor } = await openEmbeds(page, "empty");
  await editor.click();
  await page.keyboard.type("/chart");
  const menu = page.getByRole("listbox", { name: "Insert block" });
  await expect(menu.getByRole("option", { name: "Chart", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.getByTestId("sample-chart")).toBeVisible();
  await expect(await source(page)).toHaveValue(/^::chart\{kind="bar" values="3,5,2,8"\}\n/);
});

test("embeds render in the reading view", async ({ page }) => {
  const { editor } = await openEmbeds(page);
  await page.getByRole("button", { name: "Read only", exact: true }).click();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(editor.getByTestId("sample-chart")).toBeVisible();
  await expect(editor.locator(".sample-callout")).toContainText("editable markdown");
});

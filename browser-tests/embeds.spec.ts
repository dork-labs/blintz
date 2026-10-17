import { test, expect, type Locator, type Page } from "@playwright/test";

async function openEmbeds(page: Page, specimen = "embeds", theme = "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/playground?specimen=${specimen}&theme=${theme}`);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  return { editor, errors };
}

/**
 * Put the caret at a paragraph's end the way a person does: click past the
 * end of its last line. (End only reaches a wrapped line's end, and a
 * scripted DOM selection can race ProseMirror's selection sync.)
 */
async function caretAtEnd(paragraph: Locator) {
  const box = (await paragraph.boundingBox())!;
  await paragraph.click({ position: { x: box.width - 1, y: box.height - 4 } });
  await paragraph.page().keyboard.press("End");
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
  await caretAtEnd(paragraph);
  await page.keyboard.type(" Still here.");
  await expect(text).toHaveValue(
    /:::callout\{tone="note"\}\nContainers keep \*\*editable markdown\*\* inside the host's component\. Still here\.\n:::/,
  );
  // The rest of the document is untouched.
  await expect(text).toHaveValue(/::chart\[Tasks closed\]\{kind="bar" values="12,19,7,24"\}/);
  await expect(text).toHaveValue(/::mystery-widget\{id="42"\}/);
});

test("Enter on an empty last line leaves a container", async ({ page }) => {
  const { editor } = await openEmbeds(page);
  const text = await source(page);
  const paragraph = editor.locator(".sample-callout p").first();
  await caretAtEnd(paragraph);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Outside now");
  await expect(text).toHaveValue(
    /inside the host's component\.\n:::\n\nOutside now\n\n::chart\{kind="pie"\}/,
  );
});

test("Backspace at a container's start selects it, keeping the directive", async ({ page }) => {
  const { editor } = await openEmbeds(page);
  const text = await source(page);
  // Home on the first visual line is the paragraph's start.
  await editor.locator(".sample-callout p").first().click({ position: { x: 4, y: 6 } });
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expect(editor.locator(".blintz-embed.is-selected .sample-callout")).toBeVisible();
  await expect(text).toHaveValue(/:::callout\{tone="note"\}\nContainers keep/);
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

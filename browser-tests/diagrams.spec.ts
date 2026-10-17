import { test, expect, type Page } from "@playwright/test";

async function open(page: Page, specimen = "diagrams", theme = "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/playground?specimen=${specimen}&theme=${theme}`);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  return { editor, errors };
}

for (const theme of ["light", "dark"]) {
  test(`a mermaid block is drawn as a diagram in ${theme}`, async ({ page }) => {
    const { editor, errors } = await open(page, "diagrams", theme);
    const diagram = editor.locator(".preview svg").first();
    await expect(diagram).toBeVisible({ timeout: 15000 });
    await expect(diagram).toContainText("Review");
    await expect(editor.locator(".blintz-diagram-error")).toContainText("can't be drawn");
    const width = await diagram.evaluate((svg) => svg.getBoundingClientRect().width);
    const paper = await page.getByTestId("specimen-paper").evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(paper);
    expect(errors).toEqual([]);
  });
}

test("documents without diagrams never load mermaid", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await open(page, "overview");
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => /\/(node_modules|deps)\/[^?]*mermaid/i.test(url))).toEqual([]);
});

test("the slash menu inserts a diagram", async ({ page }) => {
  const { editor } = await open(page, "empty");
  await editor.click();
  await page.keyboard.type("/diagram");
  const menu = page.getByRole("listbox", { name: "Insert block" });
  await expect(menu.getByRole("option", { name: "Diagram", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".preview svg")).toContainText("Review", { timeout: 15000 });
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Markdown source" })).toHaveValue(
    /^```mermaid\nflowchart LR\n {2}Idea --> Draft --> Review --> Done\n```\n/,
  );
});

import { test, expect, type Page } from "@playwright/test";

async function open(page: Page, specimen = "links", theme = "light") {
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
  test(`wiki links render resolved and missing in ${theme}`, async ({ page }) => {
    const { editor, errors } = await open(page, "links", theme);
    const plan = editor.locator(".blintz-wiki-link", { hasText: "the Q4 plan" });
    await expect(plan).toHaveAttribute("data-state", "resolved");
    await expect(plan).toHaveAttribute("href", "#roadmap/q4");
    await expect(editor.locator(".blintz-wiki-link", { hasText: "Someday Maybe" })).toHaveAttribute(
      "data-state",
      "missing",
    );
    expect(errors).toEqual([]);
  });
}

test("the [[ menu suggests pages and inserts one by keyboard", async ({ page }) => {
  const { editor } = await open(page, "empty");
  const text = await source(page);
  await editor.click();
  await page.keyboard.type("See [[team");
  const menu = page.getByRole("listbox", { name: "Link to page" });
  await expect(menu.getByRole("option")).toHaveText(["Team CharterHow we work together"]);
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await page.keyboard.type(" today.");
  await expect(text).toHaveValue("See [[Team Charter]] today.\n");
  await expect(editor.locator(".blintz-wiki-link")).toHaveAttribute("data-state", "resolved");
});

test("typing a full [[link]] turns it into a link", async ({ page }) => {
  const { editor } = await open(page, "empty");
  const text = await source(page);
  await editor.click();
  await page.keyboard.type("Read [[Reading List#Papers|papers]]");
  await expect(editor.locator(".blintz-wiki-link")).toHaveText("papers");
  await expect(text).toHaveValue("Read [[Reading List#Papers|papers]]\n");
});

test("Escape closes the [[ menu and typing continues", async ({ page }) => {
  const { editor } = await open(page, "empty");
  await editor.click();
  await page.keyboard.type("[[r");
  const menu = page.getByRole("listbox", { name: "Link to page" });
  await expect(menu.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.keyboard.type("o");
  await expect(menu).toBeHidden();
  await expect(editor).toContainText("[[ro");
});

test("reading view follows a resolved link on click", async ({ page }) => {
  const { editor } = await open(page);
  await page.getByRole("button", { name: "Read only", exact: true }).click();
  await editor.locator(".blintz-wiki-link", { hasText: "Team Charter" }).click();
  await expect(page).toHaveURL(/#team-charter$/);
});

import { test, expect, type Page } from "@playwright/test";

async function open(page: Page, theme = "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/playground?specimen=comments&theme=${theme}`);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  return { editor, errors };
}

async function commentOnWord(page: Page, word: string) {
  const box = await page.locator(".ProseMirror p").first().evaluate((p, w) => {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(w);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }, word);
  await page.mouse.dblclick(box!.x, box!.y);
  await page.getByRole("button", { name: "Comment on selection" }).click();
}

for (const theme of ["light", "dark"]) {
  test(`a comment highlights its words and keeps the markdown clean in ${theme}`, async ({ page }) => {
    const { editor, errors } = await open(page, theme);
    await commentOnWord(page, "Marketing");
    await expect(editor.locator(".blintz-comment")).toHaveText("Marketing");
    await expect(editor.locator(".blintz-comment.is-active")).toHaveCount(1);
    await page.getByRole("button", { name: "Markdown", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source" })).toHaveValue(
      /The launch is on Friday\. Marketing is ready, and support has the new macros\./,
    );
    expect(errors).toEqual([]);
  });
}

test("a comment follows its words through edits, and resolving hides it", async ({ page }) => {
  const { editor } = await open(page);
  await commentOnWord(page, "Marketing");
  const paragraph = editor.locator("p").first();
  await paragraph.click({ position: { x: 2, y: 6 } });
  await page.keyboard.press("Home");
  await page.keyboard.type("Update: ");
  await expect(editor.locator(".blintz-comment")).toHaveText("Marketing");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(editor.locator(".blintz-comment")).toHaveCount(0);
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(editor.locator(".blintz-comment")).toHaveText("Marketing");
});

test("deleting a comment's words marks it as orphaned, not lost", async ({ page }) => {
  const { editor } = await open(page);
  await commentOnWord(page, "Marketing");
  await expect(editor.locator(".blintz-comment")).toHaveText("Marketing");
  await editor.locator(".blintz-comment").dblclick();
  await page.keyboard.press("Backspace");
  await expect(editor.locator(".blintz-comment")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Comments" })).toContainText("Its text was removed");
});

test("a triple-clicked paragraph can be commented on", async ({ page }) => {
  const { editor } = await open(page);
  await editor.locator("p").first().click({ clickCount: 3 });
  await page.getByRole("button", { name: "Comment on selection" }).click();
  await expect(editor.locator(".blintz-comment")).toHaveText(
    "The launch is on Friday. Marketing is ready, and support has the new macros.",
  );
  await expect(page.getByRole("complementary", { name: "Comments" })).not.toContainText("Its text was removed");
});

test("undo brings back a comment whose words were deleted", async ({ page }) => {
  const { editor } = await open(page);
  await commentOnWord(page, "Marketing");
  await editor.locator(".blintz-comment").dblclick();
  await page.keyboard.press("Backspace");
  await expect(editor.locator(".blintz-comment")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator(".blintz-comment")).toHaveText("Marketing");
  await expect(page.getByRole("complementary", { name: "Comments" })).not.toContainText("Its text was removed");
});

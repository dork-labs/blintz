import { test, expect, type Page } from "@playwright/test";

async function open(page: Page, theme = "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/playground?specimen=collab&theme=${theme}`);
  const ada = page.getByRole("region", { name: "Ada's editor" }).locator(".ProseMirror");
  const grace = page.getByRole("region", { name: "Grace's editor" }).locator(".ProseMirror");
  await expect(ada).toContainText("Two people are editing this page.");
  await expect(grace).toContainText("Two people are editing this page.");
  return { ada, grace, errors };
}

async function typeAtEndOf(page: Page, paragraph: ReturnType<Page["locator"]>, text: string) {
  const box = (await paragraph.boundingBox())!;
  await paragraph.click({ position: { x: box.width - 1, y: box.height - 4 } });
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

for (const theme of ["light", "dark"]) {
  test(`typing in one editor appears in the other in ${theme}`, async ({ page }) => {
    const { ada, grace, errors } = await open(page, theme);
    await typeAtEndOf(page, ada.locator("p").first(), " Ada was here.");
    await expect(grace).toContainText("Ada was here.");
    // Ada's cursor shows in Grace's editor, with her name.
    await expect(grace.locator(".ProseMirror-yjs-cursor")).toContainText("Ada");
    expect(errors).toEqual([]);
  });
}

test("an agent's rewrite keeps what people typed meanwhile", async ({ page }) => {
  const { ada, grace } = await open(page);
  await page.getByRole("button", { name: "Agent: rewrite the last line" }).click();
  // Grace types while the agent "thinks" (it read before her keystrokes).
  await typeAtEndOf(page, grace.locator("p").first(), " Grace typed this.");
  await expect(ada).toContainText("The agent rewrote this line");
  await expect(ada).toContainText("Grace typed this.");
  await expect(grace).toContainText("The agent rewrote this line");
  await expect(grace).toContainText("Grace typed this.");
});

test("undo in one editor undoes only that person's typing", async ({ page }) => {
  const { ada, grace } = await open(page);
  await typeAtEndOf(page, ada.locator("p").first(), " Ada.");
  await typeAtEndOf(page, grace.locator("p").last(), " Grace.");
  await expect(ada).toContainText("Grace.");
  await ada.locator("p").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(ada).not.toContainText("Ada.");
  await expect(ada).toContainText("Grace.");
  await expect(grace).not.toContainText("Ada.");
});

test("undo inside a code block never removes a collaborator's code", async ({ page }) => {
  const { ada, grace } = await open(page);
  const graceCode = grace.locator(".cm-content").first();
  await graceCode.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" // grace");
  await expect(ada.locator(".cm-content").first()).toContainText("// grace");
  const adaCode = ada.locator(".cm-content").first();
  await adaCode.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" // ada");
  await expect(grace.locator(".cm-content").first()).toContainText("// ada");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(adaCode).not.toContainText("// ada");
  await expect(adaCode).toContainText("// grace");
  await expect(grace.locator(".cm-content").first()).toContainText("// grace");
});

test("undo in a code block with no edits of one's own leaves others' code alone", async ({ page }) => {
  const { ada, grace } = await open(page);
  await grace.locator(".cm-content").first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" // grace");
  const adaCode = ada.locator(".cm-content").first();
  await expect(adaCode).toContainText("// grace");
  await adaCode.click();
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(200);
  await expect(adaCode).toContainText("// grace");
  await expect(grace.locator(".cm-content").first()).toContainText("// grace");
});

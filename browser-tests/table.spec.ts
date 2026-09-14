import { expect, test } from "@playwright/test";

test("table operations are available from the keyboard without dragging", async ({
  page,
}) => {
  await page.goto("/playground?specimen=technical&theme=light");
  const editor = page.locator(".milkdown > .ProseMirror");
  const table = editor.locator("table.children");
  await expect(table).toBeVisible();
  const originalRows = await table.locator("tr").count();
  const originalColumns = await table
    .locator("tr")
    .first()
    .locator("th,td")
    .count();
  const actions = page.getByRole("button", {
    name: "Table actions",
    exact: true,
  });
  await actions.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Table actions", exact: true });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Add row below", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(table.locator("tr")).toHaveCount(originalRows + 1);
  await actions.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Add column right", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(table.locator("tr").first().locator("th,td")).toHaveCount(
    originalColumns + 1,
  );
  await page.getByRole("button", { name: "Read only", exact: true }).click();
  await expect(actions).toHaveCount(0);
});

test("table menu can move columns and dismiss with Escape", async ({
  page,
}) => {
  await page.goto("/playground?specimen=technical&theme=dark");
  const table = page.locator(".milkdown table.children");
  await expect(table).toBeVisible();
  const firstHeader = await table
    .locator("tr")
    .first()
    .locator("th")
    .first()
    .innerText();
  const actions = page.getByRole("button", {
    name: "Table actions",
    exact: true,
  });
  await actions.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Table actions", exact: true });
  await menu
    .getByRole("menuitem", { name: "Move column right", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(table.locator("tr").first().locator("th").nth(1)).toHaveText(
    firstHeader,
  );
  await actions.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(actions).toBeFocused();
});

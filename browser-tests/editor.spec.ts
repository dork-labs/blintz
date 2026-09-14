import { test, expect, type Page } from "@playwright/test";

async function openDocument(
  page: Page,
  specimen = "overview",
  theme = "light",
) {
  await page.emulateMedia({
    colorScheme: theme === "light" ? "dark" : "light",
  });
  await page.goto(`/playground?specimen=${specimen}&theme=${theme}`);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return editor;
}

for (const theme of ["light", "dark"]) {
  for (const specimen of [
    "overview",
    "lists",
    "typography",
    "technical",
    "media",
  ]) {
    test(`${specimen} stays readable and contained in ${theme}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const editor = await openDocument(page, specimen, theme);
      await expect(editor.locator("h1")).toBeVisible();
      if (specimen === "technical" || specimen === "overview")
        await expect(editor.locator(".cm-content").first()).toBeVisible();
      if (specimen === "media")
        await expect(editor.locator("img")).toHaveJSProperty("complete", true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const style = await editor.evaluate((el) => {
        const css = getComputedStyle(el);
        const heading = getComputedStyle(el.querySelector("h1")!);
        return {
          body: parseFloat(css.fontSize),
          heading: parseFloat(heading.fontSize),
          color: css.color,
          headingColor: heading.color,
        };
      });
      expect(style.body).toBeGreaterThanOrEqual(15);
      expect(style.heading).toBeGreaterThan(style.body * 1.5);
      expect(style.headingColor).toBe(style.color);
      const contrastFailures = await editor.evaluate((root) => {
        const luminance = (color: string) => {
          const components = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return (
            components[0]! * 0.2126 +
            components[1]! * 0.7152 +
            components[2]! * 0.0722
          );
        };
        const failures: string[] = [];
        for (const el of root.querySelectorAll(
          "p, h1, h2, h3, h4, h5, h6, strong, em, a, code, th, td, .cm-line span",
        )) {
          if (!el.textContent?.trim()) continue;
          const style = getComputedStyle(el);
          let ancestor: Element | null = el;
          let background = "rgba(0, 0, 0, 0)";
          while (ancestor && background === "rgba(0, 0, 0, 0)") {
            background = getComputedStyle(ancestor).backgroundColor;
            ancestor = ancestor.parentElement;
          }
          const fg = luminance(style.color),
            bg = luminance(background);
          const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
          const large =
            parseFloat(style.fontSize) >= 24 ||
            (parseFloat(style.fontSize) >= 18.66 &&
              parseFloat(style.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5))
            failures.push(
              `${el.tagName} ${el.textContent!.slice(0, 35)}: ${ratio.toFixed(2)}`,
            );
        }
        return failures;
      });
      expect(contrastFailures).toEqual([]);
      await expect(page.getByTestId("specimen-paper")).toHaveScreenshot(
        `${specimen}-${theme}.png`,
      );
      expect(errors).toEqual([]);
    });
  }
}

test("lists have one marker, semantic children, and aligned first lines", async ({
  page,
}) => {
  const editor = await openDocument(page, "lists");
  const lists = await editor.locator("ul, ol").evaluateAll((elements) =>
    elements.map((el) => ({
      children: [...el.children].map((child) => child.tagName),
      marker: getComputedStyle(el).listStyleType,
    })),
  );
  expect(lists.length).toBeGreaterThan(4);
  for (const list of lists) {
    expect(list.children.every((tag) => tag === "LI")).toBe(true);
    expect(list.marker).toBe("none");
  }
  const geometry = await editor
    .locator(".milkdown-list-item-block")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const label = el.querySelector(".label-wrapper")!;
        const p = el.querySelector("p")!;
        return {
          delta: Math.abs(
            label.getBoundingClientRect().top - p.getBoundingClientRect().top,
          ),
          marker: getComputedStyle(el).listStyleType,
        };
      }),
    );
  for (const item of geometry) {
    expect(item.delta).toBeLessThanOrEqual(5);
    expect(item.marker).toBe("none");
  }
  await expect(
    editor.locator(".label.ordered").filter({ hasText: "10." }),
  ).toBeVisible();
});

test("checkboxes work by keyboard and become inert in reading view", async ({
  page,
}) => {
  await openDocument(page, "lists");
  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown source" }),
  ).toHaveValue(/[-*] \[x\] A task to do/);
  await page.getByRole("button", { name: "Read only", exact: true }).click();
  await expect(page.locator(".ProseMirror")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await expect(checkbox).toBeDisabled();
});

test("live theme changes preserve the editor, edits, and undo history", async ({
  page,
}) => {
  const editor = await openDocument(page, "empty");
  await editor.click();
  await page.keyboard.type("A thought worth keeping.");
  await expect(editor).toContainText("A thought worth keeping.");
  await editor.evaluate((el) => {
    el.setAttribute("data-instance-proof", "original");
  });
  const before = await editor.evaluate((el) => getComputedStyle(el).color);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(editor).toHaveAttribute("data-instance-proof", "original");
  await expect
    .poll(() => editor.evaluate((el) => getComputedStyle(el).color))
    .not.toBe(before);
  await expect(editor).toContainText("A thought worth keeping.");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("A thought worth keeping.");
});

test("host tokens inherit and update on the mounted editor", async ({
  page,
}) => {
  const editor = await openDocument(page);
  await page.getByTestId("specimen-paper").evaluate((el) => {
    el.style.setProperty("--blintz-color-on-background", "rgb(80, 40, 120)");
    el.style.setProperty("--blintz-color-background", "rgb(250, 245, 255)");
  });
  await expect(editor).toHaveCSS("color", "rgb(80, 40, 120)");
  await expect(editor.locator("h1")).toHaveCSS("color", "rgb(80, 40, 120)");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(editor).toHaveCSS("color", "rgb(80, 40, 120)");
});

test("empty-state guidance stays readable in both themes", async ({ page }) => {
  const editor = await openDocument(page, "empty");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    const contrast = await editor.evaluate((root) => {
      const placeholder = root.querySelector(".crepe-placeholder")!;
      const luminance = (color: string) => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return (
          channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
        );
      };
      const foreground = getComputedStyle(placeholder, "::before").color;
      let ancestor: Element | null = placeholder;
      let background = "rgba(0, 0, 0, 0)";
      while (ancestor && background === "rgba(0, 0, 0, 0)") {
        background = getComputedStyle(ancestor).backgroundColor;
        ancestor = ancestor.parentElement;
      }
      const fg = luminance(foreground),
        bg = luminance(background);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
});

test("Markdown typing and an external reset keep the editor usable", async ({
  page,
}) => {
  const editor = await openDocument(page, "empty");
  await editor.click();
  await page.keyboard.type("# A new heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A fresh paragraph.");
  await expect(
    editor.getByRole("heading", { name: "A new heading" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  const source = page.getByRole("textbox", { name: "Markdown source" });
  await expect(source).toHaveValue(/# A new heading\n\nA fresh paragraph/);
  await page.getByRole("button", { name: "Reset document" }).click();
  await expect(editor).not.toContainText("A new heading");
  await editor.click();
  await page.keyboard.type("Still writing.");
  await expect(source).toHaveValue(/Still writing/);
});

test("the first document block has no phantom cursor spacing", async ({
  page,
}) => {
  const editor = await openDocument(page, "overview");
  const geometry = await editor.evaluate((el) => {
    const first = el.querySelector("h1")!;
    return {
      inset: first.getBoundingClientRect().top - el.getBoundingClientRect().top,
      padding: parseFloat(getComputedStyle(el).paddingTop),
    };
  });
  expect(geometry.inset).toBeCloseTo(geometry.padding, 0);
});

test("the slash menu inserts a heading with the keyboard", async ({ page }) => {
  const editor = await openDocument(page, "empty");
  await editor.click();
  await page.keyboard.type("/heading");
  const menu = page.getByRole("listbox", { name: "Insert block" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("option", { name: "Heading 1", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("A heading from the menu");
  await expect(
    editor.getByRole("heading", { level: 1, name: "A heading from the menu" }),
  ).toBeVisible();
  await expect(menu).not.toBeVisible();
});

test("selection toolbar applies formatting by keyboard", async ({ page }) => {
  const editor = await openDocument(page, "empty");
  await editor.click();
  await page.keyboard.type("A strong thought");
  await page.keyboard.down("Shift");
  for (let i = 0; i < "A strong thought".length; i++)
    await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("A strong thought");
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toBeVisible();
  await bold.focus();
  await page.keyboard.press("Enter");
  await expect(editor.locator("strong")).toHaveText("A strong thought");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown source" }),
  ).toHaveValue(/\*\*A strong thought\*\*/);
});

test("reading view keeps image captions static", async ({ page }) => {
  const editor = await openDocument(page, "media");
  await page.getByRole("button", { name: "Read only", exact: true }).click();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(editor.locator("input, textarea")).toHaveCount(0);
  await expect(editor.locator("img")).toBeVisible();
  await page.getByRole("button", { name: "Read only", exact: true }).click();
  await expect(editor).toHaveAttribute("contenteditable", "true");
});

test("auto theme follows the nearest host and then the system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/playground?specimen=typography&theme=light&auto=true");
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await expect(page.locator(".milkdown-editor-host")).toHaveAttribute(
    "data-blintz-theme",
    "light",
  );
  const light = await editor.evaluate((el) => getComputedStyle(el).color);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect
    .poll(() => editor.evaluate((el) => getComputedStyle(el).color))
    .not.toBe(light);
  const dark = await editor.evaluate((el) => getComputedStyle(el).color);
  await page
    .getByTestId("specimen-paper")
    .evaluate((el) => el.setAttribute("data-theme", "light"));
  await expect(editor).toHaveCSS("color", light);
  await page
    .getByTestId("specimen-paper")
    .evaluate((el) => el.setAttribute("data-theme", "dark"));
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(editor).toHaveCSS("color", dark);
  await page.evaluate(() => {
    document
      .querySelector('[data-testid="specimen-paper"]')!
      .removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-app-theme");
    document.documentElement.removeAttribute("data-theme");
  });
  await expect(editor).toHaveCSS("color", dark);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(editor).toHaveCSS("color", light);
});

test("both live theme directions preserve a text selection", async ({
  page,
}) => {
  const editor = await openDocument(page, "empty");
  await editor.click();
  await page.keyboard.type("Keep this selection");
  await page.keyboard.down("Shift");
  for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("selection");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe("selection");
  }
});

test("wide tables remain horizontally reachable in a narrow page", async ({
  page,
}) => {
  const editor = await openDocument(page, "technical");
  await page.getByRole("button", { name: "Narrow page", exact: true }).click();
  const table = editor.locator(".table-wrapper");
  const geometry = await table.evaluate((el) => ({
    content: el.scrollWidth,
    viewport: el.clientWidth,
  }));
  expect(geometry.content).toBeGreaterThan(geometry.viewport);
  await table.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect
    .poll(() => table.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

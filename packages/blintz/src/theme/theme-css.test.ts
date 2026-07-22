/**
 * Built-CSS guard for the two theme-correctness rules that a refactor could
 * silently drop (both were regressions once): the ROOT PAINT (`.milkdown` sets
 * its own background/text from the tokens — the paint Crepe's reset.css did,
 * lost in the port) and the EXPLICIT-LIGHT re-assertion (a `.light` /
 * `[data-theme=light]` ancestor beats a dark OS preference).
 *
 * CSS is hard to unit-test, so this asserts against the SHIPPED artifact
 * (`dist/blintz.css`, the `blintz/styles.css` export) after the Vite build —
 * catching a drop anywhere in the source-to-bundle pipeline, not just the
 * source. The release/verify flow always builds; this only builds on demand
 * when the artifact is missing (e.g. a fresh checkout).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CSS_PATH = resolve(PKG_ROOT, "dist/blintz.css");

let css = "";

beforeAll(() => {
  if (!existsSync(CSS_PATH)) {
    execSync("npm run build", { cwd: PKG_ROOT, stdio: "inherit" });
  }
  css = readFileSync(CSS_PATH, "utf8");
}, 120_000);

describe("built theme CSS", () => {
  it("paints the .milkdown root from the background/text tokens", () => {
    // A rule ON `.milkdown` (not a descendant `.milkdown .x`) that sets both
    // background and color from the live tokens. `[^{}]*` stays inside one rule.
    expect(css).toMatch(
      /\.milkdown\s*\{[^{}]*background:\s*var\(--crepe-color-background\)/,
    );
    expect(css).toMatch(
      /\.milkdown\s*\{[^{}]*color:\s*var\(--crepe-color-on-background\)/,
    );
  });

  it("ships an explicit-light block that re-maps to the light tokens", () => {
    expect(css).toMatch(
      /:where\(\.light,\s*\[data-theme=light\]\)\s+\.milkdown\s*\{/,
    );
    // It re-asserts light by mapping a live token onto the `--crepe-light-*`
    // alias (not a hand-written literal).
    expect(css).toMatch(
      /:where\(\.light,\s*\[data-theme=light\]\)\s+\.milkdown\s*\{[^{}]*--crepe-color-background:\s*var\(--crepe-light-color-background\)/,
    );
  });

  it("declares explicit-light AFTER explicit-dark so it can beat OS dark", () => {
    // The explicit-dark selector follows the dark `@media` block in source, so
    // "explicit-light after explicit-dark" implies "after the dark media block"
    // — the source order that lets an explicit light signal win over OS dark.
    const darkIdx = css.search(
      /:where\(\.dark,\s*\[data-theme=dark\]\)\s+\.milkdown\s*\{/,
    );
    const lightIdx = css.search(
      /:where\(\.light,\s*\[data-theme=light\]\)\s+\.milkdown\s*\{/,
    );
    expect(darkIdx).toBeGreaterThan(-1);
    expect(lightIdx).toBeGreaterThan(darkIdx);
  });
});

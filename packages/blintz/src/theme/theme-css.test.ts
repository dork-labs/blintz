/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8");

// Browser tests own colors and layout. These guard the package boundary: the
// library must not import an application reset or shadow its public inputs.
describe("theme isolation", () => {
  it("does not pull Nord's global Tailwind reset into the editor", () => {
    expect(source("../MarkdownEditor.tsx")).not.toContain("theme-nord");
    expect(source("../useBlintzEditor.ts")).not.toContain("theme-nord");
    expect(source("./index.css")).toContain('"./prose.css"');
  });

  it("only reads public host theme inputs; it never declares them locally", () => {
    const vars = source("./vars.css");
    expect(vars).toMatch(/var\(\s*--blintz-color-background\s*,/);
    expect(vars).toMatch(/var\(\s*--blintz-font-default\s*,/);
    expect(vars).not.toMatch(/--blintz-(?:color|font|code)-[\w-]+\s*:/);
  });

  it("does not ship the static dark CodeMirror palette", () => {
    expect(source("../features/code-block/index.ts")).not.toContain("oneDark");
    expect(source("../features/code-block/theme.ts")).toContain(
      "var(--blintz-syntax-keyword)",
    );
  });
  it("uses an opaque readable placeholder in both default palettes", () => {
    const placeholder = source("./placeholder.css");
    expect(placeholder).toMatch(
      /color:\s*var\(--crepe-color-on-surface-variant\)/,
    );
    expect(placeholder).not.toMatch(/color-mix|transparent|opacity:/);
    const vars = source("./vars.css");
    const luminance = (hex: string) => {
      const channels = hex.match(/[a-f\d]{2}/gi)!.map((value) => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return (
        channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      );
    };
    for (const theme of ["light", "dark"]) {
      const color = (name: string) =>
        vars.match(
          new RegExp(`--crepe-${theme}-color-${name}:\\s*(#[a-fA-F0-9]{6})`),
        )![1]!;
      const foreground = luminance(color("on-surface-variant"));
      const background = luminance(color("background"));
      expect(
        (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

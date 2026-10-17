// Runs in plain Node: no DOM globals, no jsdom.
import { describe, expect, it } from "vitest";

import { createMarkdownModel } from "./headless";

describe("createMarkdownModel (Node, no DOM)", () => {
  it("has no DOM to lean on", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("adds only the three event functions, and keeps them working after timers time out", async () => {
    await createMarkdownModel();
    expect(typeof (globalThis as { addEventListener?: unknown }).addEventListener).toBe("function");
    expect(typeof document).toBe("undefined");
    // Milkdown timers call removeEventListener from a 3 s timeout.
    await new Promise((resolve) => setTimeout(resolve, 3200));
  }, 10_000);

  it("round-trips the editor's grammar byte for byte", async () => {
    const model = await createMarkdownModel();
    const md = [
      "---\ntitle: Doc\n---",
      "# Heading",
      "Some **bold**, *em*, `code`, ~~gone~~, [link](https://x.dev) and [[Wiki#h|label]].",
      "* a\n* b\n  * nested",
      "* [ ] task\n* [x] done",
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "```js\nconst x = 1;\n```",
      "$$\nE = mc^2\n$$",
      "Inline $a^2$ math.",
      '::chart{src="q3"}',
      ':::callout{tone="warn"}\nInside.\n:::',
      "![alt](img.png)",
      "> quote",
    ].join("\n\n") + "\n";
    const out = model.serialize(model.parse(md));
    expect(model.serialize(model.parse(out))).toBe(out);
    expect(out).toContain("[[Wiki#h|label]]");
    expect(out).toContain('::chart{src="q3"}');
    expect(out).toContain("$$\nE = mc^2\n$$");
    expect(out).toContain("---\ntitle: Doc\n---");
  });

  it("builds independent instances", async () => {
    const [a, b] = await Promise.all([createMarkdownModel(), createMarkdownModel()]);
    expect(a.schema).not.toBe(b.schema);
    expect(a.serialize(a.parse("Hi\n"))).toBe("Hi\n");
  });
});

describe("model.source (Node, no DOM)", () => {
  const markdown = "# Plan\n\nThe **launch** is on Friday, see [[Roadmap]].\n\n- one\n- two &amp; three\n";

  it("gives the editor's document", async () => {
    const model = await createMarkdownModel();
    expect(model.source(markdown).doc.eq(model.document(markdown))).toBe(true);
  });

  it("maps document ranges to the raw markdown they came from", async () => {
    const model = await createMarkdownModel();
    const source = model.source(markdown);
    const text = (from: number, to: number) =>
      source.toSource(from, to)?.map((range) => markdown.slice(range.start, range.end));
    const at = (word: string) => {
      let found = -1;
      source.doc.descendants((node, pos) => {
        if (found < 0 && node.isText && node.text!.includes(word)) found = pos + node.text!.indexOf(word);
      });
      return found;
    };
    expect(text(at("launch"), at("launch") + 6)).toEqual(["launch"]);
    // Across a mark: one raw range per text run.
    expect(text(at("The"), at("is on") + 2)).toEqual(["The ", "launch", " is"]);
    // An atom (a wiki link) or an entity has no exact source.
    expect(source.toSource(at("see"), at("see") + 6)).toBeNull();
    expect(source.toSource(at("two"), at("three") + 5)).toBeNull();
    expect(source.toSource(-1, 2)).toBeNull();
  });

  it("maps raw ranges back, snapping ends inside markup to the text", async () => {
    const model = await createMarkdownModel();
    const source = model.source(markdown);
    const between = (start: number, end: number) => {
      const range = source.fromSource(start, end);
      return range && source.doc.textBetween(range.from, range.to);
    };
    const raw = markdown.indexOf("**launch**");
    expect(between(raw, raw + "**launch**".length)).toBe("launch");
    expect(between(raw + 2, raw + 8)).toBe("launch");
    expect(between(0, 2)).toBeNull();
  });
});

describe("model.source().fromSource edge cases", () => {
  const cases: Array<[string, string, (md: string) => [number, number], string | null]> = [
    // Text without an exact source counts whole, never silently shortened.
    ["covers an entity's text whole", "Tom &amp; Jerry, see **the cast** today.\n", (md) => [0, md.indexOf(".")], "Tom & Jerry, see the cast today"],
    ["refuses an end inside an entity's text", "Tom &amp; Jerry went to the Friday market.\n", (md) => [md.indexOf("Friday"), md.indexOf("Friday") + 6], null],
    ["refuses an end inside escaped text", "Use snake\\_case names here.\n", (md) => [md.indexOf("names"), md.indexOf("names") + 5], null],
    ["covers inline code whole", "Run `npm test` now.\n", (md) => [0, md.indexOf(".")], "Run npm test now"],
    ["refuses an end inside inline code", "Run `npm test` now.\n", (md) => [md.indexOf("npm"), md.indexOf("npm") + 3], null],
    ["covers a wiki link whole", "See [[Cast]] today.\n", (md) => [md.indexOf("[["), md.indexOf(".")], "￼ today"],
    ["leaves out a wiki link covered in part", "See [[Cast]] today.\n", (md) => [md.indexOf("Cast"), md.indexOf(".")], " today"],
    ["is null for an empty range", "Plain text.\n", () => [3, 3], null],
    ["is null when start is past end", "Plain text.\n", () => [6, 2], null],
    ["is null for NaN", "Plain text.\n", () => [Number.NaN, 4], null],
    ["is null for markup alone", "Some **bold** text.\n", (md) => [md.indexOf("**"), md.indexOf("**") + 2], null],
    // Line endings split a paragraph's text into pieces with no position: the
    // paragraph counts whole.
    ["covers a soft-wrapped paragraph whole", "Intro.\n\nline one\n   indented continuation\n", (md) => [0, md.length], "Intro.\nline one￼indented continuation"],
    ["refuses an end inside a soft-wrapped paragraph", "Intro.\n\nline one\nline two\n", (md) => [0, md.indexOf("two")], null],
    ["refuses a word inside a soft-wrapped paragraph", "Alpha line\nbeta line.\n", (md) => [md.indexOf("beta"), md.indexOf("beta") + 4], null],
    // ...but only the wrapped gap: exactly mapped words beside it stay addressable.
    ["keeps marked words in a wrapped paragraph", "The **launch** is on\nFriday after review.\n", (md) => [md.indexOf("launch"), md.indexOf("launch") + 6], "launch"],
    ["keeps link text in a wrapped paragraph", "Start [the docs](u) and\nmore words.\n", (md) => [md.indexOf("the docs"), md.indexOf("the docs") + 8], "the docs"],
    ["keeps marked words in a wrapped list item", "- item **bold** one\n  continued here\n", (md) => [md.indexOf("bold"), md.indexOf("bold") + 4], "bold"],
    ["keeps marked words in a wrapped setext heading", "Setext **big**\nwrap\n=====\n", (md) => [md.indexOf("big"), md.indexOf("big") + 3], "big"],
    ["refuses an end inside the wrapped gap", "The **launch** is on\nFriday after review.\n", (md) => [md.indexOf("launch"), md.indexOf("Friday") + 6], null],
    ["snaps across a CRLF and a BOM", "﻿First line.\r\n\r\nSecond line.\r\n", (md) => [md.indexOf("line."), md.indexOf("Second") + 6], "line.\nSecond"],
  ];

  it.each(cases)("%s", async (_, markdown, range, expected) => {
    const model = await createMarkdownModel();
    const source = model.source(markdown);
    const [start, end] = range(markdown);
    const found = source.fromSource(start, end);
    const text = found && source.doc.textBetween(found.from, found.to, "\n", "￼");
    expect(text).toBe(expected);
  });
});

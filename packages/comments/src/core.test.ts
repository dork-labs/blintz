// Runs in plain Node: no DOM globals, no jsdom.
import { expect, it } from "vitest";
import { createMarkdownModel } from "blintz/collab";

import { anchorFromRange, createAnchor, resolveAnchor } from "./core";

const markdown = "# Plan\n\nThe launch is on **Friday**, after the review.\n\nShip on Friday too.\n";

it("has no DOM to lean on", () => {
  expect(typeof document).toBe("undefined");
});

it("creates an anchor from a raw range and finds it again", async () => {
  const model = await createMarkdownModel();
  const start = markdown.indexOf("**Friday**");
  const anchor = createAnchor(model, markdown, start, start + "**Friday**".length)!;
  expect(anchor).toMatchObject({ v: 1, quote: "Friday", prefix: expect.stringMatching(/launch is on $/) });
  const found = resolveAnchor(model, markdown, anchor)!;
  expect(found.match).toBe("exact");
  expect(found.source).toMatchObject({ start: start + 2, end: start + 8 });
  expect(markdown.slice(found.source!.start, found.source!.end)).toBe("Friday");
});

it("follows the words through an agent's rewrite, and orphans them when deleted", async () => {
  const model = await createMarkdownModel();
  const start = markdown.indexOf("Friday**");
  const anchor = createAnchor(model, markdown, start, start + 6)!;
  const rewritten = "# Plan\n\nIntro first.\n\nThe launch is on **Friday**, after the review.\n";
  const moved = resolveAnchor(model, rewritten, anchor)!;
  expect(moved.match).toBe("moved");
  expect(rewritten.slice(moved.source!.start, moved.source!.end)).toBe("Friday");
  expect(resolveAnchor(model, "# Plan\n\nThe launch is on hold.\n", anchor)).toBeNull();
});

it("reuses one parse for many anchors", async () => {
  const model = await createMarkdownModel();
  const source = model.source(markdown);
  const a = createAnchor(model, source, markdown.indexOf("launch"), markdown.indexOf("launch") + 6)!;
  const b = createAnchor(model, source, markdown.indexOf("Ship"), markdown.indexOf("Ship") + 4)!;
  expect(resolveAnchor(model, source, a)?.match).toBe("exact");
  expect(resolveAnchor(model, source, b)?.match).toBe("exact");
});

it("reports words found in text without an exact source", async () => {
  const model = await createMarkdownModel();
  const md = "Tom &amp; Jerry, see [[Cast]] today.\n";
  // Text with an entity or escape has no exact raw source, so a raw range
  // can't address it (as the editor's source port can't)...
  expect(createAnchor(model, md, 0, md.indexOf(","))).toBeNull();
  // ...but an anchor made in the editor still resolves, without raw offsets.
  const source = model.source(md);
  const anchor = anchorFromRange(source.doc, 1, source.doc.textContent.indexOf(",") + 1)!;
  expect(anchor.quote).toBe("Tom & Jerry");
  const found = resolveAnchor(model, source, anchor)!;
  expect(found.match).toBe("exact");
  expect(found.source).toBeNull();
  // A range across an atom anchors it, and maps where every part has a source.
  const today = createAnchor(model, md, md.indexOf("[[Cast]]"), md.indexOf("."))!;
  expect(today.quote).toBe("￼ today");
  expect(resolveAnchor(model, md, today)?.source).toBeNull();
  const words = createAnchor(model, md, md.indexOf("today"), md.indexOf("."))!;
  expect(resolveAnchor(model, md, words)?.source).toMatchObject({ start: md.indexOf("today"), end: md.indexOf(".") });
});

it("anchors every word a raw range covers, including text without an exact source", async () => {
  const model = await createMarkdownModel();
  const md = "Tom &amp; Jerry, see **the cast** today.\n";
  const anchor = createAnchor(model, md, 0, md.indexOf("."))!;
  expect(anchor.quote).toBe("Tom & Jerry, see the cast today");
  expect(anchor.prefix).toBe("");
});

it("returns null for a range with no text", async () => {
  const model = await createMarkdownModel();
  expect(createAnchor(model, markdown, 0, 2)).toBeNull();
});

import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { remarkBlockDirectives } from "../embeds/grammar";
import {
  isWritableWikiLink,
  parseWikiLinkBody,
  remarkWikiLinks,
  stringifyWikiLink,
} from "./grammar";

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWikiLinks).use(remarkStringify);
const roundTrip = (md: string) => String(processor.processSync(md));
const base = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);
const baseTrip = (md: string) => String(base.processSync(md));

describe("wiki link grammar", () => {
  it.each([
    ["Page", { target: "Page", heading: null, label: null }],
    ["Page#Intro", { target: "Page", heading: "Intro", label: null }],
    ["Page|the page", { target: "Page", heading: null, label: "the page" }],
    ["Page#Intro|see", { target: "Page", heading: "Intro", label: "see" }],
    ["#Intro", { target: "", heading: "Intro", label: null }],
    ["a#b#c|d|e", { target: "a", heading: "b#c", label: "d|e" }],
    [" spaced ", { target: " spaced ", heading: null, label: null }],
  ])("splits %j into its parts", (raw, parts) => {
    expect(parseWikiLinkBody(raw)).toEqual({ ...parts, embed: false });
    expect(stringifyWikiLink(parseWikiLinkBody(raw))).toBe(`[[${raw}]]`);
  });

  it.each([
    "See [[Other Note]] for details.\n",
    "[[a#b|c]] and ![[img.png]]\n",
    "text ![[a|b]]!\n",
    "[[a]][[b]]\n",
    "[[a]] (x)\n",
    "Hey! [[a]]\n",
    "[[ spaced ]]\n",
    "* [[In a list]]\n",
    "> [[In a quote]]\n",
    "| a             |\n| ------------- |\n| [[in a cell]] |\n",
    "| a               |\n| --------------- |\n| [[Page\\|alias]] |\n",
    "Outside a table [[Page\\|alias]] too.\n",
    "See [[Page]][^1].\n\n[^1]: A note.\n",
    "[[a]][[b]]\n",
    "Mixed [[a\\|b|c]] and [[a|b\\|c]] pipes.\n",
  ])("round-trips %j byte for byte", (md) => {
    expect(roundTrip(md)).toBe(md);
  });

  it.each([
    "[[a]](url)\n",
    "[[a]][ref]\n\n[ref]: /x\n",
    "\\[\\[escaped]]\n",
    "`[[code]]`\n",
    "[[]]\n",
    "[[a\nb]]\n",
  ])("leaves %j exactly as commonmark alone does", (md) => {
    expect(roundTrip(md)).toBe(baseTrip(md));
  });

  it("reads Obsidian's escaped pipe as the label separator", () => {
    const tree = processor.parse("| a |\n| - |\n| [[x\\|y]] |\n") as never as {
      children: Array<{ children: Array<{ children: Array<{ children: Array<Record<string, unknown>> }> }> }>;
    };
    const cell = tree.children[0]!.children[1]!.children[0]!.children[0]!;
    expect(cell).toMatchObject({ type: "wikiLink", target: "x", label: "y" });
  });

  it("writes a labelled link inside a table cell with an escaped pipe", () => {
    // The editor can put `[[Page|alias]]` in a cell; an unescaped `|` would
    // end the cell, so the cell form escapes it.
    const link = { type: "wikiLink", value: "", target: "Page", heading: null, label: "alias", embed: false };
    const tree = {
      type: "root",
      children: [
        {
          type: "table",
          children: [
            { type: "tableRow", children: [{ type: "tableCell", children: [{ type: "text", value: "a" }] }] },
            { type: "tableRow", children: [{ type: "tableCell", children: [link] }] },
          ],
        },
      ],
    };
    const out = processor.stringify(tree as never);
    expect(out).toContain("| [[Page\\|alias]] |");
    expect(roundTrip(out)).toBe(out);
    const cell = (processor.parse(out) as never as {
      children: Array<{ children: Array<{ children: Array<{ children: Array<Record<string, unknown>> }> }> }>;
    }).children[0]!.children[1]!.children[0]!.children[0]!;
    expect(cell).toMatchObject({ type: "wikiLink", target: "Page", label: "alias" });
  });

  it("keeps text after a link that only looks like a reference", () => {
    const md = "[[a]][x]\n";
    const out = roundTrip(md);
    expect(out).toBe(roundTrip(out));
    expect((processor.parse(out) as never as { children: Array<{ children: Array<{ type: string }> }> })
      .children[0]!.children.map(({ type }) => type)).toEqual(["wikiLink", "text"]);
  });

  it("keeps the brackets of a wiki link in image alt text", () => {
    const md = "![alt [[a]]](src)\n";
    expect(roundTrip(md)).toBe(baseTrip(md));
  });

  it.each([
    "[[a]][b\nc]\n\n[b c]: /u\n",
    "[[a]][x\\[y]\n\n[x\\[y]: /u\n",
  ])("leaves a reference with a line break or escape in its label to commonmark: %j", (md) => {
    expect(roundTrip(md)).toBe(baseTrip(md));
  });

  it("keeps a defined reference's URL instead of reading a wiki link", () => {
    const md = "[a]: http://x\n\n[[a]]\n";
    expect(roundTrip(md)).toBe(baseTrip(md));
    expect(roundTrip(md)).toContain("http://x");
  });

  it("leaves [[a]][ref] to commonmark when ref is defined", () => {
    const md = "[[a]][ref]\n\n[ref]: /x\n";
    expect(roundTrip(md)).toBe(baseTrip(md));
  });

  it("keeps an escaped wiki link as text", () => {
    const tree = processor.parse("\\[\\[escaped]]\n") as { children: Array<{ children: Array<{ type: string }> }> };
    expect(tree.children[0]!.children.map((node) => node.type)).toEqual(["text"]);
  });

  it("works next to block directives", () => {
    const both = unified()
      .use(remarkParse)
      .use(remarkWikiLinks)
      .use(remarkBlockDirectives)
      .use(remarkStringify);
    const md = ':::callout{tone="warn"}\nSee [[Page#Intro|this]].\n:::\n';
    expect(String(both.processSync(md))).toBe(md);
  });

  it.each([
    [{ target: "a", heading: null, label: null, embed: false }, true],
    [{ target: "a]]b", heading: null, label: null, embed: false }, false],
    [{ target: "a|b", heading: null, label: null, embed: false }, false],
    [{ target: "a#b", heading: null, label: null, embed: false }, false],
    [{ target: "a\nb", heading: null, label: null, embed: false }, false],
    [{ target: "a", heading: "h|x", label: null, embed: false }, false],
    [{ target: "a", heading: null, label: "l]", embed: false }, false],
    [{ target: "", heading: null, label: null, embed: false }, false],
    [{ target: "a\ufffcb", heading: null, label: null, embed: false }, false],
    [{ target: "y".repeat(1001), heading: null, label: null, embed: false }, false],
    [{ target: "y".repeat(1000), heading: null, label: null, embed: false }, true],
    [{ target: "a\\", heading: null, label: "b", embed: false }, false],
    [{ target: "a", heading: "h\\", label: "b", embed: false }, false],
    [{ target: "a\\", heading: "h", label: null, embed: false }, false],
    [{ target: "a\\", heading: null, label: null, embed: false }, true],
  ])("isWritableWikiLink(%j) is %s", (link, expected) => {
    expect(isWritableWikiLink(link)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
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

const processor = unified().use(remarkParse).use(remarkWikiLinks).use(remarkStringify);
const roundTrip = (md: string) => String(processor.processSync(md));
const base = unified().use(remarkParse).use(remarkStringify);
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
    "| a         |\n| --------- |\n| [[in a cell]] |\n",
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
  ])("isWritableWikiLink(%j) is %s", (link, expected) => {
    expect(isWritableWikiLink(link)).toBe(expected);
  });
});

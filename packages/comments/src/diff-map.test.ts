import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";

import { diffMap } from "./diff-map";

/** StepMap keeps its ranges internal; the tests read them to check the shape. */
const ranges = (map: ReturnType<typeof diffMap>) => (map as unknown as { ranges: number[] }).ranges;

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    image: { group: "inline", inline: true, attrs: { src: { default: "" } } },
  },
});

const doc = (...paragraphs: string[]) =>
  schema.node(
    "doc",
    null,
    paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : [])),
  );

/** Where `word` (the nth copy) lands, mapped from `before` to `after`. */
function follow(before: ReturnType<typeof doc>, after: ReturnType<typeof doc>, word: string) {
  let from = -1;
  before.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text!.includes(word)) from = pos + node.text!.indexOf(word);
  });
  const map = diffMap(before, after);
  const a = map.map(from, 1);
  const b = map.map(from + word.length, -1);
  return a < b ? after.textBetween(a, b) : null;
}

describe("diffMap", () => {
  it("is empty for identical documents", () => {
    expect(ranges(diffMap(doc("Same."), doc("Same.")))).toEqual([]);
  });

  it("keeps words that edits surround, across blocks and inside one", () => {
    expect(follow(doc("Top.", "On Friday.", "Bottom."), doc("New top!", "On Friday.", "New bottom."), "Friday")).toBe(
      "Friday",
    );
    expect(follow(doc("On Friday, at noon."), doc("Big news: on Friday, at 3pm."), "Friday")).toBe("Friday");
  });

  it("collapses words that were removed, and keeps a partial deletion's rest", () => {
    expect(follow(doc("The launch is on Friday."), doc("The launch is on."), "Friday")).toBeNull();
    expect(follow(doc("We ship big things."), doc("We ship things."), "ship big things")).toBe("ship things");
  });

  it("follows blocks inserted and removed around the words", () => {
    expect(follow(doc("A.", "On Friday."), doc("On Friday.", "Z."), "Friday")).toBe("Friday");
    expect(follow(doc("On Friday."), doc("", "X.", "On Friday."), "Friday")).toBe("Friday");
  });

  it("produces a map every position goes through in order", () => {
    const before = doc("one two three", "four five", "six");
    const after = doc("zero one three", "five four", "six seven");
    const map = diffMap(before, after);
    let last = -1;
    for (let pos = 0; pos <= before.content.size; pos++) {
      const mapped = map.map(pos, 1);
      expect(mapped).toBeGreaterThanOrEqual(last);
      expect(mapped).toBeLessThanOrEqual(after.content.size);
      last = mapped;
    }
    expect(map.map(before.content.size)).toBe(after.content.size);
  });

  it("falls back to one span for rewrites too big to diff", () => {
    const words = (seed: string) => Array.from({ length: 1500 }, (_, i) => `${seed}${i}`).join(" ");
    const map = diffMap(doc("keep", words("a")), doc("keep", words("b")));
    expect(ranges(map).length).toBe(3);
    expect(map.map(1, 1)).toBe(1);
  });
});

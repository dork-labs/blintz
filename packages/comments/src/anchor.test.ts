/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import type { Node } from "@milkdown/kit/prose/model";

import { anchorFromRange, docText, locateAnchor, offsetAt, positionAt } from "./anchor";

const editors: Editor[] = [];
afterEach(async () => {
  for (const editor of editors.splice(0)) await editor.destroy();
});

async function docOf(markdown: string): Promise<Node> {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement("div"));
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(gfm);
  editors.push(editor);
  await editor.create();
  return editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
}

/** Document range of the first occurrence of `text`. */
function rangeOf(doc: Node, text: string) {
  const model = docText(doc);
  const start = model.text.indexOf(text);
  return { from: positionAt(model, start, "start")!, to: positionAt(model, start + text.length, "end")! };
}

describe("docText", () => {
  it("joins blocks with line breaks and counts atoms as one character", async () => {
    const doc = await docOf("# Title\n\nSome *styled* text ![i](x.png) here.\n\n- one\n- two\n");
    expect(docText(doc).text).toBe("Title\nSome styled text ￼ here.\none\ntwo");
  });

  it("maps offsets and positions both ways", async () => {
    const doc = await docOf("Alpha **beta** gamma\n\nDelta\n");
    const model = docText(doc);
    const { from, to } = rangeOf(doc, "beta gamma");
    expect(doc.textBetween(from, to)).toBe("beta gamma");
    expect(model.text.slice(offsetAt(model, from), offsetAt(model, to))).toBe("beta gamma");
  });
});

describe("anchors", () => {
  it("captures the quote with context and finds it exactly", async () => {
    const doc = await docOf("The quick brown fox jumps over the lazy dog.\n");
    const { from, to } = rangeOf(doc, "brown fox");
    const anchor = anchorFromRange(doc, from, to)!;
    expect(anchor).toMatchObject({ quote: "brown fox", prefix: "The quick ", suffix: " jumps over the lazy dog." });
    expect(locateAnchor(docText(doc), anchor)).toMatchObject({ match: "exact" });
  });

  it("finds a quote that moved after edits elsewhere", async () => {
    const before = await docOf("Intro.\n\nThe claim is strong.\n");
    const anchor = anchorFromRange(before, ...Object.values(rangeOf(before, "claim is strong")) as [number, number])!;
    const after = await docOf("A new first paragraph.\n\nIntro.\n\nThe claim is strong.\n");
    const found = locateAnchor(docText(after), anchor)!;
    expect(found.match).toBe("moved");
    expect(docText(after).text.slice(found.start, found.end)).toBe("claim is strong");
  });

  it("uses the context to pick the right one of several matches", async () => {
    const before = await docOf("First: the plan works.\n\nSecond: the plan fails.\n");
    const { from, to } = rangeOf(before, "Second: the plan");
    const anchor = anchorFromRange(before, from + "Second: ".length, to)!;
    expect(anchor.quote).toBe("the plan");
    const after = await docOf("Zero.\n\nFirst: the plan works.\n\nSecond: the plan fails.\n");
    const found = locateAnchor(docText(after), anchor)!;
    expect(docText(after).text.slice(found.start - 8, found.start)).toBe("Second: ");
  });

  it("reports text that is gone as not found", async () => {
    const before = await docOf("Keep this. Delete this part.\n");
    const anchor = anchorFromRange(before, ...Object.values(rangeOf(before, "Delete this part")) as [number, number])!;
    const after = await docOf("Keep this.\n");
    expect(locateAnchor(docText(after), anchor)).toBeNull();
  });

  it("refuses an anchor over no text", async () => {
    const doc = await docOf("One.\n\nTwo.\n");
    expect(anchorFromRange(doc, 5, 6)).toBeNull();
  });
});

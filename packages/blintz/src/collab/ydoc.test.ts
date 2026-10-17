// Plain Node: no DOM, no jsdom. This is the function DorkOS runs in a worker.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createMarkdownModel } from "../headless";
import { applyMarkdownToYDoc, readYDoc, yDocToMarkdown } from "./ydoc";

const DOC = "# Plan\n\nFirst paragraph.\n\nSecond paragraph, being typed in.\n\nThird.\n";

/** Two peers that exchange updates on demand. */
function peers() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };
  return { a, b, sync };
}

/** The Y.XmlText of the n-th top-level block (paragraph/heading). */
function blockText(ydoc: Y.Doc, index: number): Y.XmlText {
  const block = ydoc.getXmlFragment("prosemirror").get(index) as Y.XmlElement;
  return block.get(0) as Y.XmlText;
}

describe("applyMarkdownToYDoc (Node, no DOM)", () => {
  it("seeds an empty doc and reads back the same markdown", async () => {
    const model = await createMarkdownModel();
    const ydoc = new Y.Doc();
    applyMarkdownToYDoc(model, ydoc, DOC);
    expect(yDocToMarkdown(model, ydoc)).toBe(DOC);
  });

  it("changes nothing when the markdown is the same", async () => {
    const model = await createMarkdownModel();
    const ydoc = new Y.Doc();
    applyMarkdownToYDoc(model, ydoc, DOC);
    let updates = 0;
    ydoc.on("update", () => updates++);
    applyMarkdownToYDoc(model, ydoc, DOC);
    expect(updates).toBe(0);
  });

  it("merges an agent's whole-document write with someone typing elsewhere", async () => {
    const model = await createMarkdownModel();
    const { a, b, sync } = peers();
    applyMarkdownToYDoc(model, a, DOC);
    sync();
    // B (a person) types in the second paragraph, not yet synced…
    blockText(b, 2).insert("Second paragraph".length, " (still)");
    // …while A (the agent) rewrites the first paragraph from markdown.
    applyMarkdownToYDoc(model, a, DOC.replace("First paragraph.", "First paragraph, revised by the agent."));
    sync();
    const expected =
      "# Plan\n\nFirst paragraph, revised by the agent.\n\nSecond paragraph (still), being typed in.\n\nThird.\n";
    expect(yDocToMarkdown(model, a)).toBe(expected);
    expect(yDocToMarkdown(model, b)).toBe(expected);
  });

  it("keeps a cursor in an untouched block where it was", async () => {
    const model = await createMarkdownModel();
    const ydoc = new Y.Doc();
    applyMarkdownToYDoc(model, ydoc, DOC);
    const text = blockText(ydoc, 3);
    const cursor = Y.createRelativePositionFromTypeIndex(text, 3);
    applyMarkdownToYDoc(model, ydoc, DOC.replace("First paragraph.", "A different first line.\n\nAnd a new one."));
    const absolute = Y.createAbsolutePositionFromRelativePosition(cursor, ydoc)!;
    expect(absolute).not.toBeNull();
    expect((absolute.type as Y.XmlText).toString()).toBe("Third.");
    expect(absolute.index).toBe(3);
  });

  it("edits only the changed characters of a paragraph", async () => {
    const model = await createMarkdownModel();
    const { a, b, sync } = peers();
    applyMarkdownToYDoc(model, a, DOC);
    sync();
    // B types at the end of the paragraph the agent edits at its start.
    blockText(b, 2).insert(blockText(b, 2).length, " More.");
    applyMarkdownToYDoc(model, a, DOC.replace("Second paragraph, being", "The second paragraph, being"));
    sync();
    expect(yDocToMarkdown(model, a)).toContain("The second paragraph, being typed in. More.");
  });

  it("keeps edits made after an agent read when it writes against its base", async () => {
    const model = await createMarkdownModel();
    const ydoc = new Y.Doc();
    applyMarkdownToYDoc(model, ydoc, DOC);
    const read = readYDoc(model, ydoc);
    // Someone edits after the agent read (already merged on the server).
    blockText(ydoc, 2).insert("Second paragraph".length, " (person)");
    blockText(ydoc, 3).delete(0, 1);
    // The agent writes its change against what it read.
    applyMarkdownToYDoc(model, ydoc, read.markdown.replace("First paragraph.", "First, by the agent."), {
      base: read.base,
    });
    expect(yDocToMarkdown(model, ydoc)).toBe(
      "# Plan\n\nFirst, by the agent.\n\nSecond paragraph (person), being typed in.\n\nhird.\n",
    );
  });

  it("without a base, makes the doc equal the markdown", async () => {
    const model = await createMarkdownModel();
    const ydoc = new Y.Doc();
    applyMarkdownToYDoc(model, ydoc, DOC);
    blockText(ydoc, 2).insert(0, "Later ");
    applyMarkdownToYDoc(model, ydoc, DOC);
    expect(yDocToMarkdown(model, ydoc)).toBe(DOC);
  });

  it("keeps unaligned tables unaligned through Yjs", async () => {
    const model = await createMarkdownModel();
    const ydoc = new Y.Doc();
    const md = "| a | b |\n| - | - |\n| 1 | 2 |\n\nAfter.\n";
    applyMarkdownToYDoc(model, ydoc, md);
    const out = yDocToMarkdown(model, ydoc);
    expect(out).not.toContain(":-");
    expect(out).toBe(model.serialize(model.document(md)));
  });

  it("refuses a base from another copy of the document, and a malformed one", async () => {
    const model = await createMarkdownModel();
    const original = new Y.Doc();
    applyMarkdownToYDoc(model, original, DOC);
    const read = readYDoc(model, original);
    // The server restarts and rebuilds the document from saved markdown.
    const rebuilt = new Y.Doc();
    applyMarkdownToYDoc(model, rebuilt, DOC);
    expect(() => applyMarkdownToYDoc(model, rebuilt, DOC + "\nMore.\n", { base: read.base })).toThrow(
      /different copy/,
    );
    expect(rebuilt.store.pendingStructs).toBeNull();
    expect(() => applyMarkdownToYDoc(model, rebuilt, DOC, { base: new Uint8Array([1, 2, 3]) })).toThrow(
      /not a Yjs update/,
    );
  });

  it("returns a base for the next write, so a change is never applied twice", async () => {
    const model = await createMarkdownModel();
    const ydoc = new Y.Doc();
    applyMarkdownToYDoc(model, ydoc, DOC);
    let { base, markdown } = readYDoc(model, ydoc);
    markdown = markdown.replace("Third.", "Third 0.");
    ({ base } = applyMarkdownToYDoc(model, ydoc, markdown, { base }));
    markdown = markdown.replace("Third 0.", "Third 0 1.");
    applyMarkdownToYDoc(model, ydoc, markdown, { base });
    expect(yDocToMarkdown(model, ydoc)).toContain("Third 0 1.\n");
    expect(yDocToMarkdown(model, ydoc)).not.toContain("0 0");
  });
});

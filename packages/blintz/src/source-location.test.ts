/** @vitest-environment jsdom */
import { afterEach, expect, it } from "vitest";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  schemaCtx,
  remarkCtx,
} from "@milkdown/kit/core";
import { gfm } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "./features/empty-paragraphs";
import { frontmatterFeature } from "./features/frontmatter";
import { SourceController } from "./source-controller";
import { sourcePlugin } from "./source-plugin";
import { parseSource } from "./source-parser";
import { createRawCoordinateMap, rawRange } from "./source-location";
const editors: Editor[] = [];
afterEach(async () => {
  for (const editor of editors.splice(0)) await editor.destroy();
  document.body.replaceChildren();
});
async function fixture(text: string) {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = new SourceController();
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, text);
    })
    .use(commonmarkWithoutEmptyLinePreservation)
    .use(stripEmptyLineBreaks)
    .use(gfm)
    .use(sourcePlugin(controller));
  frontmatterFeature(editor);
  editors.push(editor);
  await editor.create();
  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  return { editor, controller, port: controller.port, view };
}
it.each(["", "\uFEFF"])(
  "retains exact BOM/CRLF/frontmatter/repeated nested task UTF-16 spans: %s",
  async (bom) => {
    const raw = `${bom}---\r\nname: test\r\n---\r\n\r\n- [ ] 🦉 café\r\n  - [X] repeated\r\n- [x] repeated\r\n\r\n\`\`\`md\r\n- [ ] not a task\r\n\`\`\`\r\n`;
    const h = await fixture(raw);
    expect(h.port.snapshot()).toMatchObject({
      kind: "mapped",
      value: { text: raw },
    });
    const tasks: number[] = [];
    h.view.state.doc.descendants((node, pos) => {
      if (node.type.name === "list_item" && node.attrs.checked !== null)
        tasks.push(pos);
    });
    expect(tasks).toHaveLength(3);
    for (const [index, pos] of tasks.entries()) {
      const result = h.port.taskAt(pos);
      expect(result.kind).toBe("mapped");
      if (result.kind !== "mapped") throw new Error("Task mapping absent");
      expect(
        raw.slice(result.value.marker.start, result.value.marker.end),
      ).toBe(["[ ]", "[X]", "[x]"][index]);
      expect(result.value.line).toBe([5, 6, 7][index]);
      expect(
        raw.slice(result.value.item.start, result.value.item.end),
      ).toContain("repeated");
    }
  },
);
it("selects exact Unicode text in either direction and refuses decoded entities/escaped text", async () => {
  const h = await fixture("**Unicode 🦉 café** and &amp; escaped \\* text\n");
  let pos = 0;
  h.view.state.doc.descendants((node, from) => {
    if (node.isText && node.text?.startsWith("Unicode")) pos = from;
  });
  h.view.dispatch(
    h.view.state.tr.setSelection(
      TextSelection.create(h.view.state.doc, pos + 12, pos),
    ),
  );
  const result = h.port.selection();
  expect(result).toMatchObject({
    kind: "mapped",
    value: { direction: "backward" },
  });
  if (result.kind === "mapped")
    expect(
      result.value.ranges
        .map((range) =>
          h.port.snapshot().kind === "mapped"
            ? "**Unicode 🦉 café** and &amp; escaped \\* text\n".slice(
                range.start,
                range.end,
              )
            : "",
        )
        .join(""),
    ).toBe("Unicode 🦉 c");
  h.view.dispatch(
    h.view.state.tr.setSelection(
      TextSelection.create(
        h.view.state.doc,
        pos,
        pos + h.view.state.doc.firstChild!.content.size,
      ),
    ),
  );
  expect(h.port.selection()).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
});
it("invalidates edits and stale generations; host raw rebinding preserves the model and selection", async () => {
  const h = await fixture("- [ ] original\n");
  const generation = h.port.generation();
  h.view.dispatch(h.view.state.tr.insertText("X", 5));
  expect(h.port.taskAt(0, generation)).toMatchObject({
    kind: "unavailable",
    reason: "stale",
  });
  expect(h.port.snapshot()).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
  const liveDoc = h.view.state.doc,
    selection = h.view.state.selection;
  expect(h.port.bindSource("unrelated\n", h.port.generation())).toMatchObject({
    kind: "unavailable",
    reason: "model-mismatch",
  });
  const current = h.editor.action((ctx) =>
    parseSource(ctx.get(schemaCtx), ctx.get(remarkCtx), "- [ ] orXiginal\n"),
  );
  expect(current.doc.eq(liveDoc)).toBe(true);
  expect(h.port.bindSource("- [ ] orXiginal\n", h.port.generation()).kind).toBe(
    "mapped",
  );
  expect(h.view.state.doc).toBe(liveDoc);
  expect(h.view.state.selection).toBe(selection);
  await h.editor.destroy();
  editors.pop();
  expect(h.port.taskAt(0)).toMatchObject({
    kind: "unavailable",
    reason: "disposed",
  });
});

it("maps plain marked/multiline spans and refuses transformed breaks, code and frontmatter selections", async () => {
  const h = await fixture(
    "---\nname: test\n---\n\n**same** and *same*\nnext 🦉\n\nFirst<br>Second\n\n```md\n- [ ] code\n```\n",
  );
  const textPositions: { text: string; pos: number }[] = [];
  h.view.state.doc.descendants((node, pos) => {
    if (node.isText) textPositions.push({ text: node.text!, pos });
  });
  const repeated = textPositions.filter((node) => node.text === "same");
  expect(repeated).toHaveLength(2);
  for (const node of repeated) {
    h.view.dispatch(
      h.view.state.tr.setSelection(
        TextSelection.create(h.view.state.doc, node.pos, node.pos + 4),
      ),
    );
    const result = h.port.selection();
    expect(result.kind).toBe("mapped");
    if (result.kind === "mapped")
      expect(
        result.value.ranges.map((range) =>
          h.port.snapshot().kind === "mapped"
            ? "---\nname: test\n---\n\n**same** and *same*\nnext 🦉\n\nFirst<br>Second\n\n```md\n- [ ] code\n```\n".slice(
                range.start,
                range.end,
              )
            : "",
        ),
      ).toEqual(["same"]);
  }
  const first = textPositions.find((node) => node.text === "First")!,
    second = textPositions.find((node) => node.text === "Second")!;
  h.view.dispatch(
    h.view.state.tr.setSelection(
      TextSelection.create(h.view.state.doc, first.pos, second.pos + 6),
    ),
  );
  expect(h.port.selection()).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
  for (const node of textPositions.filter(
    (node) => node.text.includes("name:") || node.text.includes("[ ] code"),
  )) {
    h.view.dispatch(
      h.view.state.tr.setSelection(
        TextSelection.create(
          h.view.state.doc,
          node.pos,
          node.pos + node.text.length,
        ),
      ),
    );
    expect(h.port.selection()).toMatchObject({
      kind: "unavailable",
      reason: "unmapped",
    });
  }
});

it("indexes literal UTF-16 points with exact legacy CR/LF boundary semantics", () => {
  for (const text of [
    "",
    "\uFEFF🦉a\r\nb\rc\n",
    "\r\n\r\n",
    "é🦉\nlast",
    "a\rb\r",
    "a\nb\n",
  ]) {
    const coordinates = createRawCoordinateMap(text);
    const point = (offset: number) => {
      const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
      return { line: lines.length, column: lines.at(-1)!.length + 1 };
    };
    for (let start = 0; start <= text.length; start++) {
      for (let end = start; end <= text.length; end++) {
        const a = point(start),
          b = point(end);
        const expected = {
          start,
          end,
          startLine: a.line,
          startColumn: a.column,
          endLine: b.line,
          endColumn: b.column,
        };
        expect(coordinates.range(start, end)).toEqual(expected);
        expect(rawRange(text, start, end)).toEqual(expected);
      }
    }
  }
});

it("keeps coordinate indices independent across alternating source snapshots", () => {
  const first = createRawCoordinateMap("\uFEFF- [ ] 🦉\r\n- [ ] repeated\r\n");
  const other = createRawCoordinateMap("other\nsource\n");
  expect(first.range(11, 14)).toEqual({
    start: 11,
    end: 14,
    startLine: 2,
    startColumn: 1,
    endLine: 2,
    endColumn: 4,
  });
  expect(other.range(6, 12)).toEqual({
    start: 6,
    end: 12,
    startLine: 2,
    startColumn: 1,
    endLine: 2,
    endColumn: 7,
  });
  expect(first.range(11, 14).startLine).toBe(2);
});

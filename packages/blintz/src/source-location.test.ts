/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  schemaCtx,
  remarkCtx,
  nodesCtx,
  prosePluginsCtx,
  editorStateTimerCtx,
  SchemaReady,
  ParserReady,
} from "@milkdown/kit/core";
import {
  headingIdGenerator,
  headingSchema,
} from "@milkdown/kit/preset/commonmark";
import { Ctx, Clock, Container } from "@milkdown/kit/ctx";
import { Plugin } from "@milkdown/kit/prose/state";
import { Schema } from "@milkdown/kit/prose/model";
import type { NodeSpec } from "@milkdown/kit/prose/model";
import { matchesHeadingSpec } from "./source-model";
import { gfm } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "./features/empty-paragraphs";
import { frontmatterFeature } from "./features/frontmatter";
import { SourceController } from "./source-controller";
import { sourcePlugin, sourceEditorAssembly } from "./source-plugin";
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

async function headingFixture(
  raw: string,
  extensions: readonly unknown[] = [],
  configure?: (ctx: Ctx) => void,
) {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = new SourceController();
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, raw);
      configure?.(ctx);
    })
    .use(sourceEditorAssembly(controller, extensions))
    .use(gfm);
  editors.push(editor);
  await editor.create();
  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  return { editor, view, controller, port: controller.port };
}
it("maps default heading IDs, duplicate IDs and exact UTF-16 raw selection without changing the document", async () => {
  const raw = "\ufeff# Café😀\r\n\r\n# Café😀\r\n\r\n- [ ] task\r\n";
  const h = await headingFixture(raw);
  expect(h.view.state.doc.child(0).attrs.id).toBe("café😀");
  expect(h.view.state.doc.child(1).attrs.id).toBe("café😀-#2");
  expect(h.port.snapshot()).toMatchObject({
    kind: "mapped",
    value: { text: raw },
  });
  const document = h.view.state.doc,
    selection = h.view.state.selection;
  expect(h.port.bindSource(raw, h.port.generation()).kind).toBe("mapped");
  expect(h.view.state.doc).toBe(document);
  expect(h.view.state.selection).toBe(selection);
  h.view.dispatch(
    h.view.state.tr.setSelection(TextSelection.create(document, 1, 7)),
  );
  const result = h.port.selection();
  expect(result.kind).toBe("mapped");
  if (result.kind === "mapped")
    expect(result.value.ranges.map((r) => raw.slice(r.start, r.end))).toEqual([
      "Café😀",
    ]);
});
it("does not restore invalidated heading evidence after an edit or undo to the original model", async () => {
  const h = await headingFixture("# Original\n");
  const original = h.view.state.doc;
  const generation = h.port.generation();
  h.view.dispatch(h.view.state.tr.insertText("X", 2));
  expect(h.port.snapshot()).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
  h.view.dispatch(
    h.view.state.tr.replaceWith(
      0,
      h.view.state.doc.content.size,
      original.content,
    ),
  );
  expect(h.port.snapshot()).toMatchObject({
    kind: "unavailable",
    reason: "unmapped",
  });
  expect(h.port.selection(generation)).toMatchObject({
    kind: "unavailable",
    reason: "stale",
  });
  expect(h.port.bindSource("# Original\n", h.port.generation()).kind).toBe(
    "mapped",
  );
});
it("refuses derived mapping for consumer extensions and a replacement generator, but retains raw equality", async () => {
  const h = await headingFixture("# Heading\n", [{}]);
  expect(h.port.bindSource("# Heading\n", h.port.generation())).toMatchObject({
    kind: "unavailable",
    reason: "model-mismatch",
  });
  const owned = await headingFixture("# Owned\n");
  owned.editor.action((ctx) => ctx.set(headingIdGenerator.key, () => "custom"));
  expect(
    owned.port.bindSource("# Owned\n", owned.port.generation()),
  ).toMatchObject({ kind: "unavailable", reason: "model-mismatch" });
  const plain = await headingFixture("Paragraph\n", [{}]);
  expect(plain.port.snapshot().kind).toBe("mapped");
});
it("keeps overlapping editor registrations separate and invokes each original node runner once", async () => {
  const original = headingSchema.node;
  const calls: object[] = [],
    registrations: object[] = [];
  const cleanups: object[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(headingSchema, "node").mockImplementation((ctx) => {
    const runner = original(ctx);
    return () => {
      calls.push(ctx);
      const result = runner();
      registrations.push(
        ctx.get(nodesCtx).find(([name]) => name === "heading")![1],
      );
      return Promise.resolve(result).then(async (cleanup) => {
        await held;
        return () => {
          cleanups.push(ctx);
          if (typeof cleanup === "function") return cleanup();
        };
      });
    };
  });
  const index = commonmarkWithoutEmptyLinePreservation.indexOf(original);
  expect(index).toBeGreaterThanOrEqual(0);
  commonmarkWithoutEmptyLinePreservation[index] = headingSchema.node;
  try {
    const creating = Promise.all([
      headingFixture("# First\n"),
      headingFixture("# Second\n"),
    ]);
    await vi.waitFor(() => expect(registrations).toHaveLength(2));
    expect(calls).toHaveLength(2);
    release();
    const [a, b] = await creating;
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toBe(calls[1]);
    expect(registrations[0]).not.toBe(registrations[1]);
    expect(a.view.state.schema).not.toBe(b.view.state.schema);
    expect(a.port.bindSource("# First\n", a.port.generation()).kind).toBe(
      "mapped",
    );
    expect(b.port.bindSource("# Second\n", b.port.generation()).kind).toBe(
      "mapped",
    );
    await a.editor.destroy();
    editors.splice(editors.indexOf(a.editor), 1);
    expect(a.port.snapshot()).toMatchObject({
      kind: "unavailable",
      reason: "disposed",
    });
    expect(cleanups).toHaveLength(1);
    expect(b.port.bindSource("# Second\n", b.port.generation()).kind).toBe(
      "mapped",
    );
  } finally {
    release();
    commonmarkWithoutEmptyLinePreservation[index] = original;
    spy.mockRestore();
  }
});
it("requires exact native core spec references and ordered transformed rules, refusing getters", () => {
  const symbol = Symbol("extension");
  const fn: NonNullable<NodeSpec["toDOM"]> = () => ["h1", 0];
  const rule = { tag: "h1", priority: 7 },
    other = { tag: "h2" };
  const spec = {
    content: "inline*",
    priority: 4,
    parseDOM: [rule, other],
    toDOM: fn,
    [symbol]: fn,
  };
  const actual = {
    ...spec,
    parseDOM: spec.parseDOM.map((r) => ({ priority: spec.priority, ...r })),
  };
  expect(matchesHeadingSpec(spec, actual)).toBe(true);
  expect(matchesHeadingSpec(spec, { ...actual, toDOM: () => ["h1", 0] })).toBe(
    false,
  );
  expect(
    matchesHeadingSpec(spec, {
      ...actual,
      parseDOM: [...actual.parseDOM].reverse(),
    }),
  ).toBe(false);
  let calls = 0;
  const getter = Object.defineProperty({ ...actual }, "toDOM", {
    enumerable: true,
    get() {
      calls++;
      return fn;
    },
  });
  expect(matchesHeadingSpec(spec, getter)).toBe(false);
  expect(calls).toBe(0);
});
it("refuses inherited slug behavior without changing the upstream resulting IDs", async () => {
  const h = await headingFixture("# constructor\n");
  expect(
    h.port.bindSource("# constructor\n", h.port.generation()),
  ).toMatchObject({ kind: "unavailable", reason: "model-mismatch" });
});

it("refuses changed non-ID heading attributes and a replaced registered spec", async () => {
  const h = await headingFixture("# Original\n");
  const heading = h.view.state.doc.firstChild!;
  h.view.dispatch(
    h.view.state.tr.setNodeMarkup(0, undefined, { ...heading.attrs, level: 2 }),
  );
  expect(h.port.bindSource("# Original\n", h.port.generation())).toMatchObject({
    kind: "unavailable",
    reason: "model-mismatch",
  });
  const other = await headingFixture("# Other\n");
  other.editor.action((ctx) =>
    ctx.update(nodesCtx, (entries) =>
      entries.map(([name, spec]) => [
        name,
        name === "heading" ? { ...spec } : spec,
      ]),
    ),
  );
  expect(
    other.port.bindSource("# Other\n", other.port.generation()),
  ).toMatchObject({ kind: "unavailable", reason: "model-mismatch" });
});

it("refuses replacement current Schema and replacement native plugin identity", async () => {
  const h = await headingFixture("# Schema\n");
  h.editor.action((ctx) =>
    ctx.set(schemaCtx, new Schema(h.view.state.schema.spec)),
  );
  expect(h.port.bindSource("# Schema\n", h.port.generation())).toMatchObject({
    kind: "unavailable",
    reason: "model-mismatch",
  });
  const other = await headingFixture("# Plugin\n");
  const native = other.view.state.plugins.find((plugin) => {
    const key = plugin.spec.key;
    const value = key && Object.getOwnPropertyDescriptor(key, "key")?.value;
    return (
      typeof value === "string" && value.startsWith("MILKDOWN_HEADING_ID$")
    );
  });
  expect(native).toBeDefined();
  other.view.updateState(
    other.view.state.reconfigure({
      plugins: other.view.state.plugins.map((plugin) =>
        plugin === native ? new Plugin(plugin.spec) : plugin,
      ),
    }),
  );
  expect(
    other.port.bindSource("# Plugin\n", other.port.generation()),
  ).toMatchObject({ kind: "unavailable", reason: "model-mismatch" });
  const raw = await headingFixture("Plain\n");
  expect(raw.port.bindSource("Plain\n", raw.port.generation()).kind).toBe(
    "mapped",
  );
});

// A real Milkdown Ctx/Clock runs the actual injected default factory and native
// heading node runner. This isolates failure cleanup without Editor.create's
// upstream OnCreate polling loop after a rejected plugin. It never publishes a
// ready mapping, fabricates a schema policy, or reaches an editor view.
function runnerHarness(controller: SourceController) {
  const ctx = new Ctx(new Container(), new Clock());
  ctx
    .inject(nodesCtx, [])
    .inject(prosePluginsCtx, [])
    .inject(editorStateTimerCtx, []);
  ctx.record(SchemaReady).record(ParserReady);
  const assembly = sourceEditorAssembly(controller, []);
  const index = (plugin: import("@milkdown/kit/ctx").MilkdownPlugin) =>
    commonmarkWithoutEmptyLinePreservation.indexOf(plugin);
  const generator = assembly[index(headingIdGenerator)]!(ctx);
  const factory = assembly[index(headingSchema.ctx)]!(ctx);
  const node = assembly[index(headingSchema.node)]!(ctx);
  const source = assembly.at(-1)!(ctx);
  return { ctx, generator, factory, node, source };
}
it("failed ParserReady retains the original cause and delegates native node cleanup exactly once", async () => {
  const original = headingSchema.node,
    index = commonmarkWithoutEmptyLinePreservation.indexOf(original);
  const cause = new Error("actual held parser readiness failure");
  const cleanupCause = new Error("secondary native cleanup failure");
  let cleanups = 0;
  const spy = vi.spyOn(headingSchema, "node").mockImplementation((ctx) => {
    const runner = original(ctx);
    return async () => {
      const cleanup = await runner();
      return async () => {
        cleanups++;
        if (typeof cleanup === "function") await cleanup();
        throw cleanupCause;
      };
    };
  });
  commonmarkWithoutEmptyLinePreservation[index] = headingSchema.node;
  let restoreWait: (() => void) | undefined;
  try {
    const controller = new SourceController(),
      h = runnerHarness(controller);
    const generatorCleanup = await h.generator(),
      factoryCleanup = await h.factory(),
      nodeCleanup = await h.node();
    const nativeWait = h.ctx.wait;
    const wait = vi
      .spyOn(h.ctx, "wait")
      .mockImplementation((timer) =>
        timer === ParserReady ? Promise.reject(cause) : nativeWait(timer),
      );
    restoreWait = () => wait.mockRestore();
    h.ctx.inject(
      schemaCtx,
      new Schema({ nodes: { doc: { content: "text*" }, text: {} } }),
    );
    h.ctx.done(SchemaReady);
    await expect(h.source()).rejects.toBe(cause);
    expect(cleanups).toBe(1);
    expect(h.ctx.get(nodesCtx)).toEqual([]);
    expect(controller.port.snapshot()).toMatchObject({
      kind: "unavailable",
      reason: "disposed",
    });
    if (typeof nodeCleanup === "function") await nodeCleanup();
    expect(cleanups).toBe(1);
    if (typeof factoryCleanup === "function") await factoryCleanup();
    if (typeof generatorCleanup === "function") await generatorCleanup();
  } finally {
    restoreWait?.();
    commonmarkWithoutEmptyLinePreservation[index] = original;
    spy.mockRestore();
  }
});
it("late native runner continuation cleans up once after source readiness has already retired the lifetime", async () => {
  const original = headingSchema.node,
    index = commonmarkWithoutEmptyLinePreservation.indexOf(original);
  const cause = new Error("actual schema readiness failure");
  let release!: () => void,
    cleanups = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(headingSchema, "node").mockImplementation((ctx) => {
    const runner = original(ctx);
    return async () => {
      const cleanup = await runner();
      await held;
      return async () => {
        cleanups++;
        if (typeof cleanup === "function") await cleanup();
      };
    };
  });
  commonmarkWithoutEmptyLinePreservation[index] = headingSchema.node;
  let restoreWait: (() => void) | undefined;
  try {
    const controller = new SourceController(),
      h = runnerHarness(controller);
    const generatorCleanup = await h.generator(),
      factoryCleanup = await h.factory();
    const nodeResult = Promise.resolve(h.node());
    expect(
      h.ctx.get(nodesCtx).find(([name]) => name === "heading"),
    ).toBeDefined();
    const nativeWait = h.ctx.wait;
    const wait = vi
      .spyOn(h.ctx, "wait")
      .mockImplementation((timer) =>
        timer === SchemaReady ? Promise.reject(cause) : nativeWait(timer),
      );
    restoreWait = () => wait.mockRestore();
    await expect(h.source()).rejects.toBe(cause);
    expect(controller.port.snapshot()).toMatchObject({
      kind: "unavailable",
      reason: "disposed",
    });
    expect(cleanups).toBe(0);
    release();
    const nodeCleanup = await nodeResult;
    expect(cleanups).toBe(1);
    expect(h.ctx.get(nodesCtx)).toEqual([]);
    if (typeof nodeCleanup === "function") await nodeCleanup();
    expect(cleanups).toBe(1);
    if (typeof factoryCleanup === "function") await factoryCleanup();
    if (typeof generatorCleanup === "function") await generatorCleanup();
  } finally {
    release();
    restoreWait?.();
    commonmarkWithoutEmptyLinePreservation[index] = original;
    spy.mockRestore();
  }
});

it("refuses stale outer LF rebinding after a genuine Remark callback installs newer CRLF mapping", async () => {
  const outerRaw = "Café😀\n",
    innerRaw = "Café😀\r\n";
  let armed = false,
    nested = false;
  let inner: ReturnType<SourceController["port"]["bindSource"]> | undefined;
  let h: Awaited<ReturnType<typeof headingFixture>>;
  let generation = "";
  h = await headingFixture(outerRaw, [], (ctx) => {
    ctx.get(remarkCtx).use(() => () => {
      if (!armed || nested) return;
      nested = true;
      try {
        inner = h.port.bindSource(innerRaw, generation);
      } finally {
        nested = false;
      }
    });
  });
  generation = h.port.generation();
  const view = h.view,
    document = view.state.doc;
  armed = true;
  expect(h.port.bindSource(outerRaw, generation)).toEqual({
    kind: "unavailable",
    reason: "stale",
  });
  armed = false;
  expect(inner).toMatchObject({ kind: "mapped", value: { text: innerRaw } });
  expect(h.port.generation()).not.toBe(generation);
  expect(h.port.snapshot()).toMatchObject({
    kind: "mapped",
    value: { text: innerRaw },
  });
  expect(h.view).toBe(view);
  expect(h.view.state.doc).toBe(document);
  h.view.dispatch(
    h.view.state.tr.setSelection(TextSelection.create(document, 1, 7)),
  );
  const selection = h.port.selection();
  expect(selection.kind).toBe("mapped");
  if (selection.kind === "mapped")
    expect(
      selection.value.ranges.map((range) =>
        innerRaw.slice(range.start, range.end),
      ),
    ).toEqual(["Café😀"]);
  expect(h.port.bindSource(innerRaw, h.port.generation()).kind).toBe("mapped");
});
it("returns disposed when a genuine configured Remark callback destroys the actual editor view during bind", async () => {
  let armed = false;
  let h: Awaited<ReturnType<typeof headingFixture>>;
  h = await headingFixture("Paragraph\n", [], (ctx) => {
    ctx.get(remarkCtx).use(() => () => {
      if (!armed) return;
      armed = false;
      ctx.get(editorViewCtx).destroy();
    });
  });
  const generation = h.port.generation();
  armed = true;
  expect(h.port.bindSource("Paragraph\r\n", generation)).toEqual({
    kind: "unavailable",
    reason: "disposed",
  });
  expect(h.view.isDestroyed).toBe(true);
  expect(h.port.snapshot()).toEqual({
    kind: "unavailable",
    reason: "disposed",
  });
});

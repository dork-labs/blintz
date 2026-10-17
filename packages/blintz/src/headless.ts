import {
  commands,
  CommandsReady,
  config,
  editorViewCtx,
  init,
  keymap,
  KeymapReady,
  parser,
  ParserReady,
  parserCtx,
  pasteRule,
  remarkCtx,
  PasteRulesReady,
  schema,
  schemaCtx,
  serializer,
  SerializerReady,
  serializerCtx,
  type Editor,
} from "@milkdown/kit/core";
import { Clock, Container, Ctx, type MilkdownPlugin } from "@milkdown/kit/ctx";
import { gfm } from "@milkdown/kit/preset/gfm";
import { tableCellNullAlignment, tableHeaderNullAlignment } from "./features/table/alignment";
import type { Node, Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { trailingConfig } from "@milkdown/kit/plugin/trailing";
import { headingIdGenerator } from "@milkdown/kit/preset/commonmark";

import type { RawSourceRange } from "./source-location";
import { mapRawRange, mapSourceRange, parseSource } from "./source-parser";

import { embedGrammarFeature } from "./features/embeds/grammar-feature";
import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "./features/empty-paragraphs";
import { frontmatterFeature } from "./features/frontmatter";
import { imageBlockConfig, inlineImageConfig } from "./features/image-block/config";
import { remarkImageBlockPlugin } from "./features/image-block/remark-plugin";
import { imageBlockSchema } from "./features/image-block/schema";
import { remarkMathBlockPlugin, remarkMathPlugin } from "./features/latex/remark";
import { blockLatexSchema, mathInlineSchema } from "./features/latex/schema";
import { remarkWikiLinksPlugin, wikiLinkSchema } from "./features/wiki-links/schema";

/**
 * Blintz's document model without an editor: the same ProseMirror schema and
 * markdown parser and serializer `<MarkdownEditor>` uses, built with no view,
 * no DOM and no React, so it runs on a server or in a worker. Every call
 * builds an independent instance.
 */
export interface MarkdownModel {
  /** The editor's ProseMirror schema (same node and mark names and attrs). */
  schema: Schema;
  /** Parse markdown into a document, exactly as the editor's parser does. */
  parse(markdown: string): Node;
  /**
   * The document exactly as a live editor holds it after loading `markdown`:
   * parsed, with the heading ids and the trailing empty paragraph the editor
   * adds. Use this (not `parse`) for anything synced with live editors.
   */
  document(markdown: string): Node;
  /** Serialize a document to markdown, exactly as the editor does. */
  serialize(doc: Node): string;
  /**
   * `document(markdown)` together with where its text came from in
   * `markdown`, mapped the way the editor's source port maps (`range`).
   */
  source(markdown: string): MarkdownSource;
}

/** A document and the mapping between its positions and the markdown it was parsed from. */
export interface MarkdownSource {
  /** The markdown, as given. */
  text: string;
  /** Equal to `document(text)`. */
  doc: Node;
  /**
   * The raw ranges the document range `[from, to)` came from, with the same
   * evidence rules as the editor's `MarkdownSourcePort.range`: `null` when any
   * part of it has no exact source (atoms such as wiki links, escapes,
   * entities, code), or when it spans more than 100 text runs.
   */
  toSource(from: number, to: number): RawSourceRange[] | null;
  /**
   * The document range of the text inside the raw range `[start, end)`, and
   * of any atom it covers whole. Ends inside markdown syntax snap inward to
   * the nearest text. Text with no exact source (an escape, an entity, code)
   * counts only whole: `null` when an end falls inside it, and when nothing
   * mapped lies inside.
   */
  fromSource(start: number, end: number): { from: number; to: number } | null;
}

type Use = MilkdownPlugin | MilkdownPlugin[];

/** Collects what a feature registers, without an editor. */
function collect(register: (editor: Editor) => void) {
  const plugins: MilkdownPlugin[] = [];
  const configs: Array<(ctx: Ctx) => void | Promise<void>> = [];
  const recorder = {
    use(plugin: Use) {
      plugins.push(...[plugin].flat());
      return recorder;
    },
    config(fn: (ctx: Ctx) => void | Promise<void>) {
      configs.push(fn);
      return recorder;
    },
  };
  register(recorder as unknown as Editor);
  return { plugins, configs };
}

/** The grammar every `<MarkdownEditor>` loads: no views, no editing chrome. */
function registerGrammar(editor: Editor): void {
  editor
    .use(commonmarkWithoutEmptyLinePreservation)
    .use(stripEmptyLineBreaks)
    .use(gfm)
      .use(tableCellNullAlignment)
      .use(tableHeaderNullAlignment)
    .use(remarkMathPlugin)
    .use(remarkMathBlockPlugin)
    .use(mathInlineSchema)
    .use(blockLatexSchema)
    .use(imageBlockConfig)
    .use(inlineImageConfig)
    .use(imageBlockSchema)
    .use(remarkImageBlockPlugin)
    .use(remarkWikiLinksPlugin)
    .use(wikiLinkSchema);
  frontmatterFeature(editor);
  embedGrammarFeature(editor);
}

/**
 * Milkdown's readiness timers signal each other through the global
 * `addEventListener` / `dispatchEvent` (browsers and Deno have them; Node and
 * worker threads have `EventTarget` but not these globals). When they're
 * missing, install them, backed by one private `EventTarget`. They have to
 * stay: every timer later calls `removeEventListener` from a timeout.
 * Nothing else is added, and nothing is replaced when present.
 */
function ensureTimerEvents(): void {
  const scope = globalThis as unknown as Partial<
    Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent">
  >;
  if (typeof scope.addEventListener === "function" && typeof scope.dispatchEvent === "function") return;
  const target = new EventTarget();
  // Every model waits on a few timers at once; Node warns past 10 listeners.
  const events = (globalThis as { process?: { getBuiltinModule?: (id: string) => { setMaxListeners?: (n: number, ...t: EventTarget[]) => void } | undefined } }).process?.getBuiltinModule?.("node:events");
  events?.setMaxListeners?.(0, target);
  scope.addEventListener = target.addEventListener.bind(target);
  scope.removeEventListener = target.removeEventListener.bind(target);
  scope.dispatchEvent = target.dispatchEvent.bind(target);
}

/**
 * Build a {@link MarkdownModel}. Milkdown's `Editor` always creates a view,
 * which needs a DOM, so this runs Milkdown's schema, parser and serializer
 * plugins on a bare context instead.
 */
export async function createMarkdownModel(): Promise<MarkdownModel> {
  ensureTimerEvents();
  const { plugins, configs } = collect(registerGrammar);
  const ctx = new Ctx(new Container(), new Clock());
  // commonmark's paragraph serializer reads the live document from the view
  // (to spot the last paragraph); a headless model has none, so it holds the
  // document being serialized.
  ctx.inject(editorViewCtx, { state: { doc: null } } as never);
  const core: MilkdownPlugin[] = [
    schema,
    parser,
    serializer,
    commands,
    keymap,
    pasteRule,
    init({} as Editor),
    config(async (configCtx) => {
      for (const fn of configs) await fn(configCtx);
    }),
  ];
  const handlers = [...core, ...plugins].map((plugin) => plugin(ctx.produce()));
  // A timer's "done" is an event: start waiting before anything runs, or a
  // fast plugin's signal goes unheard. Waiting on commands, keymaps and
  // paste rules too means no timer is left pending on this context.
  const ready = Promise.all(
    [ParserReady, SerializerReady, CommandsReady, KeymapReady, PasteRulesReady].map((timer) => ctx.wait(timer)),
  );
  for (const handler of handlers) {
    void Promise.resolve()
      .then(() => handler?.())
      .catch(() => undefined);
  }
  await ready;
  const parse = ctx.get(parserCtx);
  const serialize = ctx.get(serializerCtx);
  const schemaValue = ctx.get(schemaCtx);
  const getId = ctx.get(headingIdGenerator.key);
  const { shouldAppend, getNode } = trailingConfig.key._defaultValue;
  const remark = ctx.get(remarkCtx);
  // What the editor adds after parsing; positions never move.
  const finish = (parsed: Node): Node => {
    let doc = parsed;
    // commonmark's heading-id sync: the generator's id, `-#n` for repeats.
    const ids: Record<string, number> = {};
    const tr = EditorState.create({ schema: schemaValue, doc }).tr;
    doc.descendants((node, pos) => {
      if (node.type.name !== "heading" || node.textContent.trim().length === 0) return;
      let id = getId(node);
      const seen = ids[id];
      if (seen) {
        ids[id] = seen + 1;
        id += `-#${seen + 1}`;
      } else ids[id] = 1;
      if (node.attrs.id !== id) tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
    });
    doc = tr.doc;
    // The trailing plugin's default: an empty paragraph after a final block
    // that isn't a paragraph or heading.
    const state = EditorState.create({ schema: schemaValue, doc });
    if (shouldAppend(doc.lastChild, state)) {
      doc = state.tr.insert(doc.content.size, getNode(state)).doc;
    }
    return doc;
  };
  const document = (markdown: string): Node => finish(parse(markdown));
  return {
    schema: ctx.get(schemaCtx),
    parse: (markdown) => parse(markdown),
    document,
    serialize: (doc) => {
      ctx.set(editorViewCtx, { state: { doc } } as never);
      return serialize(doc);
    },
    source: (markdown) => {
      const parsed = parseSource(schemaValue, remark, markdown);
      const doc = finish(parsed.doc);
      return {
        text: markdown,
        doc,
        toSource: (from, to) =>
          Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from <= to && to <= doc.content.size
            ? mapSourceRange(parsed, doc, from, to)
            : null,
        fromSource: (start, end) => mapRawRange(parsed, start, end),
      };
    },
  };
}

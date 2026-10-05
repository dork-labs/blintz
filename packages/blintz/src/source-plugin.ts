import {
  createSlice,
  createTimer,
  type MilkdownPlugin,
} from "@milkdown/kit/ctx";
import {
  ParserReady,
  SchemaReady,
  nodesCtx,
  parserCtx,
  schemaCtx,
  remarkCtx,
  editorStateTimerCtx,
  prosePluginsCtx,
} from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import type { Node, Schema, NodeSpec } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { trailingConfig, trailingPlugin, type TrailingConfigOptions } from "@milkdown/kit/plugin/trailing";
import {
  headingIdGenerator,
  headingSchema,
  syncHeadingIdPlugin,
} from "@milkdown/kit/preset/commonmark";
import { commonmarkWithoutEmptyLinePreservation } from "./features/empty-paragraphs";
import {
  matchesHeadingSpec,
  matchesDerivedHeadingDocument,
} from "./source-model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { parseSource, reconcileSourceTerminalSpace, type ParsedSource } from "./source-parser";
import type { SourceController } from "./source-controller";
type AssemblyLifetime = {
  phase: "pending" | "ready" | "disposed";
  parserReady?: boolean;
  ctx?: Ctx;
  generator?: ReturnType<Ctx["get"]>;
  factory?: ReturnType<Ctx["get"]>;
  registered?: NodeSpec & { priority?: number };
  schema?: Schema;
  plugin?: Plugin;
  nodeCleanup?: () => void | Promise<void>;
  extensions: boolean;
  trailing?: { config: TrailingConfigOptions; plugin?: Plugin; shouldAppend: unknown; getNode: unknown };
};
type OwnedAssembly =
  | { phase: "pending"; value: AssemblyLifetime }
  | {
      phase: "ready";
      value: AssemblyLifetime;
      ctx: Ctx;
      schema: Schema;
      registered: NodeSpec & { priority?: number };
      plugin: Plugin;
      generator: unknown;
      factory: unknown;
      extensions: boolean;
    }
  | { phase: "disposed"; value: AssemblyLifetime };
const owned = new WeakMap<SourceController, OwnedAssembly>();
// Retain the installed engine's default functions before any editor config runs.
const defaultTrailingShouldAppend = trailingConfig.key._defaultValue.shouldAppend;
const defaultTrailingGetNode = trailingConfig.key._defaultValue.getNode;
function finishReady(controller: SourceController, value: AssemblyLifetime) {
  if (
    owned.get(controller)?.value !== value ||
    value.phase === "disposed" ||
    !value.parserReady ||
    !value.ctx ||
    !value.schema ||
    !value.registered ||
    !value.plugin ||
    !value.generator ||
    !value.factory
  )
    return;
  value.phase = "ready";
  owned.set(controller, {
    phase: "ready",
    value,
    ctx: value.ctx,
    schema: value.schema,
    registered: value.registered,
    plugin: value.plugin,
    generator: value.generator,
    factory: value.factory,
    extensions: value.extensions,
  });
}

/** Terminal lexical reconstruction belongs only to the captured built-in parser/schema assembly. */
function ownsOriginalTextAssembly(controller: SourceController, state: EditorState): boolean {
  const value = owned.get(controller);
  if (!value || value.phase !== "ready" || value.extensions || !value.ctx || !value.schema ||
      !value.registered || !value.plugin) return false;
  try {
    const heading = value.schema.nodes.heading;
    return !!heading && state.schema === value.schema && value.ctx.get(schemaCtx) === value.schema &&
      value.ctx.get(headingIdGenerator.key) === value.generator && value.ctx.get(headingSchema.key) === value.factory &&
      value.ctx.get(nodesCtx).find(([name]) => name === "heading")?.[1] === value.registered &&
      state.plugins.includes(value.plugin) && matchesHeadingSpec(value.registered, heading.spec);
  } catch { return false; }
}
/** Read-only internal comparison; no caller may publish an assembly. */
export function matchesSourceDocument(
  controller: SourceController,
  parsed: Node,
  state: EditorState,
): boolean {
  if (parsed.eq(state.doc)) return true;
  const value = owned.get(controller);
  if (
    !value ||
    value.phase !== "ready" ||
    value.extensions ||
    !value.ctx ||
    !value.schema ||
    !value.registered ||
    !value.plugin
  )
    return false;
  try {
    const ctx = value.ctx,
      heading = value.schema.nodes.heading;
    if (
      state.schema !== value.schema ||
      ctx.get(schemaCtx) !== value.schema ||
      !heading ||
      ctx.get(headingIdGenerator.key) !== value.generator ||
      ctx.get(headingSchema.key) !== value.factory ||
      ctx.get(nodesCtx).find(([name]) => name === "heading")?.[1] !==
        value.registered ||
      !state.plugins.includes(value.plugin) ||
      !matchesHeadingSpec(value.registered, heading.spec)
    )
      return false;
    let actual = state.doc;
    const trailing = value.value.trailing;
    if (
      trailing?.plugin && state.plugins.includes(trailing.plugin) &&
      ctx.get(trailingConfig.key) === trailing.config &&
      trailing.config.shouldAppend === trailing.shouldAppend &&
      trailing.config.getNode === trailing.getNode &&
      trailing.shouldAppend === defaultTrailingShouldAppend &&
      trailing.getNode === defaultTrailingGetNode &&
      parsed.childCount + 1 === actual.childCount &&
      parsed.lastChild && !["heading", "paragraph"].includes(parsed.lastChild.type.name) &&
      actual.lastChild?.eq(state.schema.nodes.paragraph!.create())
    ) actual = actual.copy(actual.content.cut(0, actual.content.size - actual.lastChild!.nodeSize));
    return matchesDerivedHeadingDocument(parsed, actual, heading);
  } catch {
    return false;
  }
}

/** Only the actual hook's built-in assembly invokes this internal factory. */
export function sourceEditorAssembly(
  controller: SourceController,
  extensions: readonly unknown[],
  includeTrailing = false,
): MilkdownPlugin[] {
  const value: AssemblyLifetime = {
    phase: "pending",
    extensions: extensions.length !== 0,
  };
  owned.set(controller, { phase: "pending", value });
  const retire = () => {
    value.phase = "disposed";
    if (owned.get(controller)?.value === value) owned.delete(controller);
  };
  const captureInjection =
    (original: MilkdownPlugin, kind: "generator" | "factory"): MilkdownPlugin =>
    (ctx) => {
      try {
        const runner = original(ctx);
        value.ctx = ctx;
        if (kind === "generator")
          value.generator = ctx.get(headingIdGenerator.key);
        else value.factory = ctx.get(headingSchema.key);
        return runner;
      } catch (error) {
        retire();
        throw error;
      }
    };
  const node: MilkdownPlugin = (ctx) => {
    let runner: ReturnType<MilkdownPlugin>;
    try {
      runner = headingSchema.node(ctx);
    } catch (error) {
      retire();
      throw error;
    }
    return async () => {
      try {
        // The original async runner's synchronous prefix registers the exact spec.
        const result = runner();
        value.registered = ctx
          .get(nodesCtx)
          .find(([name]) => name === "heading")?.[1];
        const cleanup = await result;
        let cleaned = false;
        const close = () => {
          if (!cleaned) {
            cleaned = true;
            if (typeof cleanup === "function") return cleanup();
          }
        };
        value.nodeCleanup = close;
        if (value.phase === "disposed") await close();
        return () => {
          retire();
          return close();
        };
      } catch (error) {
        retire();
        throw error;
      }
    };
  };
  const sync: MilkdownPlugin = (ctx) => async () => {
    try {
      await ctx.wait(SchemaReady);
      // Literal 7.22.1 native algorithm, with only per-editor instance capture.
      const headingIdPluginKey = new PluginKey("MILKDOWN_HEADING_ID");
      const updateId = (
        view: import("@milkdown/kit/prose/view").EditorView,
      ) => {
        if (view.composing) return;
        const getId = ctx.get(headingIdGenerator.key);
        const tr = view.state.tr.setMeta("addToHistory", false);
        let found = false;
        const idMap: Record<string, number> = {};
        view.state.doc.descendants((node, pos) => {
          if (node.type === headingSchema.type(ctx)) {
            if (node.textContent.trim().length === 0) return;
            const attrs = node.attrs;
            let id = getId(node);
            if (idMap[id]) {
              idMap[id] = idMap[id]! + 1;
              id += `-#${idMap[id]}`;
            } else idMap[id] = 1;
            if (attrs.id !== id) {
              found = true;
              tr.setMeta(headingIdPluginKey, true).setNodeMarkup(
                pos,
                undefined,
                { ...attrs, id },
              );
            }
          }
        });
        if (found) view.dispatch(tr);
      };
      const plugin = new Plugin({
        key: headingIdPluginKey,
        view: (view) => {
          updateId(view);
          return {
            update: (view, previous) => {
              if (view.state.doc.eq(previous.doc)) return;
              updateId(view);
            },
          };
        },
      });
      value.plugin = plugin;
      finishReady(controller, value);
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, plugin]);
      return () => {
        retire();
        ctx.update(prosePluginsCtx, (plugins) =>
          plugins.filter((item) => item !== plugin),
        );
      };
    } catch (error) {
      retire();
      try {
        await value.nodeCleanup?.();
      } catch {
        /* Keep the original initialization cause. */
      }
      throw error;
    }
  };
  const preset = commonmarkWithoutEmptyLinePreservation.map((plugin) => {
    if (plugin === headingIdGenerator)
      return captureInjection(plugin, "generator");
    if (plugin === headingSchema.ctx)
      return captureInjection(plugin, "factory");
    if (plugin === headingSchema.node) return node;
    if (plugin === syncHeadingIdPlugin) return sync;
    return plugin;
  });
  const source = sourcePlugin(controller);
  const boundSource: MilkdownPlugin = (ctx) => {
    try {
      return source(ctx);
    } catch (error) {
      retire();
      throw error;
    }
  };
  const trailing: MilkdownPlugin[] = includeTrailing ? [
    (ctx) => {
      const runner = trailingConfig(ctx);
      const config = ctx.get(trailingConfig.key);
      value.trailing = { config, shouldAppend: config.shouldAppend, getNode: config.getNode };
      return runner;
    },
    (ctx) => {
      const runner = trailingPlugin(ctx);
      return async () => {
        const previous = new Set(ctx.get(prosePluginsCtx));
        const cleanup = await runner();
        // $prose.plugin() is module-global. Resolve the original runner's
        // registration in this editor's context instead of borrowing that slot.
        const additions = ctx.get(prosePluginsCtx).filter((plugin) => {
          if (previous.has(plugin)) return false;
          const key = plugin.spec.key;
          const name = key && Object.getOwnPropertyDescriptor(key, "key")?.value;
          return typeof name === "string" && /^MILKDOWN_TRAILING\$\d*$/.test(name);
        });
        if (value.trailing && additions.length === 1) value.trailing.plugin = additions[0];
        return () => { if (typeof cleanup === "function") return cleanup(); };
      };
    },
  ] : [];
  return [...preset, ...trailing, boundSource];
}
export const sourceControllerCtx = createSlice<SourceController | null>(
  null,
  "BlintzSourceController",
);
export function sourcePlugin(controller: SourceController): MilkdownPlugin {
  return (ctx) => {
    ctx.inject(sourceControllerCtx, controller);
    const ready = createTimer("BlintzSourceReady");
    ctx.record(ready);
    ctx.update(editorStateTimerCtx, (timers) => [...timers, ready]);
    let pending: ParsedSource | undefined;
    let initialized = false;
    ctx.update(prosePluginsCtx, (plugins) => [
      ...plugins,
      new Plugin({
        state: {
          init: (_, state) => {
            if (
              pending &&
              matchesSourceDocument(controller, pending.doc, state)
            ) {
              controller.install(pending);
              pending = undefined;
            }
            initialized = true;
            return null;
          },
          apply: (tr, value, oldState, state) => {
            if (tr.docChanged && !controller.applyConfirmedSource(tr, oldState, state) && !controller.preserveSource(state)) {
              controller.invalidate();
            }
            return value;
          },
        },
        view: (view) => {
          controller.attach(view);
          return {
            update: (current, previous) => {
              controller.finishConfirmedSource(current, previous);
              if (
                !current.state.selection.eq(previous.selection) ||
                !current.state.doc.eq(previous.doc)
              )
                controller.selectionChanged();
            },
            destroy: () => {
              controller.dispose();
            },
          };
        },
      }),
    ]);
    return async () => {
      try {
        await ctx.wait(SchemaReady);
        const assembly = owned.get(controller)?.value;
        if (assembly && assembly.phase === "pending")
          assembly.schema = ctx.get(schemaCtx);
        await ctx.wait(ParserReady);
        // Native sync runner is also behind SchemaReady. Its captured plugin is
        // checked against the actual EditorState later, not a module-global slot.
        if (assembly && assembly.phase === "pending") {
          assembly.parserReady = true;
          finishReady(controller, assembly);
        }
        const schema = ctx.get(schemaCtx),
          remark = ctx.get(remarkCtx);
        controller.parse = (text, state) => {
          const parsed = parseSource(schema, remark, text);
          return state && ownsOriginalTextAssembly(controller, state)
            ? reconcileSourceTerminalSpace(parsed, state.doc) : parsed;
        };
        ctx.set(parserCtx, (text) => {
          const parsed = controller.parse!(text);
          if (!initialized) pending = parsed;
          return parsed.doc;
        });
        ctx.done(ready);
        return () => {
          const assembly = owned.get(controller)?.value;
          if (assembly) {
            assembly.phase = "disposed";
            owned.delete(controller);
          }
          controller.dispose();
          ctx.clearTimer(ready);
          ctx.remove(sourceControllerCtx);
        };
      } catch (error) {
        const assembly = owned.get(controller)?.value;
        if (assembly) {
          assembly.phase = "disposed";
          owned.delete(controller);
          try {
            await assembly.nodeCleanup?.();
          } catch {
            /* Preserve the original ready failure. */
          }
        }
        controller.dispose();
        ctx.clearTimer(ready);
        ctx.remove(sourceControllerCtx);
        throw error;
      }
    };
  };
}

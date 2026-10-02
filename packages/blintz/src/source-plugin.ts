import {
  createSlice,
  createTimer,
  type MilkdownPlugin,
} from "@milkdown/kit/ctx";
import {
  ParserReady,
  parserCtx,
  schemaCtx,
  remarkCtx,
  editorStateTimerCtx,
  prosePluginsCtx,
} from "@milkdown/kit/core";
import { Plugin } from "@milkdown/kit/prose/state";
import { parseSource, type ParsedSource } from "./source-parser";
import { SourceController } from "./source-controller";
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
            if (pending?.doc.eq(state.doc)) {
              controller.install(pending);
              pending = undefined;
            }
            initialized = true;
            return null;
          },
          apply: (tr, value) => {
            if (tr.docChanged) {
              controller.invalidate();
            }
            return value;
          },
        },
        view: (view) => {
          controller.attach(view);
          return {
            update: (current, previous) => {
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
      await ctx.wait(ParserReady);
      const schema = ctx.get(schemaCtx),
        remark = ctx.get(remarkCtx);
      controller.parse = (text) => parseSource(schema, remark, text);
      ctx.set(parserCtx, (text) => {
        const parsed = controller.parse!(text);
        if (!initialized) pending = parsed;
        return parsed.doc;
      });
      ctx.done(ready);
      return () => {
        controller.dispose();
        ctx.clearTimer(ready);
        ctx.remove(sourceControllerCtx);
      };
    };
  };
}

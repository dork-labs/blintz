import type { Ctx } from "@milkdown/kit/ctx";
import { Plugin, PluginKey, type Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

const key = new PluginKey<boolean>("blintz-remote-changes");
const DEBOUNCE_MS = 200;

/** A collaborator's change, as y-prosemirror marks it. */
function isRemote(tr: Transaction): boolean {
  return (tr.getMeta("y-sync$") as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin === true;
}

/**
 * Calls `report` (debounced, like Milkdown's listener) after document
 * changes that came from collaborators rather than this editor.
 */
export function remoteChangesPlugin(report: (ctx: Ctx) => void) {
  return $prose((ctx) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return new Plugin<boolean>({
      key,
      state: {
        init: () => false,
        apply: (tr, pending) => (tr.docChanged && isRemote(tr) ? true : tr.docChanged ? false : pending),
      },
      view: () => ({
        update: (view, previous) => {
          if (!key.getState(view.state) || view.state.doc.eq(previous.doc)) return;
          clearTimeout(timer);
          timer = setTimeout(() => report(ctx), DEBOUNCE_MS);
        },
        destroy: () => clearTimeout(timer),
      }),
    });
  });
}

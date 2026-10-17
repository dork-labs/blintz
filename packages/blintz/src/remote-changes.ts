import type { Ctx } from "@milkdown/kit/ctx";
import { Plugin, PluginKey, type Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

const key = new PluginKey<boolean>("blintz-remote-changes");
const DEBOUNCE_MS = 200;

// The meta keys collaboration bindings put on remote changes. y-prosemirror's
// key is "y-sync$"; a second copy of it would be "y-sync$1", so
// `collaboration()` registers the key of the copy it actually uses.
const syncKeys = new Set<string>(["y-sync$"]);

/** @internal Used by `collaboration()` to register its sync plugin's key. */
export function registerCollaboratorChangeKey(key: string): void {
  syncKeys.add(key);
}

/**
 * Whether a transaction carries a collaborator's change (applied by the
 * collaboration binding) rather than this editor's own edit. Such changes
 * arrive as whole-document replacements, so position mapping through them
 * is meaningless; compare `tr.before` and `tr.doc` instead.
 */
export function isCollaboratorChange(tr: Transaction): boolean {
  for (const key of syncKeys) {
    if ((tr.getMeta(key) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin === true) return true;
  }
  return false;
}

const isRemote = isCollaboratorChange;

/**
 * Calls `report` (debounced, like Milkdown's listener) after document
 * changes that came from collaborators rather than this editor.
 */
export function remoteChangesPlugin(report: (ctx: Ctx) => void) {
  return $prose((ctx) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Until the shared document has had content once, an empty one is just
    // "not synced yet": reporting it would make a host save an empty file.
    let synced = false;
    return new Plugin<boolean>({
      key,
      state: {
        init: () => false,
        apply: (tr, pending) => (tr.docChanged && isRemote(tr) ? true : tr.docChanged ? false : pending),
      },
      view: () => ({
        update: (view, previous) => {
          if (!key.getState(view.state) || view.state.doc.eq(previous.doc)) return;
          synced ||= view.state.doc.textContent.length > 0 || view.state.doc.childCount > 1;
          if (!synced) return;
          clearTimeout(timer);
          timer = setTimeout(() => report(ctx), DEBOUNCE_MS);
        },
        destroy: () => clearTimeout(timer),
      }),
    });
  });
}

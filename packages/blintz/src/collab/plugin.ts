import { keymap } from "@milkdown/kit/prose/keymap";
import { $prose } from "@milkdown/kit/utils";
import {
  redo,
  redoCommand,
  undo,
  undoCommand,
  yCursorPlugin,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
} from "y-prosemirror";

import { codeBlockConfig } from "../features/code-block/config";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

import type { BlintzPlugin } from "../plugin";
import { registerCollaboratorChangeKey } from "../remote-changes";

/** Who this collaborator is, as others see their cursor. */
export interface CollaborationUser {
  name: string;
  /** A CSS color for this user's cursor and selection. */
  color: string;
}

export interface CollaborationOptions {
  /**
   * The shared document: `ydoc.getXmlFragment("prosemirror")`. Seed it on
   * the server (`applyMarkdownToYDoc`) before editors connect: an editor
   * shows what the fragment holds, so an empty fragment shows an empty page.
   */
  fragment: Y.XmlFragment;
  /** Presence from your provider (e.g. `provider.awareness`), for live cursors. */
  awareness?: Awareness;
  /** This person's name and color, shown on their cursor to others. */
  user?: CollaborationUser;
}

/**
 * Real-time collaboration through Yjs: pass the result in
 * `<MarkdownEditor plugins={[collaboration({ fragment, awareness, user })]}>`.
 * The editor binds to the shared fragment (remote edits appear in place,
 * cursors and selections survive them), shows other people's cursors, and
 * undoes only this person's own edits. The host's provider carries updates;
 * markdown stays the saved form (`onChange` still reports it).
 *
 * Capture the options once per editor (e.g. in `useMemo`): the plugin set is
 * read at mount.
 */
export function collaboration(options: CollaborationOptions): BlintzPlugin {
  registerCollaboratorChangeKey((ySyncPluginKey as unknown as { key: string }).key);
  const plugin: BlintzPlugin = ({ editor }) => {
    editor
      // Undo inside code blocks goes to Yjs too (only this person's edits).
      .config((ctx) =>
        ctx.update(codeBlockConfig.key, (prev) => ({ ...prev, undo: undoCommand, redo: redoCommand })),
      )
      .use($prose(() => ySyncPlugin(options.fragment)))
      .use($prose(() => yUndoPlugin()))
      .use(
        $prose(() =>
          keymap({
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
          }),
        ),
      );
    if (options.awareness) {
      if (options.user) options.awareness.setLocalStateField("user", options.user);
      editor.use($prose(() => yCursorPlugin(options.awareness!)));
    }
  };
  // Yjs undo replaces the editor's own history: one undo stack per person.
  // The shared document is the source of truth: `value` can't replace it.
  return Object.assign(plugin, { replacesHistory: true, ownsDocument: true });
}

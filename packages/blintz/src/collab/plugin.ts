import { keymap } from "@milkdown/kit/prose/keymap";
import { $prose } from "@milkdown/kit/utils";
import { redo, undo, yCursorPlugin, ySyncPlugin, yUndoPlugin } from "y-prosemirror";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

import type { BlintzPlugin } from "../plugin";

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
  const plugin: BlintzPlugin = ({ editor }) => {
    editor
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
  return Object.assign(plugin, { replacesHistory: true });
}

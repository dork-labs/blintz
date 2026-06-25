import type { Editor } from "@milkdown/kit/core";
import type {
  useNodeViewFactory,
  usePluginViewFactory,
} from "@prosemirror-adapter/react";

/**
 * What a {@link BlintzPlugin} receives. It mirrors the seam Blintz's own
 * built-in features use: the Milkdown `Editor` mid-assembly, plus the two
 * `@prosemirror-adapter/react` factories so a plugin can register React node
 * views and plugin views (the same hooks the toolbar, slash menu, and code
 * block render through).
 */
export interface BlintzPluginContext {
  /**
   * The editor being assembled. Extend it with `.use()` / `.config()`, exactly
   * as the built-in features do. Plugins run once, inside the `useEditor`
   * factory, after Blintz's own features register, so they layer on top.
   */
  editor: Editor;
  /** Factory for React node views (block and inline node renderers). */
  nodeViewFactory: ReturnType<typeof useNodeViewFactory>;
  /** Factory for React plugin views (floating tooltips, popovers, widgets). */
  pluginViewFactory: ReturnType<typeof usePluginViewFactory>;
}

/**
 * A Blintz extension: register Milkdown nodes, marks, ProseMirror plugins,
 * commands, or React views on the editor. Pass an array of these to
 * `<MarkdownEditor plugins={...}>`.
 *
 * View components rendered through the factories read the live Milkdown `Ctx`
 * with {@link useEditorCtx} (they render under `<MarkdownEditor>`'s provider).
 *
 * @example
 * const highlight: BlintzPlugin = ({ editor }) => {
 *   editor.use(highlightMark).use(highlightCommand);
 * };
 * <MarkdownEditor value={md} onChange={setMd} plugins={[highlight]} />
 */
export type BlintzPlugin = (ctx: BlintzPluginContext) => void;

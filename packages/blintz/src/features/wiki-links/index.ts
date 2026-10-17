import type { Editor } from "@milkdown/kit/core";
import { $prose, $view } from "@milkdown/kit/utils";
import type { useNodeViewFactory, usePluginViewFactory } from "@prosemirror-adapter/react";

import { WikiLinkMenu } from "./WikiLinkMenu";
import { WikiLinkView } from "./WikiLinkView";
import { wikiLinkMenuPlugin } from "./menu-plugin";
import {
  remarkWikiLinksPlugin,
  wikiLinkCodeGuard,
  wikiLinkInputRule,
  wikiLinkSchema,
  wikiLinkSourceSync,
} from "./schema";

type NodeViewFactory = ReturnType<typeof useNodeViewFactory>;
type PluginViewFactory = ReturnType<typeof usePluginViewFactory>;

/** The wiki-link grammar alone (remark plugin + node schema), no views. */
export function wikiLinkGrammarFeature(editor: Editor): void {
  editor.use(remarkWikiLinksPlugin).use(wikiLinkSchema).use(wikiLinkSourceSync);
}

/**
 * wiki links — `[[target#heading|label]]` and `![[target]]` as inline atoms
 * that round-trip exactly, resolved and suggested by the host through the
 * `wikiLinks` prop (read live from React context, so no remount).
 */
export function wikiLinksFeature(
  editor: Editor,
  nodeViewFactory: NodeViewFactory,
  pluginViewFactory: PluginViewFactory,
): void {
  wikiLinkGrammarFeature(editor);

  const view = $view(wikiLinkSchema.node, () =>
    nodeViewFactory({
      component: WikiLinkView,
      as: () => {
        const el = document.createElement("span");
        el.className = "blintz-wiki-link-host";
        return el;
      },
    }),
  );

  const menu = $prose(() =>
    wikiLinkMenuPlugin((editorView) => {
      const host = document.createElement("div");
      host.className = "blintz-wiki-link-menu-host";
      (editorView.dom.parentElement ?? document.body).appendChild(host);
      const inner = pluginViewFactory({ component: WikiLinkMenu, root: () => host })(editorView);
      return {
        update: (view, prevState) => inner.update?.(view, prevState),
        destroy: () => {
          inner.destroy?.();
          host.remove();
        },
      };
    }),
  );

  editor.use(wikiLinkInputRule).use(wikiLinkCodeGuard).use(view).use(menu);
}

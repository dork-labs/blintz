import type { Editor } from "@milkdown/kit/core";
import { $view } from "@milkdown/kit/utils";
import type { useNodeViewFactory } from "@prosemirror-adapter/react";

import { EmbedContainerView, EmbedView } from "./EmbedView";
import { embedGrammarFeature } from "./grammar-feature";
import { embedContainerSchema, embedSchema } from "./schema";

const INTERACTIVE =
  'input, textarea, select, button, a[href], [contenteditable="true"], [data-embed-interactive]';

type NodeViewFactory = ReturnType<typeof useNodeViewFactory>;

/**
 * embeds — block directives (`::name{…}`, `:::name … :::`) rendered by
 * host-registered React components (the `embeds` prop). The grammar is always
 * on, so directives round-trip whether or not anything is registered; the
 * registry itself is read live through React context, so changing the `embeds`
 * prop re-renders embeds without a remount.
 */
export function embedsFeature(editor: Editor, nodeViewFactory: NodeViewFactory): void {
  embedGrammarFeature(editor);

  const leafView = $view(embedSchema.node, () =>
    nodeViewFactory({
      component: EmbedView,
      as: () => {
        const el = document.createElement("div");
        el.className = "blintz-embed-host";
        return el;
      },
      // Host components own their form controls; everything else (clicks to
      // select, drag handles) still reaches ProseMirror.
      stopEvent: (event) =>
        event.target instanceof Element &&
        event.target.closest(INTERACTIVE) !== null,
      ignoreMutation: () => true,
    }),
  );

  const containerView = $view(embedContainerSchema.node, () =>
    nodeViewFactory({
      component: EmbedContainerView,
      as: () => {
        const el = document.createElement("div");
        el.className = "blintz-embed-host is-container";
        return el;
      },
      contentAs: "div",
    }),
  );

  editor.use(leafView).use(containerView);
}

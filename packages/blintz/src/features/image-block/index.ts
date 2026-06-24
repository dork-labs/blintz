import type { Editor } from "@milkdown/kit/core";
import { imageSchema } from "@milkdown/kit/preset/commonmark";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { $view } from "@milkdown/kit/utils";
import type { useNodeViewFactory } from "@prosemirror-adapter/react";

import { ImageBlockView } from "./ImageBlockView";
import { ImageInlineView } from "./ImageInlineView";
import { imageBlockConfig, inlineImageConfig } from "./config";
import { remarkImageBlockPlugin } from "./remark-plugin";
import { imageBlockSchema } from "./schema";

type NodeViewFactory = ReturnType<typeof useNodeViewFactory>;

/**
 * image-block — Crepe's image feature rebuilt Vue-free. Registers:
 *  - the local (ported, Vue-free) `image-block` schema + promote-to-block remark
 *    plugin + the block/inline config `$ctx` slices;
 *  - two React node views via `$view` + the adapter's `nodeViewFactory`: the
 *    block view targets our local `imageBlockSchema.node` ('image-block'), the
 *    inline view targets the commonmark `imageSchema.node` ('image'). The inline
 *    `image` schema itself comes from `.use(commonmark)` already on the editor;
 *    we only attach the view.
 *  - the paste/drop uploader closure on `uploadConfig` (ported from Crepe's
 *    `core/builder.ts`): pasting/dropping an image runs `onUpload` and inserts an
 *    `image-block` node (this feature is on) or falls back to a plain `image`.
 *
 * We deliberately do NOT import `@milkdown/kit/component/image-{block,inline}`
 * (single bundles with `import {...} from "vue"` — importing any export drags
 * Vue in); every pure piece is owned locally instead.
 *
 * `stopEvent: e => e.target instanceof HTMLInputElement` keeps typing in the
 * link/caption inputs from being swallowed by ProseMirror. These atoms have no
 * editable text content, so no `contentRef` / `contentAs`.
 */
export function imageBlockFeature(
  editor: Editor,
  nodeViewFactory: NodeViewFactory,
): void {
  const imageBlockView = $view(imageBlockSchema.node, () =>
    nodeViewFactory({
      component: ImageBlockView,
      as: () => {
        const el = document.createElement("div");
        el.className = "milkdown-image-block";
        return el;
      },
      stopEvent: (e) => e.target instanceof HTMLInputElement,
    }),
  );

  const imageInlineView = $view(imageSchema.node, () =>
    nodeViewFactory({
      component: ImageInlineView,
      as: () => {
        const el = document.createElement("span");
        el.className = "milkdown-image-inline";
        return el;
      },
      stopEvent: (e) => e.target instanceof HTMLInputElement,
    }),
  );

  editor
    .config((ctx) => {
      // The paste/drop uploader (ported from Crepe `core/builder.ts` ~75-107):
      // image-block is present, so insert that node; fall back to the inline
      // `image` node otherwise. Uses the block config's `onUpload`.
      ctx.update(uploadConfig.key, (prev) => ({
        ...prev,
        uploader: async (files, schema) => {
          const nodeType = schema.nodes["image-block"] ?? schema.nodes["image"];
          if (!nodeType) return [];

          const useBlock = Boolean(schema.nodes["image-block"]);
          const onUpload = useBlock
            ? ctx.get(imageBlockConfig.key).onUpload
            : undefined;

          const images: File[] = [];
          for (let i = 0; i < files.length; i++) {
            const file = files.item(i);
            if (file && file.type.includes("image")) images.push(file);
          }

          const nodes = await Promise.all(
            images.map(async (file) => {
              const src = onUpload
                ? await onUpload(file)
                : URL.createObjectURL(file);
              return nodeType.createAndFill({ src })!;
            }),
          );

          return nodes;
        },
      }));
    })
    .use(imageBlockConfig)
    .use(inlineImageConfig)
    .use(imageBlockSchema)
    .use(remarkImageBlockPlugin)
    .use(imageBlockView)
    .use(imageInlineView);
}

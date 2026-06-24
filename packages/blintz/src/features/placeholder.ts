import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { findParent } from "@milkdown/kit/prose";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $ctx, $prose } from "@milkdown/kit/utils";

import { isInCodeBlock, isInList } from "../shared/checker";

/**
 * placeholder — greyed prompt text in an empty editing context. 100% engine,
 * zero React UI: a node `Decoration` carrying `class="crepe-placeholder"` +
 * `data-placeholder`, rendered by CSS `::before { content: attr(...) }`.
 *
 * Ported from Crepe's `feature/placeholder/index.ts`, with the only Crepe-
 * specific line (`useCrepe(ctx).readonly`) replaced by reading editability off
 * the live editor view.
 */

interface PlaceholderConfig {
  text: string;
  mode: "doc" | "block";
}

export type PlaceholderFeatureConfig = Partial<PlaceholderConfig>;

function isDocEmpty(doc: Node) {
  return doc.childCount <= 1 && !doc.firstChild?.content.size;
}

function createPlaceholderDecoration(
  state: EditorState,
  placeholderText: string,
): Decoration | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const $pos = selection.$anchor;
  const node = $pos.parent;
  if (node.content.size > 0) return null;

  const inTable = findParent((node) => node.type.name === "table")($pos);
  if (inTable) return null;

  const before = $pos.before();

  return Decoration.node(before, before + node.nodeSize, {
    class: "crepe-placeholder",
    "data-placeholder": placeholderText,
  });
}

export const placeholderConfig = $ctx(
  {
    text: "Please enter...",
    mode: "block",
  } as PlaceholderConfig,
  "placeholderConfigCtx",
);

export const placeholderPlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey("CREPE_PLACEHOLDER"),
    props: {
      decorations: (state) => {
        // Crepe reads `useCrepe(ctx).readonly`; outside Crepe we gate on the
        // editor's own editability. The view may not be in ctx on the very
        // first decoration pass, so default to editable.
        let editable = true;
        try {
          editable = ctx.get(editorViewCtx).editable;
        } catch {
          editable = true;
        }
        if (!editable) return null;

        const config = ctx.get(placeholderConfig.key);
        if (config.mode === "doc" && !isDocEmpty(state.doc)) return null;

        if (isInCodeBlock(state.selection) || isInList(state.selection))
          return null;

        const deco = createPlaceholderDecoration(
          state,
          config.text ?? "Please enter...",
        );
        if (!deco) return null;

        return DecorationSet.create(state.doc, [deco]);
      },
    },
  });
});

export function placeholderFeature(
  editor: Editor,
  config?: PlaceholderFeatureConfig,
): void {
  editor
    .config((ctx) => {
      if (config) {
        ctx.update(placeholderConfig.key, (prev) => ({ ...prev, ...config }));
      }
    })
    .use(placeholderPlugin)
    .use(placeholderConfig);
}

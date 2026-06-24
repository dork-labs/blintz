import type { Node } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";
import { visit } from "unist-util-visit";

/**
 * The promote-paragraph→image-block remark transform, re-implemented locally
 * (verbatim port of `@milkdown/components/image-block/remark-plugin.ts`). Owned
 * here, like the schema, to keep the bundle Vue-free.
 *
 * On parse it walks the mdast and replaces any `paragraph` whose only child is
 * an `image` with an `image-block` node, carrying `url`/`alt`/`title` across so
 * the schema's `parseMarkdown` runner can rebuild the node (ratio from `alt`,
 * caption from `title`).
 */
function visitImage(ast: Node) {
  return visit(
    ast,
    "paragraph",
    (
      node: Node & { children?: Node[] },
      index: number | undefined,
      parent: (Node & { children: Node[] }) | undefined,
    ) => {
      if (index == null || !parent) return;
      if (node.children?.length !== 1) return;
      const firstChild = node.children?.[0];
      if (!firstChild || firstChild.type !== "image") return;

      const { url, alt, title } = firstChild as Node & {
        url: string;
        alt: string;
        title: string;
      };
      const newNode = {
        type: "image-block",
        url,
        alt,
        title,
      };

      parent.children.splice(index, 1, newNode as unknown as Node);
    },
  );
}

export const remarkImageBlockPlugin = $remark(
  "remark-image-block",
  () => () => visitImage,
);

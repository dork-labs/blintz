import { $nodeSchema } from "@milkdown/kit/utils";

/**
 * The block-level `image-block` node schema, re-implemented locally (verbatim
 * port of `@milkdown/components/image-block/schema.ts`). We re-create it rather
 * than import from `@milkdown/kit/component/image-block` because that package
 * compiles to a single bundle with `import { ... } from "vue"` at the top — the
 * pure schema and the Vue view components share one file, so importing any
 * export drags Vue into the bundle. Owning the pure schema keeps the build
 * provably Vue-free (same pattern as link-tooltip's local slices).
 *
 * Round-trip is lossy-by-design: a block image serializes to a paragraph
 * holding a single `![ratio](src "caption")` image — `ratio` stashed in `alt`
 * (2 decimals), `caption` in `title`. The `remark-image-block` plugin promotes
 * single-image paragraphs back to `image-block` on parse. Keep this faithful or
 * the round-trip breaks.
 */

export const IMAGE_DATA_TYPE = "image-block";

/** Local replacement for `@milkdown/exception`'s `expectDomTypeError` — a tiny
 * helper so we don't add an extra import for one parseDOM guard. */
function expectDomTypeError(dom: unknown): Error {
  return new Error(`Expected an HTMLElement, got ${String(dom)}`);
}

export const imageBlockSchema = $nodeSchema("image-block", () => {
  return {
    inline: false,
    group: "block",
    selectable: true,
    draggable: true,
    isolating: true,
    marks: "",
    atom: true,
    priority: 100,
    attrs: {
      src: { default: "", validate: "string" },
      caption: { default: "", validate: "string" },
      ratio: { default: 1, validate: "number" },
    },
    parseDOM: [
      {
        tag: `img[data-type="${IMAGE_DATA_TYPE}"]`,
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) throw expectDomTypeError(dom);

          return {
            src: dom.getAttribute("src") || "",
            caption: dom.getAttribute("caption") || "",
            ratio: Number(dom.getAttribute("ratio") ?? 1),
          };
        },
      },
    ],
    toDOM: (node) => ["img", { "data-type": IMAGE_DATA_TYPE, ...node.attrs }],
    parseMarkdown: {
      match: ({ type }) => type === "image-block",
      runner: (state, node, type) => {
        const src = node.url as string;
        const caption = node.title as string;
        let ratio = Number((node.alt as string) || 1);
        if (Number.isNaN(ratio) || ratio === 0) ratio = 1;

        state.addNode(type, {
          src,
          caption,
          ratio,
        });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "image-block",
      runner: (state, node) => {
        state.openNode("paragraph");
        state.addNode("image", undefined, undefined, {
          title: node.attrs.caption,
          url: node.attrs.src,
          alt: `${Number.parseFloat(node.attrs.ratio).toFixed(2)}`,
        });
        state.closeNode();
      },
    },
  };
});

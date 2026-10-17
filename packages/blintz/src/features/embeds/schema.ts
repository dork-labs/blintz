import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $nodeSchema } from "@milkdown/kit/utils";

import type { EmbedAttributes } from "./grammar";

export const embedId = "embed";
export const embedContainerId = "embed_container";

/**
 * The attrs both embed nodes carry. `label` keeps the label's mdast phrasing
 * children as parsed (`[Q3 *tasks*]` → text + emphasis), so serialization hands
 * remark the same tree back instead of re-deriving markdown from plain text.
 */
export interface EmbedNodeAttrs {
  name: string;
  attributes: EmbedAttributes;
  label: MarkdownNode[] | null;
}

const embedAttrs = {
  name: { default: "" },
  attributes: { default: {} },
  label: { default: null },
};

function cleanAttributes(
  raw: Record<string, string | null | undefined> | null | undefined,
): EmbedAttributes {
  const attributes: EmbedAttributes = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === "string") attributes[key] = value;
  }
  return attributes;
}

function readJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function domAttrs(type: string, attrs: Record<string, unknown>) {
  return {
    "data-type": type,
    "data-name": attrs.name as string,
    "data-attributes": JSON.stringify(attrs.attributes ?? {}),
    ...(attrs.label ? { "data-label": JSON.stringify(attrs.label) } : {}),
  };
}

function parseDomAttrs(dom: HTMLElement) {
  return {
    name: dom.getAttribute("data-name") ?? "",
    attributes: readJson<EmbedAttributes>(dom.getAttribute("data-attributes"), {}),
    label: readJson<MarkdownNode[] | null>(dom.getAttribute("data-label"), null),
  };
}

/**
 * A leaf directive (`::chart{src="q3"}`) — an atom block whose React view is
 * the host-registered component for its name. Unknown names keep the node and
 * round-trip unchanged; the view shows a neutral placeholder.
 */
export const embedSchema = $nodeSchema(embedId, () => ({
  group: "block",
  atom: true,
  isolating: true,
  selectable: true,
  draggable: true,
  marks: "",
  attrs: embedAttrs,
  parseDOM: [
    {
      tag: `div[data-type="${embedId}"]`,
      getAttrs: (dom) => parseDomAttrs(dom as HTMLElement),
    },
  ],
  toDOM: (node) => ["div", domAttrs(embedId, node.attrs)],
  parseMarkdown: {
    match: (node) => node.type === "leafDirective",
    runner: (state, node, type) => {
      const children = node.children ?? [];
      state.addNode(type, {
        name: node.name as string,
        attributes: cleanAttributes(node.attributes as never),
        label: children.length > 0 ? children : null,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === embedId,
    runner: (state, node) => {
      state.addNode(
        "leafDirective",
        (node.attrs.label as MarkdownNode[] | null) ?? undefined,
        undefined,
        { name: node.attrs.name, attributes: node.attrs.attributes },
      );
    },
  },
}));

/**
 * A container directive (`:::callout{tone="warn"} … :::`) — editable markdown
 * blocks wrapped by the host-registered component for its name.
 */
export const embedContainerSchema = $nodeSchema(embedContainerId, () => ({
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  draggable: true,
  attrs: embedAttrs,
  parseDOM: [
    {
      tag: `div[data-type="${embedContainerId}"]`,
      getAttrs: (dom) => parseDomAttrs(dom as HTMLElement),
      contentElement: "[data-embed-content]",
    },
  ],
  toDOM: (node) => [
    "div",
    domAttrs(embedContainerId, node.attrs),
    ["div", { "data-embed-content": "" }, 0],
  ],
  parseMarkdown: {
    match: (node) => node.type === "containerDirective",
    runner: (state, node, type) => {
      const children = node.children ?? [];
      const head = children[0];
      const hasLabel =
        head?.type === "paragraph" &&
        (head.data as { directiveLabel?: boolean } | undefined)?.directiveLabel === true;
      state.openNode(type, {
        name: node.name as string,
        attributes: cleanAttributes(node.attributes as never),
        label: hasLabel ? (head.children ?? []) : null,
      });
      state.next(hasLabel ? children.slice(1) : children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === embedContainerId,
    runner: (state, node) => {
      state.openNode("containerDirective", undefined, {
        name: node.attrs.name,
        attributes: node.attrs.attributes,
      });
      const label = node.attrs.label as MarkdownNode[] | null;
      if (label?.length) {
        state.addNode("paragraph", label, undefined, {
          data: { directiveLabel: true },
        });
      }
      // An empty container still holds one empty paragraph (content is
      // `block+`); writing it would add a blank line the source never had.
      const only = node.childCount === 1 ? node.firstChild : null;
      if (!(only?.type.name === "paragraph" && only.content.size === 0)) {
        state.next(node.content);
      }
      state.closeNode();
    },
  },
}));

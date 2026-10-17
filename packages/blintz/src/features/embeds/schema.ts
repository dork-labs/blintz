import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $nodeSchema } from "@milkdown/kit/utils";

import { ATTRIBUTE_KEY, DIRECTIVE_NAME, type EmbedAttributes } from "./grammar";

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

/** Keep only string values under keys the directive grammar can write back. */
export function cleanAttributes(raw: unknown): EmbedAttributes {
  const attributes: EmbedAttributes = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return attributes;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && ATTRIBUTE_KEY.test(key)) attributes[key] = value;
  }
  return attributes;
}

// Pasted HTML is untrusted, so its label may only hold these phrasing nodes:
// never raw `html` and never an unknown type, so a crafted paste can neither
// inject HTML nor make the document unserializable. Labels parsed from the
// author's own markdown keep every node type; they came from the grammar.
const PASTE_LABEL_NODES = new Set([
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "inlineMath",
  "link",
  "break",
]);

/**
 * Copy label nodes without `position` / `data`, so the same label parsed at a
 * different offset is equal (source mapping compares re-parsed documents).
 * Returns `null` for anything that is not a well-formed phrasing array; with
 * `untrusted`, also for any node type outside the paste allow-list.
 */
export function cleanLabel(raw: unknown, untrusted = false): MarkdownNode[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const nodes: MarkdownNode[] = [];
  for (const item of raw) {
    const node = cleanLabelNode(item, untrusted);
    if (!node) return null;
    nodes.push(node);
  }
  return nodes;
}

function cleanLabelNode(raw: unknown, untrusted: boolean): MarkdownNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.type !== "string") return null;
  if (untrusted && !PASTE_LABEL_NODES.has(source.type)) return null;
  const node: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "position" || key === "data") continue;
    if (key === "children") {
      if (!Array.isArray(value)) return null;
      const children: MarkdownNode[] = [];
      for (const child of value) {
        const clean = cleanLabelNode(child, untrusted);
        if (!clean) return null;
        children.push(clean);
      }
      node.children = children;
    } else if (untrusted && value !== null && typeof value !== "string") {
      return null;
    } else {
      node[key] = value;
    }
  }
  return node as MarkdownNode;
}

function readJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
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

/** Pasted HTML is untrusted: an invalid name refuses the element outright. */
function parseDomAttrs(dom: HTMLElement) {
  const name = dom.getAttribute("data-name") ?? "";
  if (!DIRECTIVE_NAME.test(name)) return false;
  return {
    name,
    attributes: cleanAttributes(readJson(dom.getAttribute("data-attributes"))),
    label: cleanLabel(readJson(dom.getAttribute("data-label")), true),
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
      state.addNode(type, {
        name: node.name as string,
        attributes: cleanAttributes(node.attributes),
        label: cleanLabel(node.children),
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
  // Not `isolating`: like a blockquote, Enter on an empty last line (and
  // Backspace at the start) lifts out of the container.
  defining: true,
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
        attributes: cleanAttributes(node.attributes),
        label: hasLabel ? cleanLabel(head.children) : null,
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

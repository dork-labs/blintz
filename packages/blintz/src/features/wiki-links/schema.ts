import { InputRule } from "@milkdown/kit/prose/inputrules";
import { $inputRule, $nodeSchema, $remark } from "@milkdown/kit/utils";

import {
  isWritableWikiLink,
  parseWikiLinkBody,
  remarkWikiLinks,
  stringifyWikiLink,
  type WikiLink,
} from "./grammar";

export const wikiLinkId = "wiki_link";

/** The wiki-link grammar on the editor's remark processor. */
export const remarkWikiLinksPlugin = $remark("remarkWikiLinks", () => remarkWikiLinks);

export function wikiLinkFromAttrs(attrs: Record<string, unknown>): WikiLink {
  return {
    target: String(attrs.target ?? ""),
    heading: typeof attrs.heading === "string" ? attrs.heading : null,
    label: typeof attrs.label === "string" ? attrs.label : null,
    embed: attrs.embed === true,
  };
}

/** Pasted HTML is untrusted: anything that would not write back cleanly is refused. */
function parseDomLink(dom: HTMLElement): WikiLink | false {
  const read = (name: string) => dom.getAttribute(`data-${name}`);
  const link: WikiLink = {
    target: read("target") ?? "",
    heading: read("heading"),
    label: read("label"),
    embed: read("embed") === "true",
  };
  return isWritableWikiLink(link) ? link : false;
}

/**
 * A wiki link: an inline atom that keeps exactly what the author typed
 * (`target`, `heading`, `label`, `embed`) and writes it back byte for byte.
 * Resolution (where it points, whether the page exists) is the host's job and
 * never stored in the document.
 */
export const wikiLinkSchema = $nodeSchema(wikiLinkId, () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  marks: "",
  attrs: {
    target: { default: "" },
    heading: { default: null },
    label: { default: null },
    embed: { default: false },
  },
  leafText: (node) => stringifyWikiLink(wikiLinkFromAttrs(node.attrs)),
  parseDOM: [
    {
      tag: 'a[data-type="wiki-link"]',
      getAttrs: (dom) => parseDomLink(dom as HTMLElement),
    },
  ],
  toDOM: (node) => {
    const link = wikiLinkFromAttrs(node.attrs);
    return [
      "a",
      {
        "data-type": "wiki-link",
        "data-target": link.target,
        ...(link.heading === null ? {} : { "data-heading": link.heading }),
        ...(link.label === null ? {} : { "data-label": link.label }),
        ...(link.embed ? { "data-embed": "true" } : {}),
      },
      wikiLinkText(link),
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === "wikiLink",
    runner: (state, node, type) => {
      state.addNode(type, {
        target: node.target,
        heading: node.heading ?? null,
        label: node.label ?? null,
        embed: node.embed === true,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === wikiLinkId,
    runner: (state, node) => {
      const link = wikiLinkFromAttrs(node.attrs);
      state.addNode("wikiLink", undefined, stringifyWikiLink(link).replace(/^!?\[\[|\]\]$/g, ""), {
        ...link,
      });
    },
  },
}));

/** What a link shows: its label, else `target › heading`, else `target`. */
export function wikiLinkText(link: WikiLink): string {
  if (link.label !== null && link.label !== "") return link.label;
  if (link.heading !== null) return link.target ? `${link.target} › ${link.heading}` : `#${link.heading}`;
  return link.target;
}

/** Typing the closing `]]` of `[[…]]` (or `![[…]]`) turns it into a link. */
export const wikiLinkInputRule = $inputRule(
  (ctx) =>
    new InputRule(/(!?)\[\[([^[\]\r\n]+)\]\]$/, (state, match, start, end) => {
      const [, bang, body] = match;
      const link = parseWikiLinkBody(body!, bang === "!");
      if (!isWritableWikiLink(link)) return null;
      const $start = state.doc.resolve(start);
      if ($start.parent.type.spec.code) return null;
      return state.tr.replaceWith(start, end, wikiLinkSchema.type(ctx).create(link));
    }),
);

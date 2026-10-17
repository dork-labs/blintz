import { InputRule } from "@milkdown/kit/prose/inputrules";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $inputRule, $nodeSchema, $prose, $remark } from "@milkdown/kit/utils";

import {
  isWritableWikiLink,
  parseWikiLinkSource,
  sourceIfUnchanged,
  writtenWikiLink,
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
    // Internal: the link as written (`[[a\\|b]]`), written back while the
    // parts are unchanged so unusual spellings survive a save.
    source: { default: null },
  },
  leafText: (node) =>
    sourceIfUnchanged({ ...wikiLinkFromAttrs(node.attrs), value: node.attrs.source ?? undefined }) ??
    stringifyWikiLink(wikiLinkFromAttrs(node.attrs)),
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
        source: typeof node.value === "string" ? node.value : null,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === wikiLinkId,
    runner: (state, node) => {
      const link = wikiLinkFromAttrs(node.attrs);
      const source = typeof node.attrs.source === "string" ? node.attrs.source : undefined;
      state.addNode("wikiLink", undefined, source, { ...link });
    },
  },
}));

/** What a link shows: its label, else `target › heading`, else `target`. */
export function wikiLinkText(link: WikiLink): string {
  if (link.label !== null && link.label !== "") return link.label;
  if (link.heading !== null) return link.target ? `${link.target} › ${link.heading}` : `#${link.heading}`;
  return link.target;
}

/**
 * Typing the closing `]]` of `[[…]]` (or `![[…]]`) turns it into a link. The
 * text must be plain characters: an inline node in the middle (an image, a
 * hard break) shows up as U+FFFC and refuses the rule, as does a code span.
 */
export const wikiLinkInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /(!?)\[\[([^[\]\r\n\ufffc]+)\]\]$/,
      (state, match, start, end) => {
        const [, bang, body] = match;
        const { link } = parseWikiLinkSource(body!, bang === "!");
        if (!isWritableWikiLink(link)) return null;
        const $start = state.doc.resolve(start);
        if ($start.parent.type.spec.code) return null;
        // Milkdown runs input rules itself and ignores `inCodeMark`; check here.
        const inCode = (pos: number) =>
          state.doc.resolve(pos).marks().some((mark) => mark.type.spec.code);
        if (inCode(start) || inCode(end)) return null;
        const node = wikiLinkSchema.type(ctx).create({ ...link, source: match[0] });
        return state.tr.replaceWith(start, end, node);
      },
    ),
);

/**
 * A wiki link can't live inside a code span (it would be written as literal
 * code, and the link lost). Strip any code mark a command puts on one, so the
 * span splits around the link instead.
 */
export const wikiLinkCodeGuard = $prose(
  () =>
    new Plugin({
      key: new PluginKey("blintz-wiki-link-code-guard"),
      appendTransaction(transactions, _old, state) {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        let tr = null as ReturnType<typeof state.tr.removeMark> | null;
        state.doc.descendants((node, pos) => {
          if (node.type.name !== wikiLinkId) return;
          for (const mark of node.marks) {
            if (mark.type.spec.code) {
              tr ??= state.tr;
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
            }
          }
        });
        return tr;
      },
    }),
);

const TABLE_CELLS = new Set(["table_cell", "table_header"]);

/**
 * Keeps every link's `source` equal to exactly what it will be written as
 * (new, pasted, edited or moved links included), so a document re-parsed from
 * its own saved markdown equals the live one and source mapping holds.
 */
export const wikiLinkSourceSync = $prose(
  () =>
    new Plugin({
      key: new PluginKey("blintz-wiki-link-source"),
      appendTransaction(transactions, _old, state) {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        let tr = null as ReturnType<typeof state.tr.setNodeAttribute> | null;
        state.doc.descendants((node, pos, parent) => {
          if (node.type.name !== wikiLinkId) return;
          const inCell = !!parent && TABLE_CELLS.has(state.doc.resolve(pos).node(-1)?.type.name ?? "");
          const link = wikiLinkFromAttrs(node.attrs);
          const written = writtenWikiLink(
            { ...link, value: typeof node.attrs.source === "string" ? node.attrs.source : undefined },
            inCell,
          );
          if (node.attrs.source !== written) {
            tr ??= state.tr;
            tr.setNodeAttribute(pos, "source", written);
          }
        });
        return tr?.setMeta("addToHistory", false) ?? null;
      },
    }),
);

import type { Data, Literal, PhrasingContent } from "mdast";
import type { CompileContext, Extension as FromMarkdownExtension, Token } from "mdast-util-from-markdown";
import type { Handle, Options as ToMarkdownExtension } from "mdast-util-to-markdown";
import type {
  Code,
  Construct,
  Effects,
  Extension as MicromarkExtension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { normalizeIdentifier } from "micromark-util-normalize-identifier";
import type { Processor } from "unified";

/**
 * A wiki link as written: `[[target]]`, `[[target#heading]]`,
 * `[[target|label]]`, `[[target#heading|label]]`, and the Obsidian embed form
 * `![[target]]`. The parts are split at the first `|` (label) and, before it,
 * the first `#` (heading), and kept exactly as typed (no trimming), so writing
 * them back reproduces the source byte for byte.
 */
export interface WikiLink {
  /** What the author typed before `#` / `|`: a title or slug, resolved by the host. */
  target: string;
  /** The part after `#`, or `null`. */
  heading: string | null;
  /** The part after `|`, or `null`. */
  label: string | null;
  /** `![[…]]`: an embed (transclusion) rather than a link. */
  embed: boolean;
}

/**
 * The mdast node. `value` is the whole source (`[[a|b]]`), so text-only views
 * of a tree (image alt text, `mdast-util-to-string`) keep the brackets.
 */
export interface WikiLinkNode extends Literal, WikiLink {
  type: "wikiLink";
  /** The source wrote `\|` (Obsidian's form inside tables); write it back that way. */
  escapedPipe?: boolean;
  data?: Data;
}

declare module "mdast" {
  interface PhrasingContentMap {
    wikiLink: WikiLinkNode;
  }
  interface RootContentMap {
    wikiLink: WikiLinkNode;
  }
}

declare module "micromark-util-types" {
  interface TokenTypeMap {
    wikiLink: "wikiLink";
    wikiLinkMarker: "wikiLinkMarker";
    wikiLinkData: "wikiLinkData";
  }
}

/** The longest text Blintz reads between `[[` and `]]`. */
export const MAX_WIKI_LINK_LENGTH = 1000;

/** Split the raw text between the brackets into its parts. */
export function parseWikiLinkBody(raw: string, embed = false): WikiLink {
  return parseWikiLinkSource(raw, embed).link;
}

/**
 * Like {@link parseWikiLinkBody}, also reporting whether the source escaped
 * its pipes (`[[a\|b]]`, the form a table cell needs). Escaped pipes are
 * read as plain `|` separators, so the resolver sees target `a`, not `a\`.
 */
export function parseWikiLinkSource(raw: string, embed = false) {
  const escapedPipe = raw.includes("\\|");
  const body = escapedPipe ? raw.replace(/\\\|/g, "|") : raw;
  const bar = body.indexOf("|");
  const head = bar === -1 ? body : body.slice(0, bar);
  const hash = head.indexOf("#");
  const link: WikiLink = {
    target: hash === -1 ? head : head.slice(0, hash),
    heading: hash === -1 ? null : head.slice(hash + 1),
    label: bar === -1 ? null : body.slice(bar + 1),
    embed,
  };
  return { link, escapedPipe };
}

/**
 * Write a wiki link back as markdown. `escapePipes` writes every `|` as `\|`,
 * which a table cell needs (an unescaped `|` would end the cell).
 */
export function stringifyWikiLink(link: WikiLink, escapePipes = false): string {
  const body = `${link.target}${link.heading === null ? "" : `#${link.heading}`}${
    link.label === null ? "" : `|${link.label}`
  }`;
  return `${link.embed ? "!" : ""}[[${escapePipes ? body.replace(/\|/g, "\\|") : body}]]`;
}

/**
 * Whether a link can be written back and read again as the same link: the
 * text between the brackets is non-empty, at most {@link MAX_WIKI_LINK_LENGTH}
 * characters, has no line break, square bracket or object-replacement
 * character, and parses back into exactly these parts.
 */
export function isWritableWikiLink(link: WikiLink): boolean {
  const written = stringifyWikiLink(link);
  const body = written.slice(link.embed ? 3 : 2, -2);
  if (body.length === 0 || body.length > MAX_WIKI_LINK_LENGTH) return false;
  if (/[[\]\r\n\ufffc]/.test(body)) return false;
  // A part ending in `\\` right before `|` or `#` would read as an escape.
  if (link.label !== null && /\\$/.test(link.heading ?? link.target)) return false;
  if (link.heading !== null && /\\$/.test(link.target)) return false;
  const back = parseWikiLinkBody(body, link.embed);
  return (
    back.target === link.target &&
    back.heading === link.heading &&
    back.label === link.label
  );
}

const codes = { bang: 33, leftParen: 40, leftBracket: 91, backslash: 92, rightBracket: 93, caret: 94 } as const;

function isLineEnding(code: Code): boolean {
  return code !== null && code < -2;
}

function tokenizeWikiLink(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const defined = this.parser.defined;
  let size = 0;
  let raw = "";

  const start: State = (code) => {
    effects.enter("wikiLink");
    if (code === codes.bang) {
      effects.enter("wikiLinkMarker");
      effects.consume(code);
      return openFirst;
    }
    effects.enter("wikiLinkMarker");
    return openFirst(code);
  };

  const openFirst: State = (code) => {
    if (code !== codes.leftBracket) return nok(code);
    effects.consume(code);
    return openSecond;
  };

  const openSecond: State = (code) => {
    if (code !== codes.leftBracket) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.enter("wikiLinkData");
    return inside;
  };

  const inside: State = (code) => {
    if (code === null || isLineEnding(code) || code === codes.leftBracket) return nok(code);
    if (code === codes.rightBracket) {
      if (size === 0) return nok(code);
      effects.exit("wikiLinkData");
      effects.enter("wikiLinkMarker");
      effects.consume(code);
      return closeSecond;
    }
    if (++size > MAX_WIKI_LINK_LENGTH) return nok(code);
    if (code === -2) raw += "\t";
    else if (code >= 0) raw += String.fromCodePoint(code);
    effects.consume(code);
    return inside;
  };

  const closeSecond: State = (code) => {
    if (code !== codes.rightBracket) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.exit("wikiLink");
    // When the document defines `[a]: url`, `[[a]]` is commonmark's `[`, a
    // reference link and `]`: keep that reading so the URL is not lost.
    if (defined.includes(normalizeIdentifier(raw))) return nok(code);
    // `[[a]](url)` and `[[a]][ref]` (with `ref` defined) are commonmark links
    // whose text is `[a]`; leave them to commonmark too.
    return effects.check(linkContinuation, nok, ok);
  };

  return start;
}

/**
 * Succeeds when what follows `]]` makes commonmark read `[…]` as a link: a
 * resource `(…)` or a full reference `[ref]` whose label is defined. A
 * footnote (`[^1]`), another wiki link, `[]` or an undefined label leaves the
 * wiki link alone.
 */
const linkContinuation: Construct = {
  partial: true,
  tokenize(this: TokenizeContext, effects, ok, nok) {
    const defined = this.parser.defined;
    let label = "";
    let size = 0;
    const consume = (code: Code) => {
      effects.enter("wikiLinkMarker");
      effects.consume(code);
      effects.exit("wikiLinkMarker");
    };
    const first: State = (code) => {
      if (code === codes.caret || code === codes.leftBracket) return nok(code);
      return inLabel(code);
    };
    const inLabel: State = (code) => {
      if (code === null || code === codes.leftBracket) return nok(code);
      if (isLineEnding(code)) {
        // Commonmark allows a line break inside a reference label.
        label += "\n";
        effects.enter("lineEnding");
        effects.consume(code);
        effects.exit("lineEnding");
        return inLabel;
      }
      if (code === codes.backslash) {
        label += "\\";
        consume(code);
        return escaped;
      }
      if (code === codes.rightBracket) {
        return defined.includes(normalizeIdentifier(label)) ? ok(code) : nok(code);
      }
      if (++size > MAX_WIKI_LINK_LENGTH) return nok(code);
      if (code === -2) label += "\t";
      else if (code >= 0) label += String.fromCodePoint(code);
      consume(code);
      return inLabel;
    };
    const escaped: State = (code) => {
      if (code === null || isLineEnding(code)) return inLabel(code);
      if (code >= 0) label += String.fromCodePoint(code);
      consume(code);
      return inLabel;
    };
    return (code) => {
      if (code === codes.leftParen) return ok(code);
      if (code !== codes.leftBracket) return nok(code);
      consume(code);
      return (next: Code) => {
        if (next === codes.rightBracket) return nok(next);
        return first(next);
      };
    };
  },
};

const wikiLinkConstruct: Construct = {
  name: "wikiLink",
  tokenize: tokenizeWikiLink,
  // Before commonmark's link and image starts, which also begin with `[` / `!`.
  add: "before",
};

/** micromark syntax for `[[…]]` and `![[…]]`. */
export function wikiLinkSyntax(): MicromarkExtension {
  return {
    text: {
      [codes.leftBracket]: wikiLinkConstruct,
      [codes.bang]: wikiLinkConstruct,
    },
  };
}

/** mdast-util-from-markdown extension: tokens → `wikiLink` nodes. */
export function wikiLinkFromMarkdown(): FromMarkdownExtension {
  let raw = "";
  return {
    enter: {
      wikiLink(this: CompileContext, token: Token) {
        raw = "";
        this.enter(
          { type: "wikiLink", value: "", target: "", heading: null, label: null, embed: false } as never,
          token,
        );
      },
    },
    exit: {
      wikiLinkData(this: CompileContext, token: Token) {
        raw = this.sliceSerialize(token);
      },
      wikiLink(this: CompileContext, token: Token) {
        const node = this.stack[this.stack.length - 1] as unknown as WikiLinkNode;
        const source = this.sliceSerialize(token);
        const { link } = parseWikiLinkSource(raw, source.startsWith("!"));
        Object.assign(node, link, { value: source });
        this.exit(token);
      },
    },
  };
}

/**
 * Write a link back exactly as it was written when its parts are unchanged
 * (the node's `value` is its source), so `[[a\\|b|c]]` and other unusual
 * spellings survive a save. Edited or new links are written in the canonical
 * form. Inside a table cell an unescaped `|` would end the cell, so pipes
 * are escaped there.
 */
const handleWikiLink: Handle = (node, _parent, state) => {
  const link = node as WikiLinkNode;
  const inCell = state.stack.includes("tableCell");
  const source = sourceIfUnchanged(link);
  if (source !== null && !(inCell && UNESCAPED_PIPE.test(source))) return source;
  return stringifyWikiLink(link, inCell);
};

const UNESCAPED_PIPE = /(^|[^\\])\|/;

/** The node's recorded source, when it still parses into the node's parts. */
export function sourceIfUnchanged(link: WikiLink & { value?: string }): string | null {
  const source = link.value;
  if (typeof source !== "string") return null;
  const match = /^(!?)\[\[([^]*)\]\]$/.exec(source);
  if (!match) return null;
  const { link: parsed } = parseWikiLinkSource(match[2]!, match[1] === "!");
  return parsed.target === link.target &&
    parsed.heading === link.heading &&
    parsed.label === link.label &&
    parsed.embed === link.embed
    ? source
    : null;
}

/** mdast-util-to-markdown extension: `wikiLink` nodes → `[[…]]`. */
export function wikiLinkToMarkdown(): ToMarkdownExtension {
  return {
    handlers: { wikiLink: handleWikiLink },
  };
}

/**
 * remark plugin for wiki links. Parsing and writing are exact: `[[a#b|c]]`
 * reads as `{ target: "a", heading: "b", label: "c" }` and writes back
 * unchanged. Text that only looks like a wiki link but was escaped
 * (`\[\[a]]`) stays text.
 */
export function remarkWikiLinks(this: Processor): void {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(wikiLinkSyntax());
  (data.fromMarkdownExtensions ??= []).push(wikiLinkFromMarkdown());
  (data.toMarkdownExtensions ??= []).push(wikiLinkToMarkdown());
}

export type { PhrasingContent };

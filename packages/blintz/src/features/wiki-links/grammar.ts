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

/** The mdast node: `{ type: "wikiLink", value: "<raw inside>", …WikiLink }`. */
export interface WikiLinkNode extends Literal, WikiLink {
  type: "wikiLink";
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

/** Split the raw text between the brackets into its parts. */
export function parseWikiLinkBody(raw: string, embed = false): WikiLink {
  const bar = raw.indexOf("|");
  const head = bar === -1 ? raw : raw.slice(0, bar);
  const label = bar === -1 ? null : raw.slice(bar + 1);
  const hash = head.indexOf("#");
  return {
    target: hash === -1 ? head : head.slice(0, hash),
    heading: hash === -1 ? null : head.slice(hash + 1),
    label,
    embed,
  };
}

/** Write a wiki link back as markdown. */
export function stringifyWikiLink(link: WikiLink): string {
  return `${link.embed ? "!" : ""}[[${link.target}${
    link.heading === null ? "" : `#${link.heading}`
  }${link.label === null ? "" : `|${link.label}`}]]`;
}

/**
 * Whether a link's parts can be written back and re-read as the same link: no
 * line breaks or square brackets anywhere, no `|` before the label, no `#` in
 * the target, and at least one character inside the brackets.
 */
export function isWritableWikiLink(link: WikiLink): boolean {
  const { target, heading, label } = link;
  if (/[[\]\r\n|#]/.test(target)) return false;
  if (heading !== null && /[[\]\r\n|]/.test(heading)) return false;
  if (label !== null && /[[\]\r\n]/.test(label)) return false;
  return (target + (heading ?? "") + (label ?? "")).length > 0 || heading !== null || label !== null;
}

const MAX_LENGTH = 1000;
const codes = { bang: 33, leftParen: 40, leftBracket: 91, rightBracket: 93 } as const;

function isLineEnding(code: Code): boolean {
  return code !== null && code < -2;
}

function tokenizeWikiLink(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  let size = 0;

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
    if (++size > MAX_LENGTH) return nok(code);
    effects.consume(code);
    return inside;
  };

  const closeSecond: State = (code) => {
    if (code !== codes.rightBracket) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.exit("wikiLink");
    // `[[a]](url)` and `[[a]][ref]` are commonmark links whose text is
    // `[a]`; leave them to commonmark.
    return effects.check(linkContinuation, nok, ok);
  };

  return start;
}

const linkContinuation: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    const bracket: State = (code) => {
      // `[[a]][[b]]` is two wiki links, not a reference link.
      return code === codes.leftBracket ? nok(code) : ok(code);
    };
    return (code) => {
      if (code === codes.leftParen) return ok(code);
      if (code !== codes.leftBracket) return nok(code);
      effects.enter("wikiLinkMarker");
      effects.consume(code);
      effects.exit("wikiLinkMarker");
      return bracket;
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
  return {
    enter: {
      wikiLink(this: CompileContext, token: Token) {
        this.enter(
          { type: "wikiLink", value: "", target: "", heading: null, label: null, embed: false } as never,
          token,
        );
      },
    },
    exit: {
      wikiLinkData(this: CompileContext, token: Token) {
        const node = this.stack[this.stack.length - 1] as unknown as WikiLinkNode;
        node.value = this.sliceSerialize(token);
      },
      wikiLink(this: CompileContext, token: Token) {
        const node = this.stack[this.stack.length - 1] as unknown as WikiLinkNode;
        const embed = this.sliceSerialize(token).startsWith("!");
        Object.assign(node, parseWikiLinkBody(node.value, embed));
        this.exit(token);
      },
    },
  };
}

const handleWikiLink: Handle = (node) => stringifyWikiLink(node as WikiLinkNode);

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

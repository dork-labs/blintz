import type { Paragraph } from "mdast";
import {
  directiveFromMarkdown,
  directiveToMarkdown,
} from "mdast-util-directive";
import { fromMarkdown } from "mdast-util-from-markdown";
import { defaultHandlers, type Handle } from "mdast-util-to-markdown";
import { directive } from "micromark-extension-directive";
import type { Processor } from "unified";

/**
 * Block directives only: `::name[label]{attrs}` (leaf) and
 * `:::name[label]{attrs} … :::` (container).
 *
 * Inline (text) directives are deliberately left out. The full directive
 * grammar reads any `:word` in prose as a directive and, on the way out,
 * escapes a colon before a letter (`:smile:` becomes `\:smile:`), which would
 * rewrite ordinary documents that never meant to use directives. Dropping the
 * text construct and its phrasing escape leaves prose alone. Only a line that
 * is a complete directive (`::name`, `::name[label]{attrs}`, `:::name…` and
 * nothing after it) changes meaning, and only such a line is escaped when it
 * is meant as text.
 *
 * Attributes come back in one canonical form: double-quoted `key="value"`
 * pairs in their written order, so `{a='x' b=y}` and `{#main .wide}` are
 * normalized (content survives) while `{a="x"}` is byte-identical.
 */
export function remarkBlockDirectives(this: Processor): void {
  const data = this.data();
  // `key="value"` is how hosts and agents write attributes, so keep it:
  // without this, `{id="42"}` would come back as `{#42}`. The `#id` / `.class`
  // shorthand is still read, and written back in the long form.
  const toMarkdown = directiveToMarkdown({ preferShortcut: false });
  // Wrap whichever paragraph handler an earlier plugin registered, if any.
  const previous: Handle =
    [...(data.toMarkdownExtensions ?? [])]
      .reverse()
      .flatMap((extension) => ("handlers" in extension ? [extension.handlers?.paragraph] : []))
      .find((handle): handle is Handle => typeof handle === "function") ??
    (defaultHandlers.paragraph as Handle);
  (data.micromarkExtensions ??= []).push({ flow });
  (data.fromMarkdownExtensions ??= []).push(directiveFromMarkdown());
  (data.toMarkdownExtensions ??= []).push({
    ...toMarkdown,
    handlers: { ...toMarkdown.handlers, paragraph: guardParagraph(previous) },
    // Keep the label line-break guards. Drop the phrasing rule (it exists only
    // for text directives) and the at-break rule, which escapes ANY line
    // starting with `::`; the guarded paragraph handler escapes precisely.
    unsafe: (toMarkdown.unsafe ?? []).filter(
      (rule) => !rule.inConstruct?.includes("phrasing") && !rule.atBreak,
    ),
  });
}

const { flow } = directive();
const parseOptions = {
  extensions: [{ flow }],
  mdastExtensions: [directiveFromMarkdown()],
};

function parseFlow(markdown: string) {
  return fromMarkdown(markdown, parseOptions).children;
}

// Validity comes from the real tokenizer, never a hand-copied regex: the
// directive grammar's idea of a name or attribute key changes between
// versions (Unicode names, a digit first), and any disagreement either loses
// content or turns text into an embed.
function memo(check: (value: string) => boolean) {
  const cache = new Map<string, boolean>();
  return (value: string): boolean => {
    let known = cache.get(value);
    if (known === undefined) {
      known = check(value);
      if (cache.size > 1000) cache.clear();
      cache.set(value, known);
    }
    return known;
  };
}

/** Whether `name` round-trips as a directive name (`::name`). */
export const isDirectiveName = memo((name) => {
  if (!name || /[\s[\]{}"'=:\\]/.test(name)) return false;
  const nodes = parseFlow(`::${name}`);
  const node = nodes[0];
  return (
    nodes.length === 1 &&
    node?.type === "leafDirective" &&
    node.name === name &&
    node.children.length === 0 &&
    Object.keys(node.attributes ?? {}).length === 0
  );
});

/** Whether `key` round-trips as an attribute key (`{key="v"}`). */
export const isAttributeKey = memo((key) => {
  if (!key || /[\s"'={}\\]/.test(key)) return false;
  const nodes = parseFlow(`::a{${key}="v"}`);
  const node = nodes[0];
  if (nodes.length !== 1 || node?.type !== "leafDirective") return false;
  const attributes = node.attributes ?? {};
  const keys = Object.keys(attributes);
  return keys.length === 1 && keys[0] === key && attributes[key] === "v";
});

/** Whether a line, on its own, would open a leaf or container directive. */
function opensDirective(line: string): boolean {
  if (!/^[ \t]*::/.test(line)) return false;
  const node = parseFlow(line)[0];
  return node?.type === "leafDirective" || node?.type === "containerDirective";
}

// Parents whose paragraphs start a line of flow content. A paragraph
// anywhere else (a table cell) is mid-line, so it can never open a directive.
const FLOW_PARENTS = new Set([
  "root",
  "blockquote",
  "listItem",
  "containerDirective",
  "footnoteDefinition",
]);

// Cheap pre-check before re-parsing: some line starts with `::` then a
// non-space, non-colon character (every directive opening does).
const MAY_OPEN_DIRECTIVE = /^[ \t]*::+[^\s:]/m;

/**
 * Wraps the paragraph handler with one guard. When a written paragraph would
 * re-parse as something other than one paragraph because a line opens a
 * directive (`::note` typed as prose, or `::x{a="*b*"}` whose braces span
 * marks), that line's first colon is escaped. A paragraph that already
 * re-parses as a single paragraph is returned untouched, so colon-led prose
 * stays byte-identical.
 */
function guardParagraph(inner: Handle): Handle {
  return (node, parent, state, info) => {
    const value = inner(node as Paragraph, parent, state, info) as string;
    if (!FLOW_PARENTS.has(parent?.type ?? "root")) return value;
    if (!MAY_OPEN_DIRECTIVE.test(value)) return value;
    const reparsed = parseFlow(value);
    if (reparsed.length === 1 && reparsed[0]?.type === "paragraph") return value;
    return value
      .split("\n")
      .map((line) => (opensDirective(line) ? line.replace(":", "\\:") : line))
      .join("\n");
  };
}

/** Directive attributes as written: `{src="a" .wide #main}` → `{ src: "a", class: "wide", id: "main" }`. */
export type EmbedAttributes = Record<string, string>;

/** One validation problem, shaped like a Standard Schema issue. */
export interface EmbedIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

/** No `issues` (or an empty list) means the attributes are valid. */
export interface EmbedValidationResult {
  readonly issues?: ReadonlyArray<EmbedIssue>;
}

/**
 * The Standard Schema v1 interface (https://standardschema.dev), copied rather
 * than imported so Blintz stays validator-agnostic: Zod, Valibot, ArkType and
 * others implement it.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | StandardSchemaV1.Result<Output>
      | Promise<StandardSchemaV1.Result<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

export declare namespace StandardSchemaV1 {
  type Result<Output> =
    | { readonly value: Output; readonly issues?: undefined }
    | { readonly issues: ReadonlyArray<EmbedIssue> };
}

/** A Standard Schema, or a plain function returning `{ issues }`. */
export type EmbedValidator =
  | StandardSchemaV1
  | ((
      attributes: EmbedAttributes,
    ) => EmbedValidationResult | Promise<EmbedValidationResult>);

/**
 * Validate an embed's attributes with whichever validator the host registered.
 * A validator that throws is reported as an issue rather than propagated, so a
 * bad schema cannot take the editor (or a publish run) down.
 */
export async function validateEmbedAttributes(
  validator: EmbedValidator | undefined,
  attributes: EmbedAttributes,
): Promise<EmbedValidationResult> {
  if (!validator) return {};
  try {
    const result =
      typeof validator === "function"
        ? await validator(attributes)
        : await validator["~standard"].validate(attributes);
    return { issues: result.issues?.length ? result.issues : undefined };
  } catch (error) {
    return {
      issues: [
        { message: error instanceof Error ? error.message : String(error) },
      ],
    };
  }
}

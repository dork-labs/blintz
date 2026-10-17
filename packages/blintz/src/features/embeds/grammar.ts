import {
  directiveFromMarkdown,
  directiveToMarkdown,
} from "mdast-util-directive";
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
 * text construct and its phrasing escape keeps every existing document
 * byte-identical; only a line that starts with `::` changes meaning.
 *
 * Attributes come back in one canonical form: double-quoted `key="value"`
 * pairs in their written order, so `{a='x' b=y}` and `{#main .wide}` are
 * normalized (content survives) while `{a="x"}` is byte-identical.
 */
export function remarkBlockDirectives(this: Processor): void {
  const data = this.data();
  const { flow } = directive();
  // `key="value"` is how hosts and agents write attributes, so keep it:
  // without this, `{id="42"}` would come back as `{#42}`. The `#id` / `.class`
  // shorthand is still read, and written back in the long form.
  const toMarkdown = directiveToMarkdown({ preferShortcut: false });
  (data.micromarkExtensions ??= []).push({ flow });
  (data.fromMarkdownExtensions ??= []).push(directiveFromMarkdown());
  (data.toMarkdownExtensions ??= []).push({
    ...toMarkdown,
    // Keep the label line-break guards and the `::` at-break escape (a
    // paragraph line that starts with `::` must not turn into a directive);
    // drop the phrasing rule that only exists for text directives.
    unsafe: (toMarkdown.unsafe ?? []).filter(
      (rule) => !rule.inConstruct?.includes("phrasing"),
    ),
  });
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

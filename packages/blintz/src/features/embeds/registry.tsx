import { createContext, useContext, type ComponentType, type ReactNode } from "react";

import type { EmbedAttributes, EmbedValidator } from "./grammar";

/** What a registered embed component receives. It must render from these props alone. */
export interface EmbedProps {
  /** The directive name, e.g. `chart` for `::chart{…}`. */
  name: string;
  /** The directive's attributes as written (all values are strings). */
  attributes: EmbedAttributes;
  /** The directive label as plain text (`::chart[Q3 tasks]` → `"Q3 tasks"`), or `""`. */
  label: string;
  /** For container directives (`:::name … :::`): the editable markdown inside. */
  children?: ReactNode;
  /** Whether the document is editable right now. */
  editable: boolean;
  /**
   * Replace the directive's attributes in the document. Present only while the
   * document is editable; the change is one undoable step.
   */
  updateAttributes?: (attributes: EmbedAttributes) => void;
}

/** One entry in the host's embed catalog. */
export interface EmbedDefinition {
  /** Renders the embed. Container directives receive their content as `children`. */
  component: ComponentType<EmbedProps>;
  /** Optional attribute validator: a Standard Schema or a plain function. */
  validate?: EmbedValidator;
  /**
   * How the slash menu inserts it: `"leaf"` (`::name{…}`, the default) or
   * `"container"` (`:::name … :::`). Both forms render whichever way they are written.
   */
  kind?: "leaf" | "container";
  /** Slash-menu title. Defaults to the name. */
  title?: string;
  /** Slash-menu icon as an inline SVG string. */
  icon?: string;
  /** Attributes a slash-menu insert starts with. */
  defaultAttributes?: EmbedAttributes;
  /** Set to hide the embed from the slash menu (it still renders). */
  hideFromMenu?: boolean;
}

/** The host's embed catalog: directive name → definition. */
export type EmbedRegistry = Readonly<Record<string, EmbedDefinition>>;

const EMPTY: EmbedRegistry = {};
const EmbedRegistryContext = createContext<EmbedRegistry>(EMPTY);

export const EmbedRegistryProvider = EmbedRegistryContext.Provider;

/** The live embed registry for node views and the slash menu. */
export function useEmbedRegistry(): EmbedRegistry {
  return useContext(EmbedRegistryContext);
}

/** Own-property lookup, so `::constructor` or `::toString` never resolve to Object.prototype. */
export function lookupEmbed(
  registry: EmbedRegistry,
  name: string,
): EmbedDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(registry, name)
    ? registry[name]
    : undefined;
}

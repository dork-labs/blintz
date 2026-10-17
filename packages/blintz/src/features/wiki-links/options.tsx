import { createContext, useContext, useMemo } from "react";

import type { WikiLink } from "./grammar";

/** Where a wiki link points, as the host resolves it. */
export interface WikiLinkResolution {
  /** Whether the target page exists. Missing links render as such. */
  exists: boolean;
  /** Link destination (rendered as the anchor's `href`). */
  href?: string;
  /** Tooltip / accessible description, e.g. the page's full title. */
  title?: string;
}

/** One `[[` autocomplete suggestion. */
export interface WikiLinkSuggestion {
  /** What gets written as the link target: a title or slug. */
  target: string;
  /** Shown in the menu; defaults to `target`. */
  title?: string;
  /** A second line in the menu, e.g. the page's space or path. */
  description?: string;
}

/** The `wikiLinks` prop: how the host resolves, suggests, and opens wiki links. */
export interface WikiLinkOptions {
  /**
   * Resolve a link (sync or async). Called once per distinct target, heading
   * and link/embed kind while this function stays the same, failures
   * included. Pass a stable function (or memoize it) so results stay cached;
   * pass a new one to refresh every link, e.g. after a page is created.
   */
  resolve?: (link: WikiLink) => WikiLinkResolution | Promise<WikiLinkResolution>;
  /** Suggestions for the `[[` menu (sync or async). Omit to turn the menu off. */
  search?: (query: string) => WikiLinkSuggestion[] | Promise<WikiLinkSuggestion[]>;
  /**
   * Open a link: plain click in a read-only document, Cmd/Ctrl-click while
   * editing. Without it, the anchor's `href` is followed.
   */
  onOpen?: (link: WikiLink, resolution: WikiLinkResolution | undefined) => void;
}

type Entry =
  | { state: "pending" }
  | { state: "resolved"; resolution: WikiLinkResolution }
  | { state: "failed" };

/** Per-resolver cache of resolutions, keyed by target and heading. */
export class WikiLinkResolver {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private readonly resolve: WikiLinkOptions["resolve"];

  constructor(resolve: WikiLinkOptions["resolve"]) {
    this.resolve = resolve;
  }

  get enabled(): boolean {
    return typeof this.resolve === "function";
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The current entry for a link, starting resolution on first sight. */
  read(link: WikiLink): Entry | undefined {
    if (!this.resolve) return undefined;
    const key = `${link.embed ? "!" : ""}${link.target}\u0000${link.heading ?? ""}`;
    const cached = this.entries.get(key);
    if (cached) return cached;
    const settle = (entry: Entry) => {
      this.entries.set(key, entry);
      queueMicrotask(() => this.listeners.forEach((listener) => listener()));
    };
    try {
      const result = this.resolve(link);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        const pending: Entry = { state: "pending" };
        this.entries.set(key, pending);
        Promise.resolve(result).then(
          (resolution) => settle({ state: "resolved", resolution }),
          () => settle({ state: "failed" }),
        );
        return pending;
      }
      const entry: Entry = { state: "resolved", resolution: result as WikiLinkResolution };
      this.entries.set(key, entry);
      return entry;
    } catch {
      const entry: Entry = { state: "failed" };
      this.entries.set(key, entry);
      return entry;
    }
  }
}

interface WikiLinkContextValue {
  options: WikiLinkOptions;
  resolver: WikiLinkResolver;
}

const EMPTY: WikiLinkOptions = {};
const WikiLinkContext = createContext<WikiLinkContextValue>({
  options: EMPTY,
  resolver: new WikiLinkResolver(undefined),
});

/** Provides the host's wiki-link options; a new `resolve` function starts a fresh cache. */
export function WikiLinkProvider({
  options = EMPTY,
  children,
}: {
  options?: WikiLinkOptions;
  children: React.ReactNode;
}) {
  const resolver = useMemo(() => new WikiLinkResolver(options.resolve), [options.resolve]);
  const value = useMemo(() => ({ options, resolver }), [options, resolver]);
  return <WikiLinkContext.Provider value={value}>{children}</WikiLinkContext.Provider>;
}

export function useWikiLinks(): WikiLinkContextValue {
  return useContext(WikiLinkContext);
}

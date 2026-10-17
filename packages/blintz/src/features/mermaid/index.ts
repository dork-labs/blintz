import type { Editor } from "@milkdown/kit/core";

import { codeBlockConfig } from "../code-block/config";

/** The slice of the `mermaid` package Blintz uses (v10 or later). */
export interface MermaidModule {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
  /** Used, when present, to keep the host's own mermaid settings intact. */
  mermaidAPI?: { getSiteConfig?: () => object };
}

/**
 * Loads mermaid on demand, e.g. `() => import("mermaid")`. Blintz calls it the
 * first time a `mermaid` code block needs a preview, so the host pays for the
 * library only in documents that have a diagram, and can share its own copy.
 */
export type MermaidLoader = () => Promise<MermaidModule | { default: MermaidModule }>;

/** How long a load or a single render may take before it is given up on. */
const LOAD_TIMEOUT_MS = 20_000;
const RENDER_TIMEOUT_MS = 10_000;
/** Quiet period after an edit before a diagram is re-drawn. */
export const DIAGRAM_DEBOUNCE_MS = 250;

const loaded = new WeakMap<MermaidLoader, Promise<MermaidModule>>();

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function asModule(value: unknown): MermaidModule {
  const candidate =
    value && typeof value === "object" && "default" in value && (value as { default?: unknown }).default
      ? (value as { default: unknown }).default
      : value;
  const module = candidate as Partial<MermaidModule> | null | undefined;
  if (!module || typeof module.initialize !== "function" || typeof module.render !== "function") {
    throw new Error("The mermaid loader did not return the mermaid module.");
  }
  return module as MermaidModule;
}

function load(loader: MermaidLoader): Promise<MermaidModule> {
  let module = loaded.get(loader);
  if (!module) {
    module = withTimeout(Promise.resolve().then(loader), LOAD_TIMEOUT_MS, "Loading mermaid").then(asModule);
    // A failed or timed-out load is retried on the next render.
    module.catch(() => loaded.delete(loader));
    loaded.set(loader, module);
  }
  return module;
}

// mermaid keeps one global configuration, so renders run one at a time: each
// applies Blintz's settings on top of the host's, renders, then restores the
// host's settings. Every step is time-limited, so one stuck load or render
// can never hold up the diagrams behind it. A render that times out may still
// be running inside mermaid (it can't be cancelled); the next one proceeds
// anyway, and a truly hung mermaid makes each later diagram fail in turn
// rather than wait forever.
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/** Render one diagram to SVG markup (sanitized later by the preview panel). */
export function renderMermaid(
  loader: MermaidLoader,
  source: string,
  theme: "light" | "dark",
  signal?: AbortSignal,
): Promise<string> {
  const run = queue.then(async () => {
    if (signal?.aborted) throw abortError();
    const mermaid = await load(loader);
    if (signal?.aborted) throw abortError();
    // Draw with the host's settings minus `themeVariables`: mermaid stores the
    // colours computed for the current theme there, and carrying them over
    // would paint a dark diagram in light colours. The restore afterwards
    // puts the host's full settings back, its own colours included.
    const site = mermaid.mermaidAPI?.getSiteConfig?.() as Record<string, unknown> | undefined;
    mermaid.initialize({
      ...withoutThemeVariables(site),
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default",
    });
    const id = `blintz-mermaid-${++counter}`;
    try {
      const { svg } = await withTimeout(mermaid.render(id, source), RENDER_TIMEOUT_MS, "Drawing this diagram");
      return svg;
    } finally {
      // On a syntax error mermaid leaves its scratch element in the document.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      if (site) mermaid.initialize(site);
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

function withoutThemeVariables(site: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!site) return {};
  const { themeVariables: _computed, ...rest } = site;
  return rest;
}

function abortError(): Error {
  const error = new Error("Superseded by a newer edit.");
  error.name = "AbortError";
  return error;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** What a diagram that fails to load or parse shows instead. */
export function diagramErrorHtml(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<div class="blintz-diagram-error"><strong>This diagram can't be drawn.</strong> <span>${escapeHtml(
    message.split("\n").slice(0, 6).join("\n"),
  )}</span></div>`;
}

/**
 * mermaid — previews ` ```mermaid ` code blocks as diagrams, through the
 * host's loader (the `mermaid` prop, passed in `options`). Without a loader
 * they stay ordinary code blocks. Registered after the code-block feature: it
 * wraps that feature's `renderPreview`, and every other language falls through.
 *
 * Re-draws wait for a short pause in typing, and a render that a newer edit
 * superseded (its `signal` aborted) is skipped, not run and discarded.
 */
export function mermaidFeature(editor: Editor): void {
  editor.config((ctx) => {
    ctx.update(codeBlockConfig.key, (prev) => ({
      ...prev,
      renderPreview: (language, content, applyPreview, options) => {
        if (language.toLowerCase() !== "mermaid") {
          return prev.renderPreview(language, content, applyPreview, options);
        }
        const loader = options?.mermaid;
        if (!loader || content.trim().length === 0) return null;
        const signal = options?.signal;
        const timer = setTimeout(() => {
          renderMermaid(loader, content, options?.theme ?? "light", signal).then(
            (svg) => applyPreview(svg),
            (error: unknown) => {
              if ((error as Error | undefined)?.name !== "AbortError") applyPreview(diagramErrorHtml(error));
            },
          );
        }, options?.immediate ? 0 : DIAGRAM_DEBOUNCE_MS);
        signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
        return undefined;
      },
    }));
  });
}

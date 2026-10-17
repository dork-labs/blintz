import type { Editor } from "@milkdown/kit/core";

import { codeBlockConfig } from "../code-block/config";

/** The slice of the `mermaid` package Blintz uses (v10 or later). */
export interface MermaidModule {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

/**
 * Loads mermaid on demand, e.g. `() => import("mermaid")`. Blintz calls it the
 * first time a `mermaid` code block needs a preview, so the host pays for the
 * library only in documents that have a diagram, and can share its own copy.
 */
export type MermaidLoader = () => Promise<MermaidModule | { default: MermaidModule }>;

const loaded = new WeakMap<MermaidLoader, Promise<MermaidModule>>();

function load(loader: MermaidLoader): Promise<MermaidModule> {
  let module = loaded.get(loader);
  if (!module) {
    module = loader().then((value) => ("default" in value && value.default ? value.default : (value as MermaidModule)));
    // A failed load can be retried on the next render.
    module.catch(() => loaded.delete(loader));
    loaded.set(loader, module);
  }
  return module;
}

// mermaid keeps one global configuration, so renders run one at a time: each
// sets its theme, renders, and cleans up before the next starts.
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/** Render one diagram to SVG markup (sanitized later by the preview panel). */
export function renderMermaid(
  loader: MermaidLoader,
  source: string,
  theme: "light" | "dark",
): Promise<string> {
  const run = queue.then(async () => {
    const mermaid = await load(loader);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default",
    });
    const id = `blintz-mermaid-${++counter}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } finally {
      // On a syntax error mermaid leaves its scratch element in the document.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** What a diagram that fails to load or parse shows instead. */
export function diagramErrorHtml(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<div class="blintz-diagram-error" role="alert"><strong>This diagram can't be drawn.</strong> <span>${escapeHtml(
    message.split("\n").slice(0, 6).join("\n"),
  )}</span></div>`;
}

/**
 * mermaid — previews ` ```mermaid ` code blocks as diagrams, through the
 * host's loader (the `mermaid` prop). Without a loader they stay ordinary code
 * blocks. Registered after the code-block feature: it wraps that feature's
 * `renderPreview`, and every other language falls through.
 */
export function mermaidFeature(editor: Editor, getLoader: () => MermaidLoader | undefined): void {
  editor.config((ctx) => {
    ctx.update(codeBlockConfig.key, (prev) => ({
      ...prev,
      renderPreview: (language, content, applyPreview, options) => {
        if (language.toLowerCase() !== "mermaid") {
          return prev.renderPreview(language, content, applyPreview, options);
        }
        const loader = getLoader();
        if (!loader || content.trim().length === 0) return null;
        renderMermaid(loader, content, options?.theme ?? "light").then(
          (svg) => applyPreview(svg),
          (error: unknown) => applyPreview(diagramErrorHtml(error)),
        );
        return undefined;
      },
    }));
  });
}

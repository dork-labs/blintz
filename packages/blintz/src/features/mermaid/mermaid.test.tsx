/**
 * @vitest-environment jsdom
 *
 * Diagram previews with a fake mermaid: loading on demand, theming, errors,
 * ordering, and the editor wiring (no loader → plain code).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MarkdownEditor } from "../../MarkdownEditor";
import { getGroups } from "../block-edit/menu-config";
import { diagramErrorHtml, renderMermaid, type MermaidLoader, type MermaidModule } from ".";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Range.prototype.getClientRects ??= () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

function fakeMermaid(delays: Record<string, number> = {}) {
  let theme = "";
  const calls: Array<{ theme: string; text: string }> = [];
  const module: MermaidModule = {
    initialize: (config) => {
      theme = String(config.theme);
    },
    render: async (id, text) => {
      calls.push({ theme, text });
      const scratch = document.createElement("div");
      scratch.id = `d${id}`;
      document.body.append(scratch);
      await new Promise((resolve) => setTimeout(resolve, delays[text] ?? 0));
      if (text.includes("bad")) throw new Error("Parse error on line 1: <script>");
      return { svg: `<svg data-theme="${theme}" data-text="${text}"><g></g></svg>` };
    },
  };
  return { module, calls };
}

describe("renderMermaid", () => {
  it("loads once, renders with the theme, and cleans up", async () => {
    const { module, calls } = fakeMermaid();
    const loader = vi.fn(async () => ({ default: module }));
    const light = await renderMermaid(loader, "graph A", "light");
    const dark = await renderMermaid(loader, "graph B", "dark");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(light).toContain('data-theme="default"');
    expect(dark).toContain('data-theme="dark"');
    expect(calls.map((call) => call.text)).toEqual(["graph A", "graph B"]);
    expect(document.querySelectorAll('[id^="dblintz-mermaid-"]')).toHaveLength(0);
  });

  it("runs renders one at a time so themes never cross", async () => {
    const { module } = fakeMermaid({ slow: 30 });
    const loader: MermaidLoader = async () => module;
    const [first, second] = await Promise.all([
      renderMermaid(loader, "slow", "dark"),
      renderMermaid(loader, "fast", "light"),
    ]);
    expect(first).toContain('data-theme="dark"');
    expect(second).toContain('data-theme="default"');
  });

  it("rejects on a syntax error and still cleans up", async () => {
    const { module } = fakeMermaid();
    await expect(renderMermaid(async () => module, "bad", "light")).rejects.toThrow("Parse error");
    expect(document.querySelectorAll('[id^="dblintz-mermaid-"]')).toHaveLength(0);
  });

  it("retries a loader that failed", async () => {
    const { module } = fakeMermaid();
    let attempts = 0;
    const loader: MermaidLoader = async () => {
      if (++attempts === 1) throw new Error("offline");
      return module;
    };
    await expect(renderMermaid(loader, "graph A", "light")).rejects.toThrow("offline");
    await expect(renderMermaid(loader, "graph A", "light")).resolves.toContain("<svg");
  });

  it("keeps the host's own mermaid settings, minus computed theme colours", async () => {
    const host = { theme: "forest", securityLevel: "loose", fontFamily: "HostFont" };
    const seen: Array<Record<string, unknown>> = [];
    const module: MermaidModule = {
      initialize: (config) => void seen.push(config),
      render: async () => ({ svg: "<svg></svg>" }),
      mermaidAPI: { getSiteConfig: () => ({ ...host, themeVariables: { primaryColor: "#ECECFF" } }) },
    };
    await renderMermaid(async () => module, "graph A", "dark");
    expect(seen[0]).toMatchObject({ fontFamily: "HostFont", securityLevel: "strict", theme: "dark" });
    expect(seen[0]).not.toHaveProperty("themeVariables");
    expect(seen.at(-1)).toEqual(host);
  });

  it("gives up on a stalled load so later diagrams still draw", async () => {
    vi.useFakeTimers();
    try {
      const stuck: MermaidLoader = () => new Promise(() => {});
      const { module } = fakeMermaid();
      const first = renderMermaid(stuck, "graph A", "light");
      const firstSettled = expect(first).rejects.toThrow(/took longer/);
      const second = renderMermaid(async () => module, "graph B", "light");
      await vi.advanceTimersByTimeAsync(21_000);
      await firstSettled;
      await expect(second).resolves.toContain('data-text="graph B"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips a render whose edit was superseded", async () => {
    const { module, calls } = fakeMermaid();
    const controller = new AbortController();
    controller.abort();
    await expect(renderMermaid(async () => module, "graph A", "light", controller.signal)).rejects.toThrow(/Superseded/);
    expect(calls).toHaveLength(0);
  });

  it("explains a loader that returns something else", async () => {
    await expect(renderMermaid(async () => undefined as never, "graph A", "light")).rejects.toThrow(
      "did not return the mermaid module",
    );
  });

  it("escapes the error message", () => {
    expect(diagramErrorHtml(new Error("<script>x</script>"))).not.toContain("<script>");
  });
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function waitFor(check: () => boolean, timeout = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function mount(value: string, props: { mermaid?: MermaidLoader; theme?: "light" | "dark" }) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<MarkdownEditor value={value} {...props} />));
  await waitFor(() => host!.querySelector(".ProseMirror") !== null);
  return host;
}

const DIAGRAM = "```mermaid\ngraph A\n```\n";

describe("<MarkdownEditor mermaid>", () => {
  it("draws a mermaid block through the loader", async () => {
    const { module } = fakeMermaid();
    const el = await mount(DIAGRAM, { mermaid: async () => module, theme: "dark" });
    await waitFor(() => el.querySelector(".preview svg") !== null);
    expect(el.querySelector(".preview svg")!.getAttribute("data-theme")).toBe("dark");
  });

  it("re-draws when the theme changes", async () => {
    const { module } = fakeMermaid();
    const loader: MermaidLoader = async () => module;
    const el = await mount(DIAGRAM, { mermaid: loader, theme: "light" });
    await waitFor(() => el.querySelector(".preview svg")?.getAttribute("data-theme") === "default");
    await act(async () => root!.render(<MarkdownEditor value={DIAGRAM} mermaid={loader} theme="dark" />));
    await waitFor(() => el.querySelector(".preview svg")?.getAttribute("data-theme") === "dark");
  });

  it("shows an error for a diagram that can't be drawn", async () => {
    const { module } = fakeMermaid();
    const el = await mount("```mermaid\nbad\n```\n", { mermaid: async () => module });
    await waitFor(() => el.querySelector(".blintz-diagram-error") !== null);
    expect(el.querySelector(".blintz-diagram-error script")).toBeNull();
  });

  it("leaves mermaid blocks as code without a loader", async () => {
    const el = await mount(DIAGRAM, {});
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(el.querySelector(".preview-panel")).toBeNull();
    expect(el.querySelector(".cm-content")?.textContent).toContain("graph A");
  });

  it("never shows an older render that finishes after the diagram changed", async () => {
    const { module } = fakeMermaid({ "graph A": 40, "graph B": 200 });
    const loader: MermaidLoader = async () => module;
    const el = await mount(DIAGRAM, { mermaid: loader });
    // Change the diagram while the first render is still running.
    await act(async () =>
      root!.render(<MarkdownEditor value={"```mermaid\ngraph B\n```\n"} mermaid={loader} />),
    );
    // A finishes (~40 ms) while B is still drawing: A must not appear.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
    expect(el.querySelector('.preview svg[data-text="graph A"]')).toBeNull();
    await waitFor(() => el.querySelector(".preview svg")?.getAttribute("data-text") === "graph B");
  });
});

describe("<MarkdownEditor mermaid> while editing", () => {
  it("draws only after typing pauses", async () => {
    const { module, calls } = fakeMermaid();
    const loader: MermaidLoader = async () => module;
    const el = await mount(DIAGRAM, { mermaid: loader });
    await waitFor(() => el.querySelector(".preview svg") !== null);
    calls.length = 0;
    for (const text of ["graph AB", "graph ABC", "graph ABCD"]) {
      await act(async () =>
        root!.render(<MarkdownEditor value={"```mermaid\n" + text + "\n```\n"} mermaid={loader} />),
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));
    }
    await waitFor(() => el.querySelector(".preview svg")?.getAttribute("data-text") === "graph ABCD");
    expect(calls.map((call) => call.text)).toEqual(["graph ABCD"]);
  });

  it("never re-draws when the host re-renders with an inline loader", async () => {
    const { module, calls } = fakeMermaid();
    let loads = 0;
    const el = await mount(DIAGRAM, {
      mermaid: async () => {
        loads++;
        return module;
      },
    });
    await waitFor(() => el.querySelector(".preview svg") !== null);
    for (let i = 0; i < 5; i++) {
      await act(async () =>
        root!.render(
          <MarkdownEditor
            value={DIAGRAM}
            mermaid={async () => {
              loads++;
              return module;
            }}
          />,
        ),
      );
    }
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(calls).toHaveLength(1);
    expect(loads).toBe(1);
  });

  it("draws existing diagrams once a loader arrives, and drops them when it goes", async () => {
    const { module } = fakeMermaid();
    const loader: MermaidLoader = async () => module;
    const el = await mount(DIAGRAM, {});
    expect(el.querySelector(".preview svg")).toBeNull();
    await act(async () => root!.render(<MarkdownEditor value={DIAGRAM} mermaid={loader} />));
    await waitFor(() => el.querySelector(".preview svg") !== null);
    await act(async () => root!.render(<MarkdownEditor value={DIAGRAM} />));
    await waitFor(() => el.querySelector(".preview-panel") === null);
  });

  it("opens links inside a diagram in a new tab", async () => {
    const module: MermaidModule = {
      initialize: () => {},
      render: async () => ({
        svg: '<svg><a xlink:href="https://example.com/x" href="https://example.com/x"><text>A</text></a></svg>',
      }),
    };
    const el = await mount(DIAGRAM, { mermaid: async () => module });
    await waitFor(() => el.querySelector(".preview a") !== null);
    const link = el.querySelector(".preview a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("slash menu Diagram item", () => {
  it("appears only with a mermaid loader", () => {
    const labels = (diagrams: boolean) =>
      getGroups("", {}, { diagrams }).groups.flatMap((group) => group.items.map(({ label }) => label));
    expect(labels(true)).toContain("Diagram");
    expect(labels(false)).not.toContain("Diagram");
  });
});

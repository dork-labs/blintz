/**
 * @vitest-environment jsdom
 *
 * Embeds through the public surface: `<MarkdownEditor embeds={...}>` renders
 * registered components from directive props, shows a placeholder for unknown
 * names, reports validation issues, contains a throwing component, and writes
 * `updateAttributes` back to markdown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MarkdownEditor } from "../../MarkdownEditor";
import type { EmbedProps, EmbedRegistry } from "./registry";
import { validateEmbedAttributes, type StandardSchemaV1 } from "./grammar";
import { getGroups } from "../block-edit/menu-config";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(
  value: string,
  embeds: EmbedRegistry,
  extra: { onChange?: (md: string) => void; editable?: boolean } = {},
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MarkdownEditor value={value} embeds={embeds} {...extra} />);
  });
  await waitFor(() => host!.querySelector(".ProseMirror") !== null);
  return host;
}

async function waitFor(check: () => boolean, timeout = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function Chart({ name, attributes, label, editable }: EmbedProps) {
  return (
    <figure data-testid="chart">
      {name}:{attributes.src}:{attributes.kind ?? "-"}:{label}:{String(editable)}
    </figure>
  );
}

function Callout({ attributes, children }: EmbedProps) {
  return (
    <aside data-testid="callout" data-tone={attributes.tone}>
      {children}
    </aside>
  );
}

describe("<MarkdownEditor embeds>", () => {
  it("renders a registered leaf from its directive props", async () => {
    const el = await mount('::chart[Q3 *tasks*]{src="q3" kind="bar"}\n', {
      chart: { component: Chart },
    });
    await waitFor(() => el.querySelector('[data-testid="chart"]') !== null);
    expect(el.querySelector('[data-testid="chart"]')!.textContent).toBe(
      "chart:q3:bar:Q3 tasks:true",
    );
  });

  it("renders a container with its markdown content as children", async () => {
    const el = await mount(':::callout{tone="warn"}\nInside **bold**\n:::\n', {
      callout: { component: Callout, kind: "container" },
    });
    await waitFor(() => el.querySelector('[data-testid="callout"] strong') !== null);
    const callout = el.querySelector('[data-testid="callout"]')!;
    expect(callout.getAttribute("data-tone")).toBe("warn");
    expect(callout.textContent).toContain("Inside bold");
  });

  it("shows a placeholder for an unregistered name", async () => {
    const el = await mount('::mystery{x="1"}\n', {});
    await waitFor(() => el.querySelector('[data-embed-state="unknown"]') !== null);
    expect(el.querySelector(".blintz-embed-notice-source")!.textContent).toBe(
      '::mystery{x="1"}',
    );
  });

  it("does not resolve prototype names like ::constructor", async () => {
    const el = await mount("::constructor\n", { chart: { component: Chart } });
    await waitFor(() => el.querySelector('[data-embed-state="unknown"]') !== null);
  });

  it("reports validation issues instead of rendering", async () => {
    const el = await mount('::chart{kind="bar"}\n', {
      chart: {
        component: Chart,
        validate: (attributes) =>
          attributes.src ? {} : { issues: [{ message: "required", path: ["src"] }] },
      },
    });
    await waitFor(() => el.querySelector('[data-embed-state="invalid"]') !== null);
    expect(el.querySelector('[data-testid="chart"]')).toBeNull();
    expect(el.querySelector(".blintz-embed-notice li")!.textContent).toBe("src: required");
  });

  it("contains a component that throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = () => {
      throw new Error("kaboom");
    };
    const el = await mount("::broken\n\nAfter.\n", { broken: { component: Broken } });
    await waitFor(() => el.textContent!.includes("kaboom"));
    expect(el.textContent).toContain("After.");
    error.mockRestore();
  });

  it("writes updateAttributes back to markdown", async () => {
    const onChange = vi.fn();
    let update: EmbedProps["updateAttributes"];
    const Capture = (props: EmbedProps) => {
      update = props.updateAttributes;
      return <span data-testid="capture" />;
    };
    await mount('::chart{src="q3"}\n\nAfter.\n', { chart: { component: Capture } }, { onChange });
    await waitFor(() => update !== undefined);
    await act(async () => update!({ src: "q4", kind: "line" }));
    await waitFor(() => onChange.mock.calls.length > 0);
    expect(onChange.mock.calls.at(-1)![0]).toBe('::chart{src="q4" kind="line"}\n\nAfter.\n');
  });

  it("gives read-only embeds no updateAttributes", async () => {
    let props: EmbedProps | undefined;
    const Capture = (p: EmbedProps) => {
      props = p;
      return null;
    };
    await mount('::chart{src="q3"}\n', { chart: { component: Capture } }, { editable: false });
    await waitFor(() => props !== undefined);
    expect(props!.editable).toBe(false);
    expect(props!.updateAttributes).toBeUndefined();
  });
});

describe("embed views keep the document whole", () => {
  it("keeps container content visible when the component ignores children", async () => {
    const Ignores = () => <aside data-testid="ignores" />;
    const el = await mount(":::box\nsecret body text\n:::\n", {
      box: { component: Ignores, kind: "container" },
    });
    await waitFor(() => el.querySelector('[data-testid="ignores"]') !== null);
    await waitFor(() => (el.querySelector(".ProseMirror")!.textContent ?? "").includes("secret body text"));
    const content = el.querySelector(".blintz-embed-content")!;
    expect(content.isConnected).toBe(true);
    expect(content.textContent).toBe("secret body text");
  });

  it("keeps container content visible when the component throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = () => {
      throw new Error("kaboom");
    };
    const el = await mount(":::box\nsecret body text\n:::\n", {
      box: { component: Broken, kind: "container" },
    });
    await waitFor(() => el.textContent!.includes("kaboom"));
    await waitFor(() => el.querySelector(".blintz-embed-content")?.textContent === "secret body text");
    expect(el.querySelector(".blintz-embed-notice-source")!.textContent).toBe(":::box");
    error.mockRestore();
  });

  it("does not remount a validated component when its attributes change", async () => {
    let mounts = 0;
    let update: EmbedProps["updateAttributes"];
    const Counter = (props: EmbedProps) => {
      update = props.updateAttributes;
      useEffect(() => {
        mounts++;
      }, []);
      return <span data-testid="n">{props.attributes.n}</span>;
    };
    const el = await mount('::counter{n="1"}\n\nAfter.\n', {
      counter: { component: Counter, validate: () => ({}) },
    });
    await waitFor(() => el.querySelector('[data-testid="n"]')?.textContent === "1");
    await act(async () => update!({ n: "2" }));
    await waitFor(() => el.querySelector('[data-testid="n"]')?.textContent === "2");
    expect(mounts).toBe(1);
  });

  it("keeps the last result on screen while an async validator re-runs", async () => {
    let mounts = 0;
    let update: EmbedProps["updateAttributes"];
    const Counter = (props: EmbedProps) => {
      update = props.updateAttributes;
      useEffect(() => {
        mounts++;
      }, []);
      return <span data-testid="n">{props.attributes.n}</span>;
    };
    const el = await mount('::counter{n="1"}\n\nAfter.\n', {
      counter: { component: Counter, validate: async () => ({}) },
    });
    await waitFor(() => el.querySelector('[data-testid="n"]')?.textContent === "1");
    await act(async () => update!({ n: "2" }));
    await waitFor(() => el.querySelector('[data-testid="n"]')?.textContent === "2");
    expect(mounts).toBe(1);
  });

  it("refuses attribute names the grammar cannot write back", async () => {
    const onChange = vi.fn();
    let update: EmbedProps["updateAttributes"];
    const Capture = (props: EmbedProps) => {
      update = props.updateAttributes;
      return null;
    };
    await mount('::chart{src="q3"}\n\nAfter.\n', { chart: { component: Capture } }, { onChange });
    await waitFor(() => update !== undefined);
    const bads: Record<string, string>[] = [{ "a}": "1" }, { "": "1" }, { "a b": "1" }];
    for (const bad of bads) {
      expect(() => update!(bad)).toThrow(/invalid embed attribute name/);
    }
    expect(() => update!({ n: 3 as unknown as string })).toThrow(/must be strings/);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("slash menu embeds", () => {
  const embedGroupOf = (groups: ReturnType<typeof getGroups>["groups"]) =>
    groups.find(({ key }) => key === "embed");

  it("offers only names the grammar can write", () => {
    const Noop = () => null;
    const { groups } = getGroups("", {
      chart: { component: Noop, title: "Chart" },
      "a b": { component: Noop, title: "Spaced" },
      "": { component: Noop, title: "Empty" },
      hidden: { component: Noop, title: "Hidden", hideFromMenu: true },
    });
    expect(embedGroupOf(groups)?.items.map(({ label }) => label)).toEqual(["Chart"]);
  });

  it("adds no Embeds group without a registry", () => {
    expect(embedGroupOf(getGroups("").groups)).toBeUndefined();
  });
});

describe("validateEmbedAttributes", () => {
  it("accepts a Standard Schema", async () => {
    const schema: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) =>
          (value as Record<string, string>).src
            ? { value }
            : { issues: [{ message: "src is required" }] },
      },
    };
    expect(await validateEmbedAttributes(schema, { src: "a" })).toEqual({ issues: undefined });
    expect(await validateEmbedAttributes(schema, {})).toEqual({
      issues: [{ message: "src is required" }],
    });
  });

  it("turns a throwing validator into an issue", async () => {
    const result = await validateEmbedAttributes(() => {
      throw new Error("bad schema");
    }, {});
    expect(result.issues).toEqual([{ message: "bad schema" }]);
  });

  it("treats no validator as valid", async () => {
    expect(await validateEmbedAttributes(undefined, {})).toEqual({});
  });
});

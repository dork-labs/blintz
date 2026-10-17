/**
 * @vitest-environment jsdom
 *
 * Wiki links through `<MarkdownEditor wikiLinks={...}>`: resolution states,
 * opening, the `]]` input rule, the `[[` menu, paste and source mapping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { gfm } from "@milkdown/kit/preset/gfm";
import { DOMParser } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getMarkdown } from "@milkdown/kit/utils";

import { MarkdownEditor } from "../../MarkdownEditor";
import {
  commonmarkWithoutEmptyLinePreservation,
  stripEmptyLineBreaks,
} from "../empty-paragraphs";
import { SourceController } from "../../source-controller";
import { sourcePlugin } from "../../source-plugin";
import { wikiLinkGrammarFeature } from ".";
import type { WikiLinkOptions } from "./options";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout; the editor's floating chrome measures ranges as the
// selection moves. Empty geometry is enough for these behavior tests.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects ??= emptyRects;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const editors: Editor[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  for (const editor of editors.splice(0)) await editor.destroy();
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

let mounted: Editor | null = null;

/** Insert text at `pos` and leave the caret after it, as typing would. */
function typeAt(view: EditorView, pos: number, text: string) {
  view.focus();
  const tr = view.state.tr.insertText(text, pos);
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + text.length)));
}
function viewOf(_el: HTMLElement): EditorView {
  return mounted!.action((ctx) => ctx.get(editorViewCtx));
}

async function mount(
  value: string,
  wikiLinks: WikiLinkOptions | undefined,
  extra: { editable?: boolean; onChange?: (md: string) => void } = {},
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MarkdownEditor
        value={value}
        wikiLinks={wikiLinks}
        plugins={[({ editor }) => void (mounted = editor)]}
        {...extra}
      />,
    );
  });
  await waitFor(() => host!.querySelector(".ProseMirror") !== null);
  return host;
}

const pages: Record<string, string> = { Home: "/docs/home", Roadmap: "/docs/roadmap" };
const resolve: WikiLinkOptions["resolve"] = (link) =>
  link.target in pages
    ? { exists: true, href: pages[link.target] + (link.heading ? `#${link.heading}` : ""), title: link.target }
    : { exists: false };

describe("<MarkdownEditor wikiLinks>", () => {
  it("renders resolved and missing links from the host's resolver", async () => {
    const el = await mount("See [[Home#Intro|home]] and [[Nowhere]].\n", { resolve });
    await waitFor(() => el.querySelectorAll(".blintz-wiki-link").length === 2);
    const [home, nowhere] = [...el.querySelectorAll<HTMLAnchorElement>(".blintz-wiki-link")];
    expect(home!.textContent).toBe("home");
    expect(home!.getAttribute("href")).toBe("/docs/home#Intro");
    expect(home!.dataset.state).toBe("resolved");
    expect(nowhere!.textContent).toBe("Nowhere");
    expect(nowhere!.dataset.state).toBe("missing");
    expect(nowhere!.hasAttribute("href")).toBe(false);
  });

  it("shows pending, then the async answer, resolving each target once", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const el = await mount("[[Home]] and [[Home]] again.\n", {
      resolve: async () => {
        calls++;
        await gate;
        return { exists: true, href: "/h" };
      },
    });
    await waitFor(() => el.querySelectorAll('.blintz-wiki-link[data-state="pending"]').length === 2);
    await act(async () => release());
    await waitFor(() => el.querySelectorAll('.blintz-wiki-link[data-state="resolved"]').length === 2);
    expect(calls).toBe(1);
  });

  it("renders plain links with no resolver", async () => {
    const el = await mount("[[Anything]]\n", undefined);
    await waitFor(() => el.querySelector(".blintz-wiki-link") !== null);
    expect(el.querySelector<HTMLElement>(".blintz-wiki-link")!.dataset.state).toBe("unresolved");
  });

  it("opens on click when read-only, and only on Cmd/Ctrl-click while editing", async () => {
    const onOpen = vi.fn();
    const el = await mount("[[Home]]\n", { resolve, onOpen }, { editable: false });
    await waitFor(() => el.querySelector('.blintz-wiki-link[data-state="resolved"]') !== null);
    el.querySelector<HTMLElement>(".blintz-wiki-link")!.click();
    expect(onOpen).toHaveBeenCalledWith(
      { target: "Home", heading: null, label: null, embed: false },
      expect.objectContaining({ href: "/docs/home" }),
    );
    await act(async () => root!.unmount());
    host!.remove();

    const onOpenEditing = vi.fn();
    const editing = await mount("[[Home]]\n", { resolve, onOpen: onOpenEditing });
    await waitFor(() => editing.querySelector(".blintz-wiki-link") !== null);
    const link = editing.querySelector<HTMLElement>(".blintz-wiki-link")!;
    link.click();
    expect(onOpenEditing).not.toHaveBeenCalled();
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    expect(onOpenEditing).toHaveBeenCalledTimes(1);
  });

  it("turns a typed `[[…]]` into a link when `]]` closes it", async () => {
    const onChange = vi.fn();
    const el = await mount("Start\n", { resolve }, { onChange });
    const view = viewOf(el);
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));
      for (const ch of " [[Home]]") {
        const { from, to } = view.state.selection;
        const handled = view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
        if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    });
    await waitFor(() => el.querySelector(".blintz-wiki-link") !== null);
    await waitFor(() => onChange.mock.calls.length > 0);
    expect(onChange.mock.calls.at(-1)![0]).toBe("Start [[Home]]\n");
  });

  it("suggests pages after `[[` and inserts the chosen one", async () => {
    const onChange = vi.fn();
    const search = vi.fn((query: string) =>
      Object.keys(pages)
        .filter((page) => page.toLowerCase().includes(query.toLowerCase()))
        .map((target) => ({ target, description: pages[target] })),
    );
    const el = await mount("Go \n", { resolve, search }, { onChange });
    const view = viewOf(el);
    await act(async () => {
      typeAt(view, 1 + view.state.doc.firstChild!.content.size, " [[ro");
    });
    const menu = () => document.querySelector<HTMLElement>(".blintz-wiki-link-menu");
    await waitFor(() => menu()?.dataset.show === "true");
    expect(search).toHaveBeenLastCalledWith("ro");
    const options = [...document.querySelectorAll(".blintz-wiki-link-option")];
    expect(options.map((o) => o.querySelector(".blintz-wiki-link-option-title")!.textContent)).toEqual(["Roadmap"]);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await waitFor(() => onChange.mock.calls.some(([md]) => md === "Go [[Roadmap]]\n"));
    await waitFor(() => menu()?.dataset.show === "false");
  });

  it("closes the menu on Escape until the caret leaves that `[[`", async () => {
    const el = await mount("Go \n", { search: () => [{ target: "Home" }] });
    const view = viewOf(el);
    await act(async () => typeAt(view, 1 + view.state.doc.firstChild!.content.size, " [[h"));
    const menu = () => document.querySelector<HTMLElement>(".blintz-wiki-link-menu");
    await waitFor(() => menu()?.dataset.show === "true");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await waitFor(() => menu()?.dataset.show === "false");
    await act(async () => typeAt(view, view.state.selection.from, "o"));
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(menu()?.dataset.show).toBe("false");
  });

  it("ignores menu keys while focus is elsewhere", async () => {
    const onChange = vi.fn();
    const el = await mount("Go\n", { search: () => [{ target: "Home" }] }, { onChange });
    const view = viewOf(el);
    await act(async () => typeAt(view, 1 + view.state.doc.firstChild!.content.size, " [[h"));
    const menu = () => document.querySelector<HTMLElement>(".blintz-wiki-link-menu");
    await waitFor(() => menu()?.dataset.show === "true");
    const other = document.createElement("textarea");
    document.body.append(other);
    await act(async () => other.focus());
    await waitFor(() => menu()?.dataset.show === "false");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      other.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(false);
    expect(onChange.mock.calls.some(([md]) => md.includes("[[Home]]"))).toBe(false);
    other.remove();
  });

  it("refuses the ]] rule across an inline node", async () => {
    const el = await mount("see ![i](x.png)\n", undefined);
    const view = viewOf(el);
    await act(async () => {
      view.focus();
      const end = 1 + view.state.doc.firstChild!.content.size;
      const tr = view.state.tr.insertText("[[a", 5).insertText("b]", end + 3);
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 5)));
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", (f) => f(view, from, to, "]", () => view.state.tr.insertText("]", from, to)));
      if (!handled) view.dispatch(view.state.tr.insertText("]", from, to));
    });
    const names: string[] = [];
    view.state.doc.descendants((node) => void names.push(node.type.name));
    expect(names).toContain("image");
    expect(names).not.toContain("wiki_link");
  });

  it("does not make a link inside an inline code span", async () => {
    const el = await mount("`code here`\n", undefined);
    const view = viewOf(el);
    await act(async () => {
      view.focus();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)));
      for (const ch of "[[a]]") {
        const { from, to } = view.state.selection;
        const handled = view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
        if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
      }
    });
    const names: string[] = [];
    view.state.doc.descendants((node) => void names.push(node.type.name));
    expect(names).not.toContain("wiki_link");
  });

  it("keeps a wiki link out of a code span applied over it", async () => {
    const onChange = vi.fn();
    const el = await mount("a [[b]] c\n", undefined, { onChange });
    const view = viewOf(el);
    await act(async () => {
      const { schema } = view.state;
      const end = 1 + view.state.doc.firstChild!.content.size;
      view.dispatch(view.state.tr.addMark(1, end, schema.marks.inlineCode!.create()));
    });
    await waitFor(() => onChange.mock.calls.length > 0);
    const md = onChange.mock.calls.at(-1)![0] as string;
    expect(md).toBe("`a `[[b]]` c`\n");
  });

  it("never renders an unsafe href from the resolver", async () => {
    const el = await mount("[[x]] [[y]] [[z]]\n", {
      resolve: (link) => ({
        exists: true,
        href: { x: "javascript:alert(1)", y: " JaVaScRiPt:alert(1)", z: "/docs/z" }[link.target],
      }),
    });
    await waitFor(() => el.querySelectorAll('.blintz-wiki-link[data-state="resolved"]').length === 3);
    const hrefs = [...el.querySelectorAll(".blintz-wiki-link")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([null, null, "/docs/z"]);
  });

  it("resolves a link and an embed of the same target separately", async () => {
    const seen: boolean[] = [];
    await mount("[[a]] ![[a]]\n", {
      resolve: (link) => {
        seen.push(link.embed);
        return { exists: true };
      },
    });
    await waitFor(() => seen.length === 2);
    expect(seen.sort()).toEqual([false, true]);
  });

  it("never shares a resolution between an embed and a `!`-prefixed target", async () => {
    const seen: string[] = [];
    await mount("![[x]] [[!x]] [[a]] [[a#]]\n", {
      resolve: (link) => {
        seen.push(`${link.embed ? "embed" : "link"}:${link.target}:${link.heading}`);
        return { exists: true };
      },
    });
    await waitFor(() => seen.length === 4);
    expect(seen.sort()).toEqual(["embed:x:null", "link:!x:null", "link:a:", "link:a:null"]);
  });

  it("copies a link as its markdown in plain text", async () => {
    const el = await mount("[[Home#Intro|home]]\n", undefined);
    const view = viewOf(el);
    expect(view.state.doc.textBetween(0, view.state.doc.content.size, "\n", (node) =>
      node.type.spec.leafText?.(node) ?? "",
    )).toBe("[[Home#Intro|home]]");
  });
});

async function fixture(text: string) {
  const rootEl = document.createElement("div");
  document.body.append(rootEl);
  const controller = new SourceController();
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, rootEl);
      ctx.set(defaultValueCtx, text);
    })
    .use(commonmarkWithoutEmptyLinePreservation)
    .use(stripEmptyLineBreaks)
    .use(gfm)
    .use(sourcePlugin(controller));
  wikiLinkGrammarFeature(editor);
  editors.push(editor);
  await editor.create();
  return { editor, port: controller.port, view: editor.action((ctx) => ctx.get(editorViewCtx)) };
}

describe("wiki links and the editor's other contracts", () => {
  it("bindSource still maps after an edit before a wiki link", async () => {
    const h = await fixture("Intro [[Home#x|h]] text.\n");
    h.view.dispatch(h.view.state.tr.insertText("More ", 1));
    const saved = h.editor.action(getMarkdown());
    expect(saved).toBe("More Intro [[Home#x|h]] text.\n");
    expect(h.port.bindSource(saved, h.port.generation()).kind).toBe("mapped");
  });

  const mapsAfterSave = (h: Awaited<ReturnType<typeof fixture>>) => {
    const saved = h.editor.action(getMarkdown());
    return { saved, kind: h.port.bindSource(saved, h.port.generation()).kind };
  };

  it("bindSource maps after inserting a link with no source (menu)", async () => {
    const h = await fixture("Go\n");
    const type = h.view.state.schema.nodes.wiki_link!;
    h.view.dispatch(h.view.state.tr.insert(3, type.create({ target: "Roadmap" })));
    expect(mapsAfterSave(h)).toEqual({ saved: "Go[[Roadmap]]\n", kind: "mapped" });
  });

  it("bindSource maps after pasting a link", async () => {
    const h = await fixture("x  y\n");
    paste(h.view, '<a data-type="wiki-link" data-target="a" data-label="b">t</a>');
    expect(mapsAfterSave(h).kind).toBe("mapped");
  });

  it("bindSource maps after editing a link's target", async () => {
    const h = await fixture("x [[a|b]] y\n");
    let at = -1;
    h.view.state.doc.descendants((node, pos) => {
      if (node.type.name === "wiki_link") at = pos;
    });
    h.view.dispatch(h.view.state.tr.setNodeAttribute(at, "target", "z"));
    expect(mapsAfterSave(h)).toEqual({ saved: "x [[z|b]] y\n", kind: "mapped" });
  });

  it("bindSource maps after a labelled link lands in a table cell", async () => {
    const h = await fixture("| a |\n| - |\n| x |\n");
    let at = -1;
    h.view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "x") at = pos + 1;
    });
    const type = h.view.state.schema.nodes.wiki_link!;
    h.view.dispatch(h.view.state.tr.insert(at, type.create({ target: "P", label: "al", source: "[[P|al]]" })));
    const { saved, kind } = mapsAfterSave(h);
    expect(saved).toContain("[[P\\|al]]");
    expect(kind).toBe("mapped");
  });

  function paste(view: EditorView, html: string) {
    const dom = document.createElement("div");
    dom.innerHTML = html;
    view.dispatch(view.state.tr.replaceSelection(DOMParser.fromSchema(view.state.schema).parseSlice(dom)));
  }

  it("keeps a well-formed pasted wiki link", async () => {
    const h = await fixture("Start.\n");
    paste(h.view, '<p>see <a data-type="wiki-link" data-target="Home" data-heading="Intro">x</a></p>');
    expect(h.editor.action(getMarkdown())).toContain("see [[Home#Intro]]");
  });

  it("refuses a pasted wiki link too long to read back", async () => {
    const h = await fixture("Start.\n");
    paste(h.view, `<p><a data-type="wiki-link" data-target="${"y".repeat(1500)}">t</a></p>`);
    const names: string[] = [];
    h.view.state.doc.descendants((node) => void names.push(node.type.name));
    expect(names).not.toContain("wiki_link");
  });

  it.each([
    'data-target="a]]b"',
    'data-target="a|b"',
    'data-target="a" data-label="l]]"',
    'data-target=""',
  ])("refuses a pasted wiki link with %s", async (attrs) => {
    const h = await fixture("Start.\n");
    paste(h.view, `<p>x <a data-type="wiki-link" ${attrs}>t</a></p>`);
    const md = h.editor.action(getMarkdown());
    const type = [] as string[];
    h.view.state.doc.descendants((node) => {
      type.push(node.type.name);
    });
    expect(type).not.toContain("wiki_link");
    expect(md).not.toMatch(/\[\[a/);
  });
});


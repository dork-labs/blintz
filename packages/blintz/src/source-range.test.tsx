/**
 * @vitest-environment jsdom
 *
 * `port.range()` (any model range → raw markdown) and plugins that declare
 * `preservesSourceMapping`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { editorViewCtx, type Editor } from "@milkdown/kit/core";

import { MarkdownEditor } from "./MarkdownEditor";
import type { BlintzPlugin } from "./plugin";
import type { MarkdownSourcePort } from "./source-location";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

async function mount(value: string, plugins: BlintzPlugin[] = []) {
  let port: MarkdownSourcePort | null = null;
  let editor: Editor | null = null;
  const capture = Object.assign(({ editor: e }: { editor: Editor }) => void (editor = e), {
    preservesSourceMapping: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<MarkdownEditor value={value} onSourceReady={(p) => (port = p)} plugins={[capture, ...plugins]} />),
  );
  const start = Date.now();
  while (!port || !editor) {
    if (Date.now() - start > 2000) throw new Error("timed out");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  return { port: port as MarkdownSourcePort, editor: editor as Editor };
}

const DOC = "# Title\n\nSome **bold** words here.\n";

describe("port.range", () => {
  it("maps a model range to raw markdown, splitting around syntax", async () => {
    const { port, editor } = await mount(DOC);
    const doc = editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
    let from = -1;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === "Some " && from < 0) from = pos;
    });
    const mapped = port.range(from, from + "Some bold".length);
    expect(mapped.kind).toBe("mapped");
    if (mapped.kind === "mapped") {
      expect(mapped.value.ranges.map((r) => DOC.slice(r.start, r.end))).toEqual(["Some ", "bold"]);
    }
  });

  it.each([
    [-1, 3],
    [5, 2],
    [0, 10_000],
    [1.5, 3],
  ])("refuses the out-of-range or malformed range [%s, %s)", async (from, to) => {
    const { port } = await mount(DOC);
    expect(port.range(from, to)).toMatchObject({ kind: "unavailable", reason: "unmapped" });
  });
});

describe("preservesSourceMapping", () => {
  it("keeps heading-tolerant bindSource for a plugin that declares it", async () => {
    const neutral = Object.assign(() => {}, { preservesSourceMapping: true });
    const { port } = await mount(DOC, [neutral]);
    expect(port.bindSource(DOC, port.generation()).kind).toBe("mapped");
  });

  it("makes an undeclared plugin require an exact match (headings refuse)", async () => {
    const { port } = await mount(DOC, [() => {}]);
    expect(port.bindSource(DOC, port.generation()).kind).toBe("unavailable");
  });
});

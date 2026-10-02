/** A real browser host for the public source API; no file writer or receipts. */
import { createRoot } from "react-dom/client";
import { MarkdownEditor } from "../../packages/blintz/src/MarkdownEditor";
import type {
  MarkdownSourcePort,
  SourceTaskToggleRequest,
} from "../../packages/blintz/src/source-location";
import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { BlintzPlugin } from "../../packages/blintz/src/plugin";
export function mountSourceHost() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const root = createRoot(container);
  const raw =
    "\uFEFF---\r\nname: source\r\n---\r\n\r\n- [ ] same 🦉\r\n- [X] same 🦉\r\n\r\nTail\r\n";
  let port: MarkdownSourcePort | undefined, ctx: Ctx | undefined;
  const requests: SourceTaskToggleRequest[] = [];
  const plugins: BlintzPlugin[] = [
    ({ editor }) => {
      editor.config((value) => {
        ctx = value;
      });
    },
  ];
  const render = (editable: boolean) =>
    root.render(
      <MarkdownEditor
        value={raw}
        editable={editable}
        plugins={plugins}
        onSourceReady={(value) => {
          port = value;
        }}
        onTaskToggleRequest={(request) => {
          requests.push(request);
        }}
      />,
    );
  render(true);
  return {
    snapshot: () => port?.snapshot(),
    requests: () => requests,
    select: () => {
      const view = ctx!.get(editorViewCtx);
      let start = 0;
      view.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === "Tail") start = pos;
      });
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, start + 4, start),
        ),
      );
      return port!.selection();
    },
    raw: () => raw,
    readonly: () => render(false),
  };
}

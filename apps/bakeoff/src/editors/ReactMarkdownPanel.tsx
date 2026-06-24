import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditorPanelProps } from "../libraries";

/**
 * react-markdown — a render-only VIEWER, paired with a plain <textarea> so it
 * represents the "store markdown, edit the raw source, render read-only"
 * approach. The textarea is the single source of truth; the renderer never
 * touches it, so round-trip is a non-question. remark-gfm adds GFM tables,
 * strikethrough, task lists, etc.
 */
export default function ReactMarkdownPanel({
  markdown,
  onChange,
  theme,
}: EditorPanelProps) {
  return (
    <div className="rm-split" data-color-mode={theme}>
      <div className="rm-pane rm-editor">
        <div className="rm-pane-label">Raw markdown (source of truth)</div>
        <textarea
          className="rm-textarea"
          value={markdown}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="rm-pane rm-preview">
        <div className="rm-pane-label">Rendered (read-only)</div>
        <div className="rm-rendered markdown-body">
          <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
        </div>
      </div>
    </div>
  );
}

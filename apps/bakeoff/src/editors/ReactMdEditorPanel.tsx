import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import type { EditorPanelProps } from "../libraries";

/**
 * @uiw/react-md-editor — source textarea + live preview.
 *
 * Controlled `value` / `onChange` (onChange hands back the markdown string).
 * Theme is set by `data-color-mode` on a wrapping element. Round-trip is
 * perfect: you edit the markdown source directly, so nothing is re-serialized.
 */
export default function ReactMdEditorPanel({
  markdown,
  onChange,
  theme,
}: EditorPanelProps) {
  return (
    <div data-color-mode={theme} className="mde-wrap">
      <MDEditor
        value={markdown}
        onChange={(v) => onChange(v ?? "")}
        height={520}
        preview="live"
        visibleDragbar
      />
    </div>
  );
}

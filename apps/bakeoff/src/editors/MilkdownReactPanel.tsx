import { MarkdownEditor } from "blintz";
import type { EditorPanelProps } from "../libraries";

/** Compare the public Blintz editor with live theme changes and shared Markdown. */
export default function MilkdownReactPanel({
  markdown,
  onChange,
  theme,
}: EditorPanelProps) {
  return (
    <div className="milkdown-react-host">
      <MarkdownEditor value={markdown} onChange={onChange} theme={theme} />
    </div>
  );
}

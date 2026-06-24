import { MarkdownEditor } from "blintz";
import type { EditorPanelProps } from "../libraries";

/**
 * Milkdown panel — now a thin consumer of the **blintz** package:
 * the React rebuild of Crepe's polished editor UX (selection toolbar, slash
 * menu, drag handle, rich node views) on @milkdown/react. No Vue in the bundle.
 *
 * All the editor logic that used to live here (useEditor + listener +
 * replaceAll reset) now lives in the package; this panel just adapts the
 * bake-off's shared {markdown, onChange} contract to the package's
 * {value, onChange} props, and keeps the `.milkdown-react-host` wrapper so the
 * playground's dark-surface styling (index.css) still applies.
 *
 * This is also the package's first real consumer — it exercises the public API
 * exactly as apps/web (and other projects) eventually will.
 */
export default function MilkdownReactPanel({
  markdown,
  onChange,
}: EditorPanelProps) {
  return (
    <div className="milkdown-react-host">
      <MarkdownEditor value={markdown} onChange={onChange} />
    </div>
  );
}

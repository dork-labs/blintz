import { createRoot } from 'react-dom/client';
import { MarkdownEditor } from '../../packages/blintz/src/MarkdownEditor';
import type { MarkdownSourcePort, SourceTaskToggleRequest } from '../../packages/blintz/src/source-location';
/** Actual default editor, keyboard history and public source port; no custom parser or model injection. */
export function mountTerminalSpaceHost() {
  const container = document.createElement('div'); document.body.replaceChildren(container);
  const root = createRoot(container); let port: MarkdownSourcePort | undefined;
  let latest = '- [ ] First\n- [ ] Later\n', request: SourceTaskToggleRequest | undefined;
  root.render(<MarkdownEditor value={latest} editable onSourceReady={(value) => { port = value; }}
    onChange={(value) => { latest = value; }} onTaskToggleRequest={(value) => { request = value; }} />);
  return { saved: () => latest, selection: () => port?.selection(),
    bind: () => port?.bindSource(latest, port.generation()),
    confirm: () => {
      if (!port || !request) throw new Error('Original mapped task request unavailable');
      const next = latest.slice(0, request.task.marker.start + 1) + (request.done ? 'x' : ' ') + latest.slice(request.task.marker.start + 2);
      const result = port.applyConfirmedTaskToggle(request, next);
      if (result.kind === 'mapped') latest = next;
      return result;
    }, close: () => root.unmount() };
}

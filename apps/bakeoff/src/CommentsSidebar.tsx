import type { BlintzComments, CommentAnchor } from "@blintz/comments";

export interface DemoThread {
  id: string;
  anchor: CommentAnchor;
  resolved: boolean;
  replies: string[];
}

/** A deliberately small sidebar: the app owns threads; Blintz owns where they sit. */
export function CommentsSidebar(props: {
  comments: BlintzComments;
  threads: DemoThread[];
  setThreads: (update: (threads: DemoThread[]) => DemoThread[]) => void;
  active: string | null;
  setActive: (id: string | null) => void;
  orphaned: string[];
}) {
  const { comments, threads, setThreads, active, setActive, orphaned } = props;
  const add = () => {
    const anchor = comments.anchorSelection();
    if (!anchor) return;
    const id = `t${Date.now().toString(36)}`;
    setThreads((all) => [...all, { id, anchor, resolved: false, replies: [] }]);
    setActive(id);
  };
  return (
    <aside className="comments-sidebar" aria-label="Comments">
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={add}>
        Comment on selection
      </button>
      <ol>
        {threads.map((thread) => (
          <li
            key={thread.id}
            data-thread={thread.id}
            className={[
              thread.id === active ? "is-active" : "",
              thread.resolved ? "is-resolved" : "",
              orphaned.includes(thread.id) ? "is-orphaned" : "",
            ].join(" ")}
          >
            <button type="button" className="comments-quote" onClick={() => { setActive(thread.id); comments.reveal(thread.id); }}>
              “{thread.anchor.quote}”
            </button>
            {orphaned.includes(thread.id) && <span className="comments-note">Its text was removed</span>}
            <button
              type="button"
              onClick={() =>
                setThreads((all) => all.map((t) => (t.id === thread.id ? { ...t, resolved: !t.resolved } : t)))
              }
            >
              {thread.resolved ? "Reopen" : "Resolve"}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

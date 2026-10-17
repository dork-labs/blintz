import { useCallback, useEffect, useState } from "react";
import { useBlintzComments } from "@blintz/comments";
import { CommentsSidebar, type DemoThread } from "./CommentsSidebar";
import { CollabDemo } from "./CollabDemo";
import { MarkdownEditor } from "blintz";
import { SAMPLE_EMBEDS } from "./embeds";
import { SAMPLE_WIKI_LINKS } from "./wiki-links";
import { SPECIMENS, type SpecimenId } from "./specimens";
import "./playground.css";

// Diagrams load mermaid only when a document has one.
const loadMermaid = () => import("mermaid");

/** Focused, repeatable visual and interaction specimens using Blintz's public API. */
export default function Playground() {
  const query = new URLSearchParams(location.search);
  const initial = query.get("specimen") as SpecimenId;
  const [specimen, setSpecimen] = useState<SpecimenId>(
    initial in SPECIMENS ? initial : "overview",
  );
  const [markdown, setMarkdown] = useState<string>(
    SPECIMENS[specimen].markdown,
  );
  const [theme, setTheme] = useState<"light" | "dark">(
    query.get("theme") === "dark" ? "dark" : "light",
  );
  const [editable, setEditable] = useState(query.get("readonly") !== "true");
  const [narrow, setNarrow] = useState(false);
  const [source, setSource] = useState(false);
  const [threads, setThreads] = useState<DemoThread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [orphaned, setOrphaned] = useState<string[]>([]);
  const comments = useBlintzComments({
    threads,
    activeThreadId: activeThread,
    onThreadClick: (ids) => setActiveThread(ids[0] ?? null),
    onAnchorsChange: useCallback(
      (updates: Array<{ id: string; anchor: DemoThread["anchor"] }>) =>
        setThreads((all) =>
          all.map((thread) => {
            const update = updates.find((u) => u.id === thread.id);
            return update ? { ...thread, anchor: update.anchor } : thread;
          }),
        ),
      [],
    ),
    onOrphanedChange: setOrphaned,
  });
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="specimen-app">
      <header className="specimen-header">
        <div>
          <a className="specimen-brand" href="/">
            Blintz
          </a>
          <span className="specimen-kicker"> / The writing room</span>
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label="Toggle color theme"
        >
          {theme === "light" ? "Light" : "Dark"}
        </button>
      </header>
      <main>
        <div className="specimen-intro">
          <h1>Let the words breathe.</h1>
          <p>A quiet place to try every detail of the editor.</p>
        </div>
        <div className="specimen-controls" aria-label="Editor preview controls">
          <label>
            Document
            <select
              aria-label="Document specimen"
              value={specimen}
              onChange={(event) => {
                const next = event.target.value as SpecimenId;
                setSpecimen(next);
                setMarkdown(SPECIMENS[next].markdown);
              }}
            >
              {Object.entries(SPECIMENS).map(([id, item]) => (
                <option value={id} key={id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="specimen-options">
            <button
              type="button"
              aria-pressed={!editable}
              onClick={() => setEditable(!editable)}
            >
              Read only
            </button>
            <button
              type="button"
              aria-pressed={narrow}
              onClick={() => setNarrow(!narrow)}
            >
              Narrow page
            </button>
            <button
              type="button"
              aria-pressed={source}
              onClick={() => setSource(!source)}
            >
              Markdown
            </button>
            <button
              type="button"
              onClick={() => setMarkdown(SPECIMENS[specimen].markdown)}
            >
              Reset document
            </button>
          </div>
        </div>
        <div className={`specimen-stage${narrow ? " is-narrow" : ""}`}>
          {specimen === "collab" ? (
            <CollabDemo theme={theme} />
          ) : (
          <section
            aria-label="Markdown document"
            className="specimen-paper"
            data-testid="specimen-paper"
          >
            <MarkdownEditor
              value={markdown}
              onChange={setMarkdown}
              theme={query.get("auto") === "true" ? "auto" : theme}
              editable={editable}
              embeds={SAMPLE_EMBEDS}
              wikiLinks={SAMPLE_WIKI_LINKS}
              mermaid={loadMermaid}
              plugins={[comments.plugin]}
            />
          </section>
          )}
          {specimen === "comments" && (
            <CommentsSidebar
              comments={comments}
              threads={threads}
              setThreads={setThreads}
              active={activeThread}
              setActive={setActiveThread}
              orphaned={orphaned}
            />
          )}
          {source && (
            <aside className="specimen-source">
              <label htmlFor="markdown-source">Markdown source</label>
              <textarea
                id="markdown-source"
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                spellCheck={false}
              />
            </aside>
          )}
        </div>
        <output className="specimen-status" aria-live="polite">
          {editable ? "Ready to write" : "Reading view"}
          <span>{markdown.length.toLocaleString()} characters</span>
        </output>
      </main>
      <footer className="specimen-footer">
        Made for the thought, and the next one.{" "}
        <a href="/">Compare editors →</a>
      </footer>
    </div>
  );
}

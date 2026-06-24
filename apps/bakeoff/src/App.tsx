import { Suspense, useEffect, useMemo, useState } from "react";
import { LIBRARIES } from "./libraries";
import { SEED_MARKDOWN } from "./seed";
import { diffMarkdown } from "./diff";
import { ComparisonTable } from "./components/ComparisonTable";
import { MarkdownOutput } from "./components/MarkdownOutput";
import { NotesBox } from "./components/NotesBox";

type Theme = "dark" | "light";

const THEME_KEY = "md-bakeoff:theme";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [activeId, setActiveId] = useState(LIBRARIES[0]!.id);
  const [markdown, setMarkdown] = useState(SEED_MARKDOWN);

  const active = useMemo(
    () => LIBRARIES.find((l) => l.id === activeId)!,
    [activeId],
  );
  const diff = useMemo(() => diffMarkdown(SEED_MARKDOWN, markdown), [markdown]);

  // Remount the active editor when the panel or theme changes, so imperative
  // editors (Milkdown) and prop-seeded ones get a clean slate per selection.
  const panelKey = `${active.id}:${theme}`;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <h1>Blintz bakeoff</h1>
          <p className="subtitle">
            Edit the same content in 5 React markdown editors. Watch the{" "}
            <strong>Markdown output</strong> panel to judge round-trip fidelity,
            the metric that matters when prose is stored as markdown.
          </p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
        >
          {theme === "dark" ? "☾ Dark" : "☀ Light"}
        </button>
      </header>

      <nav className="switcher" aria-label="Editor library">
        {LIBRARIES.map((lib) => (
          <button
            key={lib.id}
            type="button"
            className={`switch-tab${lib.id === activeId ? " active" : ""}`}
            onClick={() => setActiveId(lib.id)}
          >
            <span className="switch-name">{lib.name}</span>
            <span className={`badge badge-${roundTripTone(lib.roundTrip)}`}>
              {lib.roundTrip}
            </span>
          </button>
        ))}
      </nav>

      <main className="workspace">
        <section className="editor-col">
          <div className="panel-meta">
            <div>
              <span className={`kind-pill kind-${active.id}`}>{active.kind}</span>
              {active.roundTrip === "lossy" && (
                <span className="warn-pill">
                  ⚠ markdown export is explicitly lossy, expect drift
                </span>
              )}
              {active.roundTrip === "n/a (viewer)" && (
                <span className="info-pill">
                  viewer + raw textarea, source is the truth
                </span>
              )}
            </div>
            <a href={active.docsUrl} target="_blank" rel="noreferrer">
              docs ↗
            </a>
          </div>

          <p className="panel-blurb">{active.blurb}</p>

          <div className="editor-host">
            <Suspense
              fallback={<div className="editor-loading">Loading editor…</div>}
            >
              <active.Panel
                key={panelKey}
                markdown={markdown}
                onChange={setMarkdown}
                theme={theme}
              />
            </Suspense>
          </div>

          <NotesBox libraryId={active.id} libraryName={active.name} />
        </section>

        <aside className="output-col">
          <MarkdownOutput
            markdown={markdown}
            diff={diff}
            onReset={() => setMarkdown(SEED_MARKDOWN)}
          />
        </aside>
      </main>

      <ComparisonTable activeId={activeId} />

      <footer className="footer">
        Each editor mounts lazily, only when selected. Shared markdown state lives
        in <code>App.tsx</code>; the seed is in <code>src/seed.ts</code>.
      </footer>
    </div>
  );
}

function roundTripTone(rt: string): string {
  if (rt === "faithful") return "good";
  if (rt === "mostly") return "ok";
  if (rt === "lossy") return "bad";
  return "neutral";
}

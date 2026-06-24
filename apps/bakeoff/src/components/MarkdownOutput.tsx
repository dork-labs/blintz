import { useState } from "react";
import type { DiffSummary } from "../diff";

interface Props {
  markdown: string;
  diff: DiffSummary;
  onReset: () => void;
}

/**
 * The persistent "Markdown output" panel — the heart of the bake-off. Shows the
 * live shared markdown string so that, while editing in a WYSIWYG editor, you
 * can watch exactly what markdown it produces. Includes a reset-to-seed button
 * and a diff-vs-seed view (badge + char/line deltas + a unified line diff) so
 * round-trip drift is visible at a glance.
 */
export function MarkdownOutput({ markdown, diff, onReset }: Props) {
  const [view, setView] = useState<"raw" | "diff">("raw");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  };

  return (
    <div className="output">
      <div className="output-header">
        <h2>Markdown output</h2>
        <span
          className={`diff-badge ${diff.changed ? "drift" : "clean"}`}
          title="Whether the current markdown differs from the seed"
        >
          {diff.changed ? "drift vs seed" : "matches seed"}
        </span>
      </div>

      <div className="output-stats">
        <span>{markdown.length.toLocaleString()} chars</span>
        <span className={diff.charDelta === 0 ? "" : "stat-change"}>
          {diff.charDelta >= 0 ? "+" : ""}
          {diff.charDelta} chars vs seed
        </span>
        <span className={diff.addedLines ? "stat-add" : ""}>
          +{diff.addedLines} lines
        </span>
        <span className={diff.removedLines ? "stat-del" : ""}>
          −{diff.removedLines} lines
        </span>
      </div>

      <div className="output-toolbar">
        <div className="seg">
          <button
            type="button"
            className={view === "raw" ? "active" : ""}
            onClick={() => setView("raw")}
          >
            Raw
          </button>
          <button
            type="button"
            className={view === "diff" ? "active" : ""}
            onClick={() => setView("diff")}
          >
            Diff vs seed
          </button>
        </div>
        <div className="output-actions">
          <button type="button" onClick={copy}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            type="button"
            className="reset"
            onClick={onReset}
            disabled={!diff.changed}
            title="Restore the seed markdown"
          >
            Reset to seed
          </button>
        </div>
      </div>

      {view === "raw" ? (
        <pre className="output-pre">
          <code>{markdown}</code>
        </pre>
      ) : (
        <pre className="output-pre diff-pre">
          {diff.rows.map((row, idx) => (
            <div key={idx} className={`diff-row diff-${row.kind}`}>
              <span className="diff-gutter">
                {row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}
              </span>
              <span className="diff-text">{row.text || " "}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownEditor } from "blintz";
import "blintz/styles.css";

const SEED = `# Hello, Blintz

This is the **smallest** possible setup — a controlled \`<MarkdownEditor>\`.

Type \`/\` for commands, drag the \`::\` handle to reorder, and watch the
markdown stay clean.

1. ordered
2. list
`;

function App() {
  const [md, setMd] = useState(SEED);
  return (
    <div style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Blintz — basic example</h1>
      <div style={{ border: "1px solid #ddd", borderRadius: 8 }}>
        <MarkdownEditor value={md} onChange={setMd} />
      </div>
      <details style={{ marginTop: 16 }}>
        <summary>Markdown output</summary>
        <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 12 }}>
          {md}
        </pre>
      </details>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

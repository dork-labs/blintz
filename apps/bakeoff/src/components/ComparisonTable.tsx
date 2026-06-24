import { LIBRARIES } from "../libraries";

/**
 * Static, hand-authored comparison table summarising the bake-off research.
 * Row data lives on each LibraryMeta in libraries.ts.
 */
export function ComparisonTable({ activeId }: { activeId: string }) {
  return (
    <section className="comparison">
      <h2>Comparison at a glance</h2>
      <p className="comparison-note">
        Hand-authored from setup research. Round-trip fidelity is the headline
        column: it decides whether an editor is safe for a markdown-backed store.
      </p>
      <div className="table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Library</th>
              <th>Type</th>
              <th>Approx bundle</th>
              <th>Round-trip</th>
              <th>License</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>
            {LIBRARIES.map((lib) => (
              <tr key={lib.id} className={lib.id === activeId ? "active-row" : ""}>
                <td className="cell-name">{lib.name}</td>
                <td>{lib.kind}</td>
                <td className="cell-bundle">{lib.bundle}</td>
                <td>
                  <span className={`badge badge-${tone(lib.roundTrip)}`}>
                    {lib.roundTrip}
                  </span>
                </td>
                <td className="cell-license">{lib.license}</td>
                <td className="cell-links">
                  <a href={lib.npmUrl} target="_blank" rel="noreferrer">
                    npm
                  </a>
                  <span className="sep">·</span>
                  <a href={lib.docsUrl} target="_blank" rel="noreferrer">
                    docs
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function tone(rt: string): string {
  if (rt === "faithful") return "good";
  if (rt === "mostly") return "ok";
  if (rt === "lossy") return "bad";
  return "neutral";
}

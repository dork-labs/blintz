import type { EmbedProps, EmbedRegistry } from "blintz";

/** Sample embeds for the playground: a tiny bar chart and a callout. */
function Chart({ attributes, label }: EmbedProps) {
  const values = (attributes.values ?? "")
    .split(",")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const max = Math.max(1, ...values);
  return (
    <figure className="sample-chart" data-testid="sample-chart">
      <div className="sample-chart-bars">
        {values.map((value, index) => (
          <span key={index} style={{ height: `${(value / max) * 100}%` }} title={String(value)} />
        ))}
      </div>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

function Callout({ attributes, children }: EmbedProps) {
  return (
    <aside className="sample-callout" data-tone={attributes.tone ?? "note"}>
      {children}
    </aside>
  );
}

export const SAMPLE_EMBEDS: EmbedRegistry = {
  chart: {
    component: Chart,
    title: "Chart",
    defaultAttributes: { kind: "bar", values: "3,5,2,8" },
    validate: (attributes) =>
      attributes.values
        ? {}
        : { issues: [{ message: "needs comma-separated numbers", path: ["values"] }] },
  },
  callout: { component: Callout, title: "Callout", kind: "container", defaultAttributes: { tone: "note" } },
};

/**
 * Representative seed markdown — deliberately stresses round-trip fidelity.
 *
 * It is loosely modelled on a real experiment write-up from this repo
 * (docs/experiments/EXP-0001), so the prose feels like what the database will
 * actually store (experiment idea / hypothesis / results / learnings).
 *
 * The content exercises, on purpose:
 *   - an h1 + h2 + h3
 *   - bold and italic
 *   - an ordered list AND an unordered list (including a nested item)
 *   - a link
 *   - inline `code`
 *   - a fenced ```ts code block
 *   - a blockquote
 *   - a GFM table
 *   - a horizontal rule
 *
 * These are exactly the constructs WYSIWYG editors tend to mangle, so watching
 * the "Markdown output" panel while editing reveals each library's drift.
 */
export const SEED_MARKDOWN = `# EXP-0001 — X pull via Apify tweet-scraper

Pull a handle's recent tweets via the maintained \`apidojo/tweet-scraper\` actor
and normalize them to canonical **Post**s. The same adapter powers the *search*
experiment too — just a different input shape.

## Hypothesis

A maintained actor gives the highest completeness and fidelity of any pull
method, with near-zero anti-bot upkeep, paid for in [Apify](https://apify.com)
credits per run. Best fit for **unattended daily** account pulls.

### How to run

1. Put \`APIFY_TOKEN\` in your \`.env\`.
2. Run the CLI for a handle.
3. Paste the printed run id back into the experiment frontmatter.

\`\`\`ts
import { runActor } from "@repo/adapters";

const items = await runActor("apidojo/tweet-scraper", {
  twitterHandles: ["nasa"],
  maxItems: 50,
}, process.env.APIFY_TOKEN);
\`\`\`

## Results

Success on a paid plan. Spot-checks against the real payload showed:

- **Media**: a video normalized with 6 resolution *variants*.
- **Metrics**: full set including views and bookmarks.
  - These are fields the free-plan alternative simply cannot supply.
- **Refs**: reposts carry \`repostOf\` with id and author handle.

> The richer the pull, the less the merge has to guess later. A sparse re-pull
> must never null out a field a richer pull already filled.

### Scorecard

| Dimension     | Score (1–5) | Note                                  |
| ------------- | :---------: | ------------------------------------- |
| completeness  |      5      | media variants, full metrics, refs    |
| fidelity      |      5      | matches the source payload closely    |
| speed / cost  |      4      | ~12s per run, but costs Apify credits |
| reliability   |      4      | maintained actor, low upkeep          |
| tosRisk       |      3      | scraping — *lower is safer*            |

---

**Learnings:** a maintained actor is the strongest default for unattended pulls;
the cost is credits, not engineering time.
`;

---
name: writing-adrs
description: Guides writing concise, effective Architecture Decision Records. Use when creating ADRs, extracting decisions from specs, or reviewing ADR quality.
---

# Writing Architecture Decision Records

## Overview

Architecture Decision Records (ADRs) capture significant technical decisions in a concise, standardized format. They answer "why did we do this?" for future developers and AI agents. Blintz ADRs live in `decisions/`, one file per decision. Create one with `/adr:create`.

## When to Write an ADR

Write an ADR when a decision:

- **Chooses between alternatives** — "We picked X over Y because..."
- **Adopts a pattern or technology** — New library, architecture pattern, data model
- **Has lasting consequences** — Affects how future features are built
- **Would surprise a new team member** — Non-obvious choices that need explanation

For Blintz, a deliberate **divergence from upstream Crepe** almost always qualifies: the next person will compare against Crepe and wonder why.

## When NOT to Write an ADR

Skip ADRs for:

- **Trivial implementation details** — Variable naming, file placement within an established structure
- **Obvious choices** — Using TypeScript in a TypeScript project
- **Temporary decisions** — Workarounds that will be replaced soon
- **Single-feature scope** — Decisions that only affect one spec with no project-wide impact

## Writing Guidelines

### Context (2-5 sentences)

Focus on the **problem**, not the solution. What situation existed? What forces were at play?

- **Good**: "Milkdown's Crepe editor builds its UI in Vue. A React app that uses it ships a second UI framework, and Crepe's Vue components can't share React context or state with the host app."
- **Bad**: "We needed an architecture." (Too vague)
- **Bad**: A full page of background. (Too long — that belongs in the spec)

### Decision (2-5 sentences)

State what was decided in **active voice**. Start with "We will..."

- **Good**: "We will reuse `@milkdown/kit` unchanged and rewrite only Crepe's view layer in React, through `@prosemirror-adapter/react`. No Vue code reaches the bundle."
- **Bad**: "A React port was implemented." (Passive, vague)

### Consequences

List concrete positives and negatives. Every decision has trade-offs — if you can't list a negative, think harder.

- **Positive**: Real benefits the project gains
- **Negative**: Real costs, complexity, or limitations introduced

## Decision Signals in Specs

When scanning specs for ADR candidates, look for:

| Signal                         | Example                                  |
| ------------------------------ | ---------------------------------------- |
| "We chose X over Y"            | Technology or library selection          |
| "The recommended approach"     | Pattern adoption after comparing options |
| "Trade-offs" section           | Explicit trade-off analysis              |
| "Architecture" or "Design"     | Structural decisions                     |
| "We will not" / "Out of scope" | Deliberate exclusions with rationale     |

## ADR Lifecycle

| Status       | Meaning                                            |
| ------------ | -------------------------------------------------- |
| `proposed`   | Significant decision recorded, not yet committed   |
| `accepted`   | Active decision guiding implementation             |
| `deprecated` | No longer relevant (project evolved past it)       |
| `superseded` | Replaced by a newer ADR (link via `superseded-by`) |

There is no `draft` status: judge significance before writing the file. A decision that doesn't meet two or more "When to Write" criteria doesn't get a file.

### Partial supersession: the `amends` relation

When a new ADR reverses **part** of an older one, the older ADR **stays `accepted`**. Marking a mostly-live ADR `superseded` tells every future reader to stop reading something they still need.

1. **Parent keeps `status: accepted` and `superseded-by: null`.**
2. **Parent's Status section names exactly what is retired:** quote the clause, then state what still governs.
3. **Child carries `amends: <parent-id>`** in its frontmatter and says which clause it replaces.

Reserve `status: superseded` + `superseded-by` for a **whole** ADR being replaced.

### ADRs are immutable

History is corrected by new records and status changes, never by rewriting an old ADR's prose. The one exception is appending to its Status section when it is amended or superseded.

## Common Pitfalls

- **Too long** — ADRs are not specs. Keep each section to 2-5 sentences.
- **Missing negative consequences** — Every decision has costs. Be honest.
- **Vague context** — "We needed a better solution" tells nothing. What was broken?
- **Solution in context** — Context describes the problem, not the answer.
- **No spec link** — If a spec drove this decision, always link it.

## File Conventions

- **Location**: `decisions/<id>-kebab-case-title.md`
- **IDs**: a coordination-free timestamp `YYMMDD-HHMMSS` (`date +%y%m%d-%H%M%S`), so concurrent branches never collide
- **Frontmatter**: `id`, `title`, `status`, `created`, `spec`, `superseded-by`, and `amends` when it applies
- **Sections**: Status, Context, Decision, Consequences (Positive / Negative)

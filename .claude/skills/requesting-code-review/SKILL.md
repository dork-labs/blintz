---
name: requesting-code-review
description: Guides dispatching a code-reviewer subagent to verify work before proceeding. Use when completing tasks, implementing major features, or before merging to verify work meets requirements.
---

# Requesting Code Review

Dispatch a code-reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**

- After each batch of related tasks in spec-driven development (`/flow:execute`) — holistic batch-level review, not per-task review
- After completing a major feature
- Before merge to main

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing a complex bug

## Lightweight Alternative

For quick self-review without dispatching a subagent, trace through recently modified functions yourself to verify correctness and completeness inline. Use the full code-reviewer subagent (below) for deeper, more rigorous review.

## How to Request

### 1. Get git SHAs

```bash
BASE_SHA=$(git rev-parse origin/main)  # pin once; or HEAD~1 for the last commit only
HEAD_SHA=$(git rev-parse HEAD)
```

### 2. Dispatch code-reviewer subagent

Use the Agent tool with `subagent_type: "code-reviewer"`. Supply the following context:

**Required context:**

- `{WHAT_WAS_IMPLEMENTED}` — What you just built
- `{PLAN_OR_REQUIREMENTS}` — What it should do (spec path, task description, or requirements)
- `{BASE_SHA}` — Starting commit
- `{HEAD_SHA}` — Ending commit
- `{DESCRIPTION}` — Brief summary of the changes

**Blintz-specific review concerns to include:**

- Markdown round-trip fidelity — what goes in comes back out; new nodes or marks carry a round-trip test
- No Vue in the bundle — nothing from Crepe's Vue view layer, and no `vue` dependency
- Public API and semver — any change to exports from `packages/blintz/src/index.ts`
- React `>=18` compatibility in library code
- Cleanup on unmount — ProseMirror views and plugins, CodeMirror instances, listeners

### 3. Act on feedback

- **Critical** — Fix immediately. Bugs, content loss, broken round-trip.
- **Important** — Fix before proceeding. Architecture problems, missing tests, error handling gaps.
- **Minor** — Note for later. Code style, optimization opportunities.
- **Push back** if the reviewer is wrong — provide technical reasoning, show code or tests that prove correctness.

### 4. Clean up the review workspace

If you checked the branch out somewhere to review it — a worktree, a scratch branch, a detached checkout of the PR head — delete it once you have reported. Review checkouts duplicate a branch that already lives on origin, so nothing is lost.

```
/worktree:prune          # what would go, and why
/worktree:prune --fix    # remove it
```

Run it from the main checkout, not from inside the review worktree: the worktree you are standing in is never removed.

## Example

```
[Just completed the batch of tasks for table column drag-to-reorder]

You: Batch complete — let me request a holistic review before the next batch.

BASE_SHA=$(git rev-parse origin/main)
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer subagent]
  WHAT_WAS_IMPLEMENTED: Drag handles to reorder GFM table columns
  PLAN_OR_REQUIREMENTS: specs/table-column-drag/02-specification.md, Tasks 1-3
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added a column drag handle node view, a ProseMirror transaction
    that moves cells, and round-trip plus Playwright coverage

[Subagent returns]:
  Strengths: Transaction keeps alignment row intact, round-trip test covers it
  Issues:
    Important: Drag listeners are not removed when the node view is destroyed
    Minor: Magic number (6) for drag threshold — extract to constant
  Assessment: Ready to proceed with fixes

You: [Remove listeners in destroy(), extract constant]
[Continue to the next batch]
```

## Integration with Workflows

**Spec-Driven Development (`/flow:execute`):**

- Review holistically after each batch of related tasks
- Catch round-trip regressions and API drift early
- Fix before moving to the next batch

**Feature Development:**

- Review after completing the feature
- Verify against the spec before calling it done

**Ad-Hoc Development:**

- Review before merge to main
- Review when stuck for a fresh perspective

## Review Checklist (Blintz-Specific)

**Editor behavior:**

- Markdown round-trips unchanged, including edge cases (empty paragraphs, frontmatter, nested lists)
- Behavior matches upstream Crepe unless the divergence is deliberate and explained
- `editable={false}` stays read-only, and toggling it emits no `onChange`

**Library:**

- No Vue, and no new heavy runtime dependency without a reason
- Exported API changes are intentional and versioned accordingly
- Works with React 18 and 19
- Node views and plugins clean up after themselves

**Styling:**

- Light and dark themes both checked
- Styles don't leak into the host app
- Screenshot baselines changed only where the visual change was intended

**Testing:**

- Unit tests next to the source they cover
- Visual changes covered in `browser-tests/`
- No implementation detail testing, no arbitrary timeouts

## Red Flags

**Never:**

- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer is wrong:**

- Push back with technical reasoning
- Show code or tests that prove correctness
- Request clarification on the concern

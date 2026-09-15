---
description: Create a new Architecture Decision Record
argument-hint: '<decision-title>'
allowed-tools: Read, Write, Edit, Grep, Glob, AskUserQuestion, Bash(date:*), Bash(mkdir -p decisions:*)
category: documentation
---

# Create Architecture Decision Record

**Decision Title:** $ARGUMENTS

---

## Steps

### Step 1: Allocate a timestamp id

ADRs use a coordination-free `YYMMDD-HHMMSS` id, so concurrent branches never collide:

```bash
date +%y%m%d-%H%M%S
```

Use its output as `<id>`. If `decisions/<id>-*.md` already exists (a same-second clash), wait a second and run it again.

### Step 2: Gather Decision Context

If the title is vague or lacks context, use AskUserQuestion to clarify:

1. **What problem or situation motivated this decision?** (Context)
2. **What was decided?** (Decision — active voice: "We will...")
3. **What are the positive consequences?**
4. **What are the negative consequences or trade-offs?**
5. **Is this related to a spec?** (Optional)
6. **What is the status?** (Default: `accepted`)

If the user provides a detailed description, extract these from the description instead of asking.

### Step 3: Check for Related ADRs

If `decisions/` does not exist yet, create it and skip the rest of this step. Otherwise search it:

```
grep -l "[relevant keywords]" decisions/*.md
```

If a related ADR is found, ask the user which relation applies:

- **Supersedes** — the new decision fully replaces the old one (old ADR flips to `superseded`)
- **Amends** — the new decision reverses only part of it (old ADR stays `accepted`; the new one carries `amends: <old-id>` — see `writing-adrs` → Partial supersession)
- **Related only** — mention it in prose, no formal link

### Step 4: Write the ADR

Create `decisions/<id>-{slug}.md`, where `{slug}` is a kebab-case version of the title:

```markdown
---
id: <id>
title: <short imperative title>
status: accepted
created: <YYYY-MM-DD>
spec: null
superseded-by: null
---

# <title>

## Status

Accepted.

## Context

<2-5 sentences on the problem>

## Decision

<2-5 sentences, "We will...">

## Consequences

### Positive

- ...

### Negative

- ...
```

Add `amends: <parent-id>` to the frontmatter only when partially replacing an ADR that stays accepted.

**Content guidelines (invoke `writing-adrs` skill):** problem-focused context, active-voice decision, honest negatives.

### Step 5: Update the Related ADR (if applicable)

If this ADR **supersedes** another (full replacement):

1. Update the old ADR's frontmatter: `status: superseded`, `superseded-by: <id>`
2. Append to the old ADR's Status section which ADR replaced it

If this ADR **amends** another (partial replacement):

1. The old ADR **keeps** `status: accepted`
2. Append to the old ADR's Status section which clause is retired and what still governs

### Step 6: Display Summary

```
ADR Created
  ID:     <id>
  Title:  [title]
  File:   decisions/<id>-[slug].md
  Status: [status]
  Spec:   [slug or none]
```

## Example

```
/adr:create Rewrite Crepe's view layer in React instead of wrapping its Vue components
```

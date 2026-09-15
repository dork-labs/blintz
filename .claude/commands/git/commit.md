---
description: Stage, validate, and commit changes with typecheck and unit tests
argument-hint: '[-m "message"] [--amend] [--no-verify] [files...]'
allowed-tools: Bash, Read, Grep
category: git
---

# Git Commit

Stage and commit changes after validating that types check and unit tests pass.

## Arguments

Parse `$ARGUMENTS` for these optional flags:

| Argument       | Effect                                                 |
| -------------- | ------------------------------------------------------ |
| `-m "message"` | Use provided commit message instead of auto-generating |
| `--amend`      | Amend the previous commit instead of creating new one  |
| `--no-verify`  | Skip typecheck and unit-test validation                |
| `<files...>`   | Stage only specified files (default: all changes)      |

**Examples:**

- `/git:commit` — Auto-generate message, stage all, validate
- `/git:commit -m "fix(blintz): keep empty paragraphs on round-trip"` — Use provided message
- `/git:commit --amend` — Amend previous commit
- `/git:commit packages/blintz/src/read-only.ts` — Only stage and commit specific file
- `/git:commit -m "wip" --no-verify` — Quick WIP commit, skip checks

## Task

### Step 0: Parse Arguments

Extract flags from `$ARGUMENTS`:

- Check for `-m "..."` or `-m '...'` — store as `USER_MESSAGE`
- Check for `--amend` flag — store as `AMEND=true`
- Check for `--no-verify` flag — store as `SKIP_VERIFY=true`
- Remaining arguments are file paths — store as `FILES`

### Step 1: Run Validation Checks (unless --no-verify)

**Skip this step if `--no-verify` flag was provided.**

Run typecheck and the unit tests in parallel. Both must pass before proceeding.

```bash
npm run typecheck
```

```bash
npm test
```

Blintz has no linter, so there is no lint step. The Playwright suite (`npm run test:browser`) is slower and CI runs it on every PR; run it yourself when the change touches rendering, CSS, or the theme.

**If either fails**: Stop and report the errors. Do not proceed to commit.

### Step 2: Review Changes

Show the current state of the repository:

```bash
git status
git diff --staged
git diff
```

### Step 3: Stage Changes

**If specific files were provided:**

```bash
git add <files...>
```

**Otherwise, stage all changes:**

```bash
git add -A
```

If there are no changes to commit (or stage), report this and stop.

### Step 4: Review Recent Commits

Match the repo's Conventional Commits style (`feat(blintz): …`, `test(blintz): …`, `chore(release): …`):

```bash
git log --oneline -5
```

### Step 5: Generate Commit Message (unless -m provided)

**Skip this step if `-m "message"` was provided** — use the user's message directly.

Otherwise, analyze the staged changes and generate an appropriate commit message:

1. Look at `git diff --staged` to understand what changed
2. Summarize the nature of changes (feature, fix, refactor, docs, etc.)
3. Write a concise message focusing on "why" not "what"

### Step 5.5: Verification Gate

Before committing, verify all checks pass with FRESH evidence:

1. Confirm Step 1 validation passed (or was skipped with --no-verify)
2. Review the staged diff one more time
3. Ensure no incomplete work is being committed (no TODO markers, no commented-out code, no partial implementations)

Refer to the `verification-before-completion` skill: never claim work is ready to commit without fresh verification evidence.

### Step 6: Create Commit

**If `--amend` flag was provided:**

```bash
git commit --amend -m "$(cat <<'EOF'
<commit message here>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Otherwise, create a new commit:**

```bash
git commit -m "$(cat <<'EOF'
<commit message here>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Note**: When using `-m` with user-provided message, still append the attribution.

### Step 7: Verify

```bash
git log -1 --oneline
git status
```

## Output Format

```
Git Commit

Validation:
  [x] Typecheck passed
  [x] Unit tests passed

Changes:
  - X files changed
  - [brief summary of changes]

Commit:
  [hash] [commit message first line]

Status: Ready to push
```

## Edge Cases

- **Typecheck fails**: Report errors with file locations, do not commit (unless `--no-verify`)
- **Tests fail**: Report the failing tests, do not commit (unless `--no-verify`)
- **No changes**: Report "Nothing to commit, working tree clean"
- **Merge conflict markers**: Warn user about unresolved conflicts
- **Large number of files**: Summarize by category (e.g., "15 source files, 3 test files")
- **--amend on pushed commit**: Warn user that amending will require force push
- **Specified files don't exist**: Report which files weren't found, stage what exists

---
description: Create an isolated git worktree for a unit of work
argument-hint: '<branch-name> [--from-current]'
allowed-tools: Bash, Read, EnterWorktree
category: git
---

# Worktree Create

Create a git worktree under `../blintz-wt/` and install its dependencies.

## Arguments

| Argument         | Effect                                                        |
| ---------------- | ------------------------------------------------------------- |
| `<branch-name>`  | **Required.** Name of the branch/worktree to create           |
| `--from-current` | Base the new branch on the current `HEAD` (not `origin/main`) |

**Examples:**

- `/worktree:create fix-table-drag` — New worktree from `origin/main`
- `/worktree:create fix-table-drag --from-current` — New worktree from the current commit

## Task

### Step 0: Parse Arguments

Extract the branch name and `--from-current` flag from `$ARGUMENTS`. If no branch name is provided, report the error and stop.

### Step 1: Validate Prerequisites

```bash
# Equal only in the main worktree; in a secondary one --git-dir points into .git/worktrees/
git rev-parse --git-dir --git-common-dir
```

If the two paths differ, the current directory is a secondary worktree — warn the user and stop. Never nest worktrees.

```bash
git worktree list
```

If a worktree already exists for `<branch-name>`, report its location and stop.

### Step 2: Create Worktree

```bash
git fetch origin
BASE=$(git rev-parse origin/main)        # or: BASE=$(git rev-parse HEAD) with --from-current
DIR="../blintz-wt/<branch-name with / replaced by ->"
git worktree add -b <branch-name> "$DIR" "$BASE"
```

**Base on `origin/main`, not local `main`.** The local branch routinely trails origin, and a worktree started from it begins on a stale base. If the branch already exists locally but has no worktree, drop `-b` and pass the branch name instead of `$BASE`.

### Step 3: Install Dependencies

Run `npm ci` inside `$DIR`. A new worktree has no `node_modules`, so typecheck, tests, and the bakeoff all fail until this runs.

### Step 4: Verify, Then Report

```bash
[ -d "$DIR" ] && git -C "$DIR" log --oneline -1 || echo "MISSING — recreate it"
git worktree list
```

Keep the `-d` guard: `git -C ""` falls back to the current directory and would report success about the wrong checkout.

### Step 5: Offer to Switch the Session

Offer to move the current session into the new worktree with the EnterWorktree tool, passing `path` = the absolute path of `$DIR`. It works for any path listed by `git worktree list`. If declined, the user can `cd` there or start a fresh session in that directory.

## Output Format

```
Worktree Created

Location: <absolute worktree path>
Branch:   <branch-name>
Base:     <short sha>

Next steps:
  - I can switch this session into it (EnterWorktree), or
  - cd <worktree path> && npm run bakeoff
```

## Edge Cases

- **Already in a worktree**: Report "You're already in a worktree. Switch to the main checkout first."
- **Branch already has a worktree**: Report the existing worktree location
- **Branch name invalid**: Let git report the error naturally
- **`npm ci` fails**: Report the error but note the worktree was created
- **Parallel browser test runs**: Playwright's dev server uses port 5191 with `strictPort`. Give each worktree its own `BLINTZ_TEST_PORT` when running `npm run test:browser` at the same time as another checkout.

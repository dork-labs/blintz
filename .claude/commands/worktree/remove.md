---
description: Remove a git worktree safely
argument-hint: '<branch-name> [--delete-branch]'
allowed-tools: Bash(git worktree:*), Bash(git -C:*), Bash(git branch -d:*)
category: git
---

# Worktree Remove

Remove a git worktree after checking for uncommitted changes.

## Arguments

| Argument          | Effect                                              |
| ----------------- | --------------------------------------------------- |
| `<branch-name>`   | **Required.** Branch name of the worktree to remove |
| `--delete-branch` | Also delete the branch after removing the worktree  |

**Examples:**

- `/worktree:remove fix-table-drag` — Remove worktree, keep branch
- `/worktree:remove fix-table-drag --delete-branch` — Remove worktree and branch

## Task

### Step 0: Parse Arguments

Extract the branch name and `--delete-branch` flag from `$ARGUMENTS`. If no branch name is provided, report the error and stop.

### Step 1: Safety Checks

**Refuse to remove main:** if the branch name is `main`, report "Cannot remove the main worktree" and stop.

**Find the worktree and refuse if it's the main one:**

```bash
git worktree list
```

Scan the output for `<branch-name>`. If no worktree matches, report and stop. The first line is always the main checkout — if that's the line matching `<branch-name>`, report "That branch is checked out in the main checkout, which cannot be removed" and stop. The branch name alone is not a reliable guard; the path is.

**Check for uncommitted changes:**

```bash
git -C <worktree-path> status --porcelain
```

If there are uncommitted changes, warn the user and ask for confirmation before proceeding.

### Step 2: Remove Worktree

```bash
git worktree remove <worktree-path>
```

Never add `--force` on your own. If git refuses (untracked or modified files), report what it said and let the user decide.

If `--delete-branch` was specified:

```bash
git branch -d <branch-name>
```

If the branch hasn't been merged, `git branch -d` fails safely. Report this. Blintz squash-merges, so a merged branch can still look unmerged here; `/worktree:prune` checks the PR and handles that case.

### Step 3: Verify

```bash
git worktree list
```

## Output Format

```
Worktree Removed

Removed: <worktree-path>
Branch:  <branch-name> [deleted | kept]

Remaining worktrees:
  <worktree list>
```

## Edge Cases

- **main**: Refuse unconditionally
- **Branch checked out in the main checkout**: Refuse — the main checkout is never removed
- **Uncommitted changes**: Warn and ask for confirmation
- **Worktree not found**: Report "No worktree found for branch '<name>'"
- **Unmerged branch with --delete-branch**: Report that `-d` failed; suggest `/worktree:prune`
- **Currently inside the worktree**: Warn that removal may fail — switch to the main checkout first

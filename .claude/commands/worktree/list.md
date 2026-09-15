---
description: List all git worktrees and whether each has uncommitted work
allowed-tools: Bash(git worktree list:*), Bash(git -C:*)
category: git
---

# Worktree List

Show all worktrees, their branches, and whether each holds uncommitted work.

## Task

### Step 1: List Worktrees

```bash
git worktree list
```

This gives each worktree's path, HEAD, and checked-out branch. The first line is always the main checkout.

### Step 2: Check Each Secondary Worktree

For every worktree after the first:

```bash
git -C <worktree-path> status --porcelain
```

Any output means uncommitted work that exists only in that folder. A worktree listed as `prunable` no longer exists on disk.

## Output Format

```
Worktrees

  blintz                      (main)             [main checkout]
  blintz-wt/fix-table-drag    (fix-table-drag)   clean
  blintz-wt/theme-tokens      (theme-tokens)     uncommitted changes
```

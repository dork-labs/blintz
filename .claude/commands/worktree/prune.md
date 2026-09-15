---
description: Remove worktrees and local branches whose work has landed
argument-hint: '[--fix]'
allowed-tools: Bash(git fetch:*), Bash(git worktree:*), Bash(git -C:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(gh pr list:*)
category: git
---

# Worktree Prune

Delete the worktrees and local branches that finished work left behind. Reports by default and writes only when asked.

## Arguments

| Argument | Effect                                              |
| -------- | --------------------------------------------------- |
| _(none)_ | Show what would be removed and why. Writes nothing. |
| `--fix`  | Actually remove them.                               |

## Task

Run this from the main checkout. A worktree you are standing in is never removed.

### Step 1: Gather Facts

```bash
git fetch origin --prune
git worktree list --porcelain
git branch --format='%(refname:short) %(objectname)'
gh pr list --state all --limit 200 --json number,headRefName,headRefOid,state
```

If `gh` fails, stop classifying and mark every branch `KEEP pr-state-unknown`. "I could not ask" is not the same as "there is no PR".

### Step 2: Classify

For each local branch other than `main`, and the worktree holding it (if any), mark it **REAP** only when **all** of these hold:

1. It is not `main`, not the main checkout, and not the worktree this session is in.
2. Its worktree (if any) is clean: `git -C <path> status --porcelain` prints nothing. Ignored build output (`node_modules/`, `dist/`, `playwright-report/`, `test-results/`, `.vite/`) is fine to lose; any other ignored file is not.
3. It has a PR in state `MERGED`.
4. The local branch tip equals that PR's `headRefOid`. Blintz squash-merges, so merged branches are never ancestors of `main`; comparing the tip to the merged head is how you know nothing was committed after the merge.

Otherwise mark it **KEEP** with the first reason that applies:

| Reason                | Meaning                                                   |
| --------------------- | --------------------------------------------------------- |
| `protected`           | `main`, the main checkout, or the current worktree        |
| `uncommitted-changes` | Work exists only in that working tree                     |
| `pr-open`             | Still under review                                        |
| `pr-closed-unmerged`  | A person stopped this work; the branch is its only record |
| `no-pr`               | Never proposed — work in flight                           |
| `commits-after-merge` | Tip differs from the merged head                          |
| `pr-state-unknown`    | `gh` could not be asked                                   |

### Step 3: Show the Plan

List every branch with `REAP` or `KEEP <reason>`. Do not delete anything marked `KEEP`.

### Step 4: Remove, if Asked

Only when `$ARGUMENTS` contains `--fix`, for each `REAP`:

```bash
echo "<branch> <sha>"                 # print the recovery handle first
git worktree remove <worktree-path>   # never --force
git branch -D <branch>
```

`-D` is needed because squash-merged branches are not ancestors of `main`, so `-d` refuses them; condition 4 is what makes it safe. `git branch -D` also deletes the branch's reflog, so the printed line is the only way back: `git branch <branch> <sha>`.

If `git worktree remove` refuses, report it and move on. Its refusal is a second opinion that something changed since Step 2.

## Notes

- Branches on origin are not this command's job; it cleans local worktrees and refs.
- Safe to run any time without `--fix`: it fetches, then only reads.

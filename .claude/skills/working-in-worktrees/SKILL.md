---
name: working-in-worktrees
description: Decides when blintz work needs an isolated git worktree and how to create, enter, and clean one up safely. Use when starting code changes in a checkout that another agent or session may share, running /flow:execute, or doing parallel work that changes tracked files.
---

# Working in Worktrees

## Overview

This skill covers **workspace isolation** for code work in blintz. It teaches the one rule (_one checkout, one writer_), how to create, enter, and clean up a worktree without losing anyone's work, and the part isolation does **not** give you: worktrees separate working trees but share every ref.

## When to Use

- You are about to make a code change and the checkout **may be shared** with another agent or session.
- You are running the `/flow:execute` stage.
- You are running parallel work that changes tracked files.
- You are comparing your branch against `main` across **more than one command**.
- You need to create, enter, exit, or remove a worktree.

## The rule: one checkout, one writer

`main` is the **clean integration branch**, not a shared scratchpad. Stay in the main checkout only when _all three_ hold:

1. You are **certainly the only writer** in this checkout, **and**
2. The work is **non-code** (specs, tracker, docs prose) **or** a single commit you land immediately, **and**
3. **No dev server or Playwright run** in this checkout needs to stay undisturbed.

Otherwise create a worktree. Triggers:

- 🔴 **Another session may be active here.** This machine runs several DorkOS agents, and more than one session of the blintz agent can be live at once. You usually cannot prove you are alone.
- 🔴 **Multi-commit or long-lived code work** — a feature, refactor, or spec implementation.
- 🟡 The checkout is already **dirty or on an unrelated branch**.
- 🟡 A **bakeoff dev server or browser test run** must keep running.

Two writers in one checkout can sweep each other's uncommitted changes into their commits, or unstage each other's files mid-commit. A worktree gives each writer its own tree.

## Worktrees share refs

A worktree isolates the working tree. It does **not** isolate refs: `origin/main` lives in the common git dir, shared by every worktree. When any session runs `git fetch`, that ref moves for you too — including between two commands of your own investigation. Nothing errors; two commands simply answer against different trees.

**Pin the base once, then never name the moving ref again:**

```bash
BASE=$(git rev-parse origin/main)
git diff --name-only "$BASE"...HEAD
git log --oneline "$(git merge-base "$BASE" HEAD)"..HEAD
```

- **Treat a surprising file list as evidence the ref moved**, not as data. Re-derive it against a pinned SHA.
- **Hand people SHAs, not ref names.** A SHA means the same thing an hour later.

## Non-code phases stay in `main`

The `/flow` intent stages — `/flow:ideate`, `/flow:specify`, `/flow:decompose` — write only spec markdown (plus tracker breadcrumbs). They run in the main checkout. Isolation begins at `/flow:execute`.

## Step-by-Step

1. **Detect whether you are already in a worktree.**

   ```bash
   git rev-parse --git-dir --git-common-dir
   ```

   The two paths are equal only in the main checkout. If they differ, **work here, do not nest**.

2. **Create the worktree**, keyed by unit of work:

   ```
   /worktree:create <branch-name>             # from origin/main (default)
   /worktree:create <branch-name> --from-current
   ```

   It creates `../blintz-wt/<branch>` from `origin/main` and runs `npm ci` there.

   **Don't put a Linear issue id (`BNZ-123`) in the branch name unless the branch completes that issue.** Linear closes an issue named in a merged PR's branch, even when the PR only delivered part of it.

3. **Verify it exists before relying on it**, and commit something before handing the path to anyone:

   ```bash
   W=../blintz-wt/<branch>
   if [ -d "$W" ]; then git -C "$W" log --oneline -1; else echo "MISSING"; fi
   ```

   Every line that touches `$W` must sit inside the guard: `git -C ""` falls back to the current directory and reports on the wrong checkout. If you were handed a path that does not exist, say so rather than quietly recreating it.

4. **Enter without restarting** — use the **EnterWorktree** tool with `path` = the absolute worktree path.

5. **Do the work**, commit, push, and open the PR from the worktree branch.

6. **Exit** with **ExitWorktree** (`keep` or `remove`), or `cd` back to the main checkout.

7. **Clean up after merge.** The merge usually lands after your session ends, so sweep at the **start** of a session:

   ```
   /worktree:prune          # what would go, and why
   /worktree:prune --fix    # remove it
   ```

   Review checkouts count too: delete them once the review is reported.

## Ports

Playwright starts its own bakeoff server on port 5191 with `strictPort`. Two browser test runs at once (two worktrees, or a worktree plus the main checkout) collide unless each sets its own `BLINTZ_TEST_PORT`. Never kill a server you did not start to free a port; the process guard blocks `pkill` and `killall` for that reason.

## Common Pitfalls

- ❌ Starting code work in a shared checkout "because it's a small change".
- ❌ Creating a worktree from inside a worktree.
- ❌ Basing a worktree on local `main` instead of `origin/main`.
- ❌ Removing a worktree with uncommitted, untracked, or unpushed work — refuse and confirm first.
- ❌ Forcing the `/flow` intent stages into worktrees.
- ❌ Naming `origin/main` twice in one investigation. Pin it once.

## References

- Commands: `/worktree:create`, `/worktree:list`, `/worktree:remove`, `/worktree:prune`
- Execution gate: the `/flow:execute` stage (flow plugin's `executing-specs` skill)
- Cleanup: the `/flow:done` stage (`closing-work` skill)

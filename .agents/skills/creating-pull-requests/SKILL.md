---
name: creating-pull-requests
description: When and how to open a pull request in the blintz repo, what the body must carry, how CI behaves, and how Linear links follow the PR. Use when finishing a branch, opening a PR, writing a PR description, or reading a failed CI run.
---

# Creating Pull Requests

How blintz PRs are opened, checked, and merged. Blintz is a **public** repo, published to npm and consumed by DorkOS.

## When to Open

Open the PR once the branch has converged, not while it is still moving:

1. The work is done and reviewed locally (`requesting-code-review`).
2. The local gates pass with fresh output: `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser` when rendering, CSS, or the theme changed.
3. The branch is based on a recent `origin/main`.

One PR per unit of work. A refactor riding along with a feature makes both harder to review; split it.

## Title and Commits

Blintz squash-merges, so the **PR title becomes the commit on `main`**. Write it in the repo's Conventional Commits style:

```
feat(editor): polish markdown typography, themes, and keyboard editing
fix(blintz): keep empty paragraphs on round-trip
test(blintz): assert toggling editable emits no onChange
```

Don't bump the package version in a feature PR. Releases land as their own `chore(release): blintz X.Y.Z` commit.

## The Body

Write for a reviewer who has not seen your session. Include:

- **What changed for people using Blintz**, in plain language (`writing-for-humans`).
- **API impact**: any added, changed, or removed export or `MarkdownEditor` prop, and whether it is breaking. Say which semver bump it implies.
- **Evidence**: the commands you ran and their results. For visual changes, attach before and after screenshots and name the updated baselines.
- **Tracker link** (see below).

**Public repo rule:** nothing private goes in a PR body, title, branch name, or commit — nothing from private repos, no secrets, no internal hostnames or file paths from other machines.

```bash
gh pr create --title "fix(blintz): keep empty paragraphs on round-trip" --body "$(cat <<'EOF'
<body>
EOF
)"
```

## Linear Links

Linear's GitHub integration moves an issue on PR events, and **what closes an issue is how you name it**:

| Form                                             | Effect on merge        |
| ------------------------------------------------ | ---------------------- |
| `Closes BNZ-123` / `Fixes BNZ-123` in the body   | Closes the issue       |
| `BNZ-123` in the **branch name**                 | Closes the issue       |
| A bare `BNZ-123` in the body, or `Refs BNZ-123`  | Links only, stays open |

If the PR delivers only part of an issue, use `Refs` and keep the id out of the branch name.

## CI

`.github/workflows/verify.yml` ("Verify editor") runs on every PR and on pushes to `main`, on `macos-14`: `npm ci`, typecheck, unit tests, build, then the Playwright suite.

- Screenshot baselines are macOS-specific, which is why CI runs on macOS. Don't regenerate them on another OS.
- When the browser suite fails, CI uploads a `browser-diagnostics` artifact (Playwright report and traces):

  ```bash
  gh run list --branch <branch> --limit 3
  gh run download <run-id> -n browser-diagnostics
  ```

- Read the failure before re-running. A re-run that passes is not a fix unless you can explain the first failure.

## After Review

- Evaluate feedback with `receiving-code-review` before changing anything.
- Push fixes as new commits (they squash on merge); re-run the local gates first.
- Once approved and green, squash-merge. Then clean up with `/worktree:prune`.

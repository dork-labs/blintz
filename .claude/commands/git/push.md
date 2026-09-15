---
description: Validate and push commits with typecheck, unit test, and build checks
argument-hint: '(no arguments)'
allowed-tools: Bash, Read, Grep
category: git
---

# Git Push

Push commits to remote after validating that types check, unit tests pass, and the library builds.

## Task

### Step 1: Check Current State

```bash
git status
git log @{u}..HEAD --oneline 2>/dev/null || git log --oneline -5
```

If there are no commits to push, report this and stop.

### Step 2: Run Validation Checks

Run all validation checks. All must pass before pushing. These are the same steps CI runs in `.github/workflows/verify.yml`, minus the browser suite.

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

If the pushed commits touch rendering, CSS, or the theme, also run `npm run test:browser`. Its screenshot baselines are macOS-specific, so a failure on another OS is not evidence of a regression.

**If any check fails**: Stop and report the errors. Do not push.

### Step 2.5: Verification Gate

1. Re-read the output of typecheck, tests, and build
2. Confirm zero errors in each
3. Do not push based on a previous run — the checks in Step 2 ARE the fresh evidence

Refer to the `verification-before-completion` skill.

### Step 3: Review What Will Be Pushed

```bash
git log @{u}..HEAD --oneline 2>/dev/null || echo "No upstream branch set"
git branch --show-current
```

### Step 4: Push to Remote

```bash
git push
```

If no upstream is set:

```bash
git push -u origin $(git branch --show-current)
```

### Step 5: Verify

```bash
git status
```

## Output Format

```
Git Push

Validation:
  [x] Typecheck passed
  [x] Unit tests passed
  [x] Build passed

Pushed:
  Branch: [branch-name]
  Commits: X commit(s)
  - [hash] [message]

Status: Successfully pushed to origin
```

## Edge Cases

- **Typecheck fails**: Report errors with file locations, do not push
- **Tests fail**: Report failing tests, do not push
- **Build fails**: Report build errors, do not push
- **No upstream**: Set upstream with `-u origin <branch>`
- **Remote rejected**: Report rejection reason (likely needs pull/rebase)
- **No commits to push**: Report "Already up to date with remote"
- **Uncommitted changes**: Warn user about uncommitted changes (but still push existing commits)

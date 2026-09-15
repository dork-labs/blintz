---
name: writing-changelogs
description: Writes release notes for Blintz versions that developers installing it from npm can act on, including breaking changes and migration steps. Use when preparing a release, writing a GitHub release, or summarizing what changed between two versions.
---

# Writing Changelogs

## Who Reads This

Developers who install `blintz` from npm, DorkOS first among them. They want to know three things: what they can do now, what broke, and what to change in their code. Write every entry for them, following `writing-for-humans`.

## Where Notes Go

Blintz has no `CHANGELOG.md` yet. Releases land as a `chore(release): blintz X.Y.Z` commit. Before writing, check where past notes went:

```bash
gh release list --limit 5
git log --oneline --grep "chore(release)"
```

Write the notes where the last release put them. Don't add a `CHANGELOG.md` without the operator agreeing to it first.

## Gathering the Changes

Pin the range with SHAs, not moving refs:

```bash
FROM=$(git rev-list -n1 --grep "chore(release): blintz <previous version>" HEAD)
git log --oneline "$FROM"..HEAD
```

Read the PRs behind the commits. When a commit subject doesn't tell you what changed for the reader, read the diff until you can say it in one sentence.

## Categories

| Type          | Use For                            | Example                                         |
| ------------- | ---------------------------------- | ----------------------------------------------- |
| **Add**       | New features, capabilities         | Add a read-only mode with the `editable` prop   |
| **Fix**       | Bug corrections                    | Fix empty paragraphs disappearing when you save |
| **Change**    | Modifications to existing behavior | Change the default code block theme             |
| **Remove**    | Deleted features                   | Remove the deprecated `readOnly` prop           |
| **Improve**   | Performance, UX enhancements       | Improve typing speed in long documents          |
| **Deprecate** | Scheduled for removal              | Deprecate `onReady` (use `onCreate` instead)    |

## Breaking Changes Come First

Anything that makes a consumer change their code goes at the top, under its own heading, with a before-and-after snippet:

````markdown
## Breaking changes

`MarkdownEditor` no longer accepts `readOnly`. Use `editable` instead.

```tsx
// Before
<MarkdownEditor readOnly value={md} />
// After
<MarkdownEditor editable={false} value={md} />
```
````

Check the version bump matches: a breaking change needs a major bump (or a minor bump while Blintz is `0.x`, stated plainly in the notes).

## What to Skip

- Internal refactoring with no effect on consumers
- Test, CI, and tooling changes
- Documentation typo fixes
- Dependency updates, unless they change peer requirements or fix a security issue
- Fixes to changes that were never released

## The "You Can Now" Test

Prepend "You can now..." to each Add or Improve entry. If it doesn't make sense, rewrite it.

- ❌ "Add ImageViewer.tsx" → "You can now add ImageViewer.tsx" (nonsense)
- ✅ "Click an image to view it full size" → "You can now click an image to view it full size"

## The "So What?" Test

If someone asks "so what?" after reading an entry, add the missing context: what it lets them do, or what problem it removes.

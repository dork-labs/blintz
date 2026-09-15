# Review instructions

Calibration for the adversarial review a change faces **before** its pull request
opens. `/flow` points every reviewer at this file (the `review.rubric` config
field), so what you write here is what a reviewer optimizes for. General project
context lives in `AGENTS.md`; this file only covers what changes review behavior.

## How to review (process)

Work the diff like a senior engineer, not a linter:

1. Read the full diff and the changed-file list. Read the enclosing function or
   module around each hunk — a bug in an unchanged line of a touched function is
   in scope.
2. Trace outward. For every symbol the diff changes, removes, or renames, search
   the repo for its callers and references. A change is only safe once you have
   checked who depends on it.
3. Verify before posting. Every finding needs a `file:line` you actually read,
   never an inference from a name. If a quick search settles it, run the search.
4. Rank, then cap. Order findings by severity and post the top ones within the
   nit cap below. Quality over volume.

You are reviewing the diff, not the author's account of it. A summary of what was
implemented is a claim to check, never an input to trust.

## Severity

**Blocking** is reserved for findings that would break behavior, lose data, leak
secrets, or violate a hard architectural rule of this repo:

- Logic bugs, broken edge cases, and regressions in the changed code.
- Untrusted input reaching a shell, a query, or a filesystem path.
- Secrets or personal data in logs, error messages, or committed files.
- A new entry point that skips the authorization its neighbors perform.
- Any violation of the hard rules below.

Architecture, naming, refactoring, and style preferences are nits at most.

## Blintz's hard rules

Each of these is blocking. They are stated in `AGENTS.md` → Rules.

- **Markdown round-trip fidelity** — `packages/blintz/src/**` parsers,
  serializers, and node or mark schemas. Markdown that goes in must come back out
  unchanged. A parsing or serialization change without a case in
  `packages/blintz/src/round-trip.test.ts` (or a neighboring round-trip test) is
  incomplete. Losing a user's content on save is the worst bug this library can
  ship.
- **No Vue in the bundle** — `packages/blintz/**` and its `package.json`. Views
  are React, through `@prosemirror-adapter/react`. Nothing from Crepe's Vue view
  layer, and no `vue` dependency, direct or transitive.
- **Reuse the engine, don't fork it** — `@milkdown/kit` is used as is. Copying
  engine code into `packages/blintz` instead of configuring or extending it needs
  a stated reason in the PR.
- **The public API is semver** — exports from `packages/blintz/src/index.ts` and
  `MarkdownEditor` props. Blintz is published to npm and DorkOS consumes it. An
  added, renamed, or removed export or prop that the PR does not call out, with
  its semver impact, is blocking.
- **React `>=18`** — `packages/blintz/src/**`. Library code must work with both
  React 18 and 19; a React 19-only API needs a guard.
- **Clean up on unmount** — node views, ProseMirror plugins, CodeMirror
  instances, and DOM listeners in `packages/blintz/src/**` are destroyed when the
  editor unmounts. A leak here repeats for every editor a host app mounts.
- **Public repo** — no secrets, and nothing from private repositories, in code,
  comments, commit messages, or PR text.

## Cap the nits

Report at most **five** nits per review. If you found more, write "plus N similar
items" in the summary rather than posting them all inline. If everything you
found is a nit, open with "No blocking issues."

## Do not report

- **Anything CI already enforces** — `.github/workflows/verify.yml` runs
  typecheck, unit tests, the library build, and the Playwright suite. Each has
  its own gate; repeating it here spends the author's attention on a machine's
  job.
- **Generated, vendored, and lock files** (`package-lock.json`, `dist/`).
- **Pure formatting opinions.** There is no formatter configured; don't act as
  one.

## Always check

- **Behavior matches upstream Crepe**, or the divergence is deliberate and
  explained. Read the upstream implementation (the `opensrc` skill) before
  calling a difference a bug or a fix.
- **New or changed behavior has a test that would fail if it regressed.** Editor
  behavior belongs in a round-trip or unit test; visual behavior (typography,
  themes, lists, tables) belongs in `browser-tests/`.
- **Screenshot baseline changes are intended.** Every changed `*-darwin.png`
  should correspond to a visual change the PR describes. Baselines are
  macOS-only, so a baseline regenerated on another OS is a finding.
- **Light and dark themes** both still work for any styling change.
- **`editable={false}` stays read-only**, and toggling it emits no `onChange`.
- **Docs describe the new behavior**: `README.md`, `packages/blintz/README.md`,
  and `AGENTS.md` when props, exports, or commands change.
- Removed or renamed things leave no surviving references, in prose and config as
  well as code.

## Summary shape

Open with a one-line tally (for example `2 blocking, 3 nits`), and lead with "No
blocking issues found" when that is true. The author wants the shape of the
review before the details.

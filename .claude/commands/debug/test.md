---
description: Debug and fix failing tests using test-driven analysis and self-debugging methodology
argument-hint: '[test-file-path or test-name]'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, TodoWrite, AskUserQuestion, mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs
---

# Test Failure Debugging

Debug and fix the failing test(s) described by `$ARGUMENTS` (a test file path, a test name pattern, or empty for the whole suite). Load the `debugging-test-failures` skill — it carries the methodology (read the failing test first, distinguish test bugs from implementation bugs, verify the fix would fail on wrong code). This command adds the project-specific ground truth below.

## Running tests in this repo

```bash
npx vitest run <path-to-test-file>                   # ONE unit test file — fastest loop
npx vitest run <path> -t "test name"                 # One test case within a file
npm test                                             # Full unit suite (vitest run, root config)
npm run test:browser                                 # Playwright suite (browser-tests/)
npm run test:browser -- browser-tests/table.spec.ts  # One browser spec
```

**Gotchas:**

- **Unit tests must match `packages/*/src/**/*.test.{ts,tsx}`** (root `vitest.config.ts`). A test file anywhere else silently never runs.
- **The default environment is `node`.** A test that mounts the editor needs a DOM; copy the setup from `packages/blintz/src/reactive-editable.test.tsx`.
- **Vitest filters are positional** (path or name substrings after `vitest run`), plus `-t` for test names. `--testPathPattern` is a Jest flag and is invalid here.
- **Screenshot baselines are macOS-only** (`*-darwin.png`); CI runs on `macos-14`. Update them with `npm run test:browser:update` only after confirming the visual change is intended, and only on macOS.
- **Playwright starts its own bakeoff dev server** on port 5191 with `strictPort` (override with `BLINTZ_TEST_PORT`). A port clash fails the whole run. Pick another port; never kill a server you did not start.
- The library is consumed as TS source by tests and the bakeoff, so no build is needed first.

## Project testing patterns

- Unit tests sit next to the source they cover (`round-trip.test.ts`, `read-only.test.ts`), not in `__tests__/`.
- **Markdown round-trip is the core contract.** A parsing or serialization failure is usually a real regression, not a flaky test: the markdown that went in did not come back out.
- Visual behavior (typography, themes, lists, tables) is guarded by `browser-tests/`, not jsdom. A jsdom test asserting on layout is testing the wrong layer.
- Blintz ports Milkdown's Crepe. When a failure traces into `@milkdown/kit`, ProseMirror, or CodeMirror, read the real source with the `opensrc` skill before assuming the test is wrong.

## Escalation

- Library-specific behavior (Vitest, Playwright, Testing Library) → context7 (`resolve-library-id` → `query-docs`).
- Upstream editor internals → `opensrc`.

## Non-negotiables

- Read the failing test AND the implementation under test before proposing any fix.
- Never delete or weaken a test (or regenerate a screenshot) just to make it pass without understanding why it fails.
- Verify the fix by re-running the specific test, then the full `npm test`; check the test would still fail if the implementation were wrong.

Wrap up with: failing test, root cause, whether the bug was in the test or the implementation, what changed, files modified.

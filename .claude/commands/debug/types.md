---
description: Debug and fix TypeScript type errors with systematic analysis and expert guidance
argument-hint: '[error-message or file-path]'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, TodoWrite, AskUserQuestion, mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs
---

# TypeScript Type Error Debugging

Debug and fix the TypeScript error(s) described by `$ARGUMENTS` (an error message, a file path, or empty for a full typecheck). Load the `debugging-typescript-errors` skill — it carries the methodology (trace the real mismatch, minimal verified fix, explain the underlying concept). This command adds the project-specific ground truth below.

## Running typecheck in this repo

```bash
npm run typecheck              # Every workspace that has a typecheck script
npm run typecheck -w blintz    # Just the library — prefer for the fix loop
```

**Gotcha: one `@types/react` for the whole workspace.** The root `package.json` `overrides` pins `@types/react` and `@types/react-dom` to `^19.2`. A nested older copy splits `ReactNode` and surfaces as bigint / `Promise<ReactNode>` errors on JSX components. If you see that, run `npm ls @types/react` before touching code.

## Project-specific type landscape

- **Editor types come from Milkdown.** `@milkdown/kit` re-exports ProseMirror; React node views go through `@prosemirror-adapter/react`. A mismatch inside those is usually a wrong assumption about their API: read their source with the `opensrc` skill rather than casting.
- **React peer range is `>=18`.** Library code in `packages/blintz` must type-check against the APIs React 18 has; don't reach for React 19-only types without a guard.
- **The library is consumed as TS source** by tests and `apps/bakeoff`, so there is no stale `dist` to rebuild before typechecking.
- **Don't silence errors** with `any` or `as` — fix the type. Prefer type guards over assertions.

## Escalation

- Complex generics or "excessively deep" instantiation → dispatch a subagent with the error, file, and what the code is trying to do.
- Third-party library type questions → context7 (`resolve-library-id` → `query-docs`, topic "types").

## Non-negotiables

- Read the file at the error location (and the involved type definitions) before proposing a fix — fix the root mismatch, not the symptom the compiler happens to report first.
- After the fix, verify with `npm run typecheck -w blintz`, then the full `npm run typecheck` to catch cascading effects.

Wrap up with: the error, why it occurred, what changed, files modified — and the underlying concept if it's likely to recur.

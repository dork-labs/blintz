# Blintz

A React port of Milkdown's Crepe editor: a WYSIWYG markdown editor that round-trips clean markdown, with no Vue in the bundle. Published to npm as `blintz`; DorkOS uses it as its markdown editor. This is a public repo (MIT).

## Layout

npm workspaces:

- `packages/blintz`: the library, published to npm
- `packages/comments`: `@blintz/comments`, a private placeholder
- `apps/bakeoff`: the main dev surface; `/playground` is the specimen page the browser tests use
- `examples/basic`: the smallest Vite + React usage

The apps and tests read the library from TypeScript source, so no build is needed while iterating.

## Commands

```bash
npm run dev            # bakeoff at http://localhost:5180
npm run typecheck      # all workspaces (npm run typecheck -w blintz for the library)
npm test               # Vitest unit tests (packages/*/src/**/*.test.{ts,tsx})
npm run test:browser   # Playwright: layouts, themes, keyboard editing, screenshots
npm run build          # build the library
```

There is no linter or formatter. CI (`.github/workflows/verify.yml`, macOS) runs typecheck, unit tests, build, then the browser suite. Screenshot baselines are macOS-only; update them with `npm run test:browser:update` only for an intended visual change.

## Rules

- **Markdown round-trip is the contract.** What goes in comes back out unchanged. A parsing or serialization change needs a round-trip test.
- **Built on Milkdown and ProseMirror.** `@milkdown/kit` is reused as is; only Crepe's view layer is rewritten in React through `@prosemirror-adapter/react`. Before changing editing behavior, read what Crepe does (the `opensrc` skill); diverging from it needs a reason.
- **No Vue** reaches the bundle.
- **The public API is semver.** Exports from `packages/blintz/src/index.ts` and `MarkdownEditor` props are what consumers depend on. Library code supports React `>=18`.
- **One checkout, one writer.** Code changes go in a worktree (`/worktree:create`); see the `working-in-worktrees` skill.
- **Pull requests squash-merge**; the PR title becomes the commit on `main`. Releases land as their own `chore(release): blintz X.Y.Z` commit.
- **Public repo:** no secrets, and nothing from private repos, in code, commits, or PR text.

Linear team: BNZ.

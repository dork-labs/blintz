import { defineConfig } from "vitest/config";

// Pure unit tests live next to the source they cover (e.g. the empty-paragraph
// round-trip guard). The library is consumed as TS source, so Vite resolves it
// without a build step before tests.
//
// `.test.tsx` is included so React-integration tests (e.g. the reactive
// `editable` toggle, which lives in `useBlintzEditor`) can render the editor
// with JSX. The automatic JSX runtime keeps those files from needing a `React`
// import; it only affects `.tsx`/`.jsx`, so the node-env `.ts` tests are
// unchanged.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";

// Pure unit tests live next to the source they cover (e.g. the empty-paragraph
// round-trip guard). The library is consumed as TS source, so Vite resolves it
// without a build step before tests.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    environment: "node",
  },
});

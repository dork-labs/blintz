import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The bake-off consumes the in-repo `blintz` library directly from TypeScript
// source via an alias (no build step needed for local dev — editing the library
// hot-reloads here). The published package resolves `blintz` to its dist instead.
const editorSrc = fileURLToPath(
  new URL("../../packages/blintz/src", import.meta.url),
);
const monorepoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    fs: {
      // The blintz source lives outside this playground's root.
      allow: [monorepoRoot],
    },
  },
  resolve: {
    alias: [
      {
        find: "blintz/styles.css",
        replacement: `${editorSrc}/theme/index.css`,
      },
      { find: /^blintz$/, replacement: `${editorSrc}/index.ts` },
    ],
    // React is the one dep used by BOTH this app (React 19) and the package
    // (resolved from the monorepo). Force a single copy or hooks/context break.
    dedupe: ["react", "react-dom"],
  },
});

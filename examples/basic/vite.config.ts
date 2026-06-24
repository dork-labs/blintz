import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Consume the `blintz` library directly from TypeScript source via an alias, so
// this example hot-reloads against library edits with no build step. A real
// consumer outside this monorepo just `npm install blintz` — no alias needed.
const blintzSrc = fileURLToPath(
  new URL("../../packages/blintz/src", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    fs: { allow: [repoRoot] },
  },
  resolve: {
    alias: [
      { find: "blintz/styles.css", replacement: `${blintzSrc}/theme/index.css` },
      { find: /^blintz$/, replacement: `${blintzSrc}/index.ts` },
    ],
    dedupe: ["react", "react-dom"],
  },
});

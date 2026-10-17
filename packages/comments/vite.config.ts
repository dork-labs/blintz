import { isAbsolute } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Library build: ESM JS + bundled CSS + .d.ts. Mirrors packages/blintz. All bare
// deps stay external (blintz, @milkdown/kit, react); only our own src is bundled,
// and any CSS is extracted to dist/comments.css.
export default defineConfig({
  plugins: [
    react(),
    // `paths` maps "blintz" to its source for typechecking in the monorepo;
    // declarations must keep the bare "blintz" import and land in dist/.
    dts({
      include: ["src"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      entryRoot: "src",
      pathsToAliases: false,
    }),
  ],
  build: {
    lib: {
      // `core` is the editor-free half (no React, no DOM, no CSS).
      entry: { index: "src/index.ts", core: "src/core.ts" },
      formats: ["es"],
      fileName: (_, name) => `${name}.js`,
      cssFileName: "comments",
    },
    rollupOptions: {
      external: (id) =>
        !id.startsWith(".") && !isAbsolute(id) && !id.endsWith(".css"),
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});

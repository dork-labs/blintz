import { isAbsolute } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Library build: ESM JS + bundled CSS + .d.ts.
//
// Everything in `dependencies` / `peerDependencies` stays EXTERNAL (consumers
// install them; keeps React a single copy), so only our own `src` is bundled.
// CSS is the exception — the component imports its theme (`./theme/index.css`,
// `@milkdown/theme-nord/style.css`, the prose/table CSS), and Vite extracts all
// of it into a single `dist/blintz.css` (the `./styles.css` export).
export default defineConfig({
  plugins: [
    react(),
    dts({ include: ["src"], exclude: ["src/**/*.test.ts"] }),
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "blintz",
    },
    rollupOptions: {
      // Bundle our own source (relative) + all CSS; externalize bare deps.
      external: (id) =>
        !id.startsWith(".") && !isAbsolute(id) && !id.endsWith(".css"),
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});

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
    dts({ include: ["src"], exclude: ["src/**/*.test.ts"] }),
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
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

import { defineConfig } from "vite";
import { resolve } from "node:path";
import { viteStaticCopy } from "vite-plugin-static-copy";

// Two independent HTML entry points: the (invisible) devtools page that
// registers our panel, and the panel document itself. Vite fingerprints
// and bundles each script tree separately, which is exactly what a
// DevTools extension needs — there is no shared "app" entry point.
export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(__dirname, "devtools.html"),
        panel: resolve(__dirname, "panel.html"),
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "public/icons", dest: "." },
      ],
    }),
  ],
});

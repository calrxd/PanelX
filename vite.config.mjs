import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/panelx.ts",
      name: "PanelX",
      fileName: () => "panelx.js",
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});

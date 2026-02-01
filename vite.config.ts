import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    // Don't pre-bundle the Breez SDK - it has WASM that needs special handling
    exclude: ["@breeztech/breez-sdk-spark"],
  },
  build: {
    target: "esnext",
  },
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.wasm"],
});

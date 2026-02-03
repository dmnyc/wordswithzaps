import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { execSync } from "child_process";

const commitHash = (() => {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(commitHash),
  },
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

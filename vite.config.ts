import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const shim = (p: string) => fileURLToPath(new URL(`./src/shims/${p}`, import.meta.url));

// Self-contained build (Mini §13): relative base so dist/ can be served from any path,
// no external CDNs, everything bundled or vendored under /assets.
export default defineConfig({
  base: "./",
  // First-party browser shims for the Node core modules `quantumcoin` references
  // (events/util/crypto/net). These carry NO third-party dependency and only need
  // to satisfy the ABI/`Interface` code path; wallet/provider/RPC paths are unused.
  resolve: {
    alias: [
      { find: /^events$/, replacement: shim("events.ts") },
      { find: /^util$/, replacement: shim("util.ts") },
      { find: /^crypto$/, replacement: shim("crypto.ts") },
      { find: /^net$/, replacement: shim("net.ts") },
      { find: /^node:net$/, replacement: shim("net.ts") },
    ],
  },
  build: {
    outDir: "dist",
    target: "es2022",
    assetsDir: "assets",
    sourcemap: false,
    rollupOptions: {
      output: {
        // keep predictable asset folder for verify scripts
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
  },
  // quantumcoin / quantum-coin-js-sdk ship CJS + WASM; let Vite pre-bundle them.
  optimizeDeps: {
    include: [],
  },
});

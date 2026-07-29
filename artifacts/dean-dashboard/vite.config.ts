import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import os from "os";
import { assembleDataset, readEnrichment, SPEC, ENRICHMENT } from "../../lib/dataset-assembly.mjs";

const port = Number(process.env.PORT) || 5173;
const basePath = process.env.BASE_PATH || "/";

const BUILT_ON = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// Unique per build/deploy. Appended as ?v= to every /data fetch so a new deploy
// always busts any stale browser/CDN cache of the JSON (photos, research, datasets).
const BUILD_ID = String(Date.now());

// Dev-only: serve /data/<id>.json from src/data (ungated), mirroring what the
// gated serverless function does in production. Keeps the app's /data fetch
// contract identical in dev without generating any data artifact.
function serveDataDev(srcDir: string) {
  return {
    name: "bi-serve-data-dev",
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const m = (req.url || "").match(/^\/data\/([^/?#]+\.json)/);
        if (!m) return next();
        const f = m[1];
        try {
          let body: string | null;
          if (ENRICHMENT.has(f)) body = readEnrichment(f, srcDir);
          else { const id = f.replace(/\.json$/, ""); body = SPEC[id] ? JSON.stringify(assembleDataset(id, srcDir)) : null; }
          if (body == null) { res.statusCode = 404; res.end("not found"); return; }
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(body);
        } catch (e) { res.statusCode = 500; res.end(String(e)); }
      });
    },
  };
}

export default defineConfig({
  define: { __BUILT_ON__: JSON.stringify(BUILT_ON), __BUILD_ID__: JSON.stringify(BUILD_ID) },
  base: basePath,
  // node_modules/.vite lives inside the repo's Dropbox-synced folder, and Dropbox
  // grabs a lock on the deps_temp_* dir mid-rename during dep (re-)optimization,
  // producing an intermittent EBUSY that blanks the dev-server page. Keeping the
  // cache in the OS temp dir sidesteps Dropbox sync entirely.
  cacheDir: path.join(os.tmpdir(), "bi-vite-cache"),
  plugins: [react(), tailwindcss(), serveDataDev(path.resolve(import.meta.dirname, "src", "data"))],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

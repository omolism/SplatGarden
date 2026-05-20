import { defineConfig } from "vite";

// Cloudflare Pages builds are explicitly disabled — the splat asset
// exceeds CF's 25 MB per-file ceiling, and the project is deployed via
// GitHub Pages. CF Pages sets CF_PAGES=1 during its build environment;
// if we see that, fail immediately with a clear message so it doesn't
// silently waste build minutes.
if (process.env.CF_PAGES) {
  throw new Error(
    "Cloudflare Pages builds are disabled for this project. " +
    "Deploy via GitHub Pages instead — see .github/workflows/deploy-pages.yml. " +
    "Disconnect the repo in the Cloudflare dashboard to stop these builds."
  );
}

// VITE_BASE — sub-path under which the app is served, e.g.
// "/SplatGarden-WebViewer/" for GitHub Pages on a project page, or "/"
// for `npm run dev`. Default is "/" so local dev works without env
// config. The GitHub Actions workflow sets VITE_BASE to the repo slug
// before running `npm run build`.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  // Don't bundle the giant splat file
  assetsInclude: ["**/*.splat", "**/*.ply", "**/*.spz", "**/*.ksplat"],
});

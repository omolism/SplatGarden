import { defineConfig } from "vite";

// VITE_BASE — sub-path under which the app is served, e.g.
// "/SplatGarden-WebViewer/" for GitHub Pages on a project page, "/" for
// Cloudflare Pages or `npm run dev`. Default is "/" so local dev + most
// hosts work without env config. The GitHub Actions workflow sets
// VITE_BASE to the repo slug before running `npm run build`.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  // Don't bundle the giant splat file
  assetsInclude: ["**/*.splat", "**/*.ply", "**/*.spz", "**/*.ksplat"],
});

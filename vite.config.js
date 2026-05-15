import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  // Don't bundle the giant splat file
  assetsInclude: ["**/*.splat", "**/*.ply", "**/*.spz", "**/*.ksplat"],
});

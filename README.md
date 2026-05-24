# SplatGarden

A 3D Gaussian Splatting web viewer for an asset-pipeline showcase. A Houdini and Unreal Engine 5 garden, captured at a multi-camera rig, reconstructed with COLMAP, trained in parallel by Postshot and Lichtfeld Studio, optimised with Houdini GSOP, and rendered in the browser via Spark on Three.js + WebGL 2.

**Live**: https://omolism.github.io/SplatGarden/

## Pipeline

Three stages match the canonical intro figure on the web:

```
01 Asset making     PCG · AI texture stylization · VAT bake · Houdini SIM
02 Scene assembly   Unreal Engine 5 · MediaPipe hand-tracking
03 3DGS capture     Multi-cam rig (990 poses) · COLMAP · Postshot ‖ Lichtfeld
                    → SplatGarden_PC.splat (3M Gaussians, ~92 MB)
                    → SplatGarden_Mobile.spz (same data, ~45 MB, phones)
```

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build && npm run preview
```

## Keyboard

| Key | Surface |
|---|---|
| `T` | Tech Breakdown drawer |
| `H` | Quick Guide |
| `K` | Viewpoint Tuner |
| `P` | Profiler |
| `V / C / R` | Add / overwrite Center / reset viewpoint |
| `1 / 2 / 3` | Front / Center / Zoom viewpoints |
| `W A S D + Q E` | Flythrough (`Shift` = 3×) |

The right-rail lil-gui hosts: 3DGS/USD layer switcher, FX, Performance preset, Customize (Post-FX · HDR Sky · Particles · Hand tracking), Cinematic FX, Camera Movement.

Phones get a floating bottom-bar (`Tour · Effects · Studio · Info · Share`) and a `Battery` default profile (DPR 1.0, no bloom, no particles).

## Mobile bandwidth

`pickSplatUrl()` in `main.js` HEAD-probes `public/SplatGarden_Mobile.spz` on phones and falls back to `.splat` if the SPZ is unshipped. Regenerate via:

```bash
node scripts/generate-spz-v3.mjs
```

The script uses Spark's own `transcodeSpz`, so the output version always matches the runtime (`0.1.10` → SPZ v3, `2.x` → v4). External tools work too if pinned to the matching version. See `_archive/README.md` if a SPZ stops loading after a Spark upgrade.

## Deploy

GitHub Pages via `.github/workflows/deploy-pages.yml`. The workflow sets `VITE_BASE=/SplatGarden/` so subpath asset URLs resolve under the project page. No Git LFS (the previous LFS-cache step in the legacy repo is no longer needed).

## Source layout

```
public/         SplatGarden_PC.splat · SplatGarden_Mobile.spz · Shot4B FBX
                Skybox.hdr · colmap/ · textures/ (all WebP)
src/            main.js orchestrator + per-feature modules
                (effects, postfx, tech-spec, asset-hover, scene-layers,
                 mobile-ui, handtracking, intro-overlay, …)
scripts/        one-off asset transcoders (PNG→WebP, SPLAT→SPZ)
_archive/       off-ship references not copied into dist/
```

## Roadmap

Sound design · MP4 export from camera path · WebXR (Quest / Vision Pro) · URL-state deep links beyond viewpoints · glTF mesh composite via `KHR_gaussian_splatting` · per-cluster stylization · click pulse on asset hotspots · Spark `2.x` upgrade (unlocks SPZ v4 + new renderer features).

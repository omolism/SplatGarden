# SplatGarden

A 3D Gaussian Splatting web viewer for an asset-pipeline showcase. The scene is a Houdini / SpeedTree / Unreal Engine garden captured at Lichtfeld Studio, reconstructed with COLMAP, trained in Postshot, and rendered in the browser via Spark on Three.js + WebGL 2.

```
SpeedTree · Houdini · Unreal Engine → Lichtfeld Studio → COLMAP → Postshot → .splat
                                                                                │
                                                                                ▼
                                                               Spark + Three.js viewer
```

---

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build && npm run preview
```

On first load the viewer auto-plays the camera move and overlays a title sequence + onboarding pointers. Subsequent visits skip the cinematic; the flag is stored at `localStorage["splatgarden:visited:v1"]`.

---

## Assets shipped

| Path | Purpose |
|---|---|
| `public/manifest.json` | List of splats to auto-load on startup. The first entry is the primary layer. |
| `public/Whole_With_Statue.splat` | Default scene — gazebo / garden trained from the Unreal capture. |
| `public/Whole_With_Statue_Cleanup.splat` | Secondary scene variant. |
| `public/Shot4B_GS-FX_Camera_V01.fbx` | Authored camera trajectory (24 fps, 600 frames). The viewer plays frames 100–500 (≈ 16.67 s) as the intro. |
| `public/colmap/images.bin` | 990 training-camera poses reconstructed by COLMAP. |
| `public/Skybox.hdr` | Equirectangular HDR environment (4.4 MB). |

Splats are tracked through Git LFS (see `.gitattributes`).

---

## Panels

### Scene panel (top-left)
Multi-splat layer list. Every `.splat` in `public/manifest.json` shows up as a row with an eye-icon toggle and splat count. The first loaded splat is the primary — effects, voxel, quad, and annotation bindings stay attached to it. Drag any `.splat / .ply / .spz / .ksplat` onto the viewport, or use `+ Add`, to append a secondary layer.

### Pipeline drawer (T)
Right-side slide-in documenting how the scene was made. Organized into three layers:

| Layer | Contents |
|---|---|
| **L1 R&D** | AI Texture Stylization (IP-Adapter + ControlNet + AdaIN + Diffusion) and OpenUSD subforms (`UsdGeomPointInstancer` with Plane / Cube / Sphere prototypes). |
| **L2 Production** | Per-asset cards with toolchain chip rows: Scene assembly (Unreal + Perforce), Gazebo, Vine, Daffodil, Grape Hyacinth, Tree, Landscape. Each card carries a Hotspot ON/OFF pill that gates the in-scene marker. |
| **L3 3DGS** | The render primitive (Kerbl et al., SIGGRAPH 2023), Lichtfeld Studio capture, COLMAP SfM, Postshot training. |

The Pipeline drawer does not toggle the 3D overlays — it is purely documentation.

### Viewpoints (sidebar, top-left)
Numbered hotspots in 3D plus a sidebar list. Smooth eased camera tween between poses.

- `1` Front · `2` Right · `3` Back · `4` Left · `5` Top · `6` Center · `7` Zoom
- `V` — arm "add viewpoint" (next click on the splat anchors it)
- `C` — overwrite the Center viewpoint with the current camera pose
- `R` — reset framing
- `W A S D` + `Q E` — flythrough; `Shift` = 3× boost

Front / Right / Back / Left / Top are baked absolute poses in `src/annotations.js`. Center is patched to COLMAP cam #582 once the COLMAP loader resolves. Storage key is `splatgarden:viewpoints:v9:<splat-url>`.

### Viewport Tuner (K)
Floating panel that shows the live camera position + target and lets you commit the current pose into any seeded viewpoint slot. Includes a "Copy snippet" button that emits a `THREE.Vector3` fragment ready to paste into `seedDefaults`.

### Quick Guide (H)
Bottom-center card listing mouse + key shortcuts. Auto-pops after the intro and dismisses after a few seconds; press `H` to summon back, `Esc` to close.

### Credits panel
Toggled by the `Credits` checkbox under the lil-gui Tech Spec folder. Sections: Team, Special Thanks, Software, Tech Stack. Draggable from the header bar; closes when clicked outside the panel.

### Mobile nav (touch only)
On touch devices a hamburger button sits in the top-right corner. Tapping it opens a slide-down drawer with shortcuts to Pipeline / Viewport Tuner / Quick Guide / Profiler / Credits — equivalent to the T / K / H / P keyboard shortcuts on desktop. The Hand Tracking panel is hidden on touch; on phones the heavier post-process passes (Bloom, Underwater) default off.

### Pipeline HUD — RENDER (top-left)
Live render readout:

- Current splat count (24 px tabular-nums)
- Subform composition bars — 3DGS / Quad / Voxel
- Draw / Tris footer
- GPU identity strap

### Profiler (P)
Per-phase frame-time breakdown: splat update, velocity step, particles, compose, overlay, HUD.

---

## 3DGS / USD

Dedicated left-stack panel (above the Scene panel) listing the three render representations with eye-icon visibility toggles, subform pills, and inline size sliders. Multiple representations can be visible at once.

```
[eye] Splat       Gaussian | Point     Point Size      [───o───]
[eye] Billboard   Quad     | Circle    Billboard Size  [─o─────]
[eye] Voxel       Cube     | Sphere    Voxel Size      [─o─────]
```

A `⤓ Use My Own` button in the panel header opens a drop overlay that replaces the primary splat with a dropped `.splat / .ply / .spz / .ksplat`.

| Layer | Subform | USD analogue |
|---|---|---|
| **Splat** | Gaussian | Anisotropic 3D Gaussian (RGB · scales · quaternion · alpha) |
| **Splat** | Point | Gaussian centres collapsed to isotropic points (size = `Point Size` slider) |
| **Quad** | Quad | `UsdGeomPointInstancer › UsdGeomPlane` — camera-facing billboard |
| **Quad** | Circle | Same plane, fragment discard outside the unit disc with edge AA |
| **Voxel** | Cube | `UsdGeomPointInstancer › UsdGeomCube` — averaged colour per cell |
| **Voxel** | Sphere | `UsdGeomPointInstancer › UsdGeomSphere` — same per-instance arrays, icosphere proto |

Hovering the badges or the segmented buttons reveals a popover with the USD schema, proto, attribute list, and a link to openusd.org.

---

## Camera Movement

The FBX flythrough drives the scene camera off the animated node when active. Play / Pause / Stop with a live timeline label (`12.50s / 16.67s · F 300 / 400`).

Four equally-spaced phase transitions run over the active subclip:

```
   t = 0     ¼         ½         ¾         1
   │─────────│─────────│─────────│─────────│
   Gaussian  +Quad     -Quad     +Gaussian
   →Point    fade-in   fade-out  ←Point
```

Sub-form (Gaussian↔Point) and layer visibility use exp-decay at rate 1.2/s.

---

## Asset hotspots

Per-asset floating markers projected from world coordinates in `src/tech-spec.js`. Hovering a dot opens a poster-style info card; clicking pins it and tweens the camera to a close-up. Each card can carry:

- Toolchain chip row
- Vimeo embed (used by Gazebo, Vine, Daffodil)
- Before / after compare widget (drag the handle to wipe)
- Pipeline image strip
- Notes, key features, output, source

Visibility is gated by the Tech Spec `Enable` master toggle plus the per-asset ON/OFF pill in the Pipeline drawer.

---

## Cinematic FX

Top-level folder grouping the character-defining effects so they're separate from colour-grading.

| Effect | Knobs |
|---|---|
| Lens Distortion | Fisheye blend / FOV / Distortion / Zoom / Dispersion / Center / Anamorphic squeeze. Pulses 0 → 1 → 0 during camera-move playback. |
| Underwater | Caustic strength + scale, tint RGB + amount, wave shimmer, darken |
| Kaleidoscope | Segments / rotation speed / zoom / mix / center |
| Painterly | Style picker (Monet / Matisse / Seurat) with per-style detail folders that auto-open on selection |

## Customize

### FX
Eight GPU shader effects in a single `dyno.Dyno` branched on a uniform `int` — switching never recompiles.

1. Wave & Tint
2. Dissolve & Reform
3. Scan Line
4. Spiral Smear
5. Vortex Drift
6. Chaotic Particles
7. Slime Molds
8. Feather Roots

**Effector Mode** — sphere effector for the Dissolve shader. Press + drag drives a spatial-mask centre.
**Brush Mode** — press + drag continuously paints the active effect. OrbitControls is locked while on.

### Post-Process
Master `Enable` kills every pass at once. Bloom defaults off. Colour-grading and polish passes only — the character-defining effects live in the top-level `Cinematic FX` folder.

| Pass | Knobs |
|---|---|
| Bloom | Strength / Radius / Threshold |
| Tonemap | None / Reinhard / Cineon / ACES |
| Colour | Exposure / Contrast / Saturation |
| Echo Trails | Bell-curve auto-ramp on click |
| Warp FX | Domain-warped fractal overlay |
| Vignette / Chromatic Aberration / Film Grain | Standard knobs |

Defaults: `exposure 1.10 · contrast 1.08 · saturation 1.15`.

### Particles
Two-layer GPGPU pipeline. Renders in a separate scene after the composer, bypassing post-FX. Off by default.

| Subsystem | Role |
|---|---|
| Velocity Field | 256² half-float RGBA ping-pong — diffuse + advect + decay |
| GPGPU Particles | 64² (4096) additive point sprites, pos + vel ping-pong RTs |

Knobs: Point Size · Field Strength · Damping · Gravity Y · Alpha · Color Cool / Hot. The `Seed from USD Voxels` button respawns every particle at a voxel-cell centre and expands the spawn AABB to the scene bounds.

### Hand tracking (panel, bottom-left)
MediaPipe HandLandmarker (`tasks-vision 0.10.35`).

- Single hand — pinch = drag-orbit, quick pinch-tap = click-FX
- Two hands — spread / contract = zoom; parallel drag = pan

---

## File layout

```
public/
  manifest.json                       # list of splats to auto-load on startup
  Whole_With_Statue.splat             # default 3DGS scene
  Whole_With_Statue_Cleanup.splat
  Shot4B_GS-FX_Camera_V01.fbx         # camera move (frames 100-500 played)
  Skybox.hdr
  colmap/
    images.bin                        # 990 training-camera poses
    cameras.bin, points3D.bin

src/
  main.js                             # scene, renderer, animation loop, hooks
  scene-layers.js                     # multi-splat layer panel
  pipeline-hud.js                     # RENDER HUD
  tech-spec.js                        # Pipeline drawer data + renderer
  asset-hover.js                      # hotspots + poster-style info card
  annotations.js                      # viewpoints + camera tween
  viewpoint-tuner.js                  # K-key live pose tuner
  key-hints.js                        # H-key Quick Guide
  credits.js                          # team + software + tech stack panel
  intro-overlay.js                    # first-visit title sequence
  onboarding-pointers.js              # first-visit T/K/Scene callouts
  effects.js                          # 8 click effects + lil-gui structure
  postfx.js                           # EffectComposer pipeline
  velocity-field.js                   # velocity-field ping-pong
  gpgpu-particles.js                  # additive point-sprite particles
  colmap-loader.js                    # images.bin parser + frustum builder
  datalabels.js                       # surveillance-card overlay
  handtracking.js                     # MediaPipe-driven control scheme
  quadizer.js, voxelizer.js           # USD-PointInstancer-style overlays
  profiler.js                         # frame-time bars (P)
  style.css                           # UI tokens + panel styles

index.html
vite.config.js
package.json
```

---

## Deployment

GitHub Pages via `.github/workflows/deploy-pages.yml`. The workflow builds with `VITE_BASE: /SplatGarden-WebViewer/` so `import.meta.env.BASE_URL` resolves correctly under the sub-path. Splat files travel through Git LFS.

`vite.config.js` reads `VITE_BASE` from the environment and throws if `CF_PAGES` is detected (Cloudflare Pages is intentionally disabled — the splat exceeds the 25 MB per-file limit).

---

## Roadmap

- Asset hover card media — populate `media:` fields with real lookdev video, before/after textures, and AI-stylization comparisons per asset.
- Tree / Landscape worldPos — currently the only two asset items without floating dots.
- Clipping plane / cross-section — expose alternative subforms (point cloud / Voxel / Quad) on the cut surface.
- Pipeline scrubber — bottom timeline morphing `COLMAP points → Gaussians → Quad → Voxel → final 3DGS`.
- Per-cluster stylization — apply post-FX only to a selected region of splats.
- MP4 export from camera path.
- WebXR (Quest / Vision Pro).
- URL-state deep links — `?vp=4&panel=pipeline` for direct linking.
- glTF / mesh composite — render a USD prop alongside the splat with shared depth (`KHR_gaussian_splatting`).

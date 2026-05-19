# SplatGarden Studio

An asset-pipeline showcase built around a 3D Gaussian Splat web viewer. The scene is a Houdini / SpeedTree / Unreal garden, trained as 3DGS, served back as an inspectable, hot-swappable, USD-aware artifact. Built on **Spark** + **Three.js** + **Vite**.

```
SpeedTree · Houdini · Unreal Engine  →  Postshot / Litchfield Studio  →  .splat
                                                                            │
                                                                            ▼
                            ┌─────────────── SplatGarden Studio ──────────────┐
                            │  Scene  ·  Viewpoints  ·  Pipeline (asset doc)  │
                            │            Customize  ·  Camera Movement        │
                            └──────────────────────────────────────────────────┘
```

---

## Features

### Renderer & data
| | |
|---|---|
| **Splat engine** | [Spark](https://sparkjs.dev) `@sparkjsdev/spark` with the **Dyno** shader-graph API for per-splat GPU effects |
| **Default assets** | Listed in `public/manifest.json` — every splat there auto-loads as a Scene layer; first one renders, the rest sit hidden until you toggle them on |
| **Shipped scene** | `public/Whole_With_Statue.splat` + `Whole_With_Statue_Cleanup.splat` — gazebo / garden trained from an Unreal capture |
| **COLMAP poses** | `public/colmap/images.bin` — 990 training-camera poses reconstructed during the Postshot pass |
| **Camera move** | `public/Shot4B_GS-FX_Camera_V01.fbx` — 25 s authored camera trajectory (24 fps, 600 frames) |
| **HDR environment** | `public/Skybox.hdr` (4.4 MB equirectangular) |

### Scene panel (`top-left, below Viewpoints`)
SuperSplat-style multi-splat layer list. Every `.splat` listed in `public/manifest.json` shows up as a row with a Lucide **eye icon** toggle, splat count, and (for secondaries) a delete button. The first loaded splat is the **primary** — effects / voxel / quad / annotations bind to it and it can't be removed. Drag any `.splat / .ply / .spz / .ksplat` onto the viewport (or hit **+ Add**) to append a new secondary layer without disturbing the primary.

### Pipeline panel (press <kbd>T</kbd>)
Right-side slide-in. The information-design centerpiece of the showcase — organized by **asset authoring pipeline first**, system specs second. Sections:

| Section | Contents |
|---|---|
| **Assets** | Per-asset cards with tool-chain chip rows. Each asset ends at Unreal set dress; only the final Garden Environment touches Litchfield + Postshot. Covers Grape Hyacinth, Daffodil, Tree, Landscape, Garden Environment. |
| **AI Stylization** | Custom diffusion-based texture tool — IP-Adapter + ControlNet (Tile / Canny) + AdaIN. Drives the painterly look on Daffodil + Landscape textures. Two modes: Full Style Transfer or Texture-Only. PyTorch 2.11 / CUDA 13.0 / RTX PRO 6000 Blackwell. |
| **Render Primitives** | The four interchangeable subforms — 3DGS / Point / Quad / Voxel — with USD analogues |
| **Camera Track** | The Houdini-authored 25 s FBX + 990 COLMAP poses |
| **Capture & Train** | Unreal scene assembly (Perforce) → Litchfield Studio capture → COLMAP SfM → Postshot training |
| **Input & Sensing** | MediaPipe Hand / Body tracking |
| Post-Processing · Click FX | Demoted to bottom — labelled "toy" sections |

### Pipeline HUD — RENDER (`top-left`)
Always-on live render readout, slimmed to what isn't covered elsewhere:
- **Hero number** — current splat count (mono tabular-nums, 24 px)
- **Subform composition bars** — 3DGS / Quad / Voxel, each with an opacity-driven fill + percent
- **Draw / Tris** small footer
- **GPU identity** strap (renderer string + WebGL ctx)

### Viewpoints (sidebar, top-left)
Numbered hotspots in 3D + sidebar list. Smooth eased camera tween between poses.

- <kbd>1</kbd> Front · <kbd>2</kbd> Right · <kbd>3</kbd> Back · <kbd>4</kbd> Left · <kbd>5</kbd> Top · <kbd>6</kbd> Center · <kbd>7</kbd> Gazebo
- <kbd>V</kbd> — arm "add viewpoint" (next click on the splat anchors it)
- <kbd>C</kbd> — overwrite the **Center** viewpoint with the current camera pose
- <kbd>R</kbd> — reset framing
- <kbd>W A S D</kbd> + <kbd>Q E</kbd> — flythrough; <kbd>Shift</kbd> = 3× boost

The Gazebo viewpoint anchors at a world-absolute target on the asset itself. Tree / Grape Hyacinth / Daffodil have known world positions too (see `tech-spec.js` `worldPos`) but live as **asset hotspots** for the upcoming hover info card rather than as camera viewpoints.

### 3DGS / USD
Each render representation is hover-documented as the USD primitive it would round-trip to:

| Layer | USD analogue (hover the badge) |
|---|---|
| **Splat** sub-form `Gaussian` | UE capture → Postshot training → anisotropic 3D Gaussian (RGB · scales · quaternion · alpha) |
| **Splat** sub-form `Point` | Gaussian centres collapsed → isotropic point — size set by `Point Size` slider (default `0.0025`) |
| **Quad** | `UsdGeomPointInstancer › UsdGeomPlane` — per-instance positions / orientations / scales + `primvars:displayColor` |
| **Voxel** | `UsdGeomPointInstancer › UsdGeomCube` — same per-instance arrays |

### Camera Movement
A preauthored Houdini FBX camera flythrough drives the scene camera off the animated node. Play / Pause / Stop with a live timeline label (`12.50s / 25.00s · F 300 / 600`).

While the move plays, four equally-spaced phase transitions are scheduled over the clip duration:

```
   t = 0     ¼         ½         ¾         1
   │─────────│─────────│─────────│─────────│
   Gaussian  +Quad     -Quad     +Gaussian   (back to 3DGS)
   →Point    fade-in   fade-out  ←Point
```

Lerps for sub-form (Gaussian↔Point) and layer visibility use exp-decay at rate 1.2/s so each transition breathes across its ~6.25 s phase. The **Center** viewpoint is sampled at frame 460 of the FBX (≈ 19.17 s in) and re-patched whenever the FBX preload completes.

### Customize ▸ Play ▸ FX (the "toy" section)
Eight GPU shader effects in a single `dyno.Dyno` branched on a uniform `int` — switching never recompiles. Default preset on launch: **Slime Molds**.

1. **Wave & Tint** — radial ripple from the click point; colour-uniform dyes the wave crests
2. **Dissolve & Reform** — splats inside the impact radius explode outward, hold briefly, then snap back
3. **Scan Line** — Tron-style expanding shell sweep
4. **Spiral Smear** — band mask + wind-side bias + curl-noise; splats stretch into oriented ribbons
5. **Vortex Drift** — 3D curl-noise potential flow (divergence-free swirl)
6. **Chaotic Particles** — 3D Voronoi cell tracking with coarse cells (~3 m world) for coherent group motion
7. **Slime Molds** — domain-warped ridge-noise vein field; Physarum visual approximation
8. **Feather Roots** — outward streaming particles along noise-perturbed radial directions

**Effector Mode** — TouchDesigner-style sphere effector for the Dissolve shader. Press+drag drives a spatial-mask centre.

**Brush Mode** — Press+drag continuously paints the active effect. OrbitControls is locked while on.

### Customize ▸ Play ▸ Post-Process
Sketchfab-style finishing chain. Master **Enable** kills every pass at once. Bloom defaults **off** on launch.

| Pass | Notes |
|---|---|
| Bloom | Strength / Radius / Threshold |
| Tonemap | None / Reinhard / Cineon / ACES |
| Colour | Exposure / Contrast / Saturation |
| Painterly | Monet (Kuwahara) / Matisse (posterize + Sobel) / Seurat (pointillism) — auto-disables when Quad or Voxel overlay is visible |
| Echo Trails | Bell-curve auto-ramp on click |
| Underwater | Dave_Hoskins caustic + tint + UV shimmer |
| Lens Distortion | Fisheye + dispersion (default ON, user-tuned preset) |
| Vignette · Chromatic Aberration · Film Grain | Standard knobs |
| Kaleidoscope (under FX) | Kusama-style mirrored repetition |

3DGS-tuned defaults: `exposure 1.10 · contrast 1.08 · saturation 1.15`.

### Particle system
Two-layer GPGPU pipeline driving interaction reactivity. Renders in a separate scene **after** the composer, so it bypasses post-FX. Disabled by default; toggle under `Customize ▸ Particles`.

| Subsystem | Role |
|---|---|
| **Velocity Field** | 256² half-float RGBA ping-pong. Diffuse + advect + decay; mouse drag / hand pinch inject mass at the input UV |
| **GPGPU Particles** | 64² = 4096 additive point sprites with state in float RT pairs (pos + vel ping-pong) |

Knobs: Point Size · Field Strength · Damping · Gravity Y · Alpha · Color Cool / Hot. Plus a **Seed from USD Voxels** button that respawns every particle at a voxel-cell centre and expands the spawn AABB to the scene bounds.

### Hand tracking (panel, bottom-left)
MediaPipe HandLandmarker (tasks-vision 0.10.35) drives an alternate control scheme:
- **Single hand** — pinch = drag-orbit, quick pinch-tap = click-FX
- **Two hands** — spread / contract = zoom; parallel drag = pan

### Profiler (press <kbd>P</kbd>)
Per-phase frame-time breakdown — splat update, velocity step, particles, compose, overlay, HUD. Each phase has its own bar.

### A/B Compare (press <kbd>`</kbd>)
Paper-figure split-screen viewer for screenshots.

---

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173
# or
npm run build && npm run preview
```

First load decompresses every splat listed in `public/manifest.json` and pre-warms the camera-move FBX so the **Center** viewpoint can be patched to frame 460 immediately on page open.

### Drop in your own splat
Drag any `.splat / .ply / .spz / .ksplat` onto the viewport, or hit **+ Add** in the Scene panel. The new file becomes a **secondary** Scene layer — toggle visibility with the eye icon. To make a different file the default primary, edit `public/manifest.json` (first entry wins).

---

## GUI hierarchy

```
SplatGarden Studio
├── 3DGS/USD                    ← data-source + USD instancer choice
│   ├── Splat (Gaussian / Point sub-form)
│   ├── Point Size
│   ├── Quad      (UsdGeomPointInstancer › Plane — hover for spec)
│   ├── Quad Size
│   ├── Voxel     (UsdGeomPointInstancer › Cube — hover for spec)
│   └── Voxel Size
│
├── Customize
│   ├── Play                    ← toy section (default collapsed)
│   │   ├── FX                  ← 8 click-effect shaders
│   │   │   ├── Preset
│   │   │   ├── Core (Effect · Color · Radius · Duration · Intensity)
│   │   │   ├── Brush Mode
│   │   │   ├── Effector Mode
│   │   │   └── Kaleidoscope
│   │   └── Post-Process [Enable]
│   │       └── Bloom · Tonemap · Painterly · Echo Trails · Underwater ·
│   │         Lens Distortion · Vignette · Chromatic · Film Grain
│   ├── Interaction
│   ├── Particles               (off by default)
│   │   └── Seed from USD Voxels
│   └── HDR Sky
│
├── Tech Spec                   (3D overlays — frustums, data labels)
│   ├── Training Cameras
│   └── Data Labels
│
└── Camera Movement
    ├── ▶ Play Camera Move
    ├── ■ Stop Camera Move
    └── Camera Move Tuning  (Offset X/Y/Z · Scale)
```

The **Pipeline** drawer (T) is a separate slide-in panel — it documents the asset-authoring pipeline and is not part of the lil-gui tree.

---

## File layout

```
public/
  manifest.json                       # list of splats to auto-load on startup
  Whole_With_Statue.splat             # default 3DGS scene
  Whole_With_Statue_Cleanup.splat
  Shot4B_GS-FX_Camera_V01.fbx         # 25 s preauthored camera move
  Skybox.hdr                          # HDR environment
  colmap/                             # Postshot's COLMAP reconstruction
    images.bin                        # 990 training-camera poses
    cameras.bin, points3D.bin, ...
src/
  main.js                             # scene, renderer, raycast, animation loop,
                                      #   camera-move state machine, hover tooltips,
                                      #   Center=frame460 sampling, brush/effector hooks
  scene-layers.js                     # multi-splat layer panel (eye toggle, delete,
                                      #   primary lock, drag-drop + Add)
  pipeline-hud.js                     # RENDER HUD — splat count, subform bars,
                                      #   draw/tris, GPU strap
  tech-spec.js                        # Pipeline drawer data + renderer (asset cards
                                      #   with toolchain chips, etc.)
  effects.js                          # 8 click effects in one Dyno shader + lil-gui
                                      #   panel structure + USD/Subform hover popovers
  postfx.js                           # EffectComposer pipeline:
                                      #   RenderPass → Bloom → Polish → Painterly →
                                      #   Underwater → Echo → Kaleidoscope
  velocity-field.js                   # 256² ping-pong velocity field (lomateron port)
  gpgpu-particles.js                  # 64² additive point-sprite particle system
  annotations.js                      # Sketchfab hotspots + smooth camera tween +
                                      #   asset-anchored viewpoint defaults
  colmap-loader.js                    # images.bin parser + frustum geometry builder
  datalabels.js                       # surveillance-card overlay
  handtracking.js                     # MediaPipe-driven hand-control state machine
  bodytracking.js                     # MediaPipe PoseLandmarker (wired but UI parked)
  quadizer.js, voxelizer.js           # UsdGeomPointInstancer-style overlays
  ab-compare.js                       # `-key paper-figure split-screen viewer
  profiler.js                         # per-phase frame-time bars (P)
  style.css                           # Luma-glass UI tokens + panel styles
index.html
vite.config.js
package.json
```

---

## How the click FX works

Spark's `dyno` system lets you compose a per-splat shader from JS:

```js
const uHit = dyno.dynoVec3(new THREE.Vector3());
splat.objectModifier = dyno.dynoBlock(
  { gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat },
  ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes:  { gsplat: dyno.Gsplat, uHit: "vec3", /* + many others */ },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({inputs, outputs}) => `
        ${outputs.gsplat} = ${inputs.gsplat};
        // branch on uEffect (0..7) and modify center / scales / rgba based
        // on distance from uHit, time, per-splat seed, curl noise, etc.
      `,
    });
    return { gsplat: d.apply({ gsplat, uHit, /* ... */ }).gsplat };
  },
);
splat.updateGenerator();
```

Each frame, JS bumps `uTime.value` / `uHit.value` / per-effect uniforms and calls `splat.updateVersion()` — no shader recompile, just uniform updates. Clicking the canvas raycasts against the SplatMesh (Spark's WASM-accelerated point-in-gaussian intersection), transforms the world hit-point into the splat's local frame, and writes it into `uHit`.

---

## Tips

- **Center viewpoint** is re-patched whenever the FBX preload completes; if you tweak `Camera Move Tuning → Offset X/Y/Z / Scale`, Center stays anchored to frame 460 of the *transformed* path.
- **Tech Spec → Enable** kills all 3D-overlay surveillance gizmos (frustums, data labels) for clean screenshots.
- **Post-Process → Enable** off → zero post-fx cost (both Bloom and Polish passes are disabled).
- Shader assumes Y-up. Postshot / Inria splats need `splat.quaternion.set(1, 0, 0, 0)` (180° X flip) to align — already applied.
- Effects / voxel / quad / annotations stay bound to the **primary** Scene layer (first one loaded). Toggling its eye hides the render but FX still fire — switch primary by editing the manifest order.

---

## Roadmap

- **Asset hover info card** — Phase 4. On hovering Daffodil / Grape Hyacinth / Tree's 3D world position, pop a poster-style overlay with lookdev video, texture before/after, AI stylization comparison. Markup-first, visuals tuned once user-supplied media lands.
- **Clipping plane / cross-section** — sphere + plane clipper that exposes the alternative subform (point cloud / Voxel / Quad) on the cut surface. Direct visual for the "peel back the layers" beat of the pipeline story.
- **Pipeline Scrubber** — bottom timeline that morphs the scene `COLMAP points → Gaussians → Quad → Voxel → final 3DGS`. The four existing subforms become a single dragable continuum.
- **Per-cluster stylization** — click a region of splats, apply post-FX only to that selection. Turns the demoted toy section into an authoring tool.
- **MP4 export from camera path** — record the Houdini flythrough straight from the viewer.
- **WebXR (Quest / Vision Pro)** — Spark supports it upstream; mostly plumbing.
- **URL-state deep links** — `?viewpoint=7&overlay=cameras` so slides / tweets / PRs can point at a specific scene state.
- **Tonemapping panel** — Filmic / ACES / ACES2 selector to pair with the existing exposure / contrast / saturation knobs.
- **glTF / mesh + splat composite** — render a USD prop alongside the splat with shared depth, riding the upcoming `KHR_gaussian_splatting` extension.

# SplatGarden Studio

An interactive 3D Gaussian Splat viewer with cinematic camera moves, shader-driven click effects, post-process polish, and a dock of OpenUSD-aware "tech spec" overlays. Built on **Spark** + **Three.js** + **Vite**.

```
Unreal Engine capture  →  Postshot training  →  .splat asset
                                                    │
                                                    ▼
                          ┌─────────── SplatGarden Studio ───────────┐
                          │  3DGS / USD  ·  Customize  ·  Tech Spec  │
                          │              ·  Camera Movement          │
                          └──────────────────────────────────────────┘
```

---

## Features

### Renderer & data
| | |
|---|---|
| **Splat engine** | [Spark](https://sparkjs.dev) `@sparkjsdev/spark` with the **Dyno** shader-graph API for per-splat GPU effects |
| **Default asset** | `public/Whole_With_Statue.splat` — gazebo / garden scene captured in Unreal Engine, trained with Postshot |
| **COLMAP poses** | `public/colmap/images.bin` — 990 training-camera poses reconstructed during the Postshot pass |
| **Camera move** | `public/Shot4B_GS-FX_Camera_V01.fbx` — 25 s authored camera trajectory (24 fps) |
| **HDR environment** | `public/Skybox.hdr` (4.4 MB equirectangular) |

### Click effects (`Customize → FX`)
Eight GPU shader effects live in a single `dyno.Dyno` branched on a uniform `int` — switching never recompiles. Default preset on launch: **Slime Molds**.

1. **Wave & Tint** — radial ripple from the click point with per-splat jitter; colour-uniform dyes the wave crests.
2. **Dissolve & Reform** — splats inside the impact radius explode outward, hold briefly, then snap back. Position-only (no tint) — also drives the **Effector Mode** spatial-mask path below.
3. **Scan Line** — thin Tron-style expanding shell sweeps outward; splats it touches pop and glow.
4. **Spiral Smear** — localised band mask + wind-side directional bias + animated curl-noise perturbation. Affected splats stretch into oriented ribbons. Preset: **Iris Spiral**.
5. **Vortex Drift** *(new)* — 3D curl-noise flow field (finite-difference of 3 offset vnoise potentials). Divergence-free swirl; splats orbit and shear without clumping. Loose port of cornusammonis "Tons of Spatial-Sorted Particles".
6. **Chaotic Particles** *(new)* — 3D Voronoi cell tracking with animated cell offsets. Coarse cell scale (~3 m world) so splats migrate as coherent group, not per-particle jitter. Mass blooms uniformly during the effect.
7. **Slime Molds** *(new)* — domain-warped ridge-noise vein field. Splats are pulled along the local gradient toward bright veins (Physarum visual approximation). Default preset on launch.
8. **Feather Roots** *(new)* — splats stream OUTWARD from the click point along noise-perturbed radial directions (no inward suction). Per-splat speed variance + radial-phase shells create branching fibers. `FlyMax` knob → branch divergence.

### Effector Mode (`Customize → FX → Effector Mode`)
TouchDesigner-style sphere effector for the Dissolve shader. While the toggle is on, press+drag (mouse or hand pinch) drives a spatial-mask center; splats inside the sphere stay dissolved as long as the gesture holds, splats outside snap back. A wireframe sphere overlay tracks the live mask center. Auto-switches the Effect dropdown to **Dissolve & Reform**.

### Brush Mode (`Customize → FX → Brush Mode`)
Press + drag = continuous `effects.brushAt()` paint instead of one-shot click trigger. While Brush is on, **OrbitControls is locked** so the drag doesn't tumble the camera. Cursor flips to crosshair. Works for both mouse and hand-pinch input paths.

### Camera Movement
A preauthored Houdini FBX camera flythrough drives the scene camera off the animated node. Play / Pause / Stop with a live timeline label (`12.50s / 25.00s   F 300 / 600`).

While the move plays, four equally-spaced phase transitions are scheduled over the clip duration:

```
   t = 0     ¼         ½         ¾         1
   │─────────│─────────│─────────│─────────│
   Gaussian  +Quad     -Quad     +Gaussian  (back to 3DGS)
   →Point    fade-in   fade-out  ←Point
```

Lerps for sub-form (Gaussian↔Point) and layer visibility use exp-decay at rate 1.2/s so each transition breathes across its ~6.25 s phase.

### Center viewpoint
Sampled at **frame 460** of the camera-move FBX (≈ frame 460 / 24 fps = 19.17 s in). Target is force-pointed at the splat bounds-centre so it always **faces the gazebo** regardless of where on the path frame 460 lands.

### Sketchfab-style hotspots
Numbered hotspots in 3D + sidebar list. Smooth eased camera tween between poses.
- <kbd>1</kbd>–<kbd>9</kbd> — jump to that numbered viewpoint
- <kbd>V</kbd> — arm "add viewpoint" (next click on the splat anchors it)
- <kbd>C</kbd> — overwrite the **Center** viewpoint with the current camera pose
- <kbd>R</kbd> — reset framing
- <kbd>W A S D</kbd> + <kbd>Q E</kbd> — flythrough; <kbd>Shift</kbd> = 3× boost

### Tech Spec (`Tech Spec → Enable`)
A surveillance dock for the underlying pipeline. Master **Enable** gates everything below:

- **Training Cameras** — 3D wireframe pyramid frustums (Postshot-style) at every COLMAP capture pose. Drawn always-on-top (depth-test off) so other layers can't occlude them. Hover any frustum for a tooltip showing `CAM_ID`, `POS`, `QUAT`.
- **Data Labels** — surveillance card overlay with per-viewpoint Id / Name / Time / Date / Coord, anchored to the 3D point via a thin SVG connector.

### Particle system (`Customize → FX → Particles`)
Three layered subsystems for fluid / audio-reactive interaction. Particles **render in a separate scene AFTER the composer**, so they bypass every post-FX pass (no echo smearing, no bloom overlay, no painterly blur). Always-on-top additive sprites.

| Subsystem | Role |
|---|---|
| **Velocity Field** | 256² half-float RGBA ping-pong. Convolution + semi-Lagrangian advection + light decay; mouse drag + hand pinch inject mass / velocity at the input UV. "Velocity never dies" property (lomateron reference) with a magnitude clamp at 8.0 so it doesn't runaway-feedback. |
| **GPGPU Particles** | 64² = 4096 additive point sprites with state in float RT pairs (pos + vel ping-pong). Velocity update projects each particle to screen UV, samples the velocity field, blends the push into velocity. Default ON at launch. |
| **Audio Reactor** | AnalyserNode FFT (256 bins) wrapping a file source / mic / URL. Live amp / bass / mid / treble metrics. Default source: `/Forest_Ambience.mp3` auto-loads on first user gesture (autoplay gate). Amp feeds `uAudioAmp` on the particle render — loud frames pull harder + bigger points. |
| **Sorted Particles overlay** | cornusammonis 4-buffer screen-space sim (Buffers A/B/C: spatial sort with strides 25/1/5 + curl advection; Buffer D: EWMA-smoothed nearest-distance accumulator). Display pass blends the EWMA glow over the scene. See `Customize → Post-Process → Sorted Particles`. |

Particle knobs: Point Size · Field Strength · Damping · Gravity Y · Alpha · Color Cool / Hot. Plus a **Seed from USD Voxels** button that respawns every particle at a voxel-cell center and expands the spawn AABB to the scene bounds.

### Customize → Post-Process
Sketchfab-style finishing pipeline. Master **Enable** kills every pass at once. **Bloom is OFF by default on launch** — toggle on per scene as needed. All knobs use dedicated prefixes per the "no shared knobs across FX" rule.

| Pass | Knobs |
|---|---|
| **Bloom** | Enable (default **off**) / Strength / Radius / Threshold |
| **Tonemap** | None / Reinhard / Cineon / ACES |
| **Colour** | Exposure / Contrast / Saturation |
| **Painterly** | Style: None / Monet (Kuwahara) / Matisse (posterize + Sobel) / Seurat (pointillism). Per-style sub-folders auto-open when selected. Auto-disables when Quad or Voxel overlay is visible. |
| **Echo Trails** | Bell-curve ramp: each click triggers a smooth rise → hold → fall of persistence + mix across the FX window, then echo off. Click-FX retriggers reset the curve cleanly. |
| **Underwater** | Dave_Hoskins tileable water caustic + multiplicative tint + UV-wave shimmer + darken. Off by default; numeric defaults match the warm-pink-tint preset. |
| **Sorted Particles** | cornusammonis multipass particle sim display blend (4-buffer sim runs every frame; this pass overlays the EWMA glow). Intensity / Glow Falloff / Color R/G/B / Blend (Additive / Screen / Mix). |
| **Lens Distortion** | Fisheye Blend + FOV + Distortion + Zoom + Dispersion + Center X/Y + Anamorphic Squeeze. On by default with the user-tuned preset. |
| **Vignette** | Enable / Amount / Softness |
| **Chromatic Aberration** | Enable / Amount |
| **Film Grain** | Enable / Amount |
| **Kaleidoscope** (under FX) | Kusama-style mirrored repetition; segments / rotation speed / center / crossfade. |

3DGS-tuned defaults: `exposure 1.10 · contrast 1.08 · saturation 1.15` — gentle polish without crushing midtones.

### Customize → HDR Sky
Loads `/Skybox.hdr` lazily on first toggle and binds it as both `scene.background` and `scene.environment`. Most striking in Point sub-form (sky shines through gaps between dots).

### 3DGS / USD
Each render representation is hover-documented as the USD primitive it would round-trip to:

| Layer | USD analogue (hover) |
|---|---|
| **Splat** sub-form `Gaussian` | UE capture → Postshot training → anisotropic 3D Gaussian (RGB · scales · quaternion · alpha) |
| **Splat** sub-form `Point` | Gaussian centres collapsed → isotropic point — size set by `Point Size` slider (default `0.0025`) |
| **Quad** | `UsdGeomPointInstancer › UsdGeomPlane` — per-instance positions / orientations / scales + `primvars:displayColor` (`interpolation="vertex"`) |
| **Voxel** | `UsdGeomPointInstancer › UsdGeomCube` — same per-instance arrays |

Hover the badge → portalled popover with a clickable link to the official OpenUSD docs.

### Hand tracking (HUD, bottom-left)
MediaPipe hand-pose webcam input drives an alternate control scheme:
- **Single hand** — pinch = drag-orbit, quick pinch-tap = click-FX
- **Two hands** — spread / contract = zoom; parallel drag = pan

---

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173
# or
npm run build && npm run preview
```

First load decompresses the splat and pre-warms the camera-move FBX so the **Center** viewpoint can be patched to frame 460 immediately on page open.

### Drop-in your own splat
Drag any `.splat` / `.ply` / `.spz` / `.ksplat` onto the canvas. Or edit `SPLAT_URL` in `src/main.js`.

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
│   ├── FX                      ← all click-effect controls
│   │   ├── Preset              (default: Slime Molds)
│   │   ├── Core (Effect · Color · Radius · Duration · Intensity)
│   │   ├── Style
│   │   ├── Dissolve FX
│   │   ├── ▶ Replay at last hit
│   │   ├── Brush Mode          (locks OrbitControls while on)
│   │   ├── Effector Mode       (TD-style sphere effector for Dissolve)
│   │   ├── Particles           (Enable + tuning knobs)
│   │   │   ├── Audio Source    (file / mic / live amp · bass · mid · treble)
│   │   │   └── Seed from USD Voxels
│   │   └── Kaleidoscope
│   ├── Post-Process [Enable]
│   │   ├── Bloom [Enable]       (default OFF)
│   │   ├── Tonemap · Exposure · Contrast · Saturation
│   │   ├── Painterly            (Monet / Matisse / Seurat)
│   │   ├── Echo Trails          (bell-curve auto-ramp on click)
│   │   ├── Underwater           (Dave_Hoskins caustic)
│   │   ├── Sorted Particles     (cornusammonis multipass overlay)
│   │   ├── Lens Distortion      (fisheye + dispersion, default ON)
│   │   ├── Vignette
│   │   ├── Chromatic Aberration
│   │   └── Film Grain
│   └── HDR Sky
│
├── Tech Spec [Enable]
│   ├── Training Cameras
│   └── Data Labels
│
└── Camera Movement
    ├── ▶ Play Camera Move
    ├── ■ Stop Camera Move
    └── Camera Move Tuning  (Offset X/Y/Z · Scale)
```

---

## File layout

```
public/
  Whole_With_Statue.splat            # default 3DGS asset
  Whole_With_Statue_Cleanup.splat
  Shot4B_GS-FX_Camera_V01.fbx        # 25 s preauthored camera move
  Skybox.hdr                         # HDR environment
  Forest_Ambience.mp3                # default audio source (auto-loads on first gesture)
  colmap/                            # Postshot's COLMAP reconstruction
    images.bin                       # 990 training-camera poses
    cameras.bin, points3D.bin, ...
src/
  main.js                            # scene, renderer, raycast, animation loop,
                                     #   camera-move state machine, hover tooltips,
                                     #   Center=frame460 sampling, brush/effector hooks,
                                     #   particle/audio/field wiring
  effects.js                         # 8 click effects in one Dyno shader + lil-gui
                                     #   panel structure + USD/Subform hover popovers
  postfx.js                          # EffectComposer pipeline:
                                     #   RenderPass → Bloom → Polish → Painterly →
                                     #   Underwater → SortedParticles → Echo → Kaleidoscope
  velocity-field.js                  # 256² ping-pong velocity field (lomateron port)
  gpgpu-particles.js                 # 64² additive point-sprite particle system,
                                     #   driven by velocity field + audio amp
  audio-reactor.js                   # AnalyserNode wrapper, file / mic / URL sources
  sorted-particles.js                # cornusammonis 4-buffer multipass particle sim
  annotations.js                     # Sketchfab hotspots + smooth camera tween +
                                     #   localStorage scaffolding (default = Gazebo)
  colmap-loader.js                   # images.bin parser + frustum geometry builder
  datalabels.js                      # surveillance-card overlay (Tech Spec)
  handtracking.js                    # MediaPipe-driven hand-control state machine
  quadizer.js, voxelizer.js          # UsdGeomPointInstancer-style overlays
                                     #   (voxelizer caches cellPositions for particle seed)
  style.css                          # dark UI theme + hover popovers
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
        // branch on uEffect (0..3) and modify center / scales / rgba based
        // on distance from uHit, time, per-splat seed, curl noise, etc.
      `,
    });
    return { gsplat: d.apply({ gsplat, uHit, /* ... */ }).gsplat };
  },
);
splat.updateGenerator();
```

Each frame, JS bumps `uTime.value` / `uHit.value` / per-effect uniforms and calls `splat.updateVersion()` — no shader recompile, just uniform updates. Clicking the canvas raycasts against the SplatMesh (Spark's WASM-accelerated point-in-gaussian intersection), transforms the world hit-point into the splat's local frame, and writes it into `uHit`.

The new **Spiral Smear** effect (uEffect = 3) layers:

- **Band mask** — `smoothstep(reach, reach·0.55, dist) × smoothstep(inner·0.4, inner, dist)` so the subject and the far field stay untouched; only an annulus participates.
- **Wind-side bias** — `pow(max(dot(dir, normalize(uWindDir)), 0), 0.7)` so the smear is concentrated on the wind side.
- **Cellular + fbm noise** — per-splat trail-length variation; clusters share a fly-far multiplier so streams read as ribbons not a sheet.
- **Bounded anisotropic stretch** — `scales` are mixed with a streak shape capped at `2× source` (going beyond breaks gaussian rendering — covariance ellipsoid spans too many pixels for per-pixel alpha to register).
- **Per-splat colour preserved** — no rainbow blend, no `uColor` overlay; every ribbon carries its source RGB.

---

## Tips

- **Center viewpoint** is re-patched whenever the FBX preload completes; if you tweak `Camera Move Tuning → Offset X/Y/Z / Scale`, Center stays anchored to frame 460 of the *transformed* path.
- **Tech Spec → Enable** is the single switch to clear all surveillance overlays for screenshots.
- **Post-Process → Enable** off → zero post-fx cost (both Bloom and Polish passes are disabled).
- For very large scenes the splat-ray intersection is O(N) per click. Consider switching to screen-space picking against the depth buffer for instant feedback.
- Shader assumes Y-up. Postshot / Inria splats need `splat.quaternion.set(1, 0, 0, 0)` (180° X flip) to align — already applied.

---

## Roadmap

- ~~**Sound interaction**~~ — **shipped**. AnalyserNode + 4-band metrics drive `uAudioAmp` on the GPGPU particle system. Default `Forest_Ambience.mp3` ships in `/public`; users pick it (or any other file) via `Audio Source → Load Audio File`. Mic also supported.
- **Hand-tracking point light** — palm position drives an additive light contribution per splat (cheat lighting since splats don't ship normals).
- **USD export** — bake the live Voxelizer / Quadizer instance arrays as a `.usda` `UsdGeomPointInstancer` block with per-instance `primvars:displayColor`.
- **Tech Spec content rows** — placeholders for AI Stylization breakdown, VAT animation pipeline, GPU profile, Postshot training params.
- **Velocity field consumer for splats** — currently the field drives only the GPGPU particle layer. Next: have the Dissolve shader sample the field too so swirling gestures push splats themselves.
- **GPGPU particle 3D-occlusion** — particles render with `depthTest=false` (always on top of composed frame). For correct occlusion behind opaque splats, share the depth buffer between the composer and the post-composer pass.

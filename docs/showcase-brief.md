# SplatGarden — NVIDIA Showcase Brief

> Status: draft v0.1 — living doc, edit freely.

## 1. Positioning

**Hero pillar: GPU.** Splatting *is* a GPU story — millions of primitives, real-time shader-graph compilation, swappable Dyno effects with no recompile. The runtime is the demo.

- **Supporting — AI (origin story):** every splat in the scene came from an Unreal capture → Postshot training → 990 COLMAP poses. The viewer surfaces that lineage.
- **Supporting — USD (interop story):** asset & scene metadata are USD-aware; the panel reveals the schema, not just renders it.

**One-line pitch:** *"A GPU-native viewer for AI-generated, USD-described 3D worlds — running in your browser."*

## 2. Audience & venue *(pick one — others become re-cuts)*

| Audience | Venue | Polish target |
|---|---|---|
| Dev relations | developer.nvidia.com + GitHub | "I can fork this Monday" — code clarity, README, RTX/WebGPU paths |
| GTC keynote | 60–90 s on-stage loop | Cinematic camera, zero-error reliability, no scrolling UI |
| Enterprise / AEC | Sales deck demo | USD round-trip, Omniverse handoff, asset-pipeline framing |

## 3. 90-sec beat sheet (keynote cut)

Each beat 3–5 s. Fast cuts keep attention; the runtime never sits still.

| t (s) | Beat | Purpose |
|---|---|---|
| 0:00–0:04 | Black → garden materializes from splat assembly | Reveal |
| 0:04–0:08 | Cinematic camera glides in, no UI | "Real, in a browser" |
| 0:08–0:12 | Approach gazebo, parallax sells depth | Sell the 3D |
| 0:12–0:16 | First click → **Slime Molds** ripples | Hero GPU effect #1 |
| 0:16–0:20 | Swap to **Vortex Drift** — no recompile | "Hot-swap on the GPU" |
| 0:20–0:24 | Swap to **Feather Roots** — branches stream | Effect variety |
| 0:24–0:28 | **Effector Mode** — drag spatial mask sphere | Interaction |
| 0:28–0:32 | **Brush Mode** — paint dissolve trail | Interaction depth |
| 0:32–0:36 | Tech Spec dock slides in | Pivot: "how" |
| 0:36–0:40 | 990 COLMAP frustums fade up around scene | AI origin story |
| 0:40–0:44 | Hover frustum → source thumbnail + pose | Lineage proof |
| 0:44–0:48 | Profiler ticks: M splats, ms/frame, draw calls | Runtime truth |
| 0:48–0:52 | Click splat region → USD prim path lights up | USD interop |
| 0:52–0:56 | USD tree expands, schema text scrolls | Schema reveal |
| 0:56–1:00 | Asset metadata bound to selected prim | "Real USD, not a label" |
| 1:00–1:04 | Postshot FBX camera move starts | Authored cinematography |
| 1:04–1:08 | Gaussian → point cloud transition | Underlying primitives |
| 1:08–1:12 | Back to Gaussian, DoF locks | Visual return |
| 1:12–1:16 | Pull back to hero shot, UI fades out | Resolution |
| 1:16–1:20 | Logo + fork URL | Call to action |
| 1:20–1:30 | Hold | Audience reaction beat |

## 4. Tech Spec redesign — *the live engineering document*

**Current problem:** reads as a feature billboard (particles, post-FX toggles). It tells you what knobs exist, not how the image is produced.

**New identity:** a real-time reveal of the pipeline that *produced* what you're looking at — **data-bound, not prose**. Three sections, in pipeline order:

### 4.1 Capture & Train
- Unreal source frame thumbnail (the original capture)
- COLMAP pose count + camera intrinsics
- Postshot training params (iterations, splat count, density grad threshold)
- **Hover a frustum** → its source thumbnail + capture timestamp pops up

### 4.2 Asset & Schema (USD)
- Live tree of the USD prim hierarchy (real, not a screenshot)
- **Bidirectional selection:** click in 3D → prim highlights in tree; click in tree → splat region highlights in 3D
- Schema text panel: actual `.usda` text for the selected prim
- Attribute editor: change a `purpose` or `visibility` attr, watch the scene react

### 4.3 Runtime
- Splat count, GPU draw time (ms), shader graph currently bound
- Memory footprint (GPU + asset)
- Active Dyno branch name (which of the 8 effects is mounted)
- All values ticking from `profiler.js` — not console-only

**Remove from Tech Spec:** particles, post-FX controls, click-effect dropdown. Those belong under **Customize**, not the engineering reveal. Tech Spec only shows what's *intrinsic* to producing the image, not what's stylistic.

## 5. Gap list (eng work to land the beat sheet)

- [ ] USD prim hierarchy panel (currently absent — only "USD-aware metadata")
- [ ] Frustum → source thumbnail mapping (need image cache from training set)
- [ ] `profiler.js` exposed in Tech Spec UI, not just console
- [ ] Bidirectional 3D ↔ USD-tree selection
- [ ] Keynote-mode toggle: hide all UI except Tech Spec dock
- [ ] Zero-error 90-sec autoplay path (no F12 errors, no asset 404s)
- [ ] One-line fork pitch on `index.html`

## 6. Open questions for the team

1. **Hero pillar — GPU vs. AI.** GPU picked because the runtime is the wow. If the audience is generative-AI dev rel, flip to AI-hero (training pipeline is the wow, GPU is the substrate).
2. **USD panel scope.** Spike minimal version first (read `.usda`, render tree, click-to-select)? Or commit to full bidirectional binding from day one?
3. **Venue lock-in.** Each polish target is ~2–3 weeks of different work. We need a venue decision before the gap list is actionable.

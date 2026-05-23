// ---------------------------------------------------------------------------
// Pipeline — right-side slide-in that doubles as the showcase's information-
// design centerpiece. Organised by ASSETS first, then the systems that
// produce / render / drive them. FX and Post-FX sit at the bottom as "toy"
// sections.
//
// Each item can carry the legacy { ref, note, source } trio or the richer
// asset-pipeline fields { toolchain[], output, location }. The renderer
// shows whichever ones are present.
//
// Toggle: press T, or via instance.toggle(). Sections are collapsible; the
// entire panel slides in from the right.
// ---------------------------------------------------------------------------

import { initTickers }    from "./ticker.js";
import { fitVimeoFrames } from "./vimeo-fit.js";
// The rich-block renderers live in asset-hover.js so the asset hover card
// and the Tech Breakdown drawer share one source of truth for processCards
// / keyPoints / embed markup. Circular import is safe here — both modules
// only call across the boundary at runtime (inside renderCard / renderItem),
// not at module-evaluation time. Keeping the helpers co-located with the
// hover card avoids a third "card-blocks" module just to break the cycle.
import {
  renderProcessCards,
  renderKeyPoints,
  renderEmbed,
  renderSimVideo,
} from "./asset-hover.js";

// Same BASE_URL trick the splat / FBX / HDRI / colmap loaders use —
// resolves to "/" on local dev and "/SplatGarden-WebViewer/" on the
// GitHub Pages deploy. Without this prefix, the texture `<img src>`
// values would point at the domain root on production and 404 — the
// "images still aren't showing" symptom the user just flagged.
const BASE = import.meta.env.BASE_URL;

export const TECH_SPECS = [
  // ============== Observer-first ordering ==============
  // Overview — one-screen anchor: what is this, in one sentence.
  // L3 3DGS  — what the viewer is actually LOOKING AT (rendering primitive
  //            + capture + training). Leads because observers ask "what is
  //            this?" before "how did the team organise to build it?"
  // L2 Production — the per-asset authoring that produced the captured scene.
  // L1 R&D   — the research / tooling layer behind the assets. Last because
  //            it's furthest from what's on screen — interesting once the
  //            reader has understood the result + the assets that fed it.
  // (The numeric `layerNum` fields keep their original L1/L2/L3 values for
  //  semantic stability — the reorder is presentational only.)
  {
    section:   "Overview",
    group:     "summary",
    desc:      "What you're looking at, in one screen.",
    items: [
      {
        name:      "SplatGarden",
        ref:       "Houdini × SpeedTree × Unreal · captured at a multi-cam rig · 3DGS-trained · rendered live in your browser",
        // Embedded `.ticker` spans roll their values from 0 → target the
        // first time the drawer opens (IntersectionObserver in
        // ticker.js fires the animation when each span scrolls into
        // view). Static text + commas remain literal so only the
        // numbers animate.
        output:    "≈ <span class=\"ticker\" data-target=\"3000000\" data-format=\"compact\">0</span> splats · <span class=\"ticker\" data-target=\"990\">0</span> capture frames · <span class=\"ticker\" data-target=\"16.67\" data-decimals=\"2\">0</span>s authored flythrough",
        note:      "A Unreal-authored garden, captured at a multi-camera rig, reconstructed with COLMAP, trained in parallel by Postshot and Lichtfeld Studio, optimised with Houdini GSOP, and rendered in real time via Spark on Three.js + WebGL 2. The breakdown below walks the pipeline backwards — first the rendering primitive you're looking at right now, then the assets that produced it, then the R&D layer that authored those assets.",
      },
    ],
  },

  {
    section:   "3DGS",
    group:     "layer",
    layerNum:  3,
    desc:      "Capturing the dressed Unreal scene and training it as a 3D Gaussian Splat. Postshot and Lichtfeld Studio run in parallel — two independent trainers we cross-compare to pick the cleaner result.",
    toolchain: ["Multi-camera rig", "COLMAP", "Postshot", "Lichtfeld Studio", "Spark"],
    items: [
      {
        name: "3D Gaussian Splatting",
        ref:  "Kerbl et al., SIGGRAPH 2023 · rendered in-browser via @sparkjsdev/spark",
        note: "The render primitive: per-splat ellipsoidal Gaussians + spherical-harmonic view-dependent colour. The composed garden ends up as a single .splat asset, rasterised in real time by Spark on Three.js + WebGL 2.",
      },
      {
        name:   "Capture",
        ref:    "Multi-camera capture rig",
        note:   "The whole Unreal scene is photographed at a multi-camera array — every frame feeds the downstream pose-solver + trainers.",
      },
      {
        name:   "Pose reconstruction",
        ref:    "COLMAP Structure-from-Motion · 990 cameras recovered",
        note:   "COLMAP solves intrinsics + extrinsics for every capture frame; the resulting 990 camera poses feed both trainers (and double as the Training Cameras overlay in Tech Spec).",
        source: "src/colmap-loader.js:50",
      },
      {
        name: "Splat training (parallel)",
        ref:  "Postshot · Lichtfeld Studio",
        note: "Two trainers fit the captured frames into a 3D Gaussian Splat at the same time. Postshot is the artist-driven path; Lichtfeld is the studio's in-house pipeline. We compare outputs and hand the cleaner one off to the next stage for optimization.",
      },
      {
        name: "Splat optimization",
        ref:  "GSOP · Houdini",
        note: "The trainer output runs through Houdini's GSOP (Gaussian Splat Operators) toolset for cleanup + decimation: outlier splats are pruned, redundant low-opacity points are merged, and the splat count is brought down to ≈ 3M without a visible quality loss. Ships as public/SplatGarden_PC.splat.",
      },
    ],
  },

  {
    section:   "Production",
    group:     "layer",
    layerNum:  2,
    desc:      "Per-object authoring + Unreal scene assembly — everything that goes into the dressed scene before the camera turns on.",
    toolchain: ["Houdini", "SpeedTree", "VAT bake", "Python · OSC", "Unreal Engine 5", "Perforce"],
    items: [
      {
        name: "Scene assembly",
        ref:  "Unreal Engine 5 — every asset set-dressed into one scene",
        note: "Perforce-backed version control across artists. All set-dressed assets land here before the capture stage.",
      },
      // Landscape promoted from the end of this list to the second slot
      // because it's the asset that demonstrates the full L1 → L2 pipeline
      // most completely (AI Texture Stylization → Houdini COPNET →
      // NormalMap-Online → Unreal terrain). Reading it right after Scene
      // assembly anchors the rest of the Production list against a
      // concrete "tool-chain in action" example.
      {
        name:      "Landscape",
        location:  "Whole scene base",
        // World position resolved with the same +Z-forward → -Z-forward
        // flip used for all other hotspots (see AssetHoverManager).
        // X nudged left in stages — 1.051 → 0.651 → 0.251 → -0.749 —
        // each move responding to the user's request to pull the dot
        // further away from the foreground foliage band. Final pose
        // sits squarely over the open ground patch in the middle-left
        // of the scene.
        worldPos:  [-0.749, -0.827, 0.981],
        toolchain: [
          "AI Texture Stylization",
          "Houdini COPNET",
          "NormalMap-Online",
          "Unreal Engine 5 (terrain authoring)",
        ],
        output:    "Stylized terrain · painterly base colour + COPNET-authored height + tool-converted normal",
        note:      "Three-stage texture pipeline for the ground. (1) The AI Texture Stylization tool from L1 applies a brush-stroke style from a chosen style reference onto the original ground tile, producing the painterly base colour. (2) The result is taken into a Houdini COPNET to fine-tune colour balance, paint in additional surface detail (rocks, scattered debris, mid-tone variation), and bake out a paired height map. (3) The stylized base colour is then run through cpetry.github.io/NormalMap-Online to derive the matching normal map. Final terrain is authored in Unreal Engine 5 and dressed into the scene before the 3DGS capture stage.",
        embed: {
          src:   "https://player.vimeo.com/video/1194203694?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
          label: "Final rendered landscape · in-scene",
          title: "Shot4B_MontyVersion_4.53_1",
          // True ultrawide — Vimeo's own embed markup ships at
          // `width="2048" height="452"`, which is ≈ 4.53 : 1 (about
          // 36:8, beyond 21:9 cinemascope). Neither the 4:3 default
          // nor 16:9 fits without bars. This explicit value is the
          // first-paint hint; vimeo-fit.js then confirms / refines
          // it once the Player API reports actual dimensions.
          aspectRatio: "2048 / 452",
        },
        // Triptych: style reference (the overall stylized landscape look) /
        // original ground tile / AI-stylized result. The renderCard()
        // helper auto-renders the "Texture Stylization" triptych section
        // when any of these three keys are set. Paths prefixed with BASE
        // so they resolve correctly on GitHub Pages (`/SplatGarden-
        // WebViewer/textures/...`) as well as on local dev (`/textures/...`).
        media: {
          style:    `${BASE}textures/landscape/LandScape_Stylized.png`,
          original: `${BASE}textures/landscape/Ground_Original.png`,
          result:   `${BASE}textures/landscape/Ground_Stylized_BaseColor.png`,
          // Pipeline strip: the three downstream texture maps produced by
          // stages (2) + (3) of the note above. renderCard() lays these
          // out as a horizontal filmstrip below the triptych.
          pipeline: [
            { src: `${BASE}textures/landscape/Ground_Stylized_BaseColor.png`, label: "Base Color · AI" },
            { src: `${BASE}textures/landscape/Ground_Stylized_Height.png`,    label: "Height · Houdini COPNET" },
            { src: `${BASE}textures/landscape/Ground_Stylized_Normal.png`,    label: "Normal · NormalMap-Online" },
          ],
        },
      },
      {
        name:      "Gazebo",
        location:  "Centerpiece",
        // X shifted -0.58 → -0.18 (net +0.4: +1 from the first nudge,
        // then −0.6 from the follow-up correction) — final pose sits
        // just to the right of the statue silhouette, on the open
        // gazebo column rather than over the statue itself.
        worldPos:  [-0.18, -0.561, 3.774],
        toolchain: ["Houdini (3DGS SIM)", "Unreal Engine 5 (set dress)"],
        output:    "3DGS centerpiece · Houdini-simulated splat dynamics",
        note:      "The garden's central architecture. Built in Houdini as a 3DGS simulation — splat positions are driven by a sim graph, then baked and dressed into the Unreal scene before capture.",
        embed: {
          src:   "https://player.vimeo.com/video/1193797863?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
          label: "Houdini 3DGS simulation",
          title: "Shot4B_GS-FX_V08",
        },
      },
      {
        name:      "Statue",
        location:  "Inside the gazebo",
        // Inherits the OLD Gazebo coordinates per user direction — the
        // statue physically sits where the Gazebo hotspot used to be.
        worldPos:  [-0.58, -0.561, 3.774],
        toolchain: [
          "Houdini",
          "Particle Simulation",
          "Pyro Simulation",
          "VEX",
          "Axiom",
          "Gaussian Splat",
          "GSOPs",
          "VAT (Vertex Animation Texture)",
          "Unreal Engine 5",
        ],
        output:    "Animated statue · 3DGS dynamics + VAT-baked playback in UE5",
        note:      "Animated statue authored end-to-end in Houdini: particle and pyro simulation drive the dynamics, with VEX expressions and the Axiom solver shaping the motion. The resulting Gaussian-Splat output is cleaned through GSOPs, baked to a Vertex Animation Texture, and shipped to Unreal Engine 5 for GPU-cheap real-time playback. Left-hand pinch in the MediaPipe session scrubs the VAT live during the shoot.",
        // Embeds intentionally omitted for now — the Final Result · VAT
        // and Houdini · 3DGS slots from the mock-up are reserved but
        // waiting on dedicated Statue-only renders. The renderer
        // gracefully skips the embed section when the field is absent.
      },
      {
        name:      "Vine",
        location:  "Near gazebo",
        worldPos:  [-0.89, -0.926, 3.258],
        toolchain: ["Unreal Engine 5 — Motion Graphics", "Unreal Engine 5 — WPO shader"],
        output:    "Animated vine growth · flowers driven by Motion Graphics, stems by WPO",
        note:      "Vine growth render. The bloom heads use Unreal's Motion Graphics system for keyframed flowering; the stems run a custom material whose World Position Offset (WPO) drives the procedural growth path along the gazebo's framework.",
        embed: {
          src:   "https://player.vimeo.com/video/1194222092?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
          label: "Vine growth · Unreal MG + WPO shader",
          title: "Shot4B_VineAnimation",
          // The Vimeo embed markup ships at padding-top:75% (4:3) but
          // the underlying clip is rendered at 16:9 — same Vimeo
          // template-default trap the Landscape clip hit. Forcing the
          // iframe to 16:9 makes the gazebo content tile edge-to-edge
          // inside the card with no top/bottom black letterbox bars.
          aspectRatio: "16 / 9",
        },
      },
      {
        name:      "Daffodil",
        location:  "Near gazebo",
        worldPos:  [0.08, -0.773, 2.226],
        toolchain: ["Houdini", "VAT bake", "Unreal Engine 5 (set dress)", "Python · OSC · MediaPipe", "AI texture stylization"],
        output:    "Mesh + VAT animation · interactively driven in Unreal",
        note:      "Animated procedurally in Houdini and VAT-baked, then set-dressed in Unreal. Inside the Unreal session, Python · OSC · MediaPipe drives the rig live (hand gesture → OSC → blueprint). Diffuse texture passes through the AI Texture Stylization tool from L1.",
        embed: {
          src:   "https://player.vimeo.com/video/1191203670?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
          label: "VAT + OSC interaction",
          title: "VAT",
        },
        compare: {
          before: null,
          after:  null,
          labelA: "Original",
          labelB: "Stylized",
        },
      },
      {
        name:      "Grape Hyacinth",
        location:  "Near gazebo",
        worldPos:  [-0.195, -0.730, 2.379],
        toolchain: [
          "Houdini (procedural tool + GUI)",
          "VAT (vertex animation texture bake)",
          "Unreal Engine 5 (PCG scatter)",
          "Sequencer + Movie Render Queue",
        ],
        // Step-style processCards — three numbered sections (01/02/03)
        // matching the user's design reference. Sections 01 + 02 reuse
        // the existing Vimeo embeds (1193813472 Houdini tool + 1187001709
        // VAT/PCG render — kept since no replacement was provided);
        // section 03 uses new texture images shipped in
        // public/textures/grapehyacinth/.
        processCards: [
          {
            eyebrow:     "01 — PROCEDURAL TOOL",
            title:       "Houdini Tool — Procedural Grape Hyacinth",
            description: "A fully procedural setup that grows the flower from parameters. The distribution of florets along the primary stem follows the golden angle of 137.5°, consistent with the phyllotaxis observed in natural inflorescence structures.",
            rows: [
              { layout: "single", items: [{
                iframeSrc: "https://player.vimeo.com/video/1193813472?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
                caption: "Network & viewport — showcase",
                alt: "Houdini procedural grape-hyacinth tool — network + viewport",
              }]},
            ],
          },
          {
            eyebrow:     "02 — ANIMATION",
            title:       "Vertex Animation Texture (VAT)",
            description: "A grape hyacinth animation produced through a VAT pipeline — baking vertex motion into textures for smooth real-time playback.",
            rows: [
              { layout: "single", items: [{
                iframeSrc: "https://player.vimeo.com/video/1187001709?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
                caption: "Preliminary VAT Animation",
                alt: "Grape hyacinth VAT animation — preliminary playback",
              }]},
            ],
          },
          {
            eyebrow:     "03 — TEXTURING",
            title:       "AI Style Texture",
            description: "Texture variations explored with AI to push stylization looks while keeping the procedural base intact. Drag each slider to wipe between the procedural base and the AI-stylized output.",
            // Two A/B compare-slider widgets on ONE row, side-by-side
            // (1:1 frames, square Substance texture sources). The
            // compare row accepts an items array — 1 item = full
            // width, ≥2 = grid. On phones the grid collapses back to
            // a single column so each slider stays large enough to
            // drag comfortably (see .ah-pc-compare-grid @media in
            // style.css).
            rows: [
              {
                layout: "compare",
                items: [
                  {
                    before: `${BASE}textures/grapehyacinth/gh-bud-before.png`,
                    after:  `${BASE}textures/grapehyacinth/gh-bud-after.png`,
                    labelA: "Before: Procedural base",
                    labelB: "After: AI-stylized oil paint",
                  },
                  {
                    before: `${BASE}textures/grapehyacinth/gh-leaves-before.png`,
                    after:  `${BASE}textures/grapehyacinth/gh-leaves-after.png`,
                    labelA: "Before: Procedural base",
                    labelB: "After: AI-stylized oil paint",
                  },
                ],
              },
            ],
          },
        ],
        keyPoints: [
          { key: "Houdini",     value: "Modeled entirely in Houdini with a custom procedural tool. Artists can adjust stalk count, bloom density, and petal twist through a custom GUI." },
          { key: "Unreal",      value: "Layout is driven by PCG, so density automatically follows splines. Backlit petals glow translucently via Unreal's SubsurfaceTwoSidedFoliage shader, no extra geometry needed." },
          { key: "Performance", value: "Animation is baked to a Vertex Animation Texture (VAT) for optimized playback." },
          { key: "Rendering",   value: "Sequencer + Movie Render Queue at film quality." },
        ],
      },
      {
        name:      "Additional Foliage",
        location:  "Foreground daisy band",
        // X shifted from 1.171 → -1.829 (−3) per user direction —
        // slides the hotspot from the right-edge daisy cluster across
        // to the left-edge daisy band that the camera also passes over.
        worldPos:  [-1.829, -0.774, 1.574],
        toolchain: [
          "SpeedTree (procedural plant)",
          "Triangle decimation",
          "Substance Designer (stylized texture)",
          "Unreal Engine 5 (set dress)",
        ],
        output:    "Real-time-ready foliage · 640 triangles · stylized procedural diffuse",
        // Step-style processCards — matches the Grape Hyacinth editorial
        // pattern (eyebrow + bold title + prose description + media rows).
        // Narrative arc:
        //   01 procedural authoring → decimation pass
        //   02 Substance Designer stylization graph
        //   03 final in-scene render (the payoff)
        // The hero "Real-time Ready Foliage" plate moved from the TOP
        // (where it answered the question before the card had earned
        // it) to the BOTTOM as a climax shot — readers walk through the
        // making-of and then see the result. Frames now inherit natural
        // image height (see .ah-pc-fig .ah-frame { aspect-ratio: auto }
        // in style.css), so the wide landscape final plate no longer
        // letterboxes inside a forced 1:1 plinth.
        processCards: [
          {
            eyebrow: "01 — MODELING & OPTIMIZATION",
            title:   "Procedural Plant + Aggressive Decimation",
            description: "Authored procedurally in SpeedTree — a single node graph drives the whole daisy with parametric trunk, leaf, and cap rules, so scaling the scatter density never reauthors geometry. Decimation pass takes each plant from 28,557 to 640 triangles, the threshold where the Unreal Engine 5 foliage scatter stays at a stable interactive frame rate without visible silhouette loss.",
            rows: [
              { layout: "pair", items: [
                { src: `${BASE}textures/daisy/daisy-modeling-speedtree.png`,  caption: "Modeling in SpeedTree" },
                { src: `${BASE}textures/daisy/daisy-speedtree-nodegraph.png`, caption: "Procedural plant node graph" },
              ]},
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-optimization.jpg`, caption: "Triangle decimation · 28,557 → 640" },
              ]},
            ],
          },
          {
            eyebrow: "02 — STYLIZATION",
            title:   "Substance Designer Painterly Procedural",
            description: "Diffuse and leaf atlas built procedurally in Substance Designer, inspired by 80 Level's \"Breakdown: Making 3D Landscape Look Like Painting\". The same brush-stroke language used on the Landscape master texture carries through to the foliage so the daisy band reads as part of the painting, not as a photo-real prop dropped into a painterly scene.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-substance-nodegraph.png`, caption: "Stylized procedural node graph" },
              ]},
              { layout: "pair", items: [
                { src: `${BASE}textures/daisy/daisy-substance-before.png`, caption: "Before stylization" },
                { src: `${BASE}textures/daisy/daisy-substance-after.png`,  caption: "After stylization" },
              ]},
            ],
          },
          {
            eyebrow: "03 — FINAL RESULT",
            title:   "Real-time Ready Foliage",
            description: "640-triangle scatter cards dressed in the painterly Substance diffuse, lit by the same HDRI as the rest of the garden. The whole foreground daisy band ships at interactive frame rate on a desktop GPU without any per-frame foliage update.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-final-result.jpg`, caption: null, alt: "Stylised daisy field — final in-scene render" },
              ]},
            ],
          },
        ],
        note:      "Real-time-ready foliage authored procedurally in SpeedTree, then aggressively decimated (28,557 → 640 triangles) so the scattered plant cards survive an interactive FPS budget without visible quality loss. A Substance Designer stylization graph produces the painterly diffuse + leaf atlas — the same procedural-painterly look as the Landscape texture pipeline, inspired by 80 Level's \"Making 3D Landscape Look Like Painting\" breakdown.",
      },
      {
        name:      "Tree",
        location:  "Near gazebo",
        toolchain: ["SpeedTree", "Unreal Engine 5 (set dress)"],
        note:      "Procedural tree authored in SpeedTree, dressed into the Unreal scene before the env capture.",
      },
    ],
  },

  {
    section:   "R&D",
    group:     "layer",
    layerNum:  1,
    desc:      "Research + interop layer — the custom AI texture tool plus the OpenUSD spec for our alternative render subforms.",
    toolchain: ["IP-Adapter", "ControlNet", "AdaIN", "Diffusion", "OpenUSD", "UsdGeomPointInstancer"],
    items: [
      {
        name:      "AI Texture Stylization",
        ref:       "Diffusion-based painterly tool with controllable color preservation",
        toolchain: ["IP-Adapter", "ControlNet (Tile / Canny)", "AdaIN", "Diffusion"],
        output:    "Painterly textures · pre-approved palette preserved",
        note:      "Custom tool driving the painterly look on Daffodil + Landscape. Two artist-selectable modes — Full Style Transfer (color + texture + tone from a reference) and Texture-Only Transfer (auto-grayscale + AdaIN, preserves the original color palette). Per-channel histogram matching + patch-wise AdaIN run post-generation to deterministically correct residual color drift. Artist knobs: ControlNet mode, ControlNet strength, IP-Adapter strength, inference steps, guidance scale. PyTorch 2.11 / CUDA 13.0 on an NVIDIA RTX PRO 6000 Blackwell (96 GB VRAM) — 4K in ≈ 20 s at 20 inference steps, driven from a Gradio interface.",
        compare: {
          before: null,
          after:  null,
          labelA: "Original",
          labelB: "Stylized",
        },
      },
      {
        name:      "OpenUSD subforms",
        ref:       "Billboard + Voxel as UsdGeomPointInstancer prims",
        toolchain: ["UsdGeomPointInstancer", "UsdGeomPlane", "UsdGeomCube", "UsdGeomSphere", "primvars:displayColor"],
        output:    "USD-compatible alternative renderings of the same splat data",
        note:      "Two alternative render representations of the splat, each expressed as a USD PointInstancer prim. The Billboard layer uses proto = UsdGeomPlane (per-instance camera-facing billboards), with a Quad subform (full square) and a Circle subform (unit-disc discard for soft round impostors). The Voxel layer buckets splats into a uniform grid with averaged colour per cell, rendered as proto = UsdGeomCube or proto = UsdGeomSphere depending on the subform. All variants carry per-instance positions, orientations, scales, and a primvars:displayColor array. Toggle live via the GUI's 3DGS/USD folder.",
      },
    ],
  },
];

function renderItem(it, visMap) {
  const isAsset = Array.isArray(it.toolchain) && it.toolchain.length > 0;
  // Only assets with a worldPos have a hotspot in the scene, so only those
  // get the ON/OFF toggle. Default visibility is ON unless the user has
  // toggled it OFF (state persisted in localStorage by the TechSpec class).
  const hasHotspot = Array.isArray(it.worldPos);
  const on = !visMap || visMap.get(it.name) !== false;
  const toggle = hasHotspot
    ? `<button class="ts-hotspot-toggle" data-act="toggle-hotspot"
         data-asset-name="${it.name}" data-on="${on ? "1" : "0"}"
         title="Show / hide ${it.name} hotspot in the scene"
         aria-pressed="${on ? "true" : "false"}">
         <span class="ts-toggle-dot"></span>
         <span class="ts-toggle-label">${on ? "ON" : "OFF"}</span>
       </button>`
    : "";

  // 1. Title row — big asset name + optional location chip + hotspot toggle
  const head = `
    <header class="ts-item-head">
      <h3 class="ts-item-name">${it.name}</h3>
      ${it.location ? `<span class="ts-item-loc">${it.location}</span>` : ""}
      ${toggle}
    </header>`;

  // 2. Sub-line — short technical tagline (ref). Sits right under the title.
  const sub = it.ref ? `<div class="ts-item-sub">${it.ref}</div>` : "";

  // 3. Keywords zone — chip row. No ▸ separators (the label is "Keywords"
  // now, not "Toolchain" — arrows implied directional pipeline flow
  // which doesn't apply to a tag list). Chips space themselves via
  // the .ts-chain flex-gap rule.
  let chain = "";
  if (isAsset) {
    const chips = it.toolchain
      .map(t => `<span class="ts-chip">${t}</span>`)
      .join("");
    chain = `<div class="ts-zone">
        <div class="ts-zone-label">Keywords</div>
        <div class="ts-chain">${chips}</div>
      </div>`;
  }

  // 4. Output zone — explicit "OUTPUT" label + value
  const output = it.output ? `<div class="ts-zone">
        <div class="ts-zone-label">Output</div>
        <div class="ts-zone-val">${it.output}</div>
      </div>` : "";

  // 5. Note — the readable prose paragraph
  const note = it.note ? `<p class="ts-item-note">${it.note}</p>` : "";

  // 5b. Before/after compare widget — drag the handle to wipe between the
  // pre-AI texture and the stylized output. Used by AI Stylization items;
  // declared via `compare: { before, after, labelA, labelB }` on the item.
  const compare = it.compare ? renderCompare(it.compare) : "";

  // 5c. Rich content blocks (processCards / keyPoints / embed / simVideo) —
  // mirrors the asset hover card so the Tech Breakdown drawer shows the
  // same step-style walkthroughs, A/B compare grids, and Vimeo embeds.
  // Shared with renderCard via the helpers exported from asset-hover.js.
  // Wrapped in `.ts-rich` so the CSS rules that originally scope to
  // `.ah-card` can also scope to the drawer via `:is(.ah-card, .ts-rich)`.
  const hasRich = (Array.isArray(it.processCards) && it.processCards.length)
               || (Array.isArray(it.keyPoints)    && it.keyPoints.length)
               || it.embed
               || it.simVideo;
  const rich = hasRich
    ? `<div class="ts-rich">
         ${it.simVideo ? renderSimVideo(it.simVideo) : ""}
         ${renderProcessCards(it.processCards)}
         ${Array.isArray(it.embed)
             ? it.embed.map(e => renderEmbed(e)).join("")
             : (it.embed ? renderEmbed(it.embed) : "")}
         ${renderKeyPoints(it.keyPoints)}
       </div>`
    : "";

  // 6. Source — small mono footer with hairline rule above
  const source = it.source ? `<div class="ts-item-src">${it.source}</div>` : "";

  return `<li class="ts-item${isAsset ? " ts-item-asset" : ""}">${head}${sub}${chain}${output}${note}${compare}${rich}${source}</li>`;
}

export function renderCompare(c) {
  const lblA = c.labelA || "Before";
  const lblB = c.labelB || "After";
  const layer = (url, fallback, cls) => url
    ? `<img class="cmp-img ${cls}" src="${url}" draggable="false" alt="">`
    : `<div class="cmp-img cmp-ph ${cls}"><span>${fallback}</span></div>`;
  // Labels render BELOW the frame as a citation-style row (left = A, right =
  // B). The previous design overlaid them as absolute-positioned tags inside
  // the frame, which worked when labels were short ("BEFORE" / "AFTER") but
  // collided in the middle once labels grew into full descriptions like
  // "Before: Procedural base" / "After: AI-stylized oil paint" — especially
  // in the side-by-side compare-grid layout inside the Tech Breakdown
  // drawer where each cell is only ~half the row width. Citations below
  // never overlap regardless of label length and read more like a
  // figure-caption: image first, then the legend.
  return `
    <div class="ts-compare">
      <div class="cmp-frame" data-cmp>
        ${layer(c.after, "AFTER · placeholder", "cmp-img-b")}
        ${layer(c.before, "BEFORE · placeholder", "cmp-img-a")}
        <div class="cmp-handle"><div class="cmp-knob"></div></div>
      </div>
      <div class="cmp-captions">
        <span class="cmp-cap cmp-cap-a">${lblA}</span>
        <span class="cmp-cap cmp-cap-b">${lblB}</span>
      </div>
    </div>`;
}

// Wire the drag-to-wipe interaction on a single compare frame.
//
// Listeners live on the FRAME itself (not the tiny 2 px handle), so the
// grab target is the whole 16:9 area — much more forgiving. pointerdown
// also snaps the split to where the user clicked, so single-click works
// the same as drag. setPointerCapture on the frame routes pointermove
// events through even if the cursor drifts off the card, which means
// the compare slider keeps tracking inside draggable parents (the asset
// hover card has its own pointer handlers, but they early-return for
// targets outside .ah-head).
export function wireCompareFrame(frame) {
  // Idempotent — _show() re-runs this every time the card rebuilds, so
  // bail if we've already wired this frame.
  if (frame.dataset.cmpWired === "1") return;
  frame.dataset.cmpWired = "1";

  const imgA = frame.querySelector(".cmp-img-a");
  const handle = frame.querySelector(".cmp-handle");
  if (!imgA || !handle) return;

  let split = 0.5;
  const apply = () => {
    handle.style.left = `${(split * 100).toFixed(3)}%`;
    imgA.style.clipPath = `inset(0 ${((1 - split) * 100).toFixed(3)}% 0 0)`;
  };
  apply();

  const setAt = (clientX) => {
    const r = frame.getBoundingClientRect();
    if (r.width <= 0) return;
    split = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    apply();
  };

  let dragging = false;
  frame.addEventListener("pointerdown", (e) => {
    // Left button / primary touch only — and don't fight other handlers
    // (e.g., the asset card's text-selection on the body).
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    try { frame.setPointerCapture(e.pointerId); } catch {}
    setAt(e.clientX);
    e.preventDefault();
    e.stopPropagation();
  });
  frame.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    setAt(e.clientX);
    e.preventDefault();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { frame.releasePointerCapture(e.pointerId); } catch {}
  };
  frame.addEventListener("pointerup",     endDrag);
  frame.addEventListener("pointercancel", endDrag);
  frame.addEventListener("pointerleave",  endDrag);
}

const HOTSPOT_VIS_STORAGE_KEY = "splatgarden:hotspot-visibility:v1";

export class TechSpec {
  constructor({ mountEl = document.body } = {}) {
    this.open = false;
    // Per-asset hotspot visibility. Map<name, boolean>. Missing key == ON.
    // Persisted across reloads via localStorage.
    this.assetVisible = this._loadVisibility();
    this.onAssetToggle = null;   // (name, on) => void — wired by main.js

    this.el = document.createElement("div");
    this.el.id = "tech-spec";
    this.el.innerHTML = `
      <div class="ts-backdrop"></div>
      <aside class="ts-panel">
        <header class="ts-header">
          <div class="ts-title">
            <span class="dot"></span>
            <span class="t">TECH BREAKDOWN</span>
            <span class="ts-key">T</span>
          </div>
          <button class="ts-close" title="Close (T or Esc)">×</button>
        </header>
        <div class="ts-sub">How everything in this scene was made · click a section to fold</div>
        <div class="ts-body">
          ${TECH_SPECS.map((s, i) => {
            const groupCls = s.group ? ` ts-sec-${s.group}` : "";
            const numChip  = (s.layerNum != null)
              ? `<span class="ts-sec-num">L${s.layerNum}</span>`
              : (s.pillarIdx
                  ? `<span class="ts-sec-num">${String(s.pillarIdx).padStart(2, "0")}</span>`
                  : "");
            const itemLbl  = s.items.length === 1 ? "item" : "items";
            // Layer sections show their tool stack as a chip row in the
            // header — readable even when the section is collapsed.
            const layerTools = (s.group === "layer" && Array.isArray(s.toolchain))
              ? `<div class="ts-sec-tools">${s.toolchain.map(t => `<span class="ts-chip">${t}</span>`).join("")}</div>`
              : "";
            return `
              <section class="ts-sec${groupCls}" data-idx="${i}">
                <header class="ts-sec-head">
                  ${numChip}
                  <span class="ts-sec-name">${s.section}</span>
                  <span class="ts-sec-count">${s.items.length} ${itemLbl}</span>
                  <span class="ts-caret">▾</span>
                </header>
                <div class="ts-sec-desc">${s.desc}</div>
                ${layerTools}
                <ul class="ts-list">
                  ${s.items.map(it => renderItem(it, this.assetVisible)).join("")}
                </ul>
              </section>`;
          }).join("")}
        </div>
        <footer class="ts-footer">
          <span class="ts-foot-k">Total</span>
          <span class="ts-foot-v"><span class="ticker" data-target="${TECH_SPECS.reduce((n, s) => n + s.items.length, 0)}">0</span> entries · <span class="ticker" data-target="${TECH_SPECS.length}">0</span> sections</span>
        </footer>
      </aside>
    `;
    mountEl.appendChild(this.el);

    this.el.querySelector(".ts-close").addEventListener("click", () => this.close());
    // Backdrop is click-through (pointer-events:none) so drags reach the
    // canvas — no listener wired. Close via × button, Esc, or T toggle.

    this.el.querySelectorAll(".ts-sec-head").forEach(h => {
      h.addEventListener("click", () => {
        const sec = h.closest(".ts-sec");
        sec.classList.toggle("collapsed");
      });
    });

    // Hotspot ON/OFF toggle on each asset item. Delegated so the listener
    // survives any future re-render. stopPropagation keeps the section
    // collapse handler above from firing.
    this.el.addEventListener("click", (e) => {
      const btn = e.target?.closest?.('[data-act="toggle-hotspot"]');
      if (!btn || !this.el.contains(btn)) return;
      e.stopPropagation();
      const name = btn.dataset.assetName;
      const next = !(this.assetVisible.get(name) !== false);
      this.assetVisible.set(name, next);
      btn.dataset.on = next ? "1" : "0";
      btn.setAttribute("aria-pressed", next ? "true" : "false");
      const lbl = btn.querySelector(".ts-toggle-label");
      if (lbl) lbl.textContent = next ? "ON" : "OFF";
      this._saveVisibility();
      this.onAssetToggle?.(name, next);
    });

    // Wire drag handles on every inline before/after compare widget.
    this.el.querySelectorAll(".ts-compare .cmp-frame").forEach(wireCompareFrame);

    // T key toggles, Esc closes — guarded against typing into inputs.
    window.addEventListener("keydown", (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "t" || e.key === "T") this.toggle();
      else if (e.key === "Escape" && this.open) this.close();
    });
  }

  toggle()      { this.open ? this.close() : this.openOverlay(); }
  openOverlay() {
    this.open = true;
    this.el.classList.add("show");
    // Fire the rolling-digit tickers in the Overview output line + footer
    // counts. We pass observe:false (skip IntersectionObserver) because
    // the drawer's slide-in transform + internal overflow scroll can
    // confuse the observer's intersection geometry — the safer + more
    // reliable behaviour here is "drawer opens → all tickers fire". Each
    // ticker self-marks as active on first call so subsequent open/close
    // cycles don't restart the animation.
    initTickers(this.el, { observe: false });
    // Auto-fit every Vimeo iframe in the drawer to its clip's real
    // dimensions — eliminates Vimeo's internal letterbox bars for any
    // asset card that ships an embed. Idempotent so repeated opens
    // don't re-measure.
    fitVimeoFrames(this.el);
    this.onOpenChange?.(true);
  }
  close() {
    this.open = false;
    this.el.classList.remove("show");
    this.onOpenChange?.(false);
  }

  _loadVisibility() {
    try {
      const raw = localStorage.getItem(HOTSPOT_VIS_STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      return new Map(Object.entries(obj));
    } catch { return new Map(); }
  }
  _saveVisibility() {
    try {
      const obj = Object.fromEntries(this.assetVisible);
      localStorage.setItem(HOTSPOT_VIS_STORAGE_KEY, JSON.stringify(obj));
    } catch { /* quota / disabled — silent */ }
  }
}

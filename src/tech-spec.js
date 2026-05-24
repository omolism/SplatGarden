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
  escapeHtml,
} from "./asset-hover.js";

// Same BASE_URL trick the splat / FBX / HDRI / colmap loaders use —
// resolves to "/" on local dev and "/SplatGarden/" on the
// GitHub Pages deploy. Without this prefix, the texture `<img src>`
// values would point at the domain root on production and 404 — the
// "images still aren't showing" symptom the user just flagged.
const BASE = import.meta.env.BASE_URL;

export const TECH_SPECS = [
  // ============== Observer-first ordering ==============
  // Mirrors the canonical 3-stage pipeline figure shipped on the web
  // intro page — Asset making → Scene assembly → 3DGS capture — but
  // presented BACKWARDS so the drawer leads with what the viewer is
  // actually looking at right now (the splat) and unwinds to the
  // upstream stages.
  //
  // Overview — one-screen anchor: what is this, in one sentence.
  // 01 3DGS  — what the viewer is actually LOOKING AT (rendering
  //            primitive + capture + training). Leads because observers
  //            ask "what is this?" before "how did the team build it?".
  // 02 Production — the per-asset authoring that produced the captured
  //            scene. The original 3-layer scheme (L1 R&D + L2
  //            Production + L3 3DGS) was retired when L1 dropped out;
  //            tooling notes (AI Texture Stylization, OpenUSD subforms)
  //            now live inside the per-asset cards that consume them,
  //            and the live USD showcase lives in the 3DGS/USD panel on
  //            screen. Each section's `pillarIdx` is its reading-order
  //            number after Overview — strictly presentational.
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
        note:      "A Unreal-authored garden, captured at a multi-camera rig, reconstructed with COLMAP, trained in parallel by Postshot and Lichtfeld Studio, optimised with Houdini GSOP, and rendered in real time via Spark on Three.js + WebGL 2. The breakdown below walks the pipeline backwards. It starts with the rendering primitive you're looking at right now, then unwinds to the per-asset authoring that produced the captured scene.",
      },
    ],
  },

  {
    section:   "3DGS",
    group:     "layer",
    // Sequential reading-order chip. Was `layerNum: 3` back when the
    // drawer carried three pipeline layers (L1 R&D + L2 Production +
    // L3 3DGS); with L1 retired the "L3" label implied a missing
    // anchor. The chip now reads "01" because 3DGS is the first
    // detail section after Overview — what the viewer is actually
    // looking at.
    pillarIdx: 1,
    desc:      "Capturing the dressed Unreal scene and training it as a 3D Gaussian Splat. Postshot and Lichtfeld Studio run in parallel as two independent trainers, and we cross-compare their results to pick the cleaner one.",
    toolchain: ["Multi-camera rig", "COLMAP", "Postshot", "Lichtfeld Studio", "Spark"],
    items: [
      {
        name: "3D Gaussian Splatting",
        ref:  "Kerbl et al., SIGGRAPH 2023 · rendered in-browser via @sparkjsdev/spark",
        note: "The render primitive: per-splat ellipsoidal Gaussians + spherical-harmonic view-dependent colour. The composed garden ends up as a single .splat asset, rasterised in real time by Spark on Three.js + WebGL 2.",
      },
      // The pipeline that turns the captured Unreal scene into the
      // shipping .splat used to live as four separate items (Capture,
      // Pose reconstruction, Splat training parallel, Splat
      // optimization). Each was a single short paragraph, which the
      // drawer rendered as four un-foldable prose blocks taking up
      // significant vertical real estate before the reader could
      // even see the Artistic 3DGS card below. Consolidated into
      // one accordion-foldable card whose keyPoints carry the same
      // four stages as bullet rows — same information, ~1/4 the
      // expanded height when closed, and the source reference for
      // the COLMAP loader is preserved in the footer.
      {
        name:      "Capture and training pipeline",
        ref:       "Multi-camera capture · COLMAP poses · parallel training · Houdini GSOP cleanup",
        toolchain: ["Multi-camera rig", "COLMAP", "Postshot", "Lichtfeld Studio", "Houdini GSOP"],
        output:    "Optimized 3DGS · ≈ 3M splats · ships as public/SplatGarden_PC.splat",
        note:      "How the dressed Unreal scene becomes the splat you're looking at: photographed at the rig, solved into 990 camera poses by COLMAP, fitted in parallel by Postshot and Lichtfeld Studio, then decimated by Houdini's Gaussian Splat Operators to fit a real-time budget.",
        keyPoints: [
          { key: "Capture",         value: "The whole Unreal scene is photographed at a multi-camera array; every frame feeds the downstream pose solver and trainers." },
          { key: "Pose reconstruction", value: "COLMAP solves intrinsics and extrinsics for every capture frame; the resulting 990 camera poses feed both trainers and double as the Training Cameras overlay in Tech Spec." },
          { key: "Parallel training",   value: "Two trainers fit the captured frames into a 3D Gaussian Splat at the same time. Postshot is the artist-driven path; Lichtfeld is the studio's in-house pipeline. The cleaner output moves on to optimization." },
          { key: "Optimization",        value: "Houdini's GSOP (Gaussian Splat Operators) toolset prunes outlier splats and merges redundant low-opacity points, bringing the count down to about 3M without a visible quality loss." },
        ],
        source:    "src/colmap-loader.js:50",
      },
      {
        // Deployment story — bridges the trainer output (Postshot's
        // raw Gaussian field) to what actually ships in the browser.
        // Same pipeline originally targeted Unreal Engine 5 (see the
        // SIGGRAPH 2026 poster "Deploying World Models in Real Time:
        // Artistic 3DGS via USD Voxelization"); this web viewer is
        // the browser port. Two processCards: 01 walks the training
        // stages visually (the three Postshot screenshots cover the
        // raw initialization → cleanup → residual sparse point
        // cloud); 02 shows the USD-voxel + point-cloud composite
        // that the 3DGS/USD panel re-exposes as live layers.
        name:      "Artistic 3DGS · USD voxelization",
        ref:       "Postshot training → USD voxel + point-cloud overlay → real-time deployment",
        toolchain: ["Postshot", "USD PointInstancer", "LiDAR Point Cloud", "Spark · web playback"],
        output:    "Real-time 3DGS with USD-deployable structure + atmosphere layers",
        note:      "The trained splat is the seed for an artistic deployment pipeline. Postshot's cleanup brings a chaotic initial radiance field down to a usable Gaussian field; USD voxelization then composites the cleaned splat with a complementary point-cloud overlay so collision-bearing voxels carry structure while transparent points carry atmospheric scatter. The same dual-layer system originally targeted Unreal Engine 5 — this browser viewer is the web port of the same approach, with the voxel and point-cloud surfaces re-exposed in the 3DGS / USD panel.",
        processCards: [
          {
            eyebrow:     "01 · TRAINING",
            description: "Postshot's optimizer starts from a chaotic radiance-field initialization and progressively shapes the Gaussian field against the 990 COLMAP-recovered camera poses. The cleanup pass prunes outlier splats so the dense Gaussian field reads cleanly; the third frame overlays the camera trajectory recovered by COLMAP, the spatial scaffold Postshot uses to anchor every optimization step.",
            rows: [
              { layout: "pair", aspectRatio: "16 / 9", items: [
                { src: `${BASE}textures/3dgs/3dgs-before-cleanup.webp`, caption: "Before Cleanup" },
                { src: `${BASE}textures/3dgs/3dgs-after-cleanup.webp`,  caption: "After Cleanup" },
              ]},
              { layout: "single", items: [
                { src: `${BASE}textures/3dgs/3dgs-pointcloud.webp`, caption: "Camera trajectory" },
              ]},
            ],
          },
          {
            eyebrow:     "02 · DEPLOYMENT",
            description: "USD voxelization composites the trained splat with a complementary point-cloud overlay. The voxel layer (USD PointInstancer) carries solid structure for collision and geometry; the point-cloud layer adds atmospheric scatter and a stylised skybox feel. Both surfaces are toggleable in the 3DGS / USD panel of this viewer.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/3dgs/3dgs-pointcloud-overlay.webp`, caption: "PointCloud Overlay on 3DGS" },
              ]},
            ],
          },
        ],
      },
    ],
  },

  {
    section:   "Production",
    group:     "layer",
    // Sequential reading-order chip — see the matching comment on the
    // 3DGS section above. "02" places Production as the second detail
    // section after Overview; the per-asset authoring sits behind the
    // 3DGS layer the viewer sees first.
    pillarIdx: 2,
    desc:      "Per-object authoring plus Unreal scene assembly. Everything that goes into the dressed scene before the camera turns on.",
    toolchain: ["Houdini", "SpeedTree", "VAT bake", "Python · OSC", "Unreal Engine 5", "Perforce"],
    items: [
      {
        name: "Scene assembly",
        ref:  "Unreal Engine 5 · every asset set-dressed into one scene",
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
        // Keywords expanded to surface the AI stack — the AI Models
        // and Technique block at the bottom of the card relies on the
        // reader recognising ControlNet / IP-Adapter / AdaIN / SDXL.
        // HP AI Studio is the host environment the tool runs in.
        toolchain: [
          "HP AI Studio",
          "SDXL",
          "ControlNet",
          "IP-Adapter",
          "AdaIN",
          "Python",
          "Houdini",
          "Unreal Engine 5",
        ],
        output:    "Stylized terrain · painterly base colour + Houdini COP-adjusted height + normal map",
        note:      "Whole-scene base ground. Two materials (dirt and grass) each pass through the same AI stylization pipeline. The inputs are an original photographic texture plus a chosen painterly style reference, and the output is a painterly base color produced by ControlNet, IP-Adapter, AdaIN, and SDXL. Dirt is further refined in a Houdini COPNET to balance color and paint in scattered surface detail. Final terrain is authored in Unreal Engine 5 and dressed into the scene before the 3DGS capture stage.",
        embed: {
          src:   "https://player.vimeo.com/video/1194203694?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
          label: "Final rendered landscape · in-scene",
          title: "Shot4B_MontyVersion_4.53_1",
          // Re-rendered at 16:9 — Vimeo's current embed markup ships
          // at `width="1920" height="1080"`. (The earlier 2048×452
          // ultrawide cut was retired.) This explicit value is the
          // first-paint hint; vimeo-fit.js then confirms / refines
          // it once the Player API reports actual dimensions.
          aspectRatio: "16 / 9",
        },
        // Step-style processCards — matches Grape Hyacinth / Daffodil /
        // Foliage pattern. Three numbered sections:
        //   01 — TEXTURE STYLIZATION  hero stylized-landscape plate
        //                             explains the pipeline overview
        //   02 — DIRT                 original + reference pair, then
        //                             A/B compare (original ↔ stylized)
        //   03 — GRASS                same shape as Dirt
        // A/B compare slider (the `compare` row layout) is used for the
        // before/after stylization — user direction "可以用ab compare".
        // Style Reference is paired ALONGSIDE the original (both are
        // inputs to the AI tool) so the reader sees what went IN before
        // wiping between INPUT and OUTPUT in the compare row below.
        processCards: [
          {
            eyebrow:     "01 · TEXTURE STYLIZATION",
            title:       "Painterly Ground Pipeline",
            description: "The whole-scene base ground passes through a stylized texture pipeline: photographic ground texture + chosen painterly style reference are fed into an AI stack (ControlNet edge-respecting · IP-Adapter style transfer · AdaIN color preservation · SDXL final generation), which produces the painterly base color. Dirt gets an extra Houdini COPNET pass to balance color and paint in surface detail.",
            // Hero plate is the in-scene final output (foliage-dressed
            // painterly ground), per user direction to use the
            // TextureStylization_FinalOutput source. Earlier this slot
            // used LandScape_Stylized.png — the wider stylized landscape
            // reference — but the new file is the actual "Final Output"
            // shot from the user's reference design, showing the
            // stylized ground in-scene with daffodil + grape hyacinth
            // foliage on top. LandScape_Stylized.png is left in the
            // public/ folder for now in case it's needed elsewhere.
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/landscape/landscape-final-output.webp`, caption: "Final Output · stylized ground in-scene" },
              ]},
            ],
          },
          {
            eyebrow:     "02 · DIRT",
            title:       "Dirt · Style Transfer and Houdini Refinement",
            description: "Photographic dirt tile + a blue-toned painterly reference feed into the AI stack. Resulting base color goes through Houdini COPNET for color balance and detail painting.",
            rows: [
              // Inputs: original + style reference, both 1:1 squares.
              { layout: "pair", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/landscape/dirt-original.webp`,  caption: "Original texture" },
                { src: `${BASE}textures/landscape/dirt-reference.webp`, caption: "Style reference" },
              ]},
              // A/B wipe between the photographic original and the
              // AI-stylized + COP-refined base color.
              { layout: "compare", items: [
                {
                  before: `${BASE}textures/landscape/dirt-original.webp`,
                  after:  `${BASE}textures/landscape/dirt-stylized-basecolor.webp`,
                  labelA: "Before: Photographic dirt",
                  labelB: "After: AI-stylized + Houdini COP",
                },
              ]},
            ],
          },
          {
            eyebrow:     "03 · GRASS",
            title:       "Grass · Style Transfer",
            description: "Photographic grass tile + a warm-toned painterly reference feed into the same AI stack, producing the painterly grass base color used across the terrain.",
            rows: [
              { layout: "pair", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/landscape/grass-original.webp`,  caption: "Original texture" },
                { src: `${BASE}textures/landscape/grass-reference.webp`, caption: "Style reference" },
              ]},
              { layout: "compare", items: [
                {
                  before: `${BASE}textures/landscape/grass-original.webp`,
                  after:  `${BASE}textures/landscape/grass-stylized-basecolor.webp`,
                  labelA: "Before: Photographic grass",
                  labelB: "After: AI-stylized",
                },
              ]},
            ],
          },
        ],
        // AI Models and Technique — the four pieces of the stack each
        // get a one-liner explaining their role. Reads as a quick-
        // reference glossary after the per-material walkthroughs above.
        keyPoints: [
          { key: "ControlNet (Canny or Tile)",     value: "Detects edge lines from the sketch and forces the generator to respect those shapes during generation." },
          { key: "IP-Adapter",                     value: "Analyzes the reference image and transfers its style, color, and mood to the output." },
          { key: "AdaIN (Adaptive Instance Norm)", value: "Transfers just colors from the original texture directly to the final output to preserve the original palette." },
          { key: "Stable Diffusion XL (SDXL)",     value: "The core image generation AI, responsible for synthesizing the final painterly output." },
        ],
      },
      // Particles — sits adjacent to Landscape because both are
      // garden-WIDE ambient passes (Landscape is the static base
      // ground, Particles is the moving FLIP fluid pass that drifts
      // across the dressed scene). Reading the two back-to-back gives
      // the observer the "ambient layer" of the production stack
      // before drilling into per-asset architecture (Gazebo, Statue,
      // Vine, foliage). worldPos taken directly from the artist tool's
      // position widget — same convention as Landscape and the rest
      // of the Production hotspots; AssetHoverManager flips Z
      // internally to match Three.js's -Z-forward camera.
      {
        name:      "Particles",
        location:  "Garden-wide FX",
        worldPos:  [-1.871, -0.653, 0.483],
        // Keywords surface the Houdini FLIP stack — fluid sim with a
        // custom velocity field driven from image-traced curves, plus
        // VEX wrangling for the post-solve color transfer.
        toolchain: [
          "Houdini",
          "Particle Simulation",
          "FLIP Simulation",
          "Fluid",
          "VEX",
        ],
        output:    "Houdini FLIP particle simulation · final pass rendered in Karma",
        note:      "Garden-wide particle pass. A contained Houdini FLIP simulation whose velocity field is art-directed by image-traced guide curves, then colour-transferred onto the particles post-solve. The final pass is rendered in Karma alongside the dressed garden.",
        // Step-style processCards — show → show → show → tell:
        //   01 — FINAL RENDER  hero playback (Karma offline render).
        //   02 — BREAKDOWN     one composite Vimeo clip stacking
        //                      Volume Trail (top) + Volume velocity
        //                      (bottom) — the source video is already
        //                      a 2-up portrait composite at 960×1080,
        //                      so it goes in as a single layout with
        //                      the literal 960/1080 aspect (vimeo-fit
        //                      refines once the Player API confirms).
        //   03 — XR-STAGE VIEW load-test playback of the FLIP particle
        //                      sim on the on-set XR LED stage that the
        //                      final piece targets — "where the work
        //                      lives" context after the hero + sim
        //                      breakdown, before the closing bullets.
        //   04 — KEY PROCESS   three bullets describing the contained
        //                      FLIP setup. Inline **bold** surfaces the
        //                      named Houdini nodes / concepts (FLIP,
        //                      Volume Velocity from Curves, Attribute
        //                      Copy) within the bullet prose. No group
        //                      heading: the bullets live directly under
        //                      the "04 · KEY PROCESS" eyebrow to match
        //                      the Figma reference, which shows
        //                      Key Process → bullets without any subhead
        //                      between.
        processCards: [
          {
            eyebrow:     "01 · FINAL RENDER",
            description: "Final pass of the FLIP particle simulation rendered against the dressed garden scene in Karma.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1195047170?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption:     "Particle Render in Karma",
                alt:         "Garden FLIP particle simulation final render in Karma",
                aspectRatio: "16 / 9",
              }]},
            ],
          },
          {
            eyebrow:     "02 · BREAKDOWN",
            description: "A two-pass breakdown. Volume Trail (top) visualises the FLIP velocity field, and Volume velocity (bottom) shows the volume-velocity-from-curves field driving the sim.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1195047168?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption:     "Volume Trail · Volume velocity",
                alt:         "FLIP breakdown · Volume Trail velocity field plus Volume velocity from curves",
                // Source clip is a 2-up portrait composite at 960×1080
                // (Volume Trail stacked above Volume velocity).
                aspectRatio: "960 / 1080",
              }]},
            ],
          },
          {
            // XR-Stage View sits after the breakdown because it's the
            // "where it lives" beat: same sim, but seen playing back
            // on the on-set LED volume that the final piece targets.
            // The hero Karma render up top answers "what does it look
            // like?"; this answers "where does it deploy?". Closes the
            // visual sequence before Key Process drops the text bullets.
            //
            // No title / description on this card — the eyebrow plus
            // the caption "Particle Load Test" under the video already
            // names the beat completely, and the reference Figma
            // intentionally leaves the prose slot empty so the video
            // owns the breath of the section. Matches sections 03/04
            // text "一模一样" per the user reference.
            eyebrow:     "03 · XR-STAGE VIEW",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1195059511?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption:     "Particle Load Test",
                alt:         "FLIP particle sim load test on the on-set XR LED stage",
                aspectRatio: "16 / 9",
              }]},
            ],
          },
          {
            // Key Process closes the card with the four-line Houdini
            // glossary. No title / description on top of the eyebrow —
            // the eyebrow ("04 · KEY PROCESS") IS the section name, and
            // the group's own "Houdini Simulation" subhead introduces
            // the bullets directly underneath. The reference Figma
            // shows this same minimal stack: header → subhead →
            // bullets, with no descriptive prose between them.
            //
            // Single ungrouped block — the FLIP pipeline reads as one
            // coherent sequence (collision tuning → velocity field
            // shaping → color transfer) rather than parallel sub-systems
            // like Gazebo's Simulation Mask + Velocity from Pyro pair,
            // so a single bullet list under the eyebrow tells the story
            // cleanly. The Figma reference shows the same flat shape.
            eyebrow:     "04 · KEY PROCESS",
            groups: [
              {
                items: [
                  "Designed a contained **FLIP** particle sim, tuning collision and dissipation for partial confinement within a sealed boundary.",
                  "Drove the FLIP velocity field via **Volume Velocity from Curves**, using image-traced guide curves to art-direct the flow.",
                  "Transferred color attributes onto simulated particles post-solve using **Attribute Copy.**",
                ],
              },
            ],
          },
        ],
      },
      {
        name:      "Gazebo",
        location:  "Centerpiece",
        // X shifted -0.58 → -0.18 (net +0.4: +1 from the first nudge,
        // then −0.6 from the follow-up correction) — final pose sits
        // just to the right of the statue silhouette, on the open
        // gazebo column rather than over the statue itself.
        worldPos:  [-0.18, -0.561, 3.774],
        // Keywords updated to surface the full Houdini sim stack —
        // particle + pyro + VEX scripting + Axiom solver + the
        // Gaussian Splat ops (GSOPs) + Lichtfeld Studio capture.
        toolchain: [
          "Houdini",
          "Particle Simulation",
          "Pyro Simulation",
          "VEX",
          "Axiom",
          "Gaussian Splat",
          "GSOPs",
          "Lichtfeld Studio",
        ],
        output:    "3DGS centerpiece · particle + pyro driven splat dynamics",
        note:      "The garden's central architecture. Authored in Houdini as a 3DGS simulation. Particle and pyro sims drive splat dynamics via VEX expressions and the Axiom solver, then the resulting Gaussian Splat is dressed into the Unreal scene before the Lichtfeld Studio capture stage.",
        // Step-style process cards — three numbered sections:
        //   01 Final Render — hero playback of the simulated gazebo
        //   02 Breakdown — multi-panel walkthrough of the Houdini graph
        //   03 Key Process — grouped bullets on the technical setup
        //     (Simulation Mask + Velocity from Pyro)
        // Replaces the previous single `embed` field. Both videos are
        // user-provided Vimeo URLs; aspectRatio is the first-paint
        // hint, vimeo-fit.js refines once the Player API reports back.
        processCards: [
          {
            eyebrow:     "01 · FINAL RENDER",
            title:       "Gazebo · 3DGS Simulation",
            description: "Particle + pyro simulation drives splat dynamics in Houdini, baked and dressed into the Unreal scene for the Lichtfeld Studio capture.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1194895698?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption:     "Final render · particle FX on the gazebo",
                alt:         "Gazebo final render with particle and pyro simulation",
                aspectRatio: "16 / 9",
              }]},
            ],
          },
          {
            eyebrow:     "02 · BREAKDOWN",
            description: "A three-panel breakdown covering the mask source on the gazebo geometry, the color transfer onto the Gaussian Splat, and the emission group creation from those masks.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1194895699?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption:     "Mask source · color transfer · emission group",
                alt:         "Gazebo simulation breakdown · Houdini graph walkthrough",
                aspectRatio: "16 / 9",
              }]},
            ],
          },
          {
            eyebrow:     "03 · KEY PROCESS",
            description: "How the gazebo's flower-growth FX is built up step by step in Houdini.",
            // Grouped bullets — each subheading carries its own
            // bullet list. Schema lives on processCards as `groups`;
            // inline `**bold**` is parsed by escapeHtmlInlineBold
            // so individual node / plugin names stand out within
            // the bullet prose.
            groups: [
              {
                heading: "Simulation Mask",
                items: [
                  "Apply **Attribute Transfer node** to transfer color attribute (@Cd) from the source to the main object (the gazebo).",
                  "Group points based on masks to limit the area of particle emission.",
                ],
              },
              {
                heading: "Velocity from Pyro",
                items: [
                  "Use pyro simulations from **Axiom** plugin on multiple pyro sources to drive particles velocity.",
                ],
              },
            ],
          },
        ],
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
        // `note` is the only Statue-card prose that the processCards
        // don't already cover — they describe the VAT + Houdini-GS
        // stages each in isolation; this one-liner adds the live
        // MediaPipe interaction context (which the static images
        // can't show). Per the audit: trimmed from the longer
        // duplicate that restated the section descriptions.
        note:      "Left-hand pinch in the live MediaPipe session scrubs the VAT playback during the shoot, so the statue's animation responds to the operator's gesture in real time.",
        // Step-style process cards — two sections matching the user
        // reference design. Both videos are user-provided Vimeo URLs.
        // aspectRatio is the first-paint hint; vimeo-fit.js refines to
        // the clip's actual ratio once the Vimeo Player API reports back.
        processCards: [
          {
            eyebrow:     "01 · FINAL RESULT",
            title:       "Unreal Engine 5 · VAT",
            description: "A statue animation produced through a particle-sprite VAT pipeline that pre-bakes simulation data into textures for lightweight, GPU-driven playback at runtime.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1194884976?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption:     "Statue · UE5 VAT playback",
                alt:         "Statue VAT animation playing in Unreal Engine 5",
                aspectRatio: "4 / 3",
              }]},
            ],
          },
          {
            eyebrow:     "02 · HOUDINI SIMULATION",
            title:       "Houdini · Gaussian Splat",
            description: "Animated Gaussian Splat with particle and pyro simulation, then rendered with V-RAY in Houdini.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1194884977?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption:     "Houdini particle + pyro sim · 3DGS render",
                alt:         "Statue Houdini Gaussian Splat simulation, V-RAY render",
                aspectRatio: "16 / 9",
              }]},
            ],
          },
        ],
        // Citation for the source statue model used as the base mesh
        // before the particle/pyro sim. Renders in the existing small
        // mono footer slot at the bottom of the asset card.
        source: "Statue: Leartes Studios, Roman Statues Pack Vol 1 (cosmos.leartesstudios.com/environments/roman-statues-pack-vol1)",
      },
      {
        name:      "Vine",
        location:  "Near gazebo",
        worldPos:  [-0.89, -0.926, 3.258],
        // Keywords surface the Unreal stack that drives the vine —
        // Motion Design plugin + the WPO material + the Cloner /
        // Effector combo that scatters the bloom assets.
        toolchain: [
          "Unreal Engine 5",
          "Motion Design plugin",
          "WPO material",
          "Cloner + Effectors",
          "Blueprint",
        ],
        output:    "Procedural vine growth · WPO-driven mesh deformation + Cloner-scattered blooms",
        note:      "Procedural vine system built in Unreal Engine 5's Motion Design plugin, following the Growing Roots with WPO tutorial. A custom material drives mesh deformation through World Position Offset; Motion Designer's Cloner + Effectors scatter and animate the bloom assets along the vine. Growth is exposed as Blueprint parameters so the whole system can be triggered interactively in-scene.",
        // Existing vine growth video stays at top as the "Final Render"
        // intro. processCards render below it (the asset-hover.js order
        // was moved so embeds come BEFORE processCards).
        embed: {
          src:   "https://player.vimeo.com/video/1194222092?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
          label: "Vine growth · Unreal MG + WPO shader",
          title: "Shot4B_VineAnimation",
          // The Vimeo embed markup ships at padding-top:75% (4:3) but
          // the underlying clip is rendered at 16:9 — same Vimeo
          // template-default trap the Landscape clip hit. Forcing the
          // iframe to 16:9 makes the gazebo content tile edge-to-edge
          // inside the card with no top/bottom black letterbox bars.
          aspectRatio: "16 / 9",
        },
        // Step-style processCards mirror the reference design:
        //   01 — FINAL RESULT IN THE SCENE       hero gazebo plate + summary
        //   02 — WPO DYNAMIC MATERIAL BLUEPRINT  node graph + 5 in-section bullets
        //   03 — PLANT GROW ON THE VINE          assets + cloner/effector scene
        // Section 02 uses the new per-card `points` field for the
        // blueprint-specific bullet list (UV Directional Masking /
        // Vertex Color Control / etc.) — distinct from the global
        // keyPoints at the bottom of the card.
        processCards: [
          {
            eyebrow:     "01 · FINAL RESULT IN THE SCENE",
            description: "Combined Unreal Engine's Motion Design plugin with the workflow demonstrated in the Growing Roots with World Position Offset (WPO) tutorial to develop a procedural vine system with controllable growth animation. Blueprint-controlled parameters drive vine growth behavior, enabling interactive real-time triggering and directional vine expansion within the environment.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/vine/vine-final-scene.jpg`, caption: "Gazebo dressed with the procedural vine" },
              ]},
            ],
          },
          {
            eyebrow:     "02 · WPO DYNAMIC MATERIAL BLUEPRINT",
            description: "A single Unreal material drives the entire growth animation. The five inputs below combine into one interactive growth workflow that Blueprint can drive at runtime.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/vine/vine-material-blueprint.webp`, caption: "M_VineGrowth · material blueprint" },
              ]},
            ],
            points: [
              { key: "UV Directional Masking",            value: "Controls the directional flow and expansion of the vine growth." },
              { key: "Vertex Color Control",              value: "Defines growth areas and controls the blending behavior of the shader." },
              { key: "World Position Offset (WPO)",       value: "Animates the mesh deformation to simulate organic vine growth in real time." },
              { key: "Unreal Engine Material Blueprint System",  value: "Combines all procedural controls into an interactive and controllable growth workflow." },
              { key: "Procedural Vine Growth Workflow",   value: "Simulates dynamic and organic vine expansion interactively within the environment." },
            ],
          },
          {
            eyebrow:     "03 · PLANT GROW ON THE VINE",
            description: "By using the Motion Designer plugin's Cloner component, assets can be distributed onto a specific Static Mesh surface and animated with controllable growth behavior. Adding more Cloner components and assets creates a denser and more organic vine structure. An Effector controls both the transform behavior and growth animation of cloned assets, affecting each individual asset within the Cloner system. When driven through Sequencer or Blueprint, it creates directional growth effects based on movement.",
            // Side-by-side equal-height pair (16:9 each) — the two
            // diagrams read as a related diptych: STEP 1 distribution
            // → STEP 2 control. Original images were stacked and ate
            // ~70% of the section's vertical space; both also had
            // large black gutters because the source diagrams were
            // authored on a wider canvas. Now re-cropped to exact 16:9
            // and aligned in a pair row (`aspectRatio: "16 / 9"`)
            // — the pair-aspect mechanism keeps them side-by-side
            // even on phones (where pair rows would otherwise stack)
            // because the visual pairing carries meaning here:
            // distribution → control is a sequence, not two
            // independent images. Captions deliberately do NOT
            // repeat the in-image labels ("Assets Applied…",
            // "Plane Effector…") — they describe the PIPELINE STEP
            // each diagram represents, so caption + image are
            // complementary, not redundant.
            rows: [
              { layout: "pair", aspectRatio: "16 / 9", items: [
                { src: `${BASE}textures/vine/vine-assets-static-mesh.jpg`,
                  caption: "Step 1 · Cloner distributes bloom assets onto the static mesh" },
                { src: `${BASE}textures/vine/vine-cloner-effector.jpg`,
                  caption: "Step 2 · plane and sphere effectors shape scale and density" },
              ]},
            ],
          },
        ],
        // Citation for the source tutorial referenced in section 01.
        // Renders in the existing small mono footer slot at the bottom
        // of the asset card (see ah-foot in renderCard). Shortened
        // from the verbatim APA-style reference — the previous full
        // citation wrapped to 2 lines in the mono footer and looked
        // overweight against the rest of the footer rows (Output / Pos).
        source: "tharlevfx · Growing Roots with WPO (YouTube · KZX0kHSfD78)",
      },
      {
        name:      "Daffodil",
        location:  "Near gazebo",
        worldPos:  [0.08, -0.773, 2.226],
        toolchain: ["Houdini", "VAT bake", "Unreal Engine 5 (set dress)", "Python · OSC · MediaPipe", "AI texture stylization"],
        output:    "Mesh + VAT animation · interactively driven in Unreal",
        note:      "Animated procedurally in Houdini and VAT-baked, then set-dressed in Unreal. Inside the Unreal session, Python · OSC · MediaPipe drives the rig live (hand gesture → OSC → blueprint). Diffuse texture passes through the AI Texture Stylization tool from L1.",
        // Existing VAT + OSC interaction video stays at its current
        // position (top of the card body, right after Keywords).
        // processCards now render AFTER embeds per the updated order
        // in asset-hover.js / tech-spec.js, so the new Houdini Simulation
        // + Texturing process cards slot in BELOW this video.
        embed: {
          src:   "https://player.vimeo.com/video/1191203670?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
          label: "VAT + OSC interaction",
          title: "VAT",
        },
        // Step-style process cards — matches Landscape's pattern (top
        // embed is the implicit hero render; numbered sections start at
        // 01 and tell the breakdown story). Three sections:
        //   01 Houdini Simulation — KineFX + Vellum growth animation
        //   02 Stylization — AI Stylized + Substance Painter
        //   03 PBR Pipeline — full PBR map set
        processCards: [
          {
            eyebrow:     "01 · HOUDINI SIMULATION",
            description: "In Houdini, KineFX and Vellum were used to create a natural, organic growth animation for the daffodil, preparing it for interaction.",
            rows: [
              // Two videos side-by-side at matched 16:9 — user-provided
              // Vimeo URLs. Equal-height via the pair aspectRatio opt-in
              // so the 1920×1080 sources line up cleanly even on phones
              // (the [style*=--pair-aspect] override keeps them in a row
              // at narrow widths instead of stacking).
              { layout: "pair", aspectRatio: "16 / 9", items: [
                {
                  iframeSrc: "https://player.vimeo.com/video/1194883065?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                  caption: "Close up Stamen",
                  alt: "Daffodil close-up stamen Houdini simulation",
                },
                {
                  iframeSrc: "https://player.vimeo.com/video/1194883066?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                  caption: "Daffodil Animation",
                  alt: "Daffodil full growth Houdini simulation",
                },
              ]},
            ],
          },
          {
            // Combined STYLIZATION + PBR PIPELINE — the previous split
            // (sections 02 + 03) put the SP refined render and its PBR
            // maps in different cards even though they describe the
            // same end-state output, which made the reader scroll back
            // and forth to connect "the textured daffodil" with "the
            // 4 maps that produced it". New shape keeps the whole
            // stylization story in one card and uses A/B compare
            // sliders for the actual transformation beats: drag once
            // to see the AI stylization, drag again at the texture
            // level. The SP refined daffodil then anchors the bottom
            // with its PBR map set inline, so the reader sees the
            // final shaded result and the maps that built it in the
            // same eye-pass.
            eyebrow:     "02 · STYLIZATION",
            title:       "AI Stylized + Substance Painter",
            description: "Diffuse runs through a two-stage stylization pipeline. Substance Painter paints the base color, the in-house AI texture stylization tool converts that base into a painterly version, and then back into Substance Painter for refinement and the full PBR map set.",
            rows: [
              // Headline compare — same daffodil pose, drag reveals
              // the AI-stylized painterly look replacing the original
              // shading. Aspect locked to 3:4 so the two cells align
              // exactly under the wipe handle (the source renders
              // have slightly different native aspect ratios; the
              // compare slider requires identical framing to read).
              { layout: "compare", aspectRatio: "3 / 4", items: [
                {
                  before: `${BASE}textures/daffodil/daffodil-original-render.webp`,
                  after:  `${BASE}textures/daffodil/daffodil-ai-render.webp`,
                  labelA: "Original",
                  labelB: "AI Stylized",
                },
              ]},
              // Texture-level compare — the same transformation viewed
              // at the diffuse-map data level. Square aspect since the
              // swatches are 1:1 native. Sub-heading separates this
              // beat from the render compare above so the reader sees
              // "shaded result" and "underlying texture" as parallel
              // proofs of the same stylization pass.
              { heading: "Base color texture", layout: "compare", aspectRatio: "1 / 1", items: [
                {
                  before: `${BASE}textures/daffodil/daffodil-original-swatch.webp`,
                  after:  `${BASE}textures/daffodil/daffodil-ai-swatch.webp`,
                  labelA: "Original",
                  labelB: "AI Stylized",
                },
              ]},
              // Second transformation compare — AI Stylized ↔ SP+AI
              // refined final. Completes the two-step pipeline story
              // (Original → AI Stylized → SP+AI refined): the first
              // compare above shows the AI stylization landing on the
              // base; this one shows the Substance Painter refinement
              // pass adding brush detail and edge break-up on top.
              // Same 3:4 aspect as compare 1 so the two transformation
              // beats line up visually as a parallel pair of "before/
              // after" reveals.
              { heading: "Substance Painter + AI Stylized Tool", layout: "compare", aspectRatio: "3 / 4", items: [
                {
                  before: `${BASE}textures/daffodil/daffodil-ai-render.webp`,
                  after:  `${BASE}textures/daffodil/daffodil-sp-final.webp`,
                  labelA: "AI Stylized",
                  labelB: "SP Refined",
                },
              ]},
              // PBR map set sits inline below the refined render so
              // the reader can scan render-then-maps in one motion.
              // 4 maps at desktop, collapses to 2x2 at narrow widths.
              // No row heading here — visually flows with the SP row
              // above as the same "refined output" group.
              { layout: "quad", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/daffodil/daffodil-basecolor.webp`,   caption: "BaseColor" },
                { src: `${BASE}textures/daffodil/daffodil-normal.webp`,      caption: "Normal" },
                { src: `${BASE}textures/daffodil/daffodil-orm.webp`,         caption: "ORM" },
                { src: `${BASE}textures/daffodil/daffodil-scattermask.webp`, caption: "ScatterMask" },
              ]},
            ],
            // Three-step pipeline summary anchored at the end of the
            // card. Mirrors the user's reference design where the
            // "Daffodil texture pipeline" bullets sit directly under
            // the image rows. Distinct from the global per-asset
            // keyPoints below (which describe the broader Houdini +
            // SP + AI stack); these three lines focus on the SP/AI
            // loop specifically.
            groups: [
              {
                heading: "Daffodil texture pipeline",
                items: [
                  "Base color painted in **Substance Painter**, exported as base color map.",
                  "**AI stylization tool** generates a stylized version from the export.",
                  "Back into **Substance Painter** for refinement and detail painting.",
                ],
              },
            ],
          },
        ],
        keyPoints: [
          { key: "Houdini",           value: "KineFX rig + Vellum cloth solver produce a natural, organic growth animation, then baked to a Vertex Animation Texture (VAT) for real-time playback in Unreal." },
          { key: "Substance Painter", value: "Base color painted in Substance Painter → exported as the source diffuse." },
          { key: "AI stylization",    value: "The AI texture stylization tool from L1 generates a painterly version from the Substance Painter export." },
          { key: "Refinement",        value: "AI-stylized base goes back into Substance Painter for detail painting and the full PBR set (Normal · ORM · ScatterMask)." },
        ],
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
            eyebrow:     "01 · PROCEDURAL TOOL",
            title:       "Houdini Tool · Procedural Grape Hyacinth",
            description: "A fully procedural setup that grows the flower from parameters. The distribution of florets along the primary stem follows the golden angle of 137.5°, consistent with the phyllotaxis observed in natural inflorescence structures.",
            rows: [
              { layout: "single", items: [{
                iframeSrc: "https://player.vimeo.com/video/1193813472?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption: "Network and viewport showcase",
                alt: "Houdini procedural grape-hyacinth tool · network plus viewport",
              }]},
            ],
          },
          {
            eyebrow:     "02 · ANIMATION",
            title:       "Vertex Animation Texture (VAT)",
            description: "A grape hyacinth animation produced through a VAT pipeline that bakes vertex motion into textures for smooth real-time playback.",
            rows: [
              { layout: "single", items: [{
                iframeSrc: "https://player.vimeo.com/video/1187001709?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=0&loop=1",
                caption: "Preliminary VAT Animation",
                alt: "Grape hyacinth VAT animation · preliminary playback",
              }]},
            ],
          },
          {
            eyebrow:     "03 · TEXTURING",
            title:       "AI-Stylized Textures",
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
                    before: `${BASE}textures/grapehyacinth/gh-bud-before.webp`,
                    after:  `${BASE}textures/grapehyacinth/gh-bud-after.webp`,
                    labelA: "Before: Procedural base",
                    labelB: "After: AI-stylized oil paint",
                  },
                  {
                    before: `${BASE}textures/grapehyacinth/gh-leaves-before.webp`,
                    after:  `${BASE}textures/grapehyacinth/gh-leaves-after.webp`,
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
        name:      "Foliage",
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
        // Step-style processCards — editorial pattern (eyebrow + bold
        // title + prose description + media rows), matches Grape Hyacinth.
        // Narrative arc per user direction "先放最好看的照片 再放breakdown":
        //   01 hero — the in-scene final render leads, hooks the reader
        //   02 modeling + decimation breakdown
        //   03 Substance Designer stylization graph
        // Frames inherit natural image height (see .ah-pc-fig .ah-frame
        // { aspect-ratio: auto } in style.css), so the wide landscape
        // hero plate no longer letterboxes inside a forced 1:1 plinth.
        processCards: [
          {
            eyebrow: "01 · REAL-TIME READY FOLIAGE",
            description: "640-triangle scatter cards dressed in the painterly Substance diffuse, lit by the same HDRI as the rest of the garden. The whole foreground daisy band ships at interactive frame rate on a desktop GPU without any per-frame foliage update. Below is how the asset got from a 28,557-triangle SpeedTree source to this real-time-ready plate.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-final-result.webp`, caption: null, alt: "Stylised daisy field · final in-scene render" },
              ]},
            ],
          },
          {
            eyebrow: "02 · MODELING & OPTIMIZATION",
            description: "To maintain stable and usable FPS performance, all foliage assets need to be carefully optimized.",
            rows: [
              // aspectRatio locks both pair cells to 16:9 so the
              // modeling shot (942×776, ~1.21) and the node graph
              // (993×489, ~2.03) — wildly different source aspects —
              // align at the SAME height. Both images use
              // object-fit: cover; the modeling shot crops a sliver
              // top/bottom, the node graph crops a sliver left/right.
              // Per user direction: "用justify的形式在同一行，相同height".
              { layout: "pair", aspectRatio: "16 / 9", items: [
                { src: `${BASE}textures/daisy/daisy-modeling-speedtree.webp`,  caption: "Modeling in Speedtree" },
                { src: `${BASE}textures/daisy/daisy-speedtree-nodegraph.webp`, caption: "Procedural Plant Generation in SpeedTree" },
              ]},
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-optimization.jpg`, caption: "Optimization" },
              ]},
            ],
          },
          {
            eyebrow: "03 · STYLIZATION",
            description: "This was also another exploration of stylized workflows in Substance Designer, inspired by the article \"Breakdown: Making 3D Landscape Look Like Painting\" from 80 Level, which demonstrates a procedural approach to creating stylized textures.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-substance-nodegraph.webp`, caption: "Substance Designer Stylized Procedural Node Graph" },
              ]},
              // Both before/after are near-square sources (837×786 ≈ 1.06,
              // 1087×1081 ≈ 1.005). Locking pair to 1:1 forces exactly
              // identical height with sub-pixel crop on the before-edge —
              // imperceptible, and resolves the slight before/after
              // height drift visible in natural-aspect mode.
              { layout: "pair", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/daisy/daisy-substance-before.webp`, caption: "Before Procedural Stylization" },
                { src: `${BASE}textures/daisy/daisy-substance-after.webp`,  caption: "After Procedural Stylization" },
              ]},
            ],
          },
        ],
        note:      "Real-time-ready foliage authored procedurally in SpeedTree, then aggressively decimated (28,557 → 640 triangles) so the scattered plant cards survive an interactive FPS budget without visible quality loss. A Substance Designer stylization graph produces the painterly diffuse and leaf atlas. The look mirrors the Landscape texture pipeline and is inspired by 80 Level's \"Making 3D Landscape Look Like Painting\" breakdown.",
      },
      {
        name:      "Tree",
        location:  "Near gazebo",
        toolchain: ["SpeedTree", "Unreal Engine 5 (set dress)"],
        note:      "Procedural tree authored in SpeedTree, dressed into the Unreal scene before the env capture.",
        // Third-party marketplace asset rather than in-house authoring,
        // so this is the only Production item that surfaces an external
        // citation. The `source` field renders as the small mono footer
        // under the note; we wrap the URL in an <a> so the credit is
        // clickable, and target="_blank" + rel="noopener" keep the
        // viewer's session intact when the reader opens the listing.
        source:    `Asset: <a href="https://www.fab.com/listings/21c3786d-bc4a-472f-bace-70e40b2f01dc" target="_blank" rel="noopener noreferrer">SpeedTree pack on Fab.com ↗</a>`,
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

  // 1. Title row — big asset name + optional location chip + hotspot toggle.
  // Asset items (those with a toolchain) get a folding accordion so the
  // long Production list reads as a scannable index of asset names; the
  // reader clicks a title to expand its full card. Non-asset items
  // (Overview pillars, the short L3 prose entries) are short enough that
  // hiding them adds friction without saving scroll, so they stay open.
  // The caret + role="button" + tabindex + aria-expanded markup live
  // ONLY on asset items; the click handler in TechSpec ignores
  // anything else, and the hotspot toggle inside the head already
  // stopPropagation()s so it doesn't accidentally fold the card.
  const head = isAsset
    ? `<header class="ts-item-head"
              role="button"
              tabindex="0"
              aria-expanded="false"
              title="Click to expand">
         <h3 class="ts-item-name">${it.name}</h3>
         ${it.location ? `<span class="ts-item-loc">${it.location}</span>` : ""}
         ${toggle}
         <span class="ts-item-caret" aria-hidden="true">▾</span>
       </header>`
    : `<header class="ts-item-head">
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
         ${Array.isArray(it.embed)
             ? it.embed.map(e => renderEmbed(e)).join("")
             : (it.embed ? renderEmbed(it.embed) : "")}
         ${renderProcessCards(it.processCards)}
         ${renderKeyPoints(it.keyPoints)}
       </div>`
    : "";

  // 6. Source — small mono footer with hairline rule above
  const source = it.source ? `<div class="ts-item-src">${it.source}</div>` : "";

  // Asset items wrap their body in `.ts-item-body` so the accordion toggle
  // has one hide target. They also start with `.collapsed` so the drawer
  // first reads as a clean list of asset titles, and the reader clicks
  // a title to expand its card. Non-asset items render the body inline
  // (no wrapper, no collapse) — they're short enough that folding adds
  // friction without saving scroll.
  const body = `${sub}${chain}${output}${note}${compare}${rich}${source}`;
  if (isAsset) {
    return `<li class="ts-item ts-item-asset collapsed">${head}<div class="ts-item-body">${body}</div></li>`;
  }
  return `<li class="ts-item">${head}${body}</li>`;
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
// Listeners live on the FRAME for pointerdown (so the grab target is the
// whole frame area, not just the 2 px handle) and on DOCUMENT for the
// follow-up pointermove / pointerup / pointercancel. The document-level
// follow-up matters specifically on iOS Safari when the compare frame
// sits inside an overflow:auto parent — which the asset hover card is
// (#asset-hover-card { overflow-y: auto }). In that arrangement
// setPointerCapture on the frame silently fails to keep tracking once
// the finger leaves the frame's bounding box (small compare frames are
// only a few hundred px wide on phone), so pointermove events stop
// arriving on the frame and the slider stays stuck at the initial tap
// position. Routing the follow-up through document.addEventListener
// removes the capture-on-frame dependency entirely.
//
// Also: an explicit touchstart with `{ passive: false }` calling
// preventDefault belt-and-suspenders against iOS's gesture-commit
// heuristic. CSS already declares `touch-action: none` on .cmp-frame,
// but in scrollable parents iOS will sometimes commit a pan gesture in
// the first few pixels of movement before the pointerdown handler
// runs; the explicit touchstart preventDefault closes that window.
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

  // Per-frame pointer state. activePid scopes the document listeners
  // to the pointer that started on this specific frame, so two
  // adjacent compare frames don't interfere with each other.
  let activePid = null;

  const onMove = (e) => {
    if (activePid === null || e.pointerId !== activePid) return;
    setAt(e.clientX);
    e.preventDefault();
  };

  const onUp = (e) => {
    if (activePid === null) return;
    if (e && e.pointerId !== undefined && e.pointerId !== activePid) return;
    activePid = null;
    document.removeEventListener("pointermove",   onMove);
    document.removeEventListener("pointerup",     onUp);
    document.removeEventListener("pointercancel", onUp);
  };

  frame.addEventListener("pointerdown", (e) => {
    // Left button / primary touch only — and don't fight other handlers
    // (e.g., the asset card's text-selection on the body).
    if (e.button !== undefined && e.button !== 0) return;
    activePid = e.pointerId;
    setAt(e.clientX);
    e.preventDefault();
    e.stopPropagation();
    // Document-level follow-up — survives the finger leaving the
    // frame's bounding box on phones, which the previous
    // frame.setPointerCapture pattern could not when the frame sat
    // inside an overflow:auto parent (asset hover card).
    document.addEventListener("pointermove",   onMove);
    document.addEventListener("pointerup",     onUp);
    document.addEventListener("pointercancel", onUp);
  });

  // Explicit touchstart preventDefault (non-passive) — see header
  // comment. Without this, iOS may commit to a scroll gesture in the
  // first few pixels of touch movement before pointerdown's
  // preventDefault has a chance to claim the gesture.
  frame.addEventListener("touchstart", (e) => {
    e.preventDefault();
  }, { passive: false });
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
        <nav class="ts-toc" aria-label="Tech Breakdown sections">
          ${TECH_SPECS.map((s, i) => `
            <button class="ts-toc-pill${i === 0 ? " active" : ""}"
                    type="button"
                    data-toc-target="${i}"
                    title="Jump to ${escapeHtml(s.section)}">${escapeHtml(s.section)}</button>
          `).join("")}
        </nav>
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

    // Asset-level accordion. Each .ts-item-asset has a clickable
    // .ts-item-head; clicking (or Enter / Space on a focused head)
    // toggles `.collapsed` on the item to show / hide its body. The
    // hotspot ON/OFF pill inside the head already stopPropagation()s
    // so it won't accidentally fold the card. Delegated on this.el
    // so the listener survives any future re-render.
    //
    // Clicks inside the body (compare slider, embed, etc.) must NOT
    // bubble up and fold the card — that would be infuriating. We
    // identify "header click" strictly via `e.target.closest('.ts-item-head')`
    // AND we walk up to the nearest `.ts-item-asset`; if that's not
    // the same node as the head's parent, ignore (defensive).
    const toggleItem = (item, btn) => {
      const now = item.classList.toggle("collapsed");
      btn.setAttribute("aria-expanded", now ? "false" : "true");
      btn.setAttribute("title", now ? "Click to expand" : "Click to collapse");
      // If we just expanded an item that contains compare frames, the
      // drag handles were wired at construction time so they still work
      // — no re-wiring needed (display:none doesn't detach listeners).
    };
    this.el.addEventListener("click", (e) => {
      // Ignore clicks that originated on an interactive child of the
      // head (the hotspot toggle button); stopPropagation in that
      // handler already prevents this from firing, but we double-check
      // in case some future child forgets.
      if (e.target?.closest?.('[data-act="toggle-hotspot"]')) return;
      const head = e.target?.closest?.(".ts-item-asset > .ts-item-head");
      if (!head || !this.el.contains(head)) return;
      const item = head.parentElement;
      toggleItem(item, head);
    });
    this.el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      // Only act when the head ITSELF has focus — not when focus is on
      // the hotspot button nested inside it. Otherwise Enter on the
      // button would fire both the button's native click AND a
      // preventDefault-blocked accordion toggle, masking the toggle's
      // click handler.
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.classList.contains("ts-item-head")) return;
      if (!e.target.parentElement?.classList.contains("ts-item-asset")) return;
      e.preventDefault();
      toggleItem(e.target.parentElement, e.target);
    });

    // Sticky TOC at the top of the drawer — table of contents pill row
    // listing every TECH_SPECS section. Two interactions:
    //   1) Click pill → smooth-scroll the body to that section's top
    //      AND auto-expand the section if it was collapsed (otherwise
    //      the click would land on a collapsed header showing nothing).
    //   2) Scroll-spy → as the user scrolls the body, the pill matching
    //      the topmost-visible section gets .active so the reader
    //      always knows where they are in the long content.
    //
    // The body is a nested scroll container (overflow-y: auto), so we
    // compute scroll target via getBoundingClientRect against the body
    // rather than scrollIntoView which would also scroll the page. rAF
    // throttles the scroll-spy so a fast flick doesn't burn the main
    // thread.
    const bodyEl = this.el.querySelector(".ts-body");
    const tocPills = Array.from(this.el.querySelectorAll(".ts-toc-pill"));
    const sectionEls = Array.from(this.el.querySelectorAll(".ts-sec"));

    tocPills.forEach(pill => {
      pill.addEventListener("click", () => {
        const idx = Number(pill.dataset.tocTarget);
        const sec = sectionEls[idx];
        if (!sec) return;
        sec.classList.remove("collapsed");
        const bodyRect = bodyEl.getBoundingClientRect();
        const secRect  = sec.getBoundingClientRect();
        const offset   = (secRect.top - bodyRect.top) + bodyEl.scrollTop;
        bodyEl.scrollTo({ top: offset, behavior: "smooth" });
      });
    });

    let _tocSpyScheduled = false;
    const updateActivePill = () => {
      _tocSpyScheduled = false;
      const bodyTop = bodyEl.getBoundingClientRect().top;
      // Pick the section whose top is at or just above the viewport's
      // top edge (offset by a small fudge so a section that just barely
      // peeked out of view still counts as "current").
      const fudge = 80;
      let activeIdx = 0;
      let bestTop  = -Infinity;
      sectionEls.forEach((sec, i) => {
        const rel = sec.getBoundingClientRect().top - bodyTop;
        if (rel <= fudge && rel > bestTop) {
          bestTop = rel;
          activeIdx = i;
        }
      });
      tocPills.forEach((p, i) => p.classList.toggle("active", i === activeIdx));
      // Keep the active pill visible inside the horizontally-scrollable
      // TOC strip — on phone where the strip overflows, the active pill
      // may otherwise be off-screen after a long scroll.
      const activePill = tocPills[activeIdx];
      if (activePill) {
        activePill.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      }
    };
    bodyEl.addEventListener("scroll", () => {
      if (_tocSpyScheduled) return;
      _tocSpyScheduled = true;
      requestAnimationFrame(updateActivePill);
    }, { passive: true });

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

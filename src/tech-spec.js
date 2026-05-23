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
        note:      "Whole-scene base ground. Two materials (dirt + grass) each pass through the same AI stylization pipeline — original photographic texture + a chosen painterly style reference go in; ControlNet + IP-Adapter + AdaIN + SDXL produce a painterly base color out. Dirt is further refined in a Houdini COPNET to balance color and paint in scattered surface detail. Final terrain authored in Unreal Engine 5 and dressed into the scene before the 3DGS capture stage.",
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
        // Step-style processCards — matches Grape Hyacinth / Daffodil /
        // Additional Foliage pattern. Three numbered sections:
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
            eyebrow:     "01 — TEXTURE STYLIZATION",
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
                { src: `${BASE}textures/landscape/landscape-final-output.png`, caption: "Final Output · stylized ground in-scene" },
              ]},
            ],
          },
          {
            eyebrow:     "02 — DIRT",
            title:       "Dirt — Style Transfer + Houdini Refinement",
            description: "Photographic dirt tile + a blue-toned painterly reference feed into the AI stack. Resulting base color goes through Houdini COPNET for color balance and detail painting.",
            rows: [
              // Inputs: original + style reference, both 1:1 squares.
              { layout: "pair", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/landscape/dirt-original.png`,  caption: "Original texture" },
                { src: `${BASE}textures/landscape/dirt-reference.png`, caption: "Style reference" },
              ]},
              // A/B wipe between the photographic original and the
              // AI-stylized + COP-refined base color.
              { layout: "compare", items: [
                {
                  before: `${BASE}textures/landscape/dirt-original.png`,
                  after:  `${BASE}textures/landscape/dirt-stylized-basecolor.png`,
                  labelA: "Before: Photographic dirt",
                  labelB: "After: AI-stylized + Houdini COP",
                },
              ]},
            ],
          },
          {
            eyebrow:     "03 — GRASS",
            title:       "Grass — Style Transfer",
            description: "Photographic grass tile + a warm-toned painterly reference feed into the same AI stack, producing the painterly grass base color used across the terrain.",
            rows: [
              { layout: "pair", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/landscape/grass-original.png`,  caption: "Original texture" },
                { src: `${BASE}textures/landscape/grass-reference.png`, caption: "Style reference" },
              ]},
              { layout: "compare", items: [
                {
                  before: `${BASE}textures/landscape/grass-original.png`,
                  after:  `${BASE}textures/landscape/grass-stylized-basecolor.png`,
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
          { key: "Stable Diffusion XL (SDXL)",     value: "The core image generation AI — responsible for synthesizing the final painterly output." },
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
        // `note` is the only Statue-card prose that the processCards
        // don't already cover — they describe the VAT + Houdini-GS
        // stages each in isolation; this one-liner adds the live
        // MediaPipe interaction context (which the static images
        // can't show). Per the audit: trimmed from the longer
        // duplicate that restated the section descriptions.
        note:      "Left-hand pinch in the live MediaPipe session scrubs the VAT playback during the shoot — the statue's animation responds to the operator's gesture in real time.",
        // Step-style process cards — two sections matching the user
        // reference design. Both videos are user-provided Vimeo URLs.
        // aspectRatio is the first-paint hint; vimeo-fit.js refines to
        // the clip's actual ratio once the Vimeo Player API reports back.
        processCards: [
          {
            eyebrow:     "01 — FINAL RESULT",
            title:       "Unreal Engine 5 — VAT",
            description: "A statue animation produced through a particle-sprite VAT pipeline — pre-baking simulation data into textures for lightweight, GPU-driven playback at runtime.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1194884976?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
                caption:     "Statue · UE5 VAT playback",
                alt:         "Statue VAT animation playing in Unreal Engine 5",
                aspectRatio: "4 / 3",
              }]},
            ],
          },
          {
            eyebrow:     "02 — HOUDINI SIMULATION",
            title:       "Houdini — Gaussian Splat",
            description: "Animated Gaussian Splat with particle and pyro simulation, then rendered with V-RAY in Houdini.",
            rows: [
              { layout: "single", items: [{
                iframeSrc:   "https://player.vimeo.com/video/1194884977?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
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
        source: "Statue: Leartes Studios — Roman Statues Pack Vol 1 (cosmos.leartesstudios.com/environments/roman-statues-pack-vol1)",
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
            eyebrow:     "01 — FINAL RESULT IN THE SCENE",
            title:       "Procedural Vine on the Gazebo",
            description: "By combining Unreal Engine's Motion Design plugin with the workflow from the Growing Roots with WPO tutorial, I developed a procedural vine system with controllable growth animation. The growth behavior is driven through Blueprint parameters, enabling interactive control and real-time triggering within the scene.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/vine/vine-final-scene.jpg`, caption: "Gazebo dressed with the procedural vine" },
              ]},
            ],
          },
          {
            eyebrow:     "02 — WPO DYNAMIC MATERIAL BLUEPRINT",
            title:       "Unreal Material — Growth Controls",
            description: "A single Unreal material drives the entire growth animation. The five inputs below combine into one interactive growth workflow that Blueprint can drive at runtime.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/vine/vine-material-blueprint.png`, caption: "M_VineGrowth — material blueprint" },
              ]},
            ],
            points: [
              { key: "UV Directional Masking",            value: "Controls the directional flow and expansion of the vine growth." },
              { key: "Vertex Color Control",              value: "Defines growth areas and controls the blending behavior of the shader." },
              { key: "World Position Offset (WPO)",       value: "Animates the mesh deformation to simulate organic vine growth in real time." },
              { key: "Unreal Engine Material Blueprint",  value: "Combines all procedural controls into an interactive and controllable growth workflow." },
              { key: "Procedural Vine Growth Workflow",   value: "Simulates dynamic and organic vine expansion interactively within the environment." },
            ],
          },
          {
            eyebrow:     "03 — PLANT GROW ON THE VINE",
            title:       "Motion Designer Cloner + Effectors",
            description: "By using the Motion Designer plugin's Cloner component, assets (small plants, blooms) are distributed onto a specific Static Mesh surface and animated with controllable growth behavior. Adding more assets and Cloner components makes the vine visually richer and more organic. An Effector then controls both the transforms and the growth animation of the cloned assets — when driven through Sequencer or Blueprint, it creates a directional growth effect based on movement.",
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
                  caption: "Step 1 — Cloner distributes bloom assets onto the static mesh" },
                { src: `${BASE}textures/vine/vine-cloner-effector.jpg`,
                  caption: "Step 2 — plane + sphere effectors shape scale and density" },
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
        source: "tharlevfx — Growing Roots with WPO (YouTube · KZX0kHSfD78)",
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
          src:   "https://player.vimeo.com/video/1191203670?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
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
            eyebrow:     "01 — HOUDINI SIMULATION",
            title:       "Procedural Growth Animation",
            description: "In Houdini, KineFX and Vellum were used to create a natural, organic growth animation for the daffodil, preparing it for interaction.",
            rows: [
              // Two videos side-by-side at matched 16:9 — user-provided
              // Vimeo URLs. Equal-height via the pair aspectRatio opt-in
              // so the 1920×1080 sources line up cleanly even on phones
              // (the [style*=--pair-aspect] override keeps them in a row
              // at narrow widths instead of stacking).
              { layout: "pair", aspectRatio: "16 / 9", items: [
                {
                  iframeSrc: "https://player.vimeo.com/video/1194883065?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
                  caption: "Close up Stamen",
                  alt: "Daffodil close-up stamen Houdini simulation",
                },
                {
                  iframeSrc: "https://player.vimeo.com/video/1194883066?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
                  caption: "Daffodil Animation",
                  alt: "Daffodil full growth Houdini simulation",
                },
              ]},
            ],
          },
          {
            // Split out of the old combined "TEXTURING" section so each
            // beat stays digestible (the original had 4 rows of mixed
            // content — renders + swatches + sp final + maps — which
            // read as a long scroll). This section tells the
            // STYLIZATION story: Original → AI Stylized → final SP
            // refined render. PBR maps live in their own section below.
            eyebrow:     "02 — STYLIZATION",
            title:       "AI Stylized + Substance Painter",
            description: "Diffuse runs through a two-stage stylization pipeline. Substance Painter paints the base color; the in-house AI texture stylization tool converts that base into a painterly version; then back into Substance Painter for refinement.",
            rows: [
              // Original vs AI Stylized — daffodil renders. Native
              // aspects differ (0.84 vs 0.72 portrait) so we lock both
              // cells to 3:4 — each crops a small sliver to align.
              { layout: "pair", aspectRatio: "3 / 4", items: [
                { src: `${BASE}textures/daffodil/daffodil-original-render.png`, caption: "Original" },
                { src: `${BASE}textures/daffodil/daffodil-ai-render.png`,       caption: "AI Stylized" },
              ]},
              // Base-color swatches — both natively 1:1, no crop.
              { layout: "pair", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/daffodil/daffodil-original-swatch.png`, caption: "Original base color" },
                { src: `${BASE}textures/daffodil/daffodil-ai-swatch.png`,       caption: "AI stylized base color" },
              ]},
              // Final Substance Painter refined daffodil — full width.
              { layout: "single", items: [
                { src: `${BASE}textures/daffodil/daffodil-sp-final.png`, caption: "Substance Painter — final refined daffodil" },
              ]},
            ],
          },
          {
            // The PBR map set gets its own beat so the reader has a
            // clean break between "what was authored" (section 02) and
            // "what shipped to the GPU" (this section). Map-set
            // showcases benefit from focused presentation anyway —
            // four channels at-a-glance reads better as a dedicated
            // section than tacked onto the end of the stylization
            // story.
            eyebrow:     "03 — PBR PIPELINE",
            title:       "Full Map Set",
            description: "The refined daffodil ships with a complete PBR map set, all authored from the AI-stylized base color through Substance Painter.",
            rows: [
              // Full PBR map set — 4 maps in one row at desktop,
              // collapses to 2x2 at ≤900px (see .ah-pc-quad in
              // style.css). object-fit: cover handles any minor aspect
              // drift between maps.
              { layout: "quad", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/daffodil/daffodil-basecolor.png`,   caption: "BaseColor" },
                { src: `${BASE}textures/daffodil/daffodil-normal.png`,      caption: "Normal" },
                { src: `${BASE}textures/daffodil/daffodil-orm.png`,         caption: "ORM" },
                { src: `${BASE}textures/daffodil/daffodil-scattermask.png`, caption: "ScatterMask" },
              ]},
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
            eyebrow: "01 — REAL-TIME READY FOLIAGE",
            title:   "Final In-scene Result",
            description: "640-triangle scatter cards dressed in the painterly Substance diffuse, lit by the same HDRI as the rest of the garden. The whole foreground daisy band ships at interactive frame rate on a desktop GPU without any per-frame foliage update. Below — how the asset got from a 28,557-triangle SpeedTree source to this real-time-ready plate.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-final-result.jpg`, caption: null, alt: "Stylised daisy field — final in-scene render" },
              ]},
            ],
          },
          {
            eyebrow: "02 — MODELING & OPTIMIZATION",
            title:   "Procedural Plant + Aggressive Decimation",
            description: "Authored procedurally in SpeedTree — a single node graph drives the whole daisy with parametric trunk, leaf, and cap rules, so scaling the scatter density never reauthors geometry. Decimation pass takes each plant from 28,557 to 640 triangles, the threshold where the Unreal Engine 5 foliage scatter stays at a stable interactive frame rate without visible silhouette loss.",
            rows: [
              // aspectRatio locks both pair cells to 16:9 so the
              // modeling shot (942×776, ~1.21) and the node graph
              // (993×489, ~2.03) — wildly different source aspects —
              // align at the SAME height. Both images use
              // object-fit: cover; the modeling shot crops a sliver
              // top/bottom, the node graph crops a sliver left/right.
              // Per user direction: "用justify的形式在同一行，相同height".
              { layout: "pair", aspectRatio: "16 / 9", items: [
                { src: `${BASE}textures/daisy/daisy-modeling-speedtree.png`,  caption: "Modeling in SpeedTree" },
                { src: `${BASE}textures/daisy/daisy-speedtree-nodegraph.png`, caption: "Procedural plant node graph" },
              ]},
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-optimization.jpg`, caption: "Triangle decimation · 28,557 → 640" },
              ]},
            ],
          },
          {
            eyebrow: "03 — STYLIZATION",
            title:   "Substance Designer Painterly Procedural",
            description: "Diffuse and leaf atlas built procedurally in Substance Designer, inspired by 80 Level's \"Breakdown: Making 3D Landscape Look Like Painting\". The same brush-stroke language used on the Landscape master texture carries through to the foliage so the daisy band reads as part of the painting, not as a photo-real prop dropped into a painterly scene.",
            rows: [
              { layout: "single", items: [
                { src: `${BASE}textures/daisy/daisy-substance-nodegraph.png`, caption: "Stylized procedural node graph" },
              ]},
              // Both before/after are near-square sources (837×786 ≈ 1.06,
              // 1087×1081 ≈ 1.005). Locking pair to 1:1 forces exactly
              // identical height with sub-pixel crop on the before-edge —
              // imperceptible, and resolves the slight before/after
              // height drift visible in natural-aspect mode.
              { layout: "pair", aspectRatio: "1 / 1", items: [
                { src: `${BASE}textures/daisy/daisy-substance-before.png`, caption: "Before stylization" },
                { src: `${BASE}textures/daisy/daisy-substance-after.png`,  caption: "After stylization" },
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
         ${Array.isArray(it.embed)
             ? it.embed.map(e => renderEmbed(e)).join("")
             : (it.embed ? renderEmbed(it.embed) : "")}
         ${renderProcessCards(it.processCards)}
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

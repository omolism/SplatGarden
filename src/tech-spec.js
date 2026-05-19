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

export const TECH_SPECS = [
  {
    section: "ASSETS",
    desc:    "Per-object authoring pipelines — all baked into the captured 3DGS",
    items: [
      {
        name:      "Garden Environment",
        location:  "Whole scene",
        toolchain: ["Unreal Engine", "Litchfield Studio", "Postshot"],
        output:    "3DGS · 990 COLMAP poses",
        note:      "Scene assembled in Unreal, trained as a single 3D Gaussian Splat",
        source:    "public/Whole_With_Statue.splat",
      },
      {
        name:      "Tree",
        location:  "Near gazebo",
        toolchain: ["SpeedTree", "Unreal Engine", "Postshot"],
        output:    "Baked into env 3DGS",
        note:      "Procedural tree authored in SpeedTree, dressed into the Unreal scene before capture",
        source:    "in-scene",
      },
      {
        name:      "Grape Hyacinth",
        location:  "Near gazebo",
        toolchain: ["Houdini (procedural)", "Unreal Engine", "Postshot"],
        output:    "Baked into env 3DGS",
        note:      "Houdini-generated cluster scattered across the gazebo planters",
        source:    "in-scene",
      },
      {
        name:      "Daffodil",
        location:  "Near gazebo",
        toolchain: ["Houdini", "VAT bake", "Python · OSC · MediaPipe", "AI texture stylization", "Unreal Engine", "Postshot"],
        output:    "Baked into env 3DGS · animation captured per frame",
        note:      "Animated procedurally in Houdini, VAT-baked, MediaPipe/OSC drove the rig at capture time, AI stylization on the diffuse",
        source:    "in-scene",
      },
    ],
  },

  {
    section: "RENDER PRIMITIVES",
    desc:    "Same splat scene, four interchangeable subforms",
    items: [
      {
        name:   "3D Gaussian Splatting",
        ref:    "Kerbl et al., SIGGRAPH 2023",
        note:   "Per-splat ellipsoidal Gaussians + SH view-dep color",
        source: "via @sparkjsdev/spark",
      },
      {
        name:   "Point",
        ref:    "Bare splat centers, no anisotropy",
        source: "Spark subform — Point",
      },
      {
        name:   "Quad — camera-facing billboard",
        ref:    "OpenUSD UsdGeomPointInstancer · proto = Plane",
        source: "src/quadizer.js:1",
      },
      {
        name:   "Voxel — uniform-grid binning",
        ref:    "OpenUSD UsdGeomPointInstancer · proto = Cube",
        note:   "Averaged color per cell",
        source: "src/voxelizer.js:1",
      },
    ],
  },

  {
    section: "CAMERA TRACK",
    desc:    "Authored cinematography + reconstructed capture poses",
    items: [
      {
        name:   "Cinematic flythrough",
        ref:    "Houdini-authored, FBX bake · 24 fps · 25 s · 600 frames",
        source: "public/Shot4B_GS-FX_Camera_V01.fbx",
      },
      {
        name:   "Capture cameras",
        ref:    "990 COLMAP poses recovered from training frames",
        source: "src/colmap-loader.js:50",
      },
    ],
  },

  {
    section: "CAPTURE & TRAIN",
    desc:    "How the garden became Gaussian splats",
    items: [
      {
        name:   "Scene assembly",
        ref:    "Unreal Engine — procedural + authored assets dressed into env",
        source: "off-repo",
      },
      {
        name:   "Production",
        ref:    "Litchfield Studio pipeline",
        source: "off-repo",
      },
      {
        name:   "Pose reconstruction",
        ref:    "COLMAP Structure-from-Motion · 990 cameras recovered",
        source: "src/colmap-loader.js:50",
      },
      {
        name:   "Splat training",
        ref:    "Postshot — per-splat Gaussian fit + SH coefficients",
        source: "off-repo",
      },
    ],
  },

  {
    section: "INPUT & SENSING",
    desc:    "MediaPipe-driven interaction surfaces",
    items: [
      { name: "Hand tracking", ref: "MediaPipe HandLandmarker (tasks-vision 0.10.35)", source: "src/handtracking.js:1" },
      { name: "Body tracking", ref: "MediaPipe PoseLandmarker (tasks-vision 0.10.35)", source: "src/bodytracking.js:1" },
    ],
  },

  {
    section: "POST-PROCESSING",
    desc:    "Toy chain — view via Customize ▸ Play ▸ Post-Process",
    items: [
      { name: "Echo Trails",              ref: "Notch-style motion-blur accumulator",      source: "src/postfx.js:18"  },
      { name: "Unreal Bloom",             ref: "UnrealBloomPass (Three.js addons)",         source: "src/postfx.js:715" },
      { name: "Polish (chroma+vignette)", ref: "Custom ShaderPass — RGB shift + vignette",  source: "src/postfx.js:121" },
      { name: "Painterly",                ref: "Anisotropic edge-aware smoothing",          source: "src/postfx.js:295" },
      { name: "Warp FX",                  ref: "Barrel lens + chromatic warp",              source: "src/postfx.js:598" },
      { name: "Underwater",               ref: "Wavy refraction + cast caustics",           source: "src/postfx.js:500" },
      { name: "Kaleidoscope",             ref: "N-fold mirrored UV sampling",               source: "src/postfx.js:427" },
    ],
  },

  {
    section: "CLICK FX",
    desc:    "Toy interaction — view via Customize ▸ Play ▸ FX",
    items: [
      { name: "Wave & Tint",       ref: "sin(t·ω − dist·5) · e^(−0.7t) · ringMask",          source: "src/effects.js:307" },
      { name: "Dissolve & Reform", ref: "FBM-warped burn front · TouchDesigner SOP Effector", source: "src/effects.js:339" },
      { name: "Scan Line",         ref: "Tron-style sweeping wavefront + afterglow",          source: "src/effects.js:874" },
      { name: "Spiral Smear",      ref: "Anisotropic 3DGS streak via clamped scales mix",     source: "src/effects.js:419" },
      { name: "Vortex Drift",      ref: "Bridson et al. (2007) curl-noise potential flow",    source: "src/effects.js:540" },
      { name: "Chaotic Particles", ref: "Worley (1996) Voronoi · per-cell coherent migration", source: "src/effects.js:619" },
      { name: "Slime Molds",       ref: "Jones (2010) · Sage (2017) Physarum polycephalum sim", source: "src/effects.js:710" },
      { name: "Feather Roots",     ref: "Stochastic L-system radial branching",               source: "src/effects.js:781" },
    ],
  },
];

function renderItem(it) {
  const chain = it.toolchain
    ? `<div class="ts-item-chain">${it.toolchain
        .map(t => `<span class="ts-chip">${t}</span>`)
        .join('<span class="ts-arrow">▸</span>')}</div>`
    : "";
  const head = `
    <div class="ts-item-head">
      <span class="ts-item-name">${it.name}</span>
      ${it.location ? `<span class="ts-item-loc">${it.location}</span>` : ""}
    </div>`;
  const output = it.output ? `<div class="ts-item-output">${it.output}</div>` : "";
  const ref    = it.ref    ? `<div class="ts-item-ref">${it.ref}</div>`       : "";
  const note   = it.note   ? `<div class="ts-item-note">${it.note}</div>`     : "";
  const source = it.source ? `<div class="ts-item-src">${it.source}</div>`    : "";
  return `<li class="ts-item${it.toolchain ? " ts-item-asset" : ""}">${head}${chain}${output}${ref}${note}${source}</li>`;
}

export class TechSpec {
  constructor({ mountEl = document.body } = {}) {
    this.open = false;

    this.el = document.createElement("div");
    this.el.id = "tech-spec";
    this.el.innerHTML = `
      <div class="ts-backdrop"></div>
      <aside class="ts-panel">
        <header class="ts-header">
          <div class="ts-title">
            <span class="dot"></span>
            <span class="t">PIPELINE</span>
            <span class="ts-key">T</span>
          </div>
          <button class="ts-close" title="Close (T or Esc)">×</button>
        </header>
        <div class="ts-sub">How everything in this scene was made · click a section to fold</div>
        <div class="ts-body">
          ${TECH_SPECS.map((s, i) => `
            <section class="ts-sec" data-idx="${i}">
              <header class="ts-sec-head">
                <span class="ts-sec-name">${s.section}</span>
                <span class="ts-sec-count">${s.items.length}</span>
                <span class="ts-caret">▾</span>
              </header>
              <div class="ts-sec-desc">${s.desc}</div>
              <ul class="ts-list">
                ${s.items.map(renderItem).join("")}
              </ul>
            </section>
          `).join("")}
        </div>
        <footer class="ts-footer">
          <span class="ts-foot-k">Total</span>
          <span class="ts-foot-v">${TECH_SPECS.reduce((n, s) => n + s.items.length, 0)} entries · ${TECH_SPECS.length} sections</span>
        </footer>
      </aside>
    `;
    mountEl.appendChild(this.el);

    this.el.querySelector(".ts-close").addEventListener("click", () => this.close());
    this.el.querySelector(".ts-backdrop").addEventListener("click", () => this.close());

    this.el.querySelectorAll(".ts-sec-head").forEach(h => {
      h.addEventListener("click", () => {
        const sec = h.closest(".ts-sec");
        sec.classList.toggle("collapsed");
      });
    });

    // T key toggles, Esc closes — guarded against typing into inputs.
    window.addEventListener("keydown", (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "t" || e.key === "T") this.toggle();
      else if (e.key === "Escape" && this.open) this.close();
    });
  }

  toggle()      { this.open ? this.close() : this.openOverlay(); }
  openOverlay() { this.open = true;  this.el.classList.add("show"); }
  close()       { this.open = false; this.el.classList.remove("show"); }
}

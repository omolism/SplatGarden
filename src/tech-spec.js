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
  // ============== Three pillars: 3DGS / USD / AI ==============
  {
    section: "3DGS",
    desc:    "The render primitive and the pipeline that produces it",
    items: [
      {
        name:   "3D Gaussian Splatting",
        ref:    "Kerbl et al., SIGGRAPH 2023",
        note:   "Per-splat ellipsoidal Gaussians + SH view-dep color",
        source: "via @sparkjsdev/spark",
      },
      {
        name:   "Point subform",
        ref:    "Gaussian centers collapsed to isotropic points",
        note:   "Same data, drawn as bare points so the sky shows through gaps",
        source: "Spark subform · Customize ▸ Splat ▸ Point",
      },
      {
        name:   "Scene assembly",
        ref:    "Unreal Engine — every asset set-dressed into one scene",
        note:   "Perforce-backed version control across artists",
        source: "off-repo",
      },
      {
        name:   "Capture",
        ref:    "Litchfield Studio capture pipeline",
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
      {
        name:   "Cinematic flythrough",
        ref:    "Houdini-authored FBX · 24 fps · 25 s · 600 frames",
        source: "public/Shot4B_GS-FX_Camera_V01.fbx",
      },
    ],
  },

  {
    section: "USD",
    desc:    "OpenUSD interop — alternative subforms expressed as PointInstancer prims",
    items: [
      {
        name:   "Quad — camera-facing billboard",
        ref:    "OpenUSD UsdGeomPointInstancer · proto = Plane",
        note:   "Per-instance positions / orientations / scales + primvars:displayColor",
        source: "src/quadizer.js:1",
      },
      {
        name:   "Voxel — uniform-grid binning",
        ref:    "OpenUSD UsdGeomPointInstancer · proto = Cube",
        note:   "Averaged color per cell — same per-instance arrays as Quad",
        source: "src/voxelizer.js:1",
      },
    ],
  },

  {
    section: "AI",
    desc:    "Custom diffusion-based texture tool driving the painterly look on Daffodil + Landscape",
    items: [
      {
        name:      "Artist-Directed Style Transfer",
        ref:       "Diffusion-based style transfer with controllable color preservation",
        toolchain: ["IP-Adapter (Ye 2023)", "ControlNet (Zhang 2023)", "AdaIN (Huang & Belongie 2017)", "Diffusion"],
        output:    "Painterly textures with preserved palette",
        note:      "Two artist-selectable modes — Full Style Transfer (color + texture + tone from a reference) and Texture-Only Transfer (auto-grayscale reference + AdaIN to apply painterly brushwork while keeping the original color palette intact). Per-channel histogram matching + patch-wise AdaIN run post-generation to deterministically correct residual color drift — output stays faithful to the pre-approved palette across runs.",
        source:    "off-repo",
      },
      {
        name:   "Generation Parameters",
        ref:    "Artist-controllable knobs",
        note:   "ControlNet Mode — Tile (colored renders, preserves pixel structure) / Canny (sketches, preserves edges) · ControlNet Strength · IP-Adapter Strength · Inference Steps · Guidance Scale.",
        source: "Gradio interface",
      },
      {
        name:   "Implementation",
        ref:    "PyTorch 2.11 · CUDA 13.0 · Python",
        note:   "Runs on NVIDIA RTX PRO 6000 Blackwell (96 GB VRAM); generates a 4K image in ≈ 20 s at 20 inference steps.",
        source: "off-repo",
      },
    ],
  },

  // ============== Per-asset cards (consume the three pillars above) ==============
  {
    section: "ASSETS",
    desc:    "Per-object authoring — set-dressed in Unreal, then captured together as one 3DGS",
    items: [
      {
        name:      "Grape Hyacinth",
        location:  "Near gazebo",
        worldPos:  [-0.195, -0.730, 2.379],
        toolchain: ["Houdini (procedural)", "Unreal Engine (set dress)"],
        output:    "Mesh dressed into env scene",
        note:      "Houdini-generated cluster scattered across the gazebo planters",
        source:    "in-scene",
      },
      {
        name:      "Daffodil",
        location:  "Near gazebo",
        worldPos:  [0.20, -0.773, 2.226],
        toolchain: ["Houdini", "VAT bake", "Unreal Engine (set dress)", "Python · OSC · MediaPipe", "AI texture stylization"],
        output:    "Mesh + VAT animation · interactively driven in Unreal",
        note:      "Animated procedurally in Houdini and VAT-baked, then set-dressed in Unreal. Inside the Unreal session, Python · OSC · MediaPipe drives the rig live (hand gesture → OSC → blueprint). Diffuse texture passes through the custom AI stylization tool.",
        source:    "in-scene",
      },
      {
        name:      "Tree",
        location:  "Near gazebo",
        toolchain: ["SpeedTree", "Unreal Engine (set dress)"],
        output:    "Mesh dressed into env scene",
        note:      "Procedural tree authored in SpeedTree, dressed into the Unreal scene before the env capture",
        source:    "in-scene",
      },
      {
        name:      "Landscape",
        location:  "Whole scene base",
        toolchain: ["Unreal Engine (terrain authoring)", "AI texture stylization"],
        output:    "Landscape mesh + AI-stylized ground textures",
        note:      "Terrain authored directly in Unreal; ground textures passed through the custom AI stylization tool to land the painterly look in the final 3DGS.",
        source:    "in-scene",
      },
      {
        name:      "Garden Environment",
        location:  "Whole scene",
        toolchain: ["Unreal Engine (assembly)", "Litchfield Studio (capture)", "Postshot (training)"],
        output:    "3DGS · 990 COLMAP poses",
        note:      "All set-dressed assets composited in Unreal, then captured at Litchfield Studio and trained as a single 3D Gaussian Splat in Postshot. The only stage where Postshot enters the pipeline.",
        source:    "public/Whole_With_Statue.splat",
      },
    ],
  },

  {
    section: "INPUT & SENSING",
    desc:    "MediaPipe-driven interaction surface",
    items: [
      { name: "Hand tracking", ref: "MediaPipe HandLandmarker (tasks-vision 0.10.35)", source: "src/handtracking.js:1" },
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
  const isAsset = Array.isArray(it.toolchain) && it.toolchain.length > 0;

  // 1. Title row — big asset name + optional location chip
  const head = `
    <header class="ts-item-head">
      <h3 class="ts-item-name">${it.name}</h3>
      ${it.location ? `<span class="ts-item-loc">${it.location}</span>` : ""}
    </header>`;

  // 2. Sub-line — short technical tagline (ref). Sits right under the title.
  const sub = it.ref ? `<div class="ts-item-sub">${it.ref}</div>` : "";

  // 3. Toolchain zone — explicit "TOOLCHAIN" label + chip row with arrows
  let chain = "";
  if (isAsset) {
    const chips = it.toolchain
      .map(t => `<span class="ts-chip">${t}</span>`)
      .join('<span class="ts-arrow">▸</span>');
    chain = `<div class="ts-zone">
        <div class="ts-zone-label">Toolchain</div>
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

  // 6. Source — small mono footer with hairline rule above
  const source = it.source ? `<div class="ts-item-src">${it.source}</div>` : "";

  return `<li class="ts-item${isAsset ? " ts-item-asset" : ""}">${head}${sub}${chain}${output}${note}${source}</li>`;
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
    // Backdrop is click-through (pointer-events:none) so drags reach the
    // canvas — no listener wired. Close via × button, Esc, or T toggle.

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
  openOverlay() {
    this.open = true;
    this.el.classList.add("show");
    this.onOpenChange?.(true);
  }
  close() {
    this.open = false;
    this.el.classList.remove("show");
    this.onOpenChange?.(false);
  }
}

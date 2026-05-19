// ---------------------------------------------------------------------------
// TechSpec — research-bibliography panel that lists every algorithm, library,
// and dataset wired into the project, each with a citation/reference and a
// `file:path:line` anchor so a reader can jump straight to the implementation.
//
// Visual language matches the rest of the tech-breakdown HUD stack
// (Pipeline HUD, Profiler, Effect Callout): dark glass, monospace caps
// section headers, dashed dividers.
//
// Toggle: press T, or via instance.toggle(). Sections are collapsible; the
// entire panel slides in from the right.
// ---------------------------------------------------------------------------

export const TECH_SPECS = [
  {
    section: "RENDERING",
    desc:    "3DGS pipeline + scene representations",
    items: [
      {
        name: "3D Gaussian Splatting",
        ref:  "Kerbl et al., SIGGRAPH 2023",
        note: "Per-splat ellipsoidal Gaussians + spherical-harmonic view-dep color",
        source: "via @sparkjsdev/spark",
      },
      {
        name: "Spark renderer",
        ref:  "@sparkjsdev/spark",
        note: "Three.js-based 3DGS with dyno shader-graph API",
        source: "package.json",
      },
      {
        name: "PointInstancer › Plane",
        ref:  "OpenUSD UsdGeomPointInstancer",
        note: "Camera-facing billboards, one per splat (Quad subform)",
        source: "src/quadizer.js:1",
      },
      {
        name: "PointInstancer › Cube",
        ref:  "OpenUSD UsdGeomPointInstancer",
        note: "Uniform-grid voxelisation, averaged color per cell",
        source: "src/voxelizer.js:1",
      },
    ],
  },

  {
    section: "POST-PROCESSING",
    desc:    "EffectComposer pass chain (8 passes, toggleable)",
    items: [
      { name: "Echo Trails",          ref: "Notch-style motion-blur accumulator",         source: "src/postfx.js:18"  },
      { name: "Unreal Bloom",         ref: "UnrealBloomPass (Three.js addons)",            source: "src/postfx.js:715" },
      { name: "Polish (chroma+vignette)", ref: "Custom ShaderPass — RGB shift + vignette", source: "src/postfx.js:121" },
      { name: "Painterly",            ref: "Anisotropic edge-aware smoothing",             source: "src/postfx.js:295" },
      { name: "Warp FX",              ref: "Barrel lens + chromatic warp",                  source: "src/postfx.js:598" },
      { name: "Underwater",           ref: "Wavy refraction + cast caustics",               source: "src/postfx.js:500" },
      { name: "Kaleidoscope",         ref: "N-fold mirrored UV sampling",                    source: "src/postfx.js:427" },
    ],
  },

  {
    section: "PARTICLES",
    desc:    "Two-phase GPGPU pipeline driving interaction reactivity",
    items: [
      {
        name: "VelocityField (2D ping-pong)",
        ref:  "lomateron, 'Velocity Conservation' Shadertoy (2021)",
        note: "Diffuse → semi-Lagrangian advect → decay; injects on click/pinch",
        source: "src/velocity-field.js:95",
      },
      {
        name: "GPGPU Particles",
        ref:  "cornusammonis, 'Tons of Spatial-Sorted Particles' (2017)",
        note: "Float RT ping-pong (pos+vel) · additive blending replaces depth sort",
        source: "src/gpgpu-particles.js:1",
      },
    ],
  },

  {
    section: "CLICK EFFECTS",
    desc:    "Single branched dyno shader · 8 selectable algorithms",
    items: [
      { name: "Wave & Tint",        ref: "sin(t·ω − dist·5) · e^(−0.7t) · ringMask",                source: "src/effects.js:307" },
      { name: "Dissolve & Reform",  ref: "FBM-warped burn front · TouchDesigner SOP Effector",       source: "src/effects.js:339" },
      { name: "Scan Line",          ref: "Tron-style sweeping wavefront + afterglow",                source: "src/effects.js:874" },
      { name: "Spiral Smear",       ref: "Anisotropic 3DGS streak via clamped scales mix",            source: "src/effects.js:419" },
      { name: "Vortex Drift",       ref: "Bridson et al. (2007) curl-noise potential flow",           source: "src/effects.js:540" },
      { name: "Chaotic Particles",  ref: "Worley (1996) Voronoi · per-cell coherent migration",       source: "src/effects.js:619" },
      { name: "Slime Molds",        ref: "Jones (2010) · Sage (2017) Physarum polycephalum sim",       source: "src/effects.js:710" },
      { name: "Feather Roots",      ref: "Stochastic L-system radial branching",                       source: "src/effects.js:781" },
    ],
  },

  {
    section: "INPUT & SENSING",
    desc:    "MediaPipe drives interactive control surfaces",
    items: [
      { name: "Hand tracking",  ref: "MediaPipe HandLandmarker (tasks-vision 0.10.35)", source: "src/handtracking.js:1" },
      { name: "Body tracking",  ref: "MediaPipe PoseLandmarker (tasks-vision 0.10.35)", source: "src/bodytracking.js:1" },
    ],
  },

  {
    section: "DATA & ASSETS",
    desc:    "Scene capture + environment + camera",
    items: [
      { name: "COLMAP poses",     ref: "images.bin binary parser · 990 capture cams",  source: "src/colmap-loader.js:50" },
      { name: "HDR environment",  ref: "RGBELoader · equirectangular Skybox.hdr",       source: "public/Skybox.hdr"       },
      { name: "FBX flythrough",   ref: "FBXLoader · baked camera animation playback",   source: "public/"                 },
    ],
  },
];

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
            <span class="t">TECH SPEC</span>
            <span class="ts-key">T</span>
          </div>
          <button class="ts-close" title="Close (T or Esc)">×</button>
        </header>
        <div class="ts-sub">Algorithm bibliography · click a section to fold</div>
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
                ${s.items.map(it => `
                  <li class="ts-item">
                    <div class="ts-item-name">${it.name}</div>
                    <div class="ts-item-ref">${it.ref}</div>
                    ${it.note ? `<div class="ts-item-note">${it.note}</div>` : ""}
                    <div class="ts-item-src">${it.source}</div>
                  </li>
                `).join("")}
              </ul>
            </section>
          `).join("")}
        </div>
        <footer class="ts-footer">
          <span class="ts-foot-k">Total</span>
          <span class="ts-foot-v">${TECH_SPECS.reduce((n, s) => n + s.items.length, 0)} techniques · ${TECH_SPECS.length} sections</span>
        </footer>
      </aside>
    `;
    mountEl.appendChild(this.el);

    // Close button + backdrop click → close
    this.el.querySelector(".ts-close").addEventListener("click", () => this.close());
    this.el.querySelector(".ts-backdrop").addEventListener("click", () => this.close());

    // Section headers → toggle collapsed
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

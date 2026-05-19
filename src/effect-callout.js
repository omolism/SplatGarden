// ---------------------------------------------------------------------------
// EffectCallout — bottom-left card that pops in for ~5 s when a click FX is
// triggered. Shows the algorithm name, a one-line technique summary, a
// source-file:line reference, and a citation. Visual language mirrors the
// Pipeline HUD so the surveillance / tech-spec aesthetic stays consistent.
//
// Metadata lives in EFFECT_META below — keyed by the same effect display
// name used in effects.js → EFFECT_INDEX / PRESETS. To add or refine an
// entry just edit this map (and double-check the line number reference).
// ---------------------------------------------------------------------------

const HIDE_AFTER_MS = 5000;

export const EFFECT_META = {
  "Wave & Tint": {
    technique: "Radial ripple + RGB chromatic shift",
    source:    "src/effects.js:307",
    ref:       "sin(t·ω − dist·5) · e^(−0.7t) · ringMask",
  },
  "Dissolve & Reform": {
    technique: "FBM-warped burn front · per-splat fly-direction · alpha decay",
    source:    "src/effects.js:339",
    ref:       "TouchDesigner SOP Effector · Inria 3DGS jitter sampling",
  },
  "Scan Line": {
    technique: "Double-ring shell · noise-breakup · afterglow accumulator",
    source:    "src/effects.js:874",
    ref:       "Tron-style sweeping wavefront",
  },
  "Spiral Smear": {
    technique: "Localised band mask · wind-side directional bias · curl noise",
    source:    "src/effects.js:419",
    ref:       "Anisotropic 3D-Gaussian streak via clamped scales mix",
  },
  "Vortex Drift": {
    technique: "Curl-noise potential flow · divergence-free swirl",
    source:    "src/effects.js:540",
    ref:       "Bridson et al. (2007) · port of cornusammonis spatial sort",
  },
  "Chaotic Particles": {
    technique: "Voronoi cell tracking · animated cell-center offsets",
    source:    "src/effects.js:619",
    ref:       "Worley (1996) · per-cell coherent migration, not per-particle",
  },
  "Slime Molds": {
    technique: "Domain-warped ridge noise · gradient-ascent advection",
    source:    "src/effects.js:710",
    ref:       "Jones (2010) · Sage (2017) Physarum polycephalum simulation",
  },
  "Feather Roots": {
    technique: "Outward radial branching · per-splat noise-perturbed angle",
    source:    "src/effects.js:781",
    ref:       "Stochastic L-system fibers · no inward suction",
  },
};

export class EffectCallout {
  constructor({ mountEl = document.body } = {}) {
    this.el = document.createElement("div");
    this.el.id = "effect-callout";
    this.el.innerHTML = `
      <div class="ec-glyph">
        <span class="ec-corner tl"></span><span class="ec-corner tr"></span>
        <span class="ec-corner bl"></span><span class="ec-corner br"></span>
        <span class="ec-cross"></span>
      </div>
      <div class="ec-body">
        <div class="ec-eyebrow">CLICK EFFECT ▸ FIRED</div>
        <div class="ec-name"></div>
        <div class="ec-technique"></div>
        <div class="ec-meta">
          <span class="ec-source"></span>
          <span class="ec-sep">·</span>
          <span class="ec-ref"></span>
        </div>
      </div>`;
    mountEl.appendChild(this.el);
    this._hideTimer = null;
  }

  show(effectName) {
    const meta = EFFECT_META[effectName];
    if (!meta) return;
    this.el.querySelector(".ec-name").textContent      = effectName.toUpperCase();
    this.el.querySelector(".ec-technique").textContent = meta.technique;
    this.el.querySelector(".ec-source").textContent    = meta.source;
    this.el.querySelector(".ec-ref").textContent       = meta.ref;
    // Restart CSS animation: remove → reflow → add
    this.el.classList.remove("show");
    void this.el.offsetWidth;
    this.el.classList.add("show");
    if (this._hideTimer) clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this.el.classList.remove("show"), HIDE_AFTER_MS);
  }

  hide() {
    if (this._hideTimer) clearTimeout(this._hideTimer);
    this.el.classList.remove("show");
  }
}

// ---------------------------------------------------------------------------
// UsdAnnotations — museum-style annotation card that pops up when the user
// manually toggles a layer ON via the 3DGS/USD panel. Educates the viewer
// on what they're looking at without crowding the lil-gui side.
//
// Triggered from UsdLayers (not from controller.setLayerVis directly) so
// the camera-move's programmatic toggles don't fire annotations during the
// cinematic. Auto-dismisses after AUTO_HIDE_MS unless the user re-toggles
// (which restarts the timer) or clicks the close button.
// ---------------------------------------------------------------------------

const AUTO_HIDE_MS = 7500;

const ANNOTATIONS = {
  splat: {
    eyebrow: "3DGS · Native render",
    title:   "3D Gaussian Splat",
    body:    "Per-splat anisotropic Gaussians plus spherical-harmonic view-dependent colour, optimised against ~990 capture frames. Rasterised in real time by Spark on Three.js + WebGL 2.",
    facts: [
      ["Primitive", "Anisotropic 3D Gaussian"],
      ["Per-splat", "Position · scale · rotation · SH · opacity"],
      ["Training",  "Postshot ‖ Lichtfeld (parallel)"],
    ],
  },
  quad: {
    eyebrow: "USD · UsdGeomPointInstancer › Plane",
    title:   "Billboard",
    body:    "The same point cloud, re-expressed as a USD PointInstancer with a UsdGeomPlane prototype. Quad subform renders the full square; Circle subform discards pixels outside the unit disc for soft round impostors.",
    facts: [
      ["Schema",    "UsdGeomPointInstancer"],
      ["Prototype", "UsdGeomPlane (camera-facing)"],
      ["Subforms",  "Quad · Circle"],
    ],
  },
  voxel: {
    eyebrow: "USD · UsdGeomPointInstancer › Cube · Sphere",
    title:   "Voxel",
    body:    "Splats bucketed into a uniform spatial grid; each cell carries an averaged colour. Cube subform uses BoxGeometry, Sphere subform uses IcosahedronGeometry — both ride the same per-instance position / orientation / scale arrays.",
    facts: [
      ["Schema",    "UsdGeomPointInstancer"],
      ["Prototypes","UsdGeomCube · UsdGeomSphere"],
      ["Aggregate", "primvars:displayColor (cell mean)"],
    ],
  },
};

export class UsdAnnotations {
  constructor({ mountEl = document.body } = {}) {
    this.el = document.createElement("aside");
    this.el.id = "usd-annotations";
    this.el.setAttribute("hidden", "");
    this.el.innerHTML = `
      <div class="ua-rule"></div>
      <div class="ua-body">
        <header class="ua-head">
          <span class="ua-eyebrow" data-k="eyebrow"></span>
          <button class="ua-close" data-act="close" title="Dismiss">&times;</button>
        </header>
        <h3 class="ua-title" data-k="title"></h3>
        <p class="ua-text" data-k="body"></p>
        <dl class="ua-facts" data-k="facts"></dl>
      </div>
    `;
    mountEl.appendChild(this.el);

    this.el.querySelector('[data-act="close"]').addEventListener("click", () => this.hide());
    this._timer = null;
  }

  // Show annotation for a layer key ("splat" | "quad" | "voxel").
  // Calling repeatedly while visible swaps the content and restarts the
  // auto-hide timer, so a fast toggle sequence reads cleanly.
  show(layerKey) {
    const a = ANNOTATIONS[layerKey];
    if (!a) return;
    this.el.querySelector('[data-k="eyebrow"]').textContent = a.eyebrow;
    this.el.querySelector('[data-k="title"]')  .textContent = a.title;
    this.el.querySelector('[data-k="body"]')   .textContent = a.body;
    const factsEl = this.el.querySelector('[data-k="facts"]');
    factsEl.innerHTML = (a.facts || []).map(([k, v]) =>
      `<div class="ua-fact"><dt>${k}</dt><dd>${v}</dd></div>`
    ).join("");
    this.el.removeAttribute("hidden");
    // Force reflow so the show transition picks up cleanly on rapid swaps.
    void this.el.offsetHeight;
    this.el.classList.add("show");
    this._clearTimer();
    this._timer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  hide() {
    this.el.classList.remove("show");
    this._clearTimer();
    // Defer hidden attr so the fade-out transition has a frame to run.
    setTimeout(() => {
      if (!this.el.classList.contains("show")) this.el.setAttribute("hidden", "");
    }, 320);
  }

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }
}

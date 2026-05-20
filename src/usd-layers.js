// ---------------------------------------------------------------------------
// UsdLayers — left-side panel for the three render representations
// (Splat / Billboard / Voxel). Each row carries:
//   * eye icon          — toggle visibility (drives controller.setLayerVis)
//   * name              — Splat | Billboard | Voxel
//   * subform pills     — Gaussian/Point, Quad/Circle, Cube/Sphere
//   * size slider       — Point Size, Billboard Size, Voxel Size
//
// Replaces the lil-gui "3DGS/USD" folder, which is hidden by main.js once
// this panel is mounted. Visual language matches SceneLayers (same eye SVG,
// same row-with-actions structure) so the left stack reads as a unified
// "what's in the scene" zone.
// ---------------------------------------------------------------------------

const EYE_OPEN = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF  = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

// Row definitions — each describes one layer family. `section` groups
// rows under a small all-caps section header in the panel:
//   3DGS  → the native gaussian-splat render
//   USD   → alternative renderings exposed as UsdGeomPointInstancer
//           prims (billboard plane, voxel cube/sphere)
// visKey is the boolean field on the params object; layerKey is the
// string the EffectController.setLayerVis() expects.
const ROWS = [
  {
    id: "splat",
    section: "3DGS",
    name: "Splat",
    visKey: "splatLayer",
    layerKey: "splat",
    shapeKey: "splatSubform",
    sizeKey:  "pointSize",
    sizeLabel:"Point Size",
    sizeMin: 0.0005, sizeMax: 0.05,  sizeStep: 0.0005,
    shapes: [
      { val: "Gaussian", label: "Gaussian" },
      { val: "Point",    label: "Point"    },
    ],
    badge: "Anisotropic 3D Gaussian",
  },
  {
    id: "billboard",
    section: "USD",
    name: "Billboard",
    visKey: "quadLayer",
    layerKey: "quad",
    shapeKey: "quadShape",
    sizeKey:  "quadSize",
    sizeLabel:"Billboard Size",
    sizeMin: 0.0001, sizeMax: 0.05,  sizeStep: 0.0001,
    shapes: [
      { val: "quad",   label: "Quad"   },
      { val: "circle", label: "Circle" },
    ],
    badge: "PointInstancer › Plane",
  },
  {
    id: "voxel",
    section: "USD",
    name: "Voxel",
    visKey: "voxelLayer",
    layerKey: "voxel",
    shapeKey: "voxelShape",
    sizeKey:  "voxelSize",
    sizeLabel:"Voxel Size",
    sizeMin: 0.0005, sizeMax: 0.40,  sizeStep: 0.0005,
    shapes: [
      { val: "cube",   label: "Cube"   },
      { val: "sphere", label: "Sphere" },
    ],
    badge: "PointInstancer › Cube · Sphere",
  },
];

const SECTION_BLURBS = {
  "3DGS": "Native render",
  "USD":  "OpenUSD alternative renderings",
};

export class UsdLayers {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mountEl
   * @param {object} opts.params           — effects.params (shared)
   * @param {object} opts.controller       — EffectController with
   *                                          setLayerVis() and applyParams()
   * @param {(shape:string)=>void} opts.onQuadShape  — quadizer.setShape proxy
   * @param {(shape:string)=>void} opts.onVoxelShape — voxelizer.setShape proxy
   * @param {(size:number)=>void}  opts.onQuadSize   — quadizer.setQuadSize
   * @param {(size:number)=>void}  opts.onVoxelSize  — voxelizer.setVoxelSize
   */
  constructor({ mountEl, params, controller, onQuadShape, onVoxelShape, onQuadSize, onVoxelSize, onUploadRequest, onLayerActivate }) {
    this.params       = params;
    this.controller   = controller;
    this.onQuadShape  = onQuadShape;
    this.onVoxelShape = onVoxelShape;
    this.onQuadSize   = onQuadSize;
    this.onVoxelSize  = onVoxelSize;
    this.onUploadRequest = onUploadRequest;
    // Called with the layer key ("splat" | "quad" | "voxel") whenever the
    // user manually toggles a layer ON via the eye icon. Used by main.js
    // to fire a museum-style annotation overlay. Programmatic toggles
    // (camera move) do NOT route through here.
    this.onLayerActivate = onLayerActivate;

    this.el = document.createElement("aside");
    this.el.id = "usd-layers-panel";
    this.el.innerHTML = `
      <header>
        <div class="title">3DGS / USD</div>
        <button class="usd-upload" title="Replace the primary splat — drop a .splat / .ply / .spz / .ksplat">⤓ Use My Own</button>
      </header>
      <ul class="usd-row-list"></ul>
    `;
    mountEl.appendChild(this.el);

    this.listEl = this.el.querySelector(".usd-row-list");
    this.el.querySelector(".usd-upload")?.addEventListener("click", () => this.onUploadRequest?.());
    this._render();
  }

  // Map a shape-row id to the proxy that drives the underlying renderer.
  _runShapeCallback(rowId, val) {
    if (rowId === "billboard") this.onQuadShape?.(val);
    else if (rowId === "voxel") this.onVoxelShape?.(val);
    // splat doesn't need an external callback — applyParams() picks it up.
  }

  _setVisible(row, on) {
    this.params[row.visKey] = !!on;
    this.controller?.setLayerVis(row.layerKey, !!on);
    if (on) this.onLayerActivate?.(row.layerKey);
    this._render();
  }

  _setShape(row, val) {
    this.params[row.shapeKey] = val;
    this.controller?.applyParams?.();
    this._runShapeCallback(row.id, val);
    this._render();
  }

  _setSize(row, val) {
    this.params[row.sizeKey] = val;
    this.controller?.applyParams?.();
    // Quadizer and Voxelizer each own their own ShaderMaterial uniforms —
    // applyParams() only touches effects.js' effectUniforms, so push the
    // size directly to the right renderer here.
    if (row.id === "billboard") this.onQuadSize?.(val);
    if (row.id === "voxel")     this.onVoxelSize?.(val);
    // Live size update for the value chip — no full re-render needed.
    const valEl = this.listEl?.querySelector(`.usd-row[data-id="${row.id}"] .usd-size-val`);
    if (valEl) valEl.textContent = val.toFixed(row.sizeStep < 0.001 ? 4 : 3);
  }

  _render() {
    if (!this.listEl) return;
    let html = "";
    let prevSection = null;
    for (const row of ROWS) {
      if (row.section !== prevSection) {
        html += `
          <li class="usd-section-head">
            <span class="usd-section-name">${row.section}</span>
            <span class="usd-section-blurb">${SECTION_BLURBS[row.section] || ""}</span>
          </li>`;
        prevSection = row.section;
      }
      const on  = this.params[row.visKey] !== false;
      const cur = this.params[row.shapeKey];
      const pills = row.shapes.map(s => `
        <button class="usd-pill ${s.val === cur ? "active" : ""}"
                data-act="shape" data-val="${s.val}">${s.label}</button>
      `).join("");
      const sizeVal = Number(this.params[row.sizeKey] ?? 0);
      const decimals = row.sizeStep < 0.001 ? 4 : 3;
      html += `
        <li class="usd-row ${on ? "" : "hidden-row"}" data-id="${row.id}">
          <div class="usd-row-main">
            <button class="eye" data-act="toggle"
                    title="${on ? "Hide" : "Show"} ${row.name}">${on ? EYE_OPEN : EYE_OFF}</button>
            <span class="usd-name">${row.name}</span>
            <span class="usd-badge" title="${row.badge}">${row.badge}</span>
          </div>
          <div class="usd-row-sub">
            <div class="usd-pill-group">${pills}</div>
            <label class="usd-size">
              <span class="usd-size-label">${row.sizeLabel}</span>
              <input type="range" data-act="size"
                     min="${row.sizeMin}" max="${row.sizeMax}" step="${row.sizeStep}"
                     value="${sizeVal}">
              <span class="usd-size-val">${sizeVal.toFixed(decimals)}</span>
            </label>
          </div>
        </li>
      `;
    }
    this.listEl.innerHTML = html;

    // Wire row buttons. currentTarget so clicks land on the button even
    // when the eye SVG is the literal event target.
    this.listEl.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener(btn.tagName === "INPUT" ? "input" : "click", (e) => {
        const rowEl = e.currentTarget.closest(".usd-row");
        const rowId = rowEl?.dataset.id;
        const row   = ROWS.find(r => r.id === rowId);
        if (!row) return;
        const act   = e.currentTarget.dataset.act;
        if (act === "toggle") {
          this._setVisible(row, this.params[row.visKey] === false);
        } else if (act === "shape") {
          this._setShape(row, e.currentTarget.dataset.val);
        } else if (act === "size") {
          this._setSize(row, Number(e.currentTarget.value));
        }
      });
    });
  }

  // Allow main.js to push external changes (e.g. lil-gui still drives
  // params elsewhere). Re-renders to keep the panel in sync.
  refresh() { this._render(); }
}

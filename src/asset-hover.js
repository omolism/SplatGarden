// ---------------------------------------------------------------------------
// AssetHoverManager — projects each TECH_SPECS asset's worldPos onto the
// viewport as a small hotspot dot. Hovering a dot pops a poster-style
// overlay card with the asset's authoring detail (toolchain chips, media
// comparison grid, key feature bullets, notes, output).
//
// Scaffolding only — media slots show "placeholder" until the user supplies
// the lookdev / texture imagery and patches `tech-spec.js` items with
// `media: { style, original, result, ... }` fields.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const _v = new THREE.Vector3();

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderToolchain(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items.map(t => `<span class="ah-chip">${escapeHtml(t)}</span>`)
              .join('<span class="ah-arrow">▸</span>');
}

function renderCard(it) {
  const tc = renderToolchain(it.toolchain);
  const features = it.keyFeatures ?? [];
  const media    = it.media ?? {};

  return `
    <button class="ah-close" data-act="close" title="Close">×</button>
    <header class="ah-head">
      <div class="ah-name">${escapeHtml(it.name)}</div>
      ${it.location ? `<span class="ah-loc">${escapeHtml(it.location)}</span>` : ""}
    </header>

    ${tc ? `<section class="ah-section">
      <div class="ah-sec-title">Toolchain</div>
      <div class="ah-chain">${tc}</div>
    </section>` : ""}

    <section class="ah-section ah-media-row">
      <div class="ah-sec-title">Texture Stylization</div>
      <div class="ah-triptych">
        <figure>
          <div class="ah-frame">${media.style ? `<img src="${escapeHtml(media.style)}" alt="Style reference">` : `<div class="ah-ph">placeholder</div>`}</div>
          <figcaption>Style Reference</figcaption>
        </figure>
        <figure>
          <div class="ah-frame">${media.original ? `<img src="${escapeHtml(media.original)}" alt="Original texture">` : `<div class="ah-ph">placeholder</div>`}</div>
          <figcaption>Original Texture</figcaption>
        </figure>
        <figure>
          <div class="ah-frame">${media.result ? `<img src="${escapeHtml(media.result)}" alt="Result">` : `<div class="ah-ph">placeholder</div>`}</div>
          <figcaption>Result</figcaption>
        </figure>
      </div>
    </section>

    ${features.length > 0 ? `<section class="ah-section">
      <div class="ah-sec-title">Key Features</div>
      <ul class="ah-bullets">
        ${features.map(f => `<li>${escapeHtml(f)}</li>`).join("")}
      </ul>
    </section>` : ""}

    ${Array.isArray(media.pipeline) && media.pipeline.length > 0 ? `<section class="ah-section">
      <div class="ah-sec-title">Pipeline</div>
      <div class="ah-strip">
        ${media.pipeline.map(p => `
          <figure>
            <div class="ah-frame">${p.src ? `<img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.label ?? "")}">` : `<div class="ah-ph">placeholder</div>`}</div>
            <figcaption>${escapeHtml(p.label ?? "")}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>` : ""}

    ${it.note ? `<section class="ah-section ah-note">${escapeHtml(it.note)}</section>` : ""}

    <footer class="ah-foot">
      ${it.output ? `<div class="ah-foot-row"><span class="ah-k">Output</span><span class="ah-v">${escapeHtml(it.output)}</span></div>` : ""}
      ${it.source ? `<div class="ah-foot-row"><span class="ah-k">Source</span><span class="ah-v">${escapeHtml(it.source)}</span></div>` : ""}
      ${it.worldPos ? `<div class="ah-foot-row"><span class="ah-k">Pos</span><span class="ah-v">${it.worldPos.map(n => Number(n).toFixed(3)).join(", ")}</span></div>` : ""}
    </footer>
  `;
}

export class AssetHoverManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mountEl   — container for dots + card
   * @param {THREE.Camera} opts.camera
   * @param {HTMLCanvasElement} opts.canvas
   * @param {Array}  opts.items          — TECH_SPECS items (with worldPos[])
   *
   * `worldPos` values are picked from the artist's source tool. That tool
   * exports with +Z forward (into the scene); Three.js uses -Z forward.
   * X and Y axes already match. We therefore flip Z only when projecting
   * to land the dots on the actual asset in the rendered scene.
   */
  constructor({ mountEl, camera, canvas, items }) {
    this.camera         = camera;
    this.canvas         = canvas;
    this.items          = (items || []).filter(it => Array.isArray(it.worldPos));
    this._pinned        = null;   // item locked open by click — survives mouseleave
    this._visible       = true;   // whole layer toggle; user-uploaded splats hide it
    this.onAssetSelect  = null;   // called with the item on click (camera fly-to hook)

    this.dots = this.items.map(it => {
      const dot = document.createElement("div");
      dot.className = "asset-hotspot";
      dot.innerHTML = `
        <span class="ahot-ring"></span>
        <span class="ahot-dot"></span>
        <span class="ahot-label">${escapeHtml(it.name)}</span>
      `;
      dot.addEventListener("mouseenter", () => { if (!this._pinned) this._show(it); });
      dot.addEventListener("mouseleave", () => { if (!this._pinned) this._hide(); });
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        const same = this._pinned === it;
        this._pinned = same ? null : it;
        if (this._pinned) {
          this._show(it);
          this.onAssetSelect?.(it);   // camera fly-to (subscribed in main.js)
        } else {
          this._hide();
        }
      });
      mountEl.appendChild(dot);
      // Z-flip only — tool exports +Z forward, Three.js wants -Z forward.
      return {
        item:  it,
        el:    dot,
        world: new THREE.Vector3(it.worldPos[0], it.worldPos[1], -it.worldPos[2]),
      };
    });

    this.card = document.createElement("aside");
    this.card.id = "asset-hover-card";
    this.card.setAttribute("hidden", "");
    this.card.addEventListener("click", (e) => {
      if (e.target?.dataset?.act === "close") {
        this._pinned = null;
        this._hide();
      }
    });
    mountEl.appendChild(this.card);

    // Click outside the card un-pins.
    document.addEventListener("click", (e) => {
      if (!this._pinned) return;
      if (this.card.contains(e.target)) return;
      if (this.dots.some(d => d.el.contains(e.target))) return;
      this._pinned = null;
      this._hide();
    });
  }

  _show(it) {
    this.card.innerHTML = renderCard(it);
    this.card.removeAttribute("hidden");
    this.card.classList.toggle("pinned", !!this._pinned);
  }

  _hide() {
    this.card.setAttribute("hidden", "");
    this.card.classList.remove("pinned");
  }

  // Toggle the entire hotspot layer. Used to hide the bundled scene's
  // asset markers when the user drops in their own splat.
  setVisible(on) {
    this._visible = !!on;
    if (!on) {
      this._pinned = null;
      this._hide();
    }
    for (const d of this.dots) {
      d.el.style.display = this._visible ? "" : "none";
    }
  }

  // Call once per frame after the camera matrices are current.
  update() {
    if (!this._visible || !this.camera || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    for (const d of this.dots) {
      _v.copy(d.world).project(this.camera);
      const offscreen = _v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1;
      if (offscreen) {
        d.el.style.display = "none";
        continue;
      }
      d.el.style.display = "flex";
      const x = rect.left + (_v.x * 0.5 + 0.5) * rect.width;
      const y = rect.top  + (1 - (_v.y * 0.5 + 0.5)) * rect.height;
      d.el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}

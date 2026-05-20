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
import { renderCompare, wireCompareFrame } from "./tech-spec.js";

const _v = new THREE.Vector3();

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderSimVideo(v) {
  if (!v) return "";
  const flags = [
    v.autoplay ? "autoplay" : "",
    v.muted    ? "muted"    : "",
    v.loop     ? "loop"     : "",
    "playsinline",
  ].filter(Boolean).join(" ");
  const poster = v.poster ? ` poster="${escapeHtml(v.poster)}"` : "";
  const inner = v.url
    ? `<video class="ah-sim-video" src="${escapeHtml(v.url)}" ${flags}${poster}></video>`
    : `<div class="ah-sim-ph">
         <div class="ah-sim-ph-eyebrow">Houdini 3DGS SIM</div>
         <div class="ah-sim-ph-body">drop a .mp4 / .webm into <code>simVideo.url</code></div>
       </div>`;
  return `
    <section class="ah-section ah-sim">
      <div class="ah-sec-title">${escapeHtml(v.label || "Simulation")}</div>
      <div class="ah-sim-frame">${inner}</div>
    </section>`;
}

function renderEmbed(e) {
  if (!e || !e.src) return "";
  // Default 16:9; per-asset embeds can override with e.aspectRatio
  // (any valid CSS aspect-ratio value, e.g. "3 / 2" or "1000 / 667").
  const aspectStyle = e.aspectRatio ? ` style="aspect-ratio: ${escapeHtml(e.aspectRatio)};"` : "";
  return `
    <section class="ah-section ah-embed">
      <div class="ah-sec-title">${escapeHtml(e.label || "Video")}</div>
      <div class="ah-embed-frame"${aspectStyle}>
        <iframe
          src="${escapeHtml(e.src)}"
          title="${escapeHtml(e.title || e.label || "embedded video")}"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen></iframe>
      </div>
    </section>`;
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

    ${it.simVideo ? renderSimVideo(it.simVideo) : ""}

    ${it.embed ? renderEmbed(it.embed) : ""}

    ${(media.style || media.original || media.result) ? `<section class="ah-section ah-media-row">
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
    </section>` : ""}

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

    ${it.compare ? `<section class="ah-section">
      <div class="ah-sec-title">Before / After</div>
      ${renderCompare(it.compare)}
    </section>` : ""}

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
    this._hiddenNames   = new Set();   // per-asset toggle from the Pipeline drawer
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

    // Draggable card — pointerdown on the header (anywhere except the
    // close button) starts a drag. Position is persisted across hide /
    // re-show so the user's preferred slot survives switching assets.
    this._cardPos = null;     // { x, y } once the user drags
    this._dragState = null;
    this.card.addEventListener("pointerdown", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (!target.closest(".ah-head")) return;       // only the header is the grab handle
      if (target.closest("[data-act]")) return;      // skip the × button
      const rect = this.card.getBoundingClientRect();
      this._dragState = {
        ox: e.clientX - rect.left,
        oy: e.clientY - rect.top,
        pid: e.pointerId,
      };
      this.card.setPointerCapture?.(e.pointerId);
      this.card.classList.add("dragging");
      e.preventDefault();
    });
    this.card.addEventListener("pointermove", (e) => {
      if (!this._dragState || e.pointerId !== this._dragState.pid) return;
      const x = e.clientX - this._dragState.ox;
      const y = e.clientY - this._dragState.oy;
      this._setCardPos(x, y);
    });
    const endDrag = (e) => {
      if (!this._dragState || (e && e.pointerId !== undefined && e.pointerId !== this._dragState.pid)) return;
      this._dragState = null;
      this.card.classList.remove("dragging");
    };
    this.card.addEventListener("pointerup", endDrag);
    this.card.addEventListener("pointercancel", endDrag);
  }

  // Pin the card to an explicit (x, y) screen coordinate. Once dragged,
  // the position is remembered so subsequent _show() calls don't snap
  // back to the centered default.
  _setCardPos(x, y) {
    // Clamp into the viewport so the card never escapes off-screen.
    const margin = 8;
    const w  = this.card.offsetWidth;
    const h  = this.card.offsetHeight;
    const cx = Math.max(margin, Math.min(window.innerWidth  - w - margin, x));
    const cy = Math.max(margin, Math.min(window.innerHeight - h - margin, y));
    this._cardPos = { x: cx, y: cy };
    this.card.style.left      = cx + "px";
    this.card.style.top       = cy + "px";
    this.card.style.transform = "none";   // drop the default centering transform
  }

  _show(it) {
    this.card.innerHTML = renderCard(it);
    this.card.removeAttribute("hidden");
    this.card.classList.toggle("pinned", !!this._pinned);
    // Wire any inline before/after compare widget that's now in the DOM —
    // the .ts-compare CSS already covers visuals; this binds the drag.
    this.card.querySelectorAll(".ts-compare .cmp-frame").forEach(wireCompareFrame);

    // Position the card NEAR the hovered dot (right of it if there's
    // room, otherwise left), instead of pinned to the centre. The old
    // centre layout was right under the asset cluster, so quick mouse
    // moves between adjacent dots flashed the card in/out at the same
    // spot. Anchoring beside the dot makes the card stable visually.
    if (this._cardPos) {
      // User has dragged — honour the parked spot across asset swaps.
      this._setCardPos(this._cardPos.x, this._cardPos.y);
    } else {
      this._anchorCardToDot(it);
    }
  }

  // Place the card next to the dot's current screen position. Tries
  // right, then left; clamps to viewport so it never falls off-screen.
  _anchorCardToDot(it) {
    const dotEntry = this.dots.find(d => d.item === it);
    if (!dotEntry) return;
    const dotRect = dotEntry.el.getBoundingClientRect();
    // Measure the card by rendering off-screen first.
    this.card.style.left      = "-9999px";
    this.card.style.top       = "-9999px";
    this.card.style.transform = "none";
    const w = this.card.offsetWidth  || 600;
    const h = this.card.offsetHeight || 400;
    const gap    = 28;
    const margin = 12;
    // Prefer right of the dot; fall back to left, then a fixed
    // top-right slot if the dot is centered horizontally.
    let x = dotRect.right + gap;
    let y = dotRect.top - 20;
    if (x + w > window.innerWidth - margin) {
      x = dotRect.left - w - gap;
    }
    if (x < margin) {
      x = Math.max(margin, window.innerWidth - w - margin);
    }
    y = Math.max(margin, Math.min(window.innerHeight - h - margin, y));
    this.card.style.left = x + "px";
    this.card.style.top  = y + "px";
  }

  _hide() {
    this.card.setAttribute("hidden", "");
    this.card.classList.remove("pinned");
  }

  // Toggle the entire hotspot layer. Used both by the Tech Spec master
  // Enable and by user-uploaded splats (which hide the bundled markers).
  // When turning OFF we explicitly hide every dot; when turning ON we
  // let the per-frame update() loop restore visibility so per-asset
  // _hiddenNames entries stay hidden (no flash on master re-enable).
  setVisible(on) {
    this._visible = !!on;
    if (!on) {
      this._pinned = null;
      this._hide();
      for (const d of this.dots) {
        d.el.style.display = "none";
      }
    }
  }

  // Hide / show a single asset by name. Wired from the Pipeline drawer's
  // per-item ON/OFF toggle so users can declutter the scene for screenshots.
  // The dot itself stays hidden via the _hiddenNames check in update().
  setItemVisible(name, on) {
    if (on) this._hiddenNames.delete(name);
    else    this._hiddenNames.add(name);
    if (!on && this._pinned?.name === name) {
      this._pinned = null;
      this._hide();
    }
  }

  // Call once per frame after the camera matrices are current.
  update() {
    if (!this._visible || !this.camera || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    for (const d of this.dots) {
      // Per-asset toggle from the Pipeline drawer wins over the projection
      // logic — if hidden, skip the math entirely.
      if (this._hiddenNames.has(d.item.name)) {
        d.el.style.display = "none";
        continue;
      }
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

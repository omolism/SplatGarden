// ---------------------------------------------------------------------------
// MobileUI — one-thumb friendly bottom-bar + slide-up sheet, plus asset
// short-tap toast / long-press detail sheet. Only mounted when body.touch
// is set (main.js does the gating).
//
// Layout summary:
//
//   ┌─────────────────────────────────┐
//   │  hamburger (existing)           │ ← #mobile-nav-btn (advanced / help)
//   │                                 │
//   │       3D viewport               │
//   │                                 │
//   │  [ sheet content slides up ]    │ ← #mobile-sheet (drag-handle, swipe-down)
//   ├─────────────────────────────────┤
//   │ [Views][FX][Cam][Info][Share]   │ ← #mobile-bottombar
//   └─────────────────────────────────┘
//
// The bottom-bar owns the *daily-use* surfaces; the hamburger still owns
// the advanced / occasional ones (Pipeline, Quick Guide, Profiler, etc.).
// One sheet at a time; re-tapping the same toolbar button closes it.
// ---------------------------------------------------------------------------

import { renderCard as renderAssetCard } from "./asset-hover.js";

// Lucide-style line icons. Stroke 1.7 reads crisp at the rendered ~22 px.
const ICONS = {
  views: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M2.5 12C4.5 7.5 8 5.5 12 5.5s7.5 2 9.5 6.5c-2 4.5-5.5 6.5-9.5 6.5S4.5 16.5 2.5 12z"/>
          </svg>`,
  fx:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
            <circle cx="12" cy="12" r="3.5"/>
          </svg>`,
  cam:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6.5" width="14" height="11" rx="1.5"/>
            <path d="M17 10l4.5-2.5v9L17 14z"/>
          </svg>`,
  info:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <line x1="12" y1="11" x2="12" y2="16.5"/>
            <line x1="12" y1="7.6" x2="12" y2="7.6"/>
          </svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v12"/>
            <polyline points="8 7 12 3 16 7"/>
            <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>
          </svg>`,
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ----------------------------------------------------------------------
// BottomSheet — single shared slide-up panel. The toolbar (and asset
// long-press) swaps the body content. Drag-down on the handle pulls
// the sheet down to follow the finger; >80 px of pull closes it.
// ----------------------------------------------------------------------
class BottomSheet {
  constructor() {
    this.open      = false;
    this.activeKey = null;
    this._dragStart = null;
    this._dragY     = 0;
    this._onDismiss = null;

    this.backdrop = document.createElement("div");
    this.backdrop.id = "mobile-sheet-backdrop";
    document.body.appendChild(this.backdrop);

    this.el = document.createElement("aside");
    this.el.id = "mobile-sheet";
    this.el.setAttribute("role", "dialog");
    this.el.innerHTML = `
      <div class="ms-handle" data-grab aria-hidden="true"></div>
      <div class="ms-head">
        <span class="ms-title">—</span>
        <button class="ms-close" aria-label="Close">&times;</button>
      </div>
      <div class="ms-body"></div>
    `;
    document.body.appendChild(this.el);

    this.titleEl  = this.el.querySelector(".ms-title");
    this.bodyEl   = this.el.querySelector(".ms-body");
    this.handleEl = this.el.querySelector(".ms-handle");

    this.backdrop.addEventListener("pointerdown", () => this.close());
    this.el.querySelector(".ms-close").addEventListener("click", () => this.close());

    // Drag-down dismissal. Capture pointer so we keep tracking even if
    // the finger leaves the handle's bounds.
    this.handleEl.addEventListener("pointerdown", (e) => {
      this._dragStart = e.clientY;
      this._dragY     = 0;
      this.handleEl.setPointerCapture(e.pointerId);
      this.el.classList.add("dragging");
    });
    this.handleEl.addEventListener("pointermove", (e) => {
      if (this._dragStart == null) return;
      this._dragY = Math.max(0, e.clientY - this._dragStart);
      this.el.style.transform = `translateY(${this._dragY}px)`;
    });
    const endDrag = () => {
      if (this._dragStart == null) return;
      this._dragStart = null;
      this.el.classList.remove("dragging");
      if (this._dragY > 80) {
        this.close();
      } else {
        this.el.style.transform = "";
      }
      this._dragY = 0;
    };
    this.handleEl.addEventListener("pointerup",     endDrag);
    this.handleEl.addEventListener("pointercancel", endDrag);
  }

  show(key, title, contentNode) {
    this.activeKey = key;
    this.titleEl.textContent = title;
    this.bodyEl.replaceChildren(contentNode);
    this.open = true;
    this.el.style.transform = "";
    this.el.classList.add("open");
    this.backdrop.classList.add("open");
  }

  close() {
    if (!this.open) return;
    this.open = false;
    const prevKey = this.activeKey;
    this.activeKey = null;
    this.el.classList.remove("open");
    this.backdrop.classList.remove("open");
    this.el.style.transform = "";
    this._onDismiss?.(prevKey);
  }

  isOpen(key) { return this.open && (!key || this.activeKey === key); }
}

// ----------------------------------------------------------------------
// MobileUI — main entry point. Wires the toolbar to the sheet, builds
// each section lazily so its DOM reflects current state at open time.
// ----------------------------------------------------------------------
export class MobileUI {
  /**
   * @param {object} refs
   * @param {AnnotationManager} refs.annotations
   * @param {*}      refs.gui            — lil-gui root
   * @param {object} refs.effectParams   — { effect, ... } from effects.js
   * @param {*}      refs.effects        — EffectController instance
   * @param {*}      refs.postfx         — setupPostFX return
   * @param {*}      refs.assetHover     — AssetHoverManager (for short-tap / long-press)
   */
  constructor(refs) {
    this.refs = refs;
    this.sheet = new BottomSheet();
    this._buildBar();
    this._buildContents();
    this._wireAssetTouch();
  }

  _buildBar() {
    this.bar = document.createElement("nav");
    this.bar.id = "mobile-bottombar";
    this.bar.setAttribute("aria-label", "Main");
    this.bar.innerHTML = `
      <button data-tab="views"  aria-label="Viewpoints"><span class="mb-ico">${ICONS.views}</span><span class="mb-lbl">Views</span></button>
      <button data-tab="fx"     aria-label="Effects"   ><span class="mb-ico">${ICONS.fx   }</span><span class="mb-lbl">Effects</span></button>
      <button data-tab="cam"    aria-label="Camera"    ><span class="mb-ico">${ICONS.cam  }</span><span class="mb-lbl">Camera</span></button>
      <button data-tab="info"   aria-label="Info"      ><span class="mb-ico">${ICONS.info }</span><span class="mb-lbl">Info</span></button>
      <button data-tab="share"  aria-label="Share"     ><span class="mb-ico">${ICONS.share}</span><span class="mb-lbl">Share</span></button>
    `;
    document.body.appendChild(this.bar);

    this.bar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tab]");
      if (!btn) return;
      const tab = btn.dataset.tab;
      // Share is a one-shot action (no sheet).
      if (tab === "share") { this._doShare(); return; }
      // Re-tapping the active tab closes the sheet (toggle behaviour).
      if (this.sheet.isOpen(tab)) {
        this.sheet.close();
        this._setActive(null);
        return;
      }
      const built = this._sections[tab]();
      this.sheet.show(tab, built.title, built.node);
      this._setActive(tab);
    });

    // Keep the bottom-bar's active-tab highlight in sync with sheet state.
    this.sheet._onDismiss = () => this._setActive(null);
  }

  _setActive(tab) {
    this.bar.querySelectorAll("button[data-tab]").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
  }

  _buildContents() {
    // Lazy factories — each invocation rebuilds the DOM so toggles
    // reflect current state (e.g. active viewpoint, postfx.enabled).
    this._sections = {
      views: () => ({ title: "Viewpoints",   node: this._viewsContent() }),
      fx:    () => ({ title: "Effects",      node: this._fxContent()    }),
      cam:   () => ({ title: "Camera Move",  node: this._camContent()   }),
      info:  () => ({ title: "Scene Info",   node: this._infoContent()  }),
    };
  }

  // ---- Views ----------------------------------------------------------
  _viewsContent() {
    const wrap = document.createElement("div");
    wrap.className = "ms-views";
    const annotations = this.refs.annotations;
    if (!annotations || annotations.viewpoints.length === 0) {
      wrap.innerHTML = `<div class="ms-empty">No viewpoints yet.</div>`;
      return wrap;
    }
    const list = document.createElement("ul");
    list.className = "ms-views-list";
    annotations.viewpoints.forEach((vp, i) => {
      const li = document.createElement("li");
      const isActive = annotations.activeId === vp.id;
      if (isActive) li.classList.add("active");
      li.innerHTML = `
        <span class="ms-vp-num">${i + 1}</span>
        <span class="ms-vp-name">${escapeHtml(vp.name)}</span>
        ${isActive ? `<span class="ms-vp-badge">Active</span>` : ""}
      `;
      li.addEventListener("click", () => {
        annotations.flyTo(vp.id);
        this.sheet.close();
      });
      list.appendChild(li);
    });
    wrap.appendChild(list);
    return wrap;
  }

  // ---- Effects (curated) ---------------------------------------------
  _fxContent() {
    const wrap = document.createElement("div");
    wrap.className = "ms-fx";
    const { effectParams, postfx, gui } = this.refs;

    // Click-effect chips. Keeps the most visually-distinct subset; the
    // others stay reachable through Advanced.
    const EFFECTS = [
      "Wave & Tint", "Dissolve & Reform", "Scan Line",
      "Spiral Smear", "Vortex Drift", "Slime Molds", "Feather Roots",
    ];
    wrap.appendChild(this._row("Click effect"));
    const chips = document.createElement("div");
    chips.className = "ms-chips";
    // Resolve the lil-gui "Effect" controller once so the chips can drive
    // it via setValue() — that path fires onChange (controller.applyParams)
    // exactly the way the desktop dropdown does, instead of bypassing the
    // gui's internal state and getting it out of sync.
    const effectCtrl = gui?.controllersRecursive?.()?.find(c => c._name === "Effect");
    for (const name of EFFECTS) {
      const chip = document.createElement("button");
      chip.className = "ms-chip" + (effectParams.effect === name ? " on" : "");
      chip.textContent = name;
      chip.addEventListener("click", () => {
        if (effectCtrl) effectCtrl.setValue(name);
        else            effectParams.effect = name;
        chips.querySelectorAll(".ms-chip").forEach(c =>
          c.classList.toggle("on", c.textContent === name));
      });
      chips.appendChild(chip);
    }
    wrap.appendChild(chips);

    // Post-process master toggle — wraps the Post-Process › Enable
    // controller on the lil-gui side. setValue() fires the onChange
    // chain so every pass's enabled-state gets re-evaluated.
    const postCtrl = gui?.controllersRecursive?.()?.find(c =>
      c._name === "Enable" && c.object === postfx?.params);
    if (postCtrl) {
      wrap.appendChild(this._toggleRow("Post-process FX", !!postfx.params.postEnable, (next) => {
        postCtrl.setValue(next);
      }));
    }

    // HDR sky toggle, if window.__hdrParams was exposed (it isn't always
    // — depends on whether the user opened the HDR folder before).
    // Skipped silently when not available.

    // Advanced — pin the full lil-gui into the sheet so all 80+ controls
    // are reachable for power users. On dismiss we restore the gui to
    // its previous DOM position (top-right) so desktop callers don't get
    // surprised after an HMR.
    const adv = document.createElement("button");
    adv.className = "ms-action ms-advanced";
    adv.innerHTML = `<span>Open Studio · Advanced</span><span class="ms-arrow">›</span>`;
    adv.addEventListener("click", () => this._openAdvanced());
    wrap.appendChild(adv);

    return wrap;
  }

  _openAdvanced() {
    const { gui } = this.refs;
    if (!gui) return;
    const guiEl = gui.domElement;
    const oldParent = guiEl.parentNode;
    const oldStyle = {
      top:        guiEl.style.top,
      right:      guiEl.style.right,
      maxHeight:  guiEl.style.maxHeight,
      position:   guiEl.style.position,
      width:      guiEl.style.width,
    };
    const sheetWrap = document.createElement("div");
    sheetWrap.className = "ms-gui-wrap";
    sheetWrap.appendChild(guiEl);
    guiEl.style.position  = "static";
    guiEl.style.top       = "";
    guiEl.style.right     = "";
    guiEl.style.maxHeight = "";
    guiEl.style.width     = "100%";
    gui.open();
    this.sheet.show("advanced", "Studio · Advanced", sheetWrap);
    this._setActive("fx");

    // Restore on dismiss. Note: chains with whatever onDismiss was set
    // previously so the toolbar's active-tab clear still runs.
    const prev = this.sheet._onDismiss;
    this.sheet._onDismiss = (key) => {
      guiEl.style.position  = oldStyle.position;
      guiEl.style.top       = oldStyle.top;
      guiEl.style.right     = oldStyle.right;
      guiEl.style.maxHeight = oldStyle.maxHeight;
      guiEl.style.width     = oldStyle.width;
      oldParent?.appendChild(guiEl);
      gui.close();
      this.sheet._onDismiss = prev;
      prev?.(key);
    };
  }

  // ---- Camera ---------------------------------------------------------
  _camContent() {
    const wrap = document.createElement("div");
    wrap.className = "ms-cam";
    wrap.innerHTML = `
      <button class="ms-action ms-action-primary" data-act="play">
        <span class="ms-icon-glyph">▶</span> Play / Pause
      </button>
      <button class="ms-action" data-act="stop">
        <span class="ms-icon-glyph">■</span> Stop &amp; reset
      </button>
      <button class="ms-action" data-act="replay">
        <span class="ms-icon-glyph">↻</span> Replay intro
      </button>
      <div class="ms-help">Plays the authored fly-through. Stop returns full control to drag / WASD.</div>
    `;
    wrap.querySelector('[data-act="play"]'  ).addEventListener("click", () => window.__camMovePlayPause?.());
    wrap.querySelector('[data-act="stop"]'  ).addEventListener("click", () => window.__camMoveStop?.());
    wrap.querySelector('[data-act="replay"]').addEventListener("click", () => window.__replayIntro?.());
    return wrap;
  }

  // ---- Info -----------------------------------------------------------
  _infoContent() {
    const wrap = document.createElement("div");
    wrap.className = "ms-info";
    const splatCount = (window.__hudRefs?.splat?.packedSplats?.numSplats)
                    || (this.refs.splat?.packedSplats?.numSplats)
                    || 0;
    const fps = Math.round(this._lastFps ?? 0);
    wrap.innerHTML = `
      <div class="ms-info-grid">
        <div class="ms-info-k">FPS</div>
        <div class="ms-info-v">${fps || "—"}</div>
        <div class="ms-info-k">Splats</div>
        <div class="ms-info-v">${splatCount.toLocaleString()}</div>
        <div class="ms-info-k">Renderer</div>
        <div class="ms-info-v">Spark · Three.js · WebGL 2</div>
        <div class="ms-info-k">Scene</div>
        <div class="ms-info-v">SplatGarden</div>
      </div>
      <button class="ms-action" data-act="pipeline">Open Pipeline</button>
      <button class="ms-action" data-act="guide">Open Quick Guide</button>
      <button class="ms-action" data-act="credits">Credits</button>
    `;
    // Pipeline = the tech-spec asset drawer. Moved here from the (now-
    // empty) hamburger so users on touch still have a way in. Closes
    // the sheet first so the drawer slide-in isn't covered by it.
    wrap.querySelector('[data-act="pipeline"]').addEventListener("click", () => {
      this.sheet.close();
      window.__techSpec?.toggle?.();
    });
    wrap.querySelector('[data-act="guide"]').addEventListener("click", () => {
      this.sheet.close();
      window.__keyHints?.showFor?.(6500);
    });
    wrap.querySelector('[data-act="credits"]').addEventListener("click", () => {
      this.sheet.close();
      window.__credits?.toggle?.();
    });
    return wrap;
  }

  // Called by main.js's per-frame loop so the Info sheet (when open)
  // can show a live-ish FPS reading. Cheap: just stores the dt.
  tickFps(dt) {
    if (!dt || dt <= 0) return;
    const inst = 1 / dt;
    // EMA so the readout doesn't flicker every frame.
    this._lastFps = this._lastFps == null ? inst : this._lastFps * 0.9 + inst * 0.1;
  }

  // ---- Share ----------------------------------------------------------
  async _doShare() {
    const url   = location.href;
    const title = document.title || "SplatGarden Studio";
    if (navigator.share) {
      try { await navigator.share({ url, title }); return; } catch { /* user cancelled */ }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        this._toast("Link copied");
        return;
      } catch {}
    }
    this._toast("Tap-and-hold the URL bar to share");
  }

  // ---- Asset tap → detail sheet --------------------------------------
  // Every tap on a 3D hotspot opens the full asset card in a bottom
  // sheet (same content the desktop hover card shows). Originally I
  // gated this behind a 480 ms long-press to keep short-taps light, but
  // long-press is undiscoverable on mobile — users tapped, nothing
  // visible happened, and the asset card was effectively missing on
  // touch. Tap-to-reveal is the conventional pattern and matches what
  // the desktop click already does (fly + show card).
  _wireAssetTouch() {
    const ah = this.refs.assetHover;
    if (!ah) return;
    const openAssetSheet = (it) => {
      const node = document.createElement("div");
      node.className = "ms-asset-card";
      node.innerHTML = renderAssetCard(it);
      // The card's own × button uses data-act="close"; route it to the
      // sheet's close so users get one consistent dismiss path.
      node.querySelector('[data-act="close"]')?.addEventListener("click", () => this.sheet.close());
      this.sheet.show("asset", it.name, node);
      this._setActive(null);
    };
    // Short tap AND long press open the same sheet. The long-press
    // path stays wired in asset-hover.js as a backup gesture — if a
    // user holds rather than taps, they still get the card.
    ah.onAssetShortTap  = openAssetSheet;
    ah.onAssetLongPress = openAssetSheet;
  }

  // ---- Toast helper ---------------------------------------------------
  _toast(msg, durationMs = 2200) {
    let t = document.getElementById("mobile-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "mobile-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), durationMs);
  }

  // ---- DOM-builder helpers -------------------------------------------
  _row(label) {
    const d = document.createElement("div");
    d.className = "ms-row-label";
    d.textContent = label;
    return d;
  }
  _toggleRow(label, initialOn, onChange) {
    const d = document.createElement("div");
    d.className = "ms-toggle-row";
    d.innerHTML = `
      <span class="ms-toggle-label">${escapeHtml(label)}</span>
      <button class="ms-switch ${initialOn ? "on" : ""}" aria-pressed="${initialOn}">
        <span class="ms-switch-knob"></span>
      </button>
    `;
    const btn = d.querySelector(".ms-switch");
    btn.addEventListener("click", () => {
      const next = !btn.classList.contains("on");
      btn.classList.toggle("on", next);
      btn.setAttribute("aria-pressed", String(next));
      onChange(next);
    });
    return d;
  }
}

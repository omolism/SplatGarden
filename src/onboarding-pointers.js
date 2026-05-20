// ---------------------------------------------------------------------------
// OnboardingPointers — animated arrow-tooltip pairs that pop up at the end
// of the intro camera move, calling out the discoverable surfaces of the
// app. Each tip resolves its `selector` to a live element at show time
// and anchors itself relative to that element's bounding rect, so the
// pointer always lands on its target regardless of layout (panel moved,
// viewport rotated, sidebar hidden on touch, etc.).
//
// Auto-dismisses after `autoHideMs`; clicking anywhere or pressing Esc
// dismisses early. Tips whose target isn't in the DOM (or has zero size,
// i.e. CSS-hidden) are silently skipped — that's how the touch layout
// avoids pointing at the desktop-only sidebar, and how desktop avoids
// pointing at the bottom-bar that doesn't exist there.
// ---------------------------------------------------------------------------

// Per-tip schema:
//   label    — bold heading on the card
//   sub      — small mono caption under the label
//   selector — querySelector for the target; multiple selectors allowed
//              comma-separated and the first match wins
//   side     — which side of the target to place the card on:
//              "above" | "below" | "left" | "right"
//              The arrow's rotation + the card-vs-arrow order in flex
//              are derived from this so the arrow always points AT the
//              target's nearest edge.

const TIPS_DESKTOP = [
  {
    label: "Scene layers",
    sub: "Drag-drop a .splat to add",
    selector: "#scene-panel, #sidebar",
    side: "right",
  },
  {
    label: "3DGS / USD",
    sub: "Toggle layers + swap subforms",
    selector: "#usd-layers-panel",
    side: "left",
  },
  {
    label: "Tech Breakdown",
    sub: "Press T",
    selector: "#toolbar, #status",
    side: "above",
  },
];

// On touch the desktop panels are CSS-hidden — point at the bottom-bar
// tabs instead, since that's the canonical mobile entry point for the
// same actions. The top-right Studio button is the showcase surface
// (3DGS / USD layer modes — the *core* of the project), so it gets
// the first callout to draw the eye there before users notice the
// bottom-bar tabs.
const TIPS_TOUCH = [
  {
    label: "3DGS / USD",
    sub: "Toggle layers · swap subforms",
    selector: "#mobile-studio-btn",
    side: "below",
  },
  {
    label: "Effects",
    sub: "Click effects + Studio Advanced",
    selector: '#mobile-bottombar [data-tab="fx"]',
    side: "above",
  },
  {
    label: "Camera",
    sub: "Play / replay the move",
    selector: '#mobile-bottombar [data-tab="cam"]',
    side: "above",
  },
];

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export class OnboardingPointers {
  constructor({ mountEl = document.body, autoHideMs = 5500 } = {}) {
    this.autoHideMs = autoHideMs;
    this._visible   = false;
    this._timer     = null;
    this._tips      = [];

    this.el = document.createElement("div");
    this.el.id = "onboarding-pointers";
    this.el.setAttribute("hidden", "");
    mountEl.appendChild(this.el);

    this._onAnyKey = (e) => {
      if (!this._visible) return;
      if (e.key === "Escape") { e.preventDefault(); this.hide(); }
    };
    this._onAnyClick = () => { if (this._visible) this.hide(); };
  }

  // Build (or rebuild) the tip DOM and anchor each one to its target's
  // current rect. Called on every show() so layout changes between calls
  // (touch ⇆ desktop, viewport rotation, panels added later) re-position
  // cleanly. Tips without a visible target are silently skipped.
  _build() {
    const isTouch = document.body.classList.contains("touch");
    const defs    = isTouch ? TIPS_TOUCH : TIPS_DESKTOP;
    this.el.innerHTML = "";
    this._tips = [];

    let revealedIndex = 0;
    for (const def of defs) {
      const target = document.querySelector(def.selector);
      if (!target) continue;
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;   // hidden element

      const tip = document.createElement("div");
      tip.className = `op-tip op-side-${def.side}`;
      tip.style.setProperty("--delay", `${revealedIndex * 0.35}s`);
      tip.innerHTML = `
        <div class="op-card">
          <div class="op-label">${escapeHtml(def.label)}</div>
          <div class="op-sub">${escapeHtml(def.sub)}</div>
        </div>
        <div class="op-arrow-wrap">
          <svg class="op-arrow" viewBox="0 0 80 40" aria-hidden="true">
            <path d="M5 20 Q 40 5 75 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M68 14 L 76 20 L 68 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      `;
      this.el.appendChild(tip);
      this._positionTip(tip, r, def.side);
      this._tips.push(tip);
      revealedIndex++;
    }
  }

  // Place `tipEl` next to the target rect on the given side. Sets the
  // anchor point with `left/top` and offsets the tip's own box via a
  // transform so its arrow-edge sits at `gap` pixels from the target.
  _positionTip(tipEl, r, side, gap = 22) {
    let x, y, transform;
    switch (side) {
      case "above":
        x = r.left + r.width / 2;
        y = r.top  - gap;
        transform = "translate(-50%, -100%)";   // bottom-centre at (x, y)
        break;
      case "below":
        x = r.left + r.width / 2;
        y = r.bottom + gap;
        transform = "translate(-50%, 0%)";      // top-centre at (x, y)
        break;
      case "left":
        x = r.left - gap;
        y = r.top  + r.height / 2;
        transform = "translate(-100%, -50%)";   // right-centre at (x, y)
        break;
      case "right":
      default:
        x = r.right + gap;
        y = r.top   + r.height / 2;
        transform = "translate(0%, -50%)";      // left-centre at (x, y)
        break;
    }
    tipEl.style.left      = `${Math.round(x)}px`;
    tipEl.style.top       = `${Math.round(y)}px`;
    tipEl.style.transform = transform;
  }

  show() {
    this._build();
    if (this._tips.length === 0) return;     // nothing to point at — skip silently
    this._visible = true;
    this.el.removeAttribute("hidden");
    this.el.classList.add("show");
    // Force a reflow so the staggered .show fade-ins re-trigger after
    // a rebuild (replaceChildren / innerHTML doesn't re-fire transitions
    // automatically).
    void this.el.offsetHeight;
    window.addEventListener("keydown", this._onAnyKey, { capture: true });
    // Single-shot click dismiss; capture=false so it fires after the
    // canvas's own click handlers (don't steal interaction).
    setTimeout(() => {
      if (this._visible) document.addEventListener("click", this._onAnyClick, { once: true });
    }, 400);
    this._scheduleHide(this.autoHideMs);
  }

  hide() {
    this._visible = false;
    this.el.classList.remove("show");
    this.el.setAttribute("hidden", "");
    this._clearTimer();
    window.removeEventListener("keydown", this._onAnyKey, { capture: true });
    document.removeEventListener("click", this._onAnyClick);
  }

  _scheduleHide(ms) {
    this._clearTimer();
    this._timer = setTimeout(() => this.hide(), ms);
  }
  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }
}

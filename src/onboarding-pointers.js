// ---------------------------------------------------------------------------
// OnboardingPointers — three animated arrow-tooltip pairs that pop up at
// the end of the intro camera move, calling out the discoverable panels
// (Pipeline T, Viewport Tuner K, Scene layers). Auto-dismisses after a
// short hold; dismissable early by clicking anywhere or hitting Escape.
// ---------------------------------------------------------------------------

// Each callout points at a screen-space target. We resolve `selector` at
// reveal time so panels added later still get a valid pointer.
const TIPS = [
  {
    label: "Pipeline",
    sub:   "Press T",
    selector: "#tech-spec, #left-stack",
    anchor:   "top-right",      // where the arrow originates relative to viewport
  },
  {
    label: "Viewport Tuner",
    sub:   "Press K",
    selector: "#viewport-tuner",
    anchor:   "top-right",
  },
  {
    label: "Scene layers",
    sub:   "Drag-drop a .splat to add",
    selector: "#scene-panel, #left-stack",
    anchor:   "top-left",
  },
];

export class OnboardingPointers {
  constructor({ mountEl = document.body, autoHideMs = 5500 } = {}) {
    this.autoHideMs = autoHideMs;
    this._visible   = false;
    this._timer     = null;

    this.el = document.createElement("div");
    this.el.id = "onboarding-pointers";
    this.el.setAttribute("hidden", "");
    this.el.innerHTML = TIPS.map((t, i) => `
      <div class="op-tip op-anchor-${t.anchor}" data-i="${i}" style="--delay:${i * 0.35}s">
        <div class="op-card">
          <div class="op-label">${t.label}</div>
          <div class="op-sub">${t.sub}</div>
        </div>
        <svg class="op-arrow" viewBox="0 0 80 40" aria-hidden="true">
          <path d="M5 20 Q 40 5 75 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M68 14 L 76 20 L 68 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    `).join("");
    mountEl.appendChild(this.el);

    // Dismiss on any click outside (we don't want to capture canvas clicks
    // forever) — listener is added on show() and removed on hide() so the
    // splash doesn't eat input when we're not visible.
    this._onAnyKey = (e) => {
      if (!this._visible) return;
      if (e.key === "Escape") { e.preventDefault(); this.hide(); }
    };
    this._onAnyClick = () => { if (this._visible) this.hide(); };
  }

  show() {
    this._visible = true;
    this.el.removeAttribute("hidden");
    this.el.classList.add("show");
    // Force a fresh CSS animation cycle on each show — strip + restore the
    // class so the delay-staggered fade-ins re-trigger.
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

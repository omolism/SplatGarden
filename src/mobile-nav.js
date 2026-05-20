// ---------------------------------------------------------------------------
// MobileNav — top-right hamburger menu that surfaces the keyboard-shortcut
// panels (Pipeline T / Viewport Tuner K / Quick Guide H / Profiler P /
// Credits) on touch devices that have no physical keyboard.
//
// Hidden on desktop via CSS (body:not(.touch)). Each menu item calls the
// existing .toggle() on the matching panel — there is no parallel state
// machine, just a touch-friendly entry point.
// ---------------------------------------------------------------------------

const HAMBURGER_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <line x1="4" y1="7"  x2="20" y2="7"  stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

const CLOSE_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <line x1="6" y1="6"  x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="18" y1="6" x2="6"  y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

// Lazy resolver — viewpointTuner is created inside loadSplat() after the
// MobileNav constructor runs, so we look refs up on click via the
// window.__* exposes that main.js already publishes. Anything that's not
// yet constructed becomes a no-op until it is.
const RESOLVE = {
  techSpec:       () => window.__techSpec,
  viewpointTuner: () => window.__viewpointTuner,
  keyHints:       () => window.__keyHints,
  profiler:       () => window.__profiler,
  credits:        () => window.__credits,
};

export class MobileNav {
  constructor() {
    this.open = false;
    this._build();
  }

  _build() {
    // Trigger button — fixed top-right corner.
    this.btn = document.createElement("button");
    this.btn.id = "mobile-nav-btn";
    this.btn.setAttribute("aria-label", "Open navigation");
    this.btn.setAttribute("aria-expanded", "false");
    this.btn.innerHTML = HAMBURGER_SVG;
    this.btn.addEventListener("click", () => this.toggle());
    document.body.appendChild(this.btn);

    // Drawer — slides down from the top-right corner. Each item resolves
    // its panel at click time so we tolerate refs being null (which can
    // happen if a future panel is removed without updating MobileNav).
    this.menu = document.createElement("aside");
    this.menu.id = "mobile-nav-menu";
    this.menu.setAttribute("hidden", "");
    this.menu.innerHTML = `
      <ul class="mn-list">
        <li><button data-target="techSpec">
          <span class="mn-icon">▦</span><span class="mn-label">Pipeline</span><span class="mn-key">T</span></button></li>
        <li><button data-target="viewpointTuner">
          <span class="mn-icon">◎</span><span class="mn-label">Viewport Tuner</span><span class="mn-key">K</span></button></li>
        <li><button data-target="keyHints">
          <span class="mn-icon">?</span><span class="mn-label">Quick Guide</span><span class="mn-key">H</span></button></li>
        <li><button data-target="profiler">
          <span class="mn-icon">▤</span><span class="mn-label">Profiler</span><span class="mn-key">P</span></button></li>
        <li><button data-target="credits">
          <span class="mn-icon">★</span><span class="mn-label">Credits</span></button></li>
      </ul>
    `;
    document.body.appendChild(this.menu);

    this.menu.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-target]");
      if (!btn) return;
      const key = btn.dataset.target;
      const panel = RESOLVE[key]?.();
      if (!panel) return;
      // Each panel has its own toggle method; some use showFor for auto-
      // hiding cards (Quick Guide). Prefer toggle when present.
      if (typeof panel.toggle === "function") panel.toggle();
      else if (typeof panel.showFor === "function") panel.showFor(6500);
      this.close();
    });

    // Close when the user taps outside the drawer or the trigger.
    document.addEventListener("pointerdown", (e) => {
      if (!this.open) return;
      if (this.menu.contains(e.target)) return;
      if (this.btn .contains(e.target)) return;
      this.close();
    }, true);
  }

  open_()   { this.open = true;  this.menu.removeAttribute("hidden"); this.btn.innerHTML = CLOSE_SVG;    this.btn.setAttribute("aria-expanded", "true"); }
  close()   { this.open = false; this.menu.setAttribute("hidden", ""); this.btn.innerHTML = HAMBURGER_SVG; this.btn.setAttribute("aria-expanded", "false"); }
  toggle()  { this.open ? this.close() : this.open_(); }
}

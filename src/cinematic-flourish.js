// ---------------------------------------------------------------------------
// cinematic-flourish.js — end-of-cinematic title-card. Fires when the
// FBX camera-move mixer emits "finished", overlaying a brief
// "SPLATGARDEN" signature card so the cinematic feels authored to its
// conclusion rather than just stopping.
//
// Timing — matches a film-credits beat:
//   0    – 600 ms  fade-in        (the hairline sweep draws across first,
//                                  then the title letters reveal behind it)
//   600  – 2100 ms hold           (full opacity, gentle letter-spacing
//                                  breath to make the type feel alive)
//   2100 – 2900 ms fade-out       (linear opacity to 0, scale 1 → 1.04
//                                  for a soft "drift away" feel)
//
// Self-cleaning: the DOM element + listeners are torn down at the end of
// the fade-out so a subsequent Replay-intro can mount a fresh card.
// Idempotent — calling play() while already mid-show is a no-op.
//
// Mounting: builds its own element on first play() so wiring stays
// declarative ("just call fx.play()") and the element doesn't sit dark
// in the DOM all session.
// ---------------------------------------------------------------------------

const TIMING = {
  fadeInMs:  600,
  holdMs:   1500,
  fadeOutMs: 800,
};

export class CinematicFlourish {
  constructor({ mountEl = document.body, title = "SPLATGARDEN", subtitle = "STUDIO · 2026", credit = "Houdini · SpeedTree · Unreal · COLMAP · Spark" } = {}) {
    this.mountEl  = mountEl;
    this.title    = title;
    this.subtitle = subtitle;
    this.credit   = credit;
    this._active  = false;
    this._el      = null;
  }

  /**
   * Show the flourish. Returns a promise that resolves when the full
   * sequence (fade-in + hold + fade-out + cleanup) completes. No-op if
   * a previous play() is still mid-sequence.
   */
  play() {
    if (this._active) return Promise.resolve();
    this._active = true;

    // Build the card on demand so the DOM stays clean between cinematics.
    const el = document.createElement("div");
    el.className = "cinematic-flourish";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="cf-rule" aria-hidden="true"></div>
      <div class="cf-stack">
        <h2 class="cf-title">${this.title}</h2>
        <div class="cf-sub">${this.subtitle}</div>
      </div>
      <div class="cf-credit">${this.credit}</div>
    `;
    this.mountEl.appendChild(el);
    this._el = el;

    // Force a reflow before adding the .show class so the fade-in
    // transition fires reliably (otherwise the browser may collapse
    // the initial → final state into the same frame).
    void el.offsetHeight;
    el.classList.add("show");

    const total = TIMING.fadeInMs + TIMING.holdMs + TIMING.fadeOutMs;

    return new Promise((resolve) => {
      setTimeout(() => {
        if (!el.parentNode) return resolve();    // disposed early
        el.classList.add("fade-out");
        setTimeout(() => {
          this._cleanup();
          resolve();
        }, TIMING.fadeOutMs + 50);                // +50 ms cushion for the transition
      }, TIMING.fadeInMs + TIMING.holdMs);
    });
  }

  /**
   * Cancel any in-flight flourish and remove the DOM element. Safe to
   * call multiple times; called automatically at the end of play().
   */
  dispose() { this._cleanup(); }

  _cleanup() {
    if (this._el?.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
    this._active = false;
  }
}

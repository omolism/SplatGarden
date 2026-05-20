// ---------------------------------------------------------------------------
// KeyHints — bottom-centre floating quick-reference card listing the mouse +
// keyboard shortcuts. Slides up on first entry (after loadSplat hides the
// splash), auto-dismisses after a few seconds, summon back with H.
// ---------------------------------------------------------------------------

// Player-facing essentials only — dev tools (P profiler, K tuner, V/C/R
// viewpoint authoring, Esc) are intentionally omitted to keep the guide
// short. Power users discover those via lil-gui or by reading the code.
const SECTIONS = [
  {
    title: "Move the camera",
    rows: [
      [`<span class="kh-mouse">drag</span>`,   "Rotate"],
      [`<span class="kh-mouse">scroll</span>`, "Zoom"],
    ],
  },
  {
    title: "Jump to a view",
    rows: [
      [`<kbd>1</kbd>&ndash;<kbd>3</kbd>`, "Numbered viewpoints"],
    ],
  },
  {
    title: "Walk around",
    rows: [
      [`<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>`, "Move"],
    ],
  },
  {
    title: "Panels",
    rows: [
      [`<kbd>T</kbd>`, "Pipeline drawer"],
      [`<kbd>H</kbd>`, "This guide"],
    ],
  },
];

export class KeyHints {
  constructor({ mountEl = document.body, autoHideMs = 6500 } = {}) {
    this.autoHideMs = autoHideMs;
    this._visible   = false;
    this._timer     = null;

    this.el = document.createElement("aside");
    this.el.id = "key-hints";
    this.el.innerHTML = `
      <header class="kh-head">
        <span class="kh-title">Quick Guide</span>
        <span class="kh-key">H</span>
        <button class="kh-close" data-act="close" title="Close (H or Esc)">&times;</button>
      </header>
      <div class="kh-body">
        ${SECTIONS.map(s => `
          <section class="kh-sec">
            <div class="kh-sec-title">${s.title}</div>
            <ul class="kh-list">
              ${s.rows.map(([k, v]) => `
                <li class="kh-row">
                  <span class="kh-k">${k}</span>
                  <span class="kh-v">${v}</span>
                </li>
              `).join("")}
            </ul>
          </section>
        `).join("")}
      </div>
    `;
    mountEl.appendChild(this.el);

    this.el.querySelector('[data-act="close"]').addEventListener("click", () => this.hide());

    // H toggles; Esc closes — guarded against input typing.
    window.addEventListener("keydown", (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "h" || e.key === "H") { e.preventDefault(); this.toggle(); }
      else if (e.key === "Escape" && this._visible) { e.preventDefault(); this.hide(); }
    });

    // Pause auto-hide while the user is hovering / interacting with the card.
    this.el.addEventListener("mouseenter", () => this._clearTimer());
    this.el.addEventListener("mouseleave", () => {
      if (this._visible) this._scheduleHide(this.autoHideMs);
    });
  }

  show()   { this._visible = true;  this.el.classList.add("show"); }
  hide()   { this._visible = false; this.el.classList.remove("show"); this._clearTimer(); }
  toggle() { this._visible ? this.hide() : this.showFor(this.autoHideMs); }

  // Show the card and schedule an auto-hide after `ms` (omit / 0 = sticky).
  showFor(ms = this.autoHideMs) {
    this.show();
    this._clearTimer();
    if (ms > 0) this._scheduleHide(ms);
  }

  _scheduleHide(ms) {
    this._clearTimer();
    this._timer = setTimeout(() => this.hide(), ms);
  }
  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }
}

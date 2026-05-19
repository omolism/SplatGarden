// ---------------------------------------------------------------------------
// ABCompare — paper-figure-style side-by-side ablation viewer.
//
// Workflow:
//   1. Press `~` (backtick) to open the overlay.
//   2. Adjust the scene to state "A", click CAPTURE A → snapshot the canvas.
//   3. Change settings to state "B", click CAPTURE B → snapshot.
//   4. Drag the vertical handle to wipe between A (left) and B (right).
//
// The viewer is screenshot-based, not double-render. That makes it cheap
// (no extra per-frame cost when closed) and works for ANY pair of states
// — subform, post-fx toggle, FX preset, etc.
//
// Requires renderer to be constructed with preserveDrawingBuffer:true so
// canvas.toDataURL() returns real pixels rather than a blank frame.
// ---------------------------------------------------------------------------

const PNG = "image/png";

export class ABCompare {
  constructor({ canvas, mountEl = document.body } = {}) {
    this.canvas = canvas;
    this.mountEl = mountEl;
    this.open = false;
    this.split = 0.5;
    this.imgA = null;
    this.imgB = null;
    this.labelA = "A";
    this.labelB = "B";

    this.el = document.createElement("div");
    this.el.id = "ab-compare";
    this.el.innerHTML = `
      <div class="abc-shade"></div>
      <div class="abc-frame">
        <img class="abc-img abc-img-b" alt="State B"/>
        <img class="abc-img abc-img-a" alt="State A"/>
        <div class="abc-handle">
          <div class="abc-line"></div>
          <div class="abc-knob">‖</div>
        </div>
        <div class="abc-tag abc-tag-a"><span class="k">A</span> <span class="v"></span></div>
        <div class="abc-tag abc-tag-b"><span class="k">B</span> <span class="v"></span></div>
        <div class="abc-empty">CAPTURE A and B to compare</div>
      </div>
      <div class="abc-ctrl">
        <div class="abc-title">
          <span class="dot"></span>
          <span class="t">A/B COMPARE</span>
          <button class="abc-close" type="button" title="Close (\`, Esc)">×</button>
        </div>
        <div class="abc-buttons">
          <button class="abc-cap" data-slot="a">▶ Capture A</button>
          <button class="abc-cap" data-slot="b">▶ Capture B</button>
        </div>
        <div class="abc-fields">
          <label>A label <input class="abc-lbl" data-slot="a" value="State A" maxlength="32"></label>
          <label>B label <input class="abc-lbl" data-slot="b" value="State B" maxlength="32"></label>
        </div>
        <div class="abc-hint">
          Click "Capture A" → change a setting → "Capture B" → drag the handle to wipe between the two. Backtick (\`) or Esc to close.
        </div>
      </div>`;
    mountEl.appendChild(this.el);

    // Wire DOM
    this.el.querySelectorAll(".abc-cap").forEach(b => {
      b.addEventListener("click", () => this.capture(b.dataset.slot));
    });
    this.el.querySelectorAll(".abc-lbl").forEach(inp => {
      inp.addEventListener("input", () => {
        if (inp.dataset.slot === "a") this.labelA = inp.value || "A";
        else                          this.labelB = inp.value || "B";
        this._updateLabels();
      });
    });

    // Drag the handle
    const handle = this.el.querySelector(".abc-handle");
    const frame  = this.el.querySelector(".abc-frame");
    let dragging = false;
    const setSplit = (clientX) => {
      const r = frame.getBoundingClientRect();
      this.split = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      this._applySplit();
    };
    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (dragging) setSplit(e.clientX);
    });
    handle.addEventListener("pointerup", () => { dragging = false; });

    // Frame click → snap split there
    frame.addEventListener("click", (e) => {
      if (!this.imgA || !this.imgB) return;
      if (e.target === handle || handle.contains(e.target)) return;
      setSplit(e.clientX);
    });

    // Close button + click on the dimmed backdrop both close.
    this.el.querySelector(".abc-close")?.addEventListener("click", () => this.close());
    this.el.querySelector(".abc-shade")?.addEventListener("click", () => this.close());

    // Keyboard: backtick toggles, Esc closes (only when open).
    window.addEventListener("keydown", (e) => {
      if (this._isTyping(e.target)) return;
      if (e.key === "`") {
        e.preventDefault();
        this.toggle();
      } else if (e.key === "Escape" && this.open) {
        e.preventDefault();
        this.close();
      }
    });
  }

  _isTyping(el) {
    const tag = el?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
  }

  toggle() { this.open ? this.close() : this.openOverlay(); }
  openOverlay() {
    this.open = true;
    this.el.classList.add("show");
    this._applySplit();
  }
  close() {
    this.open = false;
    this.el.classList.remove("show");
  }

  capture(slot) {
    try {
      const url = this.canvas.toDataURL(PNG);
      if (slot === "a") this.imgA = url; else this.imgB = url;
      const imgEl = this.el.querySelector(slot === "a" ? ".abc-img-a" : ".abc-img-b");
      imgEl.src = url;
      this._applySplit();
      this._updateLabels();
    } catch (e) {
      console.warn("[ABCompare] capture failed:", e?.message ?? e);
    }
  }

  _applySplit() {
    const empty = !this.imgA && !this.imgB;
    this.el.querySelector(".abc-empty").style.display = empty ? "block" : "none";
    const imgA = this.el.querySelector(".abc-img-a");
    const imgB = this.el.querySelector(".abc-img-b");
    imgA.style.display = this.imgA ? "block" : "none";
    imgB.style.display = this.imgB ? "block" : "none";
    // Left half = A (clip the right portion away)
    imgA.style.clipPath = `inset(0 ${(1 - this.split) * 100}% 0 0)`;
    // Right half (B) is the natural background; just make sure handle is on top
    this.el.querySelector(".abc-handle").style.left = `${this.split * 100}%`;
  }

  _updateLabels() {
    this.el.querySelector(".abc-tag-a .v").textContent = this.labelA;
    this.el.querySelector(".abc-tag-b .v").textContent = this.labelB;
  }
}

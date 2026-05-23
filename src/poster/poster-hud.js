// ---------------------------------------------------------------------------
// PosterHUD — DOM-based infographic overlay rendered above the Poster Mode
// canvas. Sci-fi military scan-mode aesthetic: monospace tabular data,
// sparkline charts, radar dial, bio-signal readouts, accent-color edges.
//
// Why DOM, not a canvas pass?
//   • The HUD is text-heavy + chart-heavy. DOM/CSS gives sub-pixel text
//     fidelity (no canvas font blur), free accessibility, and resizes
//     for free across viewports.
//   • The 3D scene is the focal point; the HUD is the *frame*. Keeping
//     them separate means perf-tuning each independently.
//   • Future-self can edit HUD copy without touching the renderer.
//
// Layout zones (CSS grid at desktop, flex-stacked on phone):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ [top-left: SCAN MODE banner + data table]   [top-right:     │
//   │                                              ambient panel] │
//   │ [side-left: charts +    [center: 3D canvas    [side-right:  │
//   │  radar + readouts]       (no HUD content)]     compass]     │
//   │ [bottom-left: BIO       [bottom-mid: waveform] [bottom-     │
//   │  SIGNAL panel]                                  right:bars] │
//   └─────────────────────────────────────────────────────────────┘
//
// Phase 1 ships static placeholder data styled to match the reference
// posters. Phase 7 wires real data sources (vertex count from the loaded
// FBX, current frame from VAT time, GPU FPS from the renderer, etc.).
// ---------------------------------------------------------------------------

const ACCENT = "var(--poster-accent)";

function tableRow(label, val) {
  return `<tr><th>${label}</th><td>${val}</td></tr>`;
}

function sparklinePath(values, w = 100, h = 24) {
  if (!values?.length) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (h - ((v - min) / range) * h).toFixed(1);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function randomSparkline(n = 40, base = 50, amp = 30) {
  return Array.from({ length: n }, () =>
    Math.max(0, base + (Math.random() - 0.5) * amp),
  );
}

export class PosterHUD {
  constructor({ mountEl }) {
    this.el = document.createElement("div");
    this.el.id = "poster-hud";
    this.el.setAttribute("aria-hidden", "true");

    // Random-but-stable data per session. Phase 7 will swap these for
    // real values from the renderer / VAT runtime. Static "scan
    // coordinates" + frequency labels read as plausibly technical.
    const wave1 = randomSparkline(48, 50, 28);
    const wave2 = randomSparkline(48, 40, 36);
    const bars  = Array.from({ length: 30 }, () => 20 + Math.random() * 80);

    this.el.innerHTML = `
      <!-- TOP-LEFT — SCAN MODE banner + asset data table -->
      <div class="ph-zone ph-top-left">
        <div class="ph-banner">
          <div class="ph-banner-line">SCAN MODE</div>
          <div class="ph-banner-sub">Acid Graphics</div>
        </div>
        <table class="ph-table">
          <thead><tr>
            <th>FIELD</th><th>VAL</th><th>UNIT</th><th>REF</th>
          </tr></thead>
          <tbody>
            ${tableRow("HENPLY",   "11.18")}
            ${tableRow("SPENAL",   "11.88")}
            ${tableRow("TELCH",    "80.17")}
            ${tableRow("ARLD",     "19.22")}
            ${tableRow("ASEGA",    "12.28")}
            ${tableRow("BIAK",     "44.10")}
            ${tableRow("SOSTA1D",  "13.31")}
            ${tableRow("CBREASO",  "19.60")}
            ${tableRow("SEOTAIN",  "12.850")}
            ${tableRow("APBA",     "08.689")}
          </tbody>
        </table>
        <div class="ph-bars">
          ${bars.map(v => `<span style="height:${v.toFixed(0)}%"></span>`).join("")}
        </div>
      </div>

      <!-- TOP-RIGHT — secondary readout panel -->
      <div class="ph-zone ph-top-right">
        <div class="ph-eyebrow">Capture · Field 7</div>
        <div class="ph-readout-grid">
          <div><span class="k">SPECIMEN</span><span class="v">DAF-001</span></div>
          <div><span class="k">CAPTURE</span><span class="v">VAT · 60 fr</span></div>
          <div><span class="k">VTX</span>     <span class="v" data-vtx>—</span></div>
          <div><span class="k">FRAME</span>   <span class="v" data-frame>0</span></div>
          <div><span class="k">BLOOM</span>   <span class="v" data-bloom>0%</span></div>
          <div><span class="k">FPS</span>     <span class="v" data-fps>—</span></div>
        </div>
      </div>

      <!-- SIDE-LEFT — sparkline waveforms + radar dial -->
      <div class="ph-zone ph-side-left">
        <div class="ph-sparkline">
          <div class="ph-eyebrow">Waveform A</div>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none">
            <path d="${sparklinePath(wave1)}" fill="none" stroke="${ACCENT}" stroke-width="1"/>
          </svg>
        </div>
        <div class="ph-sparkline">
          <div class="ph-eyebrow">Waveform B</div>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none">
            <path d="${sparklinePath(wave2)}" fill="none" stroke="${ACCENT}" stroke-width="1"/>
          </svg>
        </div>
        <div class="ph-radar" aria-hidden="true">
          <svg viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="28" fill="none" stroke="${ACCENT}" stroke-width="0.6" opacity="0.5"/>
            <circle cx="30" cy="30" r="20" fill="none" stroke="${ACCENT}" stroke-width="0.4" opacity="0.4"/>
            <circle cx="30" cy="30" r="12" fill="none" stroke="${ACCENT}" stroke-width="0.4" opacity="0.4"/>
            <circle cx="30" cy="30" r="4"  fill="none" stroke="${ACCENT}" stroke-width="0.4" opacity="0.6"/>
            <line x1="30" y1="30" x2="30" y2="2" stroke="${ACCENT}" stroke-width="0.6" class="ph-radar-sweep"/>
          </svg>
        </div>
      </div>

      <!-- SIDE-RIGHT — compass / orientation indicator -->
      <div class="ph-zone ph-side-right">
        <div class="ph-eyebrow">Orient</div>
        <div class="ph-compass">
          <svg viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" fill="none" stroke="${ACCENT}" stroke-width="0.6" opacity="0.6"/>
            <text x="30" y="8"  fill="${ACCENT}" font-size="6" text-anchor="middle">N</text>
            <text x="56" y="32" fill="${ACCENT}" font-size="6" text-anchor="middle">E</text>
            <text x="30" y="56" fill="${ACCENT}" font-size="6" text-anchor="middle">S</text>
            <text x="4"  y="32" fill="${ACCENT}" font-size="6" text-anchor="middle">W</text>
            <polygon points="30,12 26,32 30,30 34,32" fill="${ACCENT}" class="ph-compass-needle"/>
          </svg>
        </div>
        <div class="ph-readout-stack">
          <div><span class="k">YAW</span>   <span class="v" data-yaw>0.0°</span></div>
          <div><span class="k">PITCH</span> <span class="v">0.0°</span></div>
          <div><span class="k">ROLL</span>  <span class="v">0.0°</span></div>
        </div>
      </div>

      <!-- BOTTOM-LEFT — BIO SIGNAL panel + prose -->
      <div class="ph-zone ph-bottom-left">
        <div class="ph-banner ph-banner-sm">
          <div class="ph-banner-line">BIO SIGNAL</div>
          <div class="ph-banner-sub">Bio Signals</div>
        </div>
        <div class="ph-coord">COORD: 47.3769N / 8.5417E</div>
        <div class="ph-prose">
          Procedural growth animation baked from a Houdini KineFX rig
          and Vellum cloth solver. Vertex Animation Texture pipeline:
          per-vertex position + quaternion rotation written to a pair
          of textures, sampled at runtime from a custom material.
        </div>
      </div>

      <!-- BOTTOM-MID — waveform spectrogram -->
      <div class="ph-zone ph-bottom-mid">
        <div class="ph-spectrogram">
          <svg viewBox="0 0 200 40" preserveAspectRatio="none">
            <path
              d="${sparklinePath(randomSparkline(60, 22, 16), 200, 40)} L 200 40 L 0 40 Z"
              fill="${ACCENT}" opacity="0.35"/>
            <path
              d="${sparklinePath(randomSparkline(60, 22, 16), 200, 40)}"
              fill="none" stroke="${ACCENT}" stroke-width="0.8"/>
          </svg>
        </div>
      </div>

      <!-- BOTTOM-RIGHT — bar histogram -->
      <div class="ph-zone ph-bottom-right">
        <div class="ph-bars ph-bars-tall">
          ${Array.from({ length: 40 }, () =>
            `<span style="height:${(20 + Math.random() * 80).toFixed(0)}%"></span>`,
          ).join("")}
        </div>
      </div>

      <!-- BOTTOM-EDGE — title bar with project mark -->
      <div class="ph-zone ph-footer">
        <span class="ph-mark">DEAFN · CRBLKD</span>
        <span class="ph-sep">·</span>
        <span class="ph-meta" data-build>build —</span>
      </div>
    `;

    mountEl.appendChild(this.el);

    // Cache the writeable readouts so update() doesn't re-query the DOM.
    this._vtxEl   = this.el.querySelector("[data-vtx]");
    this._frameEl = this.el.querySelector("[data-frame]");
    this._bloomEl = this.el.querySelector("[data-bloom]");
    this._fpsEl   = this.el.querySelector("[data-fps]");
    this._yawEl   = this.el.querySelector("[data-yaw]");
    this._buildEl = this.el.querySelector("[data-build]");

    // Stable session build stamp.
    if (this._buildEl) {
      const d = new Date();
      const stamp = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
      this._buildEl.textContent = `build ${stamp}`;
    }

    // FPS smoothing state — averaged over a rolling window so the
    // readout doesn't flicker between adjacent integers every frame.
    this._fpsAcc   = 0;
    this._fpsSamp  = 0;
    this._fpsLastT = performance.now();
  }

  /** Visibility — driven by PosterMode.setActive(). */
  setVisible(on) {
    this.el.classList.toggle("show", on);
    this.el.setAttribute("aria-hidden", on ? "false" : "true");
  }

  /**
   * One-frame tick. Updates the live readouts (FPS, etc.). Phase 7
   * will add VAT-frame + bloom-% + vertex-count from the loaded mesh
   * once the VAT shader lands.
   */
  update(dt) {
    // FPS — averaged every ~500ms.
    this._fpsAcc++;
    const now = performance.now();
    const elapsed = now - this._fpsLastT;
    if (elapsed >= 500) {
      const fps = (this._fpsAcc * 1000) / elapsed;
      if (this._fpsEl) this._fpsEl.textContent = fps.toFixed(0);
      this._fpsAcc = 0;
      this._fpsLastT = now;
    }
  }

  /** Phase 3+ hooks — set by PosterMode once the real mesh + VAT load. */
  setVertexCount(n) {
    if (this._vtxEl) this._vtxEl.textContent = n.toLocaleString();
  }
  setFrame(frame, total) {
    if (this._frameEl) this._frameEl.textContent = `${frame} / ${total}`;
  }
  setBloom(percent) {
    if (this._bloomEl) this._bloomEl.textContent = `${(percent * 100).toFixed(0)}%`;
  }
  setYaw(deg) {
    if (this._yawEl) this._yawEl.textContent = `${deg.toFixed(1)}°`;
  }
}

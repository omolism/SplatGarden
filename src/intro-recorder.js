// ---------------------------------------------------------------------------
// IntroRecorder — captures the auto-played opening cinematic to a .webm
// file. The WebGL canvas only holds the 3D scene; the intro overlay text
// (Hero title + lower-third phase callouts + bottom progress strip) lives
// in the DOM and isn't part of the canvas stream, so we composite both
// into a 2D canvas every frame and feed THAT canvas's stream to
// MediaRecorder. The overlay drawing here mirrors src/intro-overlay.js
// (PHASES timings + style.css visuals) so the export reads identically to
// what the user saw.
//
// Lifecycle:
//   1. start()           — sizes the composite canvas to the WebGL backing
//                          buffer, wires up MediaRecorder, kicks the rAF
//                          composite loop.
//   2. setIntroState(t, playing)
//                        — main.js calls this from __camMoveTick each frame
//                          so we know what overlay state to draw.
//   3. stop()            — awaits the final dataavailable, returns the Blob.
//   4. download(blob)    — saves as .webm via an anchor click.
// ---------------------------------------------------------------------------

// These two structures intentionally mirror src/intro-overlay.js so any
// future edit to phase copy / timing happens in lock-step. If you change
// one, change both.
const HERO = {
  text:    "SplatGarden",
  sub:     "A 3D Gaussian Splatting asset showcase",
  inAt:    0.005,
  holdTo:  0.13,
  outAt:   0.17,
};

const PHASES = [
  { at: 0.02, until: 0.25, eyebrow: "CAPTURE", text: "Captured in Unreal Engine" },
  { at: 0.27, until: 0.50, eyebrow: "POSE",    text: "990 camera poses solved with COLMAP" },
  { at: 0.52, until: 0.75, eyebrow: "TRAIN",   text: "3 million Gaussians optimized in Postshot" },
  { at: 0.77, until: 0.99, eyebrow: "RENDER",  text: "Real-time WebGL playback via Spark" },
];

const FADE = 0.025;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

// First mime type the browser actually supports, in descending quality.
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* */ }
  }
  return "video/webm";
}

export class IntroRecorder {
  constructor({ canvas, fps = 60, bitrate = 16_000_000 } = {}) {
    this.srcCanvas = canvas;
    this.dst       = document.createElement("canvas");
    this.ctx       = this.dst.getContext("2d");
    this.fps       = fps;
    this.bitrate   = bitrate;

    // Frame-state, updated from main.js every tick
    this.tNorm   = 0;
    this.playing = false;

    this.recording = false;
    this.stream    = null;
    this.recorder  = null;
    this.chunks    = [];
    this._rafId    = 0;
  }

  static isSupported() { return typeof MediaRecorder !== "undefined" && pickMime() !== null; }

  setIntroState(tNorm, playing) {
    this.tNorm   = tNorm;
    this.playing = playing;
  }

  start() {
    if (this.recording) return;
    if (!IntroRecorder.isSupported()) {
      console.warn("[IntroRecorder] MediaRecorder not supported in this browser.");
      return;
    }
    this._syncSize();
    this.chunks = [];
    this.stream = this.dst.captureStream(this.fps);

    const mimeType = pickMime();
    this.recorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: this.bitrate,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(250);     // flush a chunk every 250 ms
    this.recording = true;
    this._tick();
  }

  _syncSize() {
    if (this.dst.width  !== this.srcCanvas.width
     || this.dst.height !== this.srcCanvas.height) {
      this.dst.width  = this.srcCanvas.width;
      this.dst.height = this.srcCanvas.height;
    }
  }

  _tick = () => {
    if (!this.recording) return;
    this._syncSize();
    // 1) WebGL canvas → 2D canvas
    this.ctx.drawImage(this.srcCanvas, 0, 0);
    // 2) Overlay only while the cinematic is playing — once stopped we
    // still keep recording for the lens-fade tail, but the overlay should
    // be gone (matches what the live user sees).
    if (this.playing) this._drawOverlay();
    this._rafId = requestAnimationFrame(this._tick);
  };

  // ---------------------------------------------------------------------
  // Overlay drawing — replicates the DOM intro-overlay in canvas 2D so
  // the recorded video matches the live appearance.
  // ---------------------------------------------------------------------
  _drawOverlay() {
    const ctx = this.ctx;
    const w   = this.dst.width;
    const h   = this.dst.height;
    const dpr = window.devicePixelRatio || 1;
    const t   = this.tNorm;

    // -------- HERO (centered title + sub) --------
    let heroAlpha = 0;
    if      (t < HERO.inAt)   heroAlpha = 0;
    else if (t < HERO.holdTo) heroAlpha = smooth((t - HERO.inAt)  / FADE);
    else if (t < HERO.outAt)  heroAlpha = 1;
    else                      heroAlpha = 1 - smooth((t - HERO.outAt) / FADE);
    heroAlpha = Math.max(0, Math.min(1, heroAlpha));

    if (heroAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = heroAlpha;
      ctx.shadowColor    = "rgba(0,0,0,0.75)";
      ctx.shadowBlur     = 30 * dpr;
      ctx.shadowOffsetY  = 2 * dpr;
      ctx.textBaseline   = "alphabetic";

      const vwPx     = w / dpr;
      const titleSize = Math.max(56, Math.min(104, vwPx * 0.09));
      const cx        = w / 2;
      const cy        = h * 0.38;

      // Hero title
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font      = `300 ${titleSize * dpr}px Inter, "SF Pro Text", "Segoe UI", sans-serif`;
      ctx.fillText(HERO.text, cx, cy);

      // Sub (uppercase, wide tracking)
      const subSize = Math.max(11, Math.min(14, vwPx * 0.011));
      ctx.shadowBlur = 16 * dpr;
      ctx.fillStyle  = "rgba(255,255,255,0.78)";
      ctx.font       = `400 ${subSize * dpr}px "JetBrains Mono", monospace`;
      this._fillTracked(ctx, HERO.sub.toUpperCase(),
        cx, cy + titleSize * dpr * 0.55 + 14 * dpr, 0.36, "center");

      ctx.restore();
    }

    // -------- PHASE callout (lower-third, with vertical white bar) --------
    let activeIdx  = -1;
    let phaseAlpha = 0;
    for (let i = 0; i < PHASES.length; i++) {
      const p = PHASES[i];
      if (t >= p.at - FADE && t <= p.until + FADE) {
        activeIdx = i;
        if      (t < p.at)    phaseAlpha = smooth((t - (p.at - FADE)) / FADE);
        else if (t > p.until) phaseAlpha = 1 - smooth((t - p.until)    / FADE);
        else                  phaseAlpha = 1;
        break;
      }
    }

    if (activeIdx >= 0 && phaseAlpha > 0.001) {
      const p = PHASES[activeIdx];
      const vwPx = w / dpr;
      const vhPx = h / dpr;

      const baseX  = vwPx * 0.04 * dpr;
      const baseY  = (vhPx - vhPx * 0.08) * dpr;     // 8vh from bottom
      const eyebrowSize = 11 * dpr;
      const phaseTextSize = Math.max(22, Math.min(38, vwPx * 0.03));
      const innerGap = 8 * dpr;
      // Block height accounts for eyebrow + gap + phase text baseline
      const blockH = eyebrowSize + innerGap + phaseTextSize * dpr * 1.15;
      const blockTop = baseY - blockH;

      ctx.save();
      ctx.globalAlpha   = phaseAlpha;
      ctx.shadowColor   = "rgba(0,0,0,0.80)";
      ctx.shadowBlur    = 20 * dpr;
      ctx.shadowOffsetY = 2 * dpr;

      // Vertical bar on left edge of the block
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(baseX, blockTop, 2 * dpr, blockH);

      const textX = baseX + 14 * dpr;
      // Eyebrow
      ctx.fillStyle    = "rgba(255,255,255,0.82)";
      ctx.font         = `500 ${eyebrowSize}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "top";
      this._fillTracked(ctx, p.eyebrow, textX, blockTop, 0.36, "left");

      // Phase text
      ctx.fillStyle    = "#ffffff";
      ctx.font         = `300 ${phaseTextSize * dpr}px Inter, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(p.text, textX, blockTop + eyebrowSize + innerGap + phaseTextSize * dpr);

      ctx.restore();
    }

    // -------- Bottom progress bar --------
    ctx.save();
    const barH = 2 * dpr;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, h - barH, w, barH);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0.95)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - barH, w * Math.max(0, Math.min(1, t)), barH);
    ctx.restore();
  }

  // Letter-spaced text — uses ctx.letterSpacing when available (Chrome 99+),
  // falls back to per-character drawing for older browsers.
  _fillTracked(ctx, text, x, y, trackEm, align = "left") {
    if (!text) return;
    const fontMatch = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
    const fontSize  = fontMatch ? parseFloat(fontMatch[1]) : 16;

    if ("letterSpacing" in ctx) {
      const prev = ctx.letterSpacing;
      ctx.letterSpacing = `${fontSize * trackEm}px`;
      ctx.textAlign     = align;
      ctx.fillText(text, x, y);
      ctx.letterSpacing = prev || "0px";
      return;
    }

    // Manual fallback: measure each char, place individually
    ctx.textAlign = "left";
    const spacing = fontSize * trackEm;
    const chars   = [...text];
    const widths  = chars.map(ch => ctx.measureText(ch).width);
    const totalW  = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
    let cursor;
    if      (align === "center") cursor = x - totalW / 2;
    else if (align === "right")  cursor = x - totalW;
    else                         cursor = x;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cursor, y);
      cursor += widths[i] + spacing;
    }
  }

  async stop() {
    if (!this.recording || !this.recorder) return null;
    this.recording = false;
    cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    return new Promise((resolve) => {
      const rec = this.recorder;
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: "video/webm" });
        this.recorder = null;
        this.stream?.getTracks().forEach((tr) => tr.stop());
        this.stream = null;
        resolve(blob);
      };
      try { rec.stop(); } catch (e) { resolve(null); }
    });
  }

  download(blob, baseName = "splatgarden-intro") {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    const ts  = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href     = url;
    a.download = `${baseName}-${ts}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

// ---------------------------------------------------------------------------
// loading-splash-fx.js — Refik-Anadol-inspired particle reveal of a hero
// image (public/BeautyShot.png) on the loading splash. The image is
// downsampled to a colour grid; each cell becomes a particle that flies
// in from a random screen edge to its target position over ~1.4 s with
// stagger, then drifts organically while the splat downloads. When
// hideLoading() fires we dispatch an "exit" pulse that scatters every
// particle outward + fades the canvas.
//
// Thematic tie-in: splats ARE clouds of coloured points; rendering the
// loading hero as point cloud lets the wait double as a preview of the
// project's aesthetic. ~6000 particles is comfortable on any 2018-era
// laptop GPU rendering through Canvas2D.
//
// Usage:
//   import { LoadingSplashFx } from "./loading-splash-fx.js";
//   const fx = new LoadingSplashFx({
//     mountEl: document.getElementById("loading"),
//     imageUrl: BASE + "BeautyShot.png",
//   });
//   // later, when the splat finishes loading:
//   fx.exit();
//
// Self-cleaning: exit() fades over ~800 ms then removes the canvas +
// cancels the rAF loop. Safe to call exit() more than once.
// ---------------------------------------------------------------------------

const COLS_DEFAULT = 120;  // horizontal sample density; vertical derived from image ratio
const DOT_RADIUS    = 1.5;
const FLIGHT_MS     = 1100;
const FLIGHT_STAGGER_MS = 1300;
const DRIFT_AMP     = 3.5;  // px around target during the idle drift phase
const EXIT_MS       = 850;
// ----- Mouse interaction -----
const MOUSE_RADIUS    = 140;  // particles within this many px feel the cursor
const MOUSE_FORCE     = 4200; // peak repulsion in px²/s²; tuned so a brisk swipe parts the cloud cleanly
const MOUSE_DAMP      = 6.0;  // velocity damping per second when no force is applied (springs back to rest)
const MOUSE_SPRING    = 18.0; // return-to-target spring stiffness (per second²)

export class LoadingSplashFx {
  constructor({ mountEl, imageUrl, cols = COLS_DEFAULT }) {
    this.mountEl  = mountEl;
    this.imageUrl = imageUrl;
    this.cols     = cols;
    this.particles = [];
    this._raf  = 0;
    this._t0   = performance.now();
    this._prevT = this._t0;
    this._exiting = false;
    this._exitT0  = 0;
    // Mouse interaction state — particles within MOUSE_RADIUS of (mx, my)
    // get pushed away with a force that falls off linearly to zero at
    // the edge of the radius. When the cursor leaves the splash entirely
    // (mouseLive=false) the spring + damping returns the cloud to its
    // image-shaped rest pose. Initialised off-screen so the first frame
    // before any pointermove doesn't apply phantom force.
    this._mx = -9999;
    this._my = -9999;
    this._mouseLive = false;
    this._init();
  }

  async _init() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "loading-fx-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.mountEl.appendChild(this.canvas);
    this._sizeCanvas();
    this._onResize = () => this._sizeCanvas();
    window.addEventListener("resize", this._onResize);
    this.ctx = this.canvas.getContext("2d");

    // Track cursor for the repulsion field. We listen on the document
    // (rather than the canvas) so the splash captures mouse movement
    // even when the user's cursor is over the chrome text on top of
    // the canvas — the particles respond regardless of what HTML layer
    // the pointer is technically over.
    this._onPointerMove = (e) => {
      this._mx = e.clientX;
      this._my = e.clientY;
      this._mouseLive = true;
    };
    this._onPointerLeave = () => { this._mouseLive = false; };
    document.addEventListener("pointermove", this._onPointerMove, { passive: true });
    document.addEventListener("pointerleave", this._onPointerLeave);

    try {
      const img = await this._loadImage(this.imageUrl);
      this._sampleParticles(img);
      this._tick();
    } catch (err) {
      // Image load failure is non-fatal — splash just renders without
      // the particle layer.
      console.debug("[LoadingSplashFx] image load failed:", err);
    }
  }

  _sizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + "px";
    this.canvas.style.height = h + "px";
    this._dpr = dpr;
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Downsample `img` to a `cols × rows` grid and create one particle per
   * non-transparent cell. Each particle's start point is on a random
   * screen edge, target is its grid cell mapped into a centred fit-contain
   * rect at ~65 % of viewport. Stagger is uniform random across
   * FLIGHT_STAGGER_MS so the assembly reads as a rolling sweep rather
   * than a synchronized snap.
   */
  _sampleParticles(img) {
    const cols   = this.cols;
    const aspect = img.width / img.height;
    const rows   = Math.max(1, Math.round(cols / aspect));

    // Off-screen sample canvas — getImageData on the downsampled grid
    // returns a packed Uint8ClampedArray of RGBA bytes.
    const sc = document.createElement("canvas");
    sc.width  = cols;
    sc.height = rows;
    const sx = sc.getContext("2d");
    sx.drawImage(img, 0, 0, cols, rows);
    const data = sx.getImageData(0, 0, cols, rows).data;

    // Centred fit-contain target rect at ~65 % of viewport, leaving
    // room for the splash text overlay above + status bar below.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / cols, vh / rows) * 0.65;
    const drawW = cols * scale;
    const drawH = rows * scale;
    const offX  = (vw - drawW) / 2;
    const offY  = (vh - drawH) / 2;

    this.particles = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 24) continue;  // skip near-transparent

        const tx = offX + (x + 0.5) * scale;
        const ty = offY + (y + 0.5) * scale;

        // Start point — random spawn just outside one of the four
        // viewport edges. Distribute roughly uniformly so the inflow
        // reads as a sweep from all sides, not a single direction.
        let sx_, sy_;
        const side = (Math.random() * 4) | 0;
        switch (side) {
          case 0: sx_ = Math.random() * vw;       sy_ = -40 - Math.random() * 80;        break;  // top
          case 1: sx_ = vw + 40 + Math.random() * 80; sy_ = Math.random() * vh;          break;  // right
          case 2: sx_ = Math.random() * vw;       sy_ = vh + 40 + Math.random() * 80;    break;  // bottom
          default:sx_ = -40 - Math.random() * 80; sy_ = Math.random() * vh;                      // left
        }

        this.particles.push({
          x: sx_, y: sy_, tx, ty,
          // Velocity in px/s — driven by the mouse-repulsion force +
          // spring-return-to-target + damping. Zero at spawn; the
          // flight phase moves x/y directly via lerp without using
          // velocity, then physics takes over after settle.
          vx: 0, vy: 0,
          // Single packed RGBA — cheaper than concatenating "rgba(...)"
          // per draw call. We re-pack to a string only on first paint
          // (memoised below in the tick loop).
          r, g, b, a: a / 255,
          delay:     Math.random() * FLIGHT_STAGGER_MS,
          duration:  FLIGHT_MS + Math.random() * 320,
          dphi:      Math.random() * Math.PI * 2,
          dspd:      0.00065 + Math.random() * 0.0005,
        });
      }
    }
  }

  _tick = () => {
    const dpr = this._dpr;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, vw, vh);
    // Additive blend so overlapping pixels brighten — gives the cloud a
    // luminous feel matching Anadol's particle pieces. We lose true
    // colour fidelity at the cost of mood; acceptable for a loading FX.
    this.ctx.globalCompositeOperation = "lighter";

    const tNow   = performance.now();
    const tLocal = tNow - this._t0;
    // Per-frame delta in seconds, clamped to 50 ms to prevent giant
    // physics jumps if a tab was backgrounded.
    const dt = Math.min(0.05, (tNow - this._prevT) / 1000);
    this._prevT = tNow;

    const exitU  = this._exiting
      ? Math.min(1, (tNow - this._exitT0) / EXIT_MS)
      : 0;

    // Mouse pose for this frame — gated by mouseLive so a cursor that
    // has left the document doesn't apply phantom force at -9999.
    const mLive = this._mouseLive;
    const mx    = this._mx;
    const my    = this._my;
    const mR    = MOUSE_RADIUS;
    const mR2   = mR * mR;

    for (const p of this.particles) {
      // ---- Position --------------------------------------------------
      const lt = Math.max(0, tLocal - p.delay);
      const u  = Math.min(1, lt / p.duration);
      const e  = 1 - Math.pow(1 - u, 3);   // cubic ease-out

      let x, y;
      if (u < 1) {
        // Flight phase — direct lerp from spawn to target. No physics
        // yet so the assembly stays clean and predictable.
        x = p.x + (p.tx - p.x) * e;
        y = p.y + (p.ty - p.y) * e;
        // Keep particle's stored position in sync so when flight ends,
        // physics has the correct starting state.
        p.x = x;
        p.y = y;
      } else {
        // Settled phase — spring toward (tx, ty) + damping + mouse
        // repulsion. Drift sinusoid is added as a target offset so
        // the cloud breathes even when the cursor isn't engaged.
        const dtPhi = (tLocal - p.delay - p.duration);
        const driftX = Math.cos(p.dphi + dtPhi * p.dspd)        * DRIFT_AMP;
        const driftY = Math.sin(p.dphi + dtPhi * p.dspd * 1.3)  * DRIFT_AMP;
        const targetX = p.tx + driftX;
        const targetY = p.ty + driftY;

        // Spring force toward (drifting) target.
        let ax = (targetX - p.x) * MOUSE_SPRING;
        let ay = (targetY - p.y) * MOUSE_SPRING;

        // Cursor repulsion — falls off linearly to zero at the edge
        // of MOUSE_RADIUS. Squared-distance fast-path avoids the
        // sqrt for particles outside the radius.
        if (mLive) {
          const dx = p.x - mx;
          const dy = p.y - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < mR2 && d2 > 0.01) {
            const d  = Math.sqrt(d2);
            const k  = (1 - d / mR);            // 0 at edge, 1 at centre
            const f  = MOUSE_FORCE * k * k;      // squared falloff = soft edge, hard core
            ax += (dx / d) * f;
            ay += (dy / d) * f;
          }
        }

        // Damping — opposes velocity. Without this the spring would
        // oscillate forever; with it the particle critically damps.
        ax -= p.vx * MOUSE_DAMP;
        ay -= p.vy * MOUSE_DAMP;

        // Integrate (semi-implicit Euler).
        p.vx += ax * dt;
        p.vy += ay * dt;
        p.x  += p.vx * dt;
        p.y  += p.vy * dt;
        x = p.x;
        y = p.y;
      }

      // ---- Exit pulse — outward burst + fade -------------------------
      let alpha = p.a;
      if (this._exiting) {
        // Linear outward push from canvas centre with slight
        // ease-out. By exitU=1 each particle has flown ~viewport-far
        // away from where it was at exit start, and alpha is 0.
        const cx = vw * 0.5, cy = vh * 0.5;
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const push = (1 - Math.pow(1 - exitU, 2)) * 320;
        x += (dx / dist) * push;
        y += (dy / dist) * push;
        alpha = p.a * (1 - exitU);
      }

      if (alpha <= 0.01) continue;
      this.ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha.toFixed(3)})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Exit complete — clean up.
    if (this._exiting && exitU >= 1) {
      this._dispose();
      return;
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  /** Kick off the exit pulse (particles burst outward + fade). */
  exit() {
    if (this._exiting) return;
    this._exiting = true;
    this._exitT0  = performance.now();
  }

  _dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    if (this._onPointerMove)  document.removeEventListener("pointermove",  this._onPointerMove);
    if (this._onPointerLeave) document.removeEventListener("pointerleave", this._onPointerLeave);
    this.canvas?.remove();
    this.canvas = null;
    this.particles = [];
  }
}

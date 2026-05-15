import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// ---------------------------------------------------------------------------
// BodyController
//
// Webcam + MediaPipe PoseLandmarker → key body landmarks projected to scene.
//
// On every frame a hand-like callback is invoked with five world-relevant
// landmarks already converted to canvas screen coords:
//   onPose({head, lhand, rhand, lfoot, rfoot})
//
// Caller is responsible for raycasting those screen positions onto the splat
// and feeding the resulting object-space points into the effect's body-mask
// uniforms.
//
// MediaPipe landmark indices used:
//    0 = nose (head)
//   11 = left shoulder        — used as fallback "chest" if face occluded
//   12 = right shoulder
//   15 = left wrist           — close-enough to hand position
//   16 = right wrist
//   27 = left ankle           — close-enough to foot
//   28 = right ankle
// ---------------------------------------------------------------------------

const WASM_CDN  = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const L_HEAD       = 0;
const L_LSHOULDER  = 11;
const L_RSHOULDER  = 12;
const L_LWRIST     = 15;
const L_RWRIST     = 16;
const L_LANKLE     = 27;
const L_RANKLE     = 28;
const NO_BODY_GRACE_MS = 350;

// Smooth a single normalized landmark (x or y) — one-Euro filter
class OneEuro {
  constructor({ minCutoff = 1.4, beta = 0.06, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null; this.dx = 0; this.lastT = 0;
  }
  _alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }
  filter(value, tMs) {
    if (this.x === null) { this.x = value; this.lastT = tMs; return value; }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-6);
    const dx = (value - this.x) / dt;
    const aD = this._alpha(this.dCutoff, dt);
    this.dx = this.dx + aD * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this._alpha(cutoff, dt);
    this.x = this.x + a * (value - this.x);
    this.lastT = tMs; return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}

export class BodyController {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas
   * @param {HTMLVideoElement}  opts.video
   * @param {(points: object)=>void} opts.onPose  - called each frame: {head, lhand, rhand, lfoot, rfoot} each {x, y}
   * @param {()=>void}                opts.onPoseLost
   */
  constructor({ canvas, video, onPose, onPoseLost, statusEl }) {
    this.canvas      = canvas;
    this.video       = video;
    this.onPose      = onPose      || (() => {});
    this.onPoseLost  = onPoseLost  || (() => {});
    this.statusEl    = statusEl;

    this.enabled     = false;
    this.landmarker  = null;
    this.stream      = null;
    this.lastVideoTs = -1;
    this.lastSeenAt  = 0;
    this.poseActive  = false;
    this.onError     = null;

    // Per-landmark filters (x, y each)
    const mk = () => new OneEuro();
    this._f = {
      head:  { x: mk(), y: mk() },
      lhand: { x: mk(), y: mk() },
      rhand: { x: mk(), y: mk() },
      lfoot: { x: mk(), y: mk() },
      rfoot: { x: mk(), y: mk() },
    };
  }

  setStatus(t) { if (this.statusEl) this.statusEl.textContent = t; }

  preflightCheck() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { code: "no-api", message: "Webcam API not available",
               hint: "Use a recent Chrome / Edge / Firefox." };
    }
    if (!window.isSecureContext) {
      return { code: "insecure", message: "Insecure context",
               hint: `Use https:// or http://localhost (current: ${location.origin}).` };
    }
    return null;
  }

  async _ensureModel() {
    if (this.landmarker) return;
    this.setStatus("Loading pose model…");
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      numPoses: 1,
      runningMode: "VIDEO",
    });
  }

  async start() {
    if (this.enabled) return;
    const pre = this.preflightCheck();
    if (pre) { this._raise(pre); return; }

    try {
      this.setStatus("Requesting webcam…");
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();

      await this._ensureModel();

      this.enabled = true;
      this.video.classList.add("active");
      this.setStatus("Tracking — body silhouette drives dissolve");
      this._loop();
    } catch (err) {
      console.error("Body tracking failed:", err);
      this.stop();
      this._raise(this._classify(err));
    }
  }

  stop() {
    this.enabled = false;
    this.video.classList.remove("active");
    if (this.poseActive) { this.poseActive = false; this.onPoseLost(); }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.video.srcObject = null;
    Object.values(this._f).forEach(p => { p.x.reset(); p.y.reset(); });
    this.setStatus("");
  }

  async toggle() {
    if (this.enabled) this.stop(); else await this.start();
    return this.enabled;
  }

  _classify(err) {
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { code: "denied",  message: "Webcam permission denied",
               hint: "Click the camera icon in the address bar to allow." };
    }
    if (name === "NotFoundError") {
      return { code: "no-device", message: "No webcam found",
               hint: "Plug in a webcam or enable a built-in camera." };
    }
    if (name === "NotReadableError") {
      return { code: "in-use", message: "Webcam in use",
               hint: "Close other apps using the camera and retry." };
    }
    return { code: "unknown", message: name || "Error", hint: err?.message || String(err) };
  }
  _raise(info) { if (this.onError) this.onError(info); }

  _loop = (t) => {
    if (!this.enabled) return;
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTs) {
      this.lastVideoTs = this.video.currentTime;
      const result = this.landmarker.detectForVideo(this.video, t);
      if (result?.landmarks?.length > 0) {
        this._processPose(result.landmarks[0], t);
      } else {
        this._checkNoPose(t);
      }
    }
    requestAnimationFrame(this._loop);
  };

  _processPose(lm, tMs) {
    this.lastSeenAt = tMs;
    const rect = this.canvas.getBoundingClientRect();

    // Mirror x so the body appears in the same orientation as a selfie view.
    const px = (x) => (1 - x) * rect.width  + rect.left;
    const py = (y) => y * rect.height + rect.top;

    const fX = (slot, val) => this._f[slot].x.filter(val, tMs);
    const fY = (slot, val) => this._f[slot].y.filter(val, tMs);

    // Head: use nose; fall back to mid-shoulders if nose missing
    const head = lm[L_HEAD] ?? lm[L_LSHOULDER];

    const points = {
      head:  { x: px(fX("head",  head.x)),
               y: py(fY("head",  head.y)) },
      lhand: { x: px(fX("lhand", lm[L_LWRIST].x)),
               y: py(fY("lhand", lm[L_LWRIST].y)) },
      rhand: { x: px(fX("rhand", lm[L_RWRIST].x)),
               y: py(fY("rhand", lm[L_RWRIST].y)) },
      lfoot: { x: px(fX("lfoot", lm[L_LANKLE].x)),
               y: py(fY("lfoot", lm[L_LANKLE].y)) },
      rfoot: { x: px(fX("rfoot", lm[L_RANKLE].x)),
               y: py(fY("rfoot", lm[L_RANKLE].y)) },
    };

    if (!this.poseActive) {
      this.poseActive = true;
      this.setStatus("Tracking — body driving dissolve");
    }
    this.onPose(points);
  }

  _checkNoPose(tMs) {
    if (tMs - this.lastSeenAt < NO_BODY_GRACE_MS) return;
    if (!this.poseActive) return;
    this.poseActive = false;
    Object.values(this._f).forEach(p => { p.x.reset(); p.y.reset(); });
    this.onPoseLost();
  }
}

// ---------------------------------------------------------------------------
// AudioReactor — thin wrapper around Web Audio's AnalyserNode that turns
// either a dropped/picked audio FILE or a MIC stream into a small set of
// per-frame metrics (amp / bass / mid / treble in 0..1). Designed to feed
// shader uniforms (e.g. GPGPUParticles' uAudioAmp). One reactor lasts the
// lifetime of the page; switching source = disconnect + reconnect.
//
// Browser autoplay policy: AudioContext starts suspended. The first call
// to connectFile / connectMic must happen inside a user gesture (button
// click, etc.) so the context can resume. After that, update() is safe
// from anywhere.
// ---------------------------------------------------------------------------

const FFT_SIZE       = 256;          // 128 frequency bins — plenty for vibes
const SMOOTH_TC      = 0.72;         // AnalyserNode smoothingTimeConstant
const BASS_END_FRAC  = 0.12;         // first 12% of bins → bass
const MID_END_FRAC   = 0.45;         // next slice → mid; rest → treble

export class AudioReactor {
  constructor() {
    this.ctx        = null;
    this.analyser   = null;
    this.dataArray  = null;
    this.source     = null;          // AudioNode currently feeding the analyser
    this.audioEl    = null;          // HTMLAudioElement when file-mode
    this.mode       = "none";        // "none" | "file" | "mic"
    this.metrics    = { amp: 0, bass: 0, mid: 0, treble: 0 };
    this.onStateChange = null;       // optional callback(state) for GUI sync
  }

  // Lazy-create the AudioContext + AnalyserNode on first use.
  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API not supported in this browser");
    this.ctx = new AC();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = SMOOTH_TC;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  // Connect a file (File object from <input type="file"> or drag-and-drop).
  // Routes the audio through analyser AND to the speakers so the user
  // hears the source. Loops by default.
  async connectFile(file) {
    const url = URL.createObjectURL(file);
    return this._connectFromUrl(url);
  }

  // Connect by URL string (e.g. "/Forest_Ambience.mp3"). Same plumbing as
  // connectFile — separates the URL-creation concern from the audio-graph
  // setup. Throws if the URL can't be loaded (caller should catch).
  async connectUrl(url) {
    return this._connectFromUrl(url);
  }

  async _connectFromUrl(url) {
    this._ensureCtx();
    this.disconnect();
    const el = new Audio(url);
    el.crossOrigin = "anonymous";
    el.loop = true;
    this.audioEl = el;
    const node = this.ctx.createMediaElementSource(el);
    node.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.source = node;
    this.mode = "file";
    await this.ctx.resume();
    try { await el.play(); } catch (e) { console.warn("audio play failed:", e); }
    this.onStateChange?.("file");
  }

  // Connect microphone via getUserMedia. NOT routed to destination
  // (would create a feedback loop).
  async connectMic() {
    this._ensureCtx();
    this.disconnect();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const node = this.ctx.createMediaStreamSource(stream);
    node.connect(this.analyser);
    this.source     = node;
    this.micStream  = stream;
    this.mode       = "mic";
    await this.ctx.resume();
    this.onStateChange?.("mic");
  }

  disconnect() {
    if (this.audioEl) {
      try { this.audioEl.pause(); } catch {}
      this.audioEl.src = "";
      this.audioEl = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    try { this.analyser?.disconnect(); } catch {}
    this.mode = "none";
    this.metrics.amp = this.metrics.bass = this.metrics.mid = this.metrics.treble = 0;
    this.onStateChange?.("none");
  }

  // Per-frame metric refresh. Cheap (single FFT read + 128-element loop).
  // Returns the live metrics object (also cached on .metrics).
  update() {
    if (!this.analyser || this.mode === "none") {
      this.metrics.amp = this.metrics.bass = this.metrics.mid = this.metrics.treble = 0;
      return this.metrics;
    }
    this.analyser.getByteFrequencyData(this.dataArray);
    const N = this.dataArray.length;
    const splitBass = Math.max(1, Math.floor(N * BASS_END_FRAC));
    const splitMid  = Math.max(splitBass + 1, Math.floor(N * MID_END_FRAC));
    let sum = 0, bSum = 0, mSum = 0, tSum = 0;
    for (let i = 0; i < N; i++) {
      const v = this.dataArray[i];
      sum += v;
      if (i < splitBass)      bSum += v;
      else if (i < splitMid)  mSum += v;
      else                    tSum += v;
    }
    this.metrics.amp    = (sum  / N)                  / 255;
    this.metrics.bass   = (bSum / splitBass)          / 255;
    this.metrics.mid    = (mSum / (splitMid - splitBass)) / 255;
    this.metrics.treble = (tSum / (N - splitMid))     / 255;
    return this.metrics;
  }
}

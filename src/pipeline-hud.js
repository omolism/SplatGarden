// ---------------------------------------------------------------------------
// PipelineHUD — top-left tech-spec HUD that reads live numbers off the
// renderer, post-fx composer, splat / voxel / quad / particle subsystems,
// and audio reactor. Refreshes ~2 Hz so the panel doesn't flicker per frame.
//
// Sections:
//   ① RENDER   — splat / quad / voxel counts + draw calls + triangles
//   ② POSTFX   — total / enabled pass count + per-pass list
//   ③ PARTICLES — gpgpu count + live audio amp bar
//   ④ FRAME    — fps + frame ms breakdown (Profiler integration if available)
//   ⑤ GPU      — WebGL vendor / renderer / driver
// ---------------------------------------------------------------------------

const UPDATE_HZ_MS = 500;

function compactInt(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

// Exact integer with thousands separators — used for splat count, which is
// the headline figure for 3DGS and deserves precision over compactness.
function exactInt(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

function getGpuInfo(renderer) {
  try {
    const gl  = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return { vendor: "—", renderer: "—" };
    return {
      vendor:   gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   || "—",
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "—",
    };
  } catch { return { vendor: "—", renderer: "—" }; }
}

export class PipelineHUD {
  constructor({ renderer, postfx, refs = {}, mountEl = document.body, profiler = null }) {
    this.renderer = renderer;
    this.postfx   = postfx;
    this.refs     = refs;       // { splat, voxelizer, quadizer, gpgpuParticles, audioReactor }
    this.profiler = profiler;
    this._lastT   = 0;
    this._frames  = 0;
    this._fps     = 0;
    this._fpsAccum = 0;
    this._collapsed = false;

    const gpu = getGpuInfo(renderer);

    this.el = document.createElement("div");
    this.el.id = "pipeline-hud";
    this.el.innerHTML = `
      <div class="hud-title">
        <span class="dot"></span>
        <span class="t">PIPELINE</span>
        <span class="hud-toggle" data-act="collapse" title="Collapse">─</span>
      </div>
      <div class="hud-body">
        <div class="hud-section" data-key="render">
          <div class="hud-shdr">RENDER</div>
          <div class="hud-row"><span class="k">SPLATS</span><span class="v" data-k="splats">—</span></div>
          <div class="hud-row"><span class="k">QUADS</span><span class="v" data-k="quads">— · off</span></div>
          <div class="hud-row"><span class="k">VOXELS</span><span class="v" data-k="voxels">— · off</span></div>
          <div class="hud-row"><span class="k">DRAW</span><span class="v" data-k="draw">—</span></div>
          <div class="hud-row"><span class="k">TRIS</span><span class="v" data-k="tris">—</span></div>
        </div>

        <div class="hud-section" data-key="postfx">
          <div class="hud-shdr">POST-FX</div>
          <div class="hud-row"><span class="k">PASSES</span><span class="v" data-k="passcount">—</span></div>
          <div class="hud-passlist" data-k="passlist"></div>
        </div>

        <div class="hud-section" data-key="particles">
          <div class="hud-shdr">PARTICLES</div>
          <div class="hud-row"><span class="k">GPGPU</span><span class="v" data-k="gpgpuCount">—</span></div>
          <div class="hud-row"><span class="k">AUDIO</span>
            <span class="v hud-bar-wrap"><span class="hud-bar" data-k="audioBar"></span><span class="v hud-bar-num" data-k="audioNum">0.00</span></span>
          </div>
        </div>

        <div class="hud-section" data-key="frame">
          <div class="hud-shdr">FRAME</div>
          <div class="hud-row"><span class="k">FPS</span><span class="v" data-k="fps">—</span></div>
          <div class="hud-row"><span class="k">DT</span><span class="v" data-k="dt">—</span></div>
        </div>

        <div class="hud-section" data-key="gpu">
          <div class="hud-shdr">GPU</div>
          <div class="hud-row"><span class="k">VEND</span><span class="v" data-k="vendor"></span></div>
          <div class="hud-row"><span class="k">REND</span><span class="v" data-k="renderer"></span></div>
          <div class="hud-row"><span class="k">CTX</span><span class="v">WebGL 2 · f32</span></div>
        </div>
      </div>
    `;
    mountEl.appendChild(this.el);

    // Seed static GPU fields
    this._set("vendor",   gpu.vendor);
    this._set("renderer", gpu.renderer);

    // Wire collapse toggle
    this.el.querySelector('[data-act="collapse"]').addEventListener("click", () => {
      this._collapsed = !this._collapsed;
      this.el.classList.toggle("collapsed", this._collapsed);
    });
  }

  _set(key, value) {
    const el = this.el.querySelector(`[data-k="${key}"]`);
    if (el) el.textContent = value;
  }

  // Hint that the audio reactor is now live (avoids reading the file before
  // user interaction completes the autoplay gate).
  setAudioReactor(r) { this.refs.audioReactor = r; }
  setProfiler(p)     { this.profiler = p; }

  // Called every frame; updates internal counters but only rewrites DOM at
  // UPDATE_HZ_MS to avoid layout thrash.
  tick(nowMs, dtMs) {
    this._frames++;
    this._fpsAccum += dtMs;
    if (nowMs - this._lastT < UPDATE_HZ_MS) return;
    this._lastT = nowMs;
    const fps = this._frames * 1000 / (this._fpsAccum || 16);
    this._fps = fps;
    this._frames = 0;
    this._fpsAccum = 0;
    this._update(fps);
  }

  _update(fps) {
    const r  = this.refs;
    const ri = this.renderer.info.render;

    // ---- RENDER row ----
    // Splat count uses exactInt — it's the headline figure for 3DGS and
    // small differences matter (e.g. 2,987,341 vs "3.00M" hides 12k).
    const nSplats = r.splat?.packedSplats?.numSplats ?? null;
    this._set("splats", nSplats != null ? exactInt(nSplats) : "—");

    const nQuads  = r.quadizer?.mesh?.geometry?.instanceCount ?? 0;
    const qVis    = r.quadizer?.opacity ?? 0;
    this._set("quads",  nQuads > 0
      ? `${exactInt(nQuads)} · ${(qVis*100).toFixed(0)}%`
      : "— · off");

    const nVoxels = r.voxelizer?.mesh?.geometry?.instanceCount ?? 0;
    const vVis    = r.voxelizer?.opacity ?? 0;
    this._set("voxels", nVoxels > 0
      ? `${exactInt(nVoxels)} · ${(vVis*100).toFixed(0)}%`
      : "— · off");

    this._set("draw", compactInt(ri.calls));
    this._set("tris", compactInt(ri.triangles));

    // ---- POSTFX row ----
    const passes = this.postfx?.composer?.passes || [];
    const enabledPasses = passes.filter(p => p.enabled !== false);
    this._set("passcount",
      `${enabledPasses.length} / ${passes.length}`);
    const passlistEl = this.el.querySelector('[data-k="passlist"]');
    if (passlistEl) {
      passlistEl.innerHTML = passes.map(p => {
        const name = (p.constructor?.name || "Pass").replace(/Pass$/, "");
        const on = p.enabled !== false;
        return `<span class="hud-pass ${on ? "on" : "off"}" title="${name}">${name}</span>`;
      }).join("");
    }

    // ---- PARTICLES row ----
    const pCount = r.gpgpuParticles?.particleCount
                ?? r.gpgpuParticles?.count
                ?? null;
    const pVis = r.gpgpuParticles?.points?.visible ?? false;
    this._set("gpgpuCount",
      pCount != null
        ? `${compactInt(pCount)} · ${pVis ? "on" : "off"}`
        : "—");

    const amp = r.audioReactor?.metrics?.amp ?? 0;
    const bar = this.el.querySelector('[data-k="audioBar"]');
    if (bar) bar.style.setProperty("--w", `${Math.min(amp, 1) * 100}%`);
    this._set("audioNum", amp.toFixed(2));

    // ---- FRAME row ----
    this._set("fps", `${fps.toFixed(1)}`);
    this._set("dt",  `${(1000 / Math.max(fps, 1)).toFixed(1)} ms`);
  }
}

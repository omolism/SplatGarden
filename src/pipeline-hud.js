// ---------------------------------------------------------------------------
// PipelineHUD — top-left "RENDER" readout. Just the runtime numbers that
// aren't covered by other panels:
//   - Splat count (hero number)
//   - Subform composition bars (3DGS / Quad / Voxel) — each row shows the
//     layer's current opacity as a bar + percent
//   - Draw calls + triangles (small footer)
//   - GPU identity (footer, static after init)
//
// FPS / DT moved to the Profiler (P), pass list lives in the lil-gui
// Post-Process folder, audio reactor was removed. Refreshes ~2 Hz.
// ---------------------------------------------------------------------------

const UPDATE_HZ_MS = 500;

function compactInt(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

// Splat count uses commas — it's the headline figure for 3DGS and small
// differences matter (e.g. 2,987,341 vs "3.00M" hides 12k).
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

// Trim the ANGLE wrapper string from WebGL renderer strings so the HUD
// shows "NVIDIA GeForce RTX 4090" instead of
// "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)".
function shortRenderer(s) {
  if (!s || s === "—") return s;
  const ang = /^ANGLE\s*\(\s*[^,]+,\s*([^,]+?)\s*(?:Direct3D[^,)]*)?(?:,[^)]*)?\)$/i.exec(s);
  if (ang) return ang[1].trim();
  return s;
}

export class PipelineHUD {
  constructor({ renderer, refs = {}, mountEl = document.body }) {
    this.renderer = renderer;
    this.refs     = refs;       // { splat, voxelizer, quadizer }
    this._collapsed = false;

    const gpu = getGpuInfo(renderer);

    this.el = document.createElement("div");
    this.el.id = "pipeline-hud";
    this.el.innerHTML = `
      <div class="hud-title">
        <span class="dot"></span>
        <span class="t">RENDER</span>
        <span class="hud-toggle" data-act="collapse" title="Collapse">─</span>
      </div>
      <div class="hud-body">
        <div class="hud-hero">
          <div class="hero-num" data-k="splats">—</div>
          <div class="hero-label">splats</div>
        </div>

        <div class="hud-subforms">
          <div class="hud-sub" data-k="splatRow">
            <span class="sub-name">3DGS</span>
            <span class="sub-bar"><span class="fill" data-k="splatFill"></span></span>
            <span class="sub-val" data-k="splatPct">—</span>
          </div>
          <div class="hud-sub" data-k="quadRow">
            <span class="sub-name">Quad</span>
            <span class="sub-bar"><span class="fill" data-k="quadFill"></span></span>
            <span class="sub-val" data-k="quadPct">—</span>
          </div>
          <div class="hud-sub" data-k="voxelRow">
            <span class="sub-name">Voxel</span>
            <span class="sub-bar"><span class="fill" data-k="voxelFill"></span></span>
            <span class="sub-val" data-k="voxelPct">—</span>
          </div>
        </div>

        <div class="hud-stats">
          <span class="k">Draw</span><span class="v" data-k="draw">—</span>
          <span class="sep">·</span>
          <span class="k">Tris</span><span class="v" data-k="tris">—</span>
        </div>

        <div class="hud-gpu">
          <div class="gpu-name" data-k="renderer">—</div>
          <div class="gpu-ctx">WebGL 2 · f32</div>
        </div>
      </div>
    `;
    mountEl.appendChild(this.el);

    this._set("renderer", shortRenderer(gpu.renderer));
    this.el.querySelector('[data-k="renderer"]').title = gpu.renderer;

    this.el.querySelector('[data-act="collapse"]').addEventListener("click", () => {
      this._collapsed = !this._collapsed;
      this.el.classList.toggle("collapsed", this._collapsed);
    });

    this._lastT = 0;
  }

  _set(key, value) {
    const el = this.el.querySelector(`[data-k="${key}"]`);
    if (el) el.textContent = value;
  }

  _setBar(key, pct) {
    const el = this.el.querySelector(`[data-k="${key}"]`);
    if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  tick(nowMs /*, dtMs */) {
    if (nowMs - this._lastT < UPDATE_HZ_MS) return;
    this._lastT = nowMs;
    this._update();
  }

  _update() {
    const r  = this.refs;
    const ri = this.renderer.info.render;

    // Hero splat count
    const nSplats = r.splat?.packedSplats?.numSplats ?? null;
    this._set("splats", nSplats != null ? exactInt(nSplats) : "—");

    // 3DGS row — splat layer either visible or hidden; bar reflects that.
    const splatVisible = r.splat?.visible !== false && nSplats != null && nSplats > 0;
    this._setBar("splatFill", splatVisible ? 100 : 0);
    this._set("splatPct", splatVisible ? "100%" : "off");
    this.el.querySelector('[data-k="splatRow"]')?.classList.toggle("off", !splatVisible);

    // Quad row — opacity drives the bar; show "off" if no instances.
    const nQuads  = r.quadizer?.mesh?.geometry?.instanceCount ?? 0;
    const qVis    = r.quadizer?.opacity ?? 0;
    const quadActive = nQuads > 0 && qVis > 0.001;
    this._setBar("quadFill", quadActive ? qVis * 100 : 0);
    this._set("quadPct", quadActive ? `${(qVis * 100).toFixed(0)}%` : "off");
    this.el.querySelector('[data-k="quadRow"]')?.classList.toggle("off", !quadActive);

    // Voxel row — same shape as quad.
    const nVoxels = r.voxelizer?.mesh?.geometry?.instanceCount ?? 0;
    const vVis    = r.voxelizer?.opacity ?? 0;
    const voxActive = nVoxels > 0 && vVis > 0.001;
    this._setBar("voxelFill", voxActive ? vVis * 100 : 0);
    this._set("voxelPct", voxActive ? `${(vVis * 100).toFixed(0)}%` : "off");
    this.el.querySelector('[data-k="voxelRow"]')?.classList.toggle("off", !voxActive);

    // Draw + tris
    this._set("draw", compactInt(ri.calls));
    this._set("tris", compactInt(ri.triangles));
  }
}

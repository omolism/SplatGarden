// ---------------------------------------------------------------------------
// Pipeline — right-side slide-in that doubles as the showcase's information-
// design centerpiece. Organised by ASSETS first, then the systems that
// produce / render / drive them. FX and Post-FX sit at the bottom as "toy"
// sections.
//
// Each item can carry the legacy { ref, note, source } trio or the richer
// asset-pipeline fields { toolchain[], output, location }. The renderer
// shows whichever ones are present.
//
// Toggle: press T, or via instance.toggle(). Sections are collapsible; the
// entire panel slides in from the right.
// ---------------------------------------------------------------------------

export const TECH_SPECS = [
  // ============== Three layered groups ==============
  // L1 R&D       — research / spec work: AI tooling + USD interop
  // L2 Production — assets + Unreal scene assembly
  // L3 3DGS       — capture + training (the Unreal -> splat conversion)
  {
    section:   "R&D",
    group:     "layer",
    layerNum:  1,
    desc:      "Research + interop layer — the custom AI texture tool plus the OpenUSD spec for our alternative render subforms.",
    toolchain: ["IP-Adapter", "ControlNet", "AdaIN", "Diffusion", "OpenUSD", "UsdGeomPointInstancer"],
    items: [
      {
        name:      "AI Texture Stylization",
        ref:       "Diffusion-based painterly tool with controllable color preservation",
        toolchain: ["IP-Adapter", "ControlNet (Tile / Canny)", "AdaIN", "Diffusion"],
        output:    "Painterly textures · pre-approved palette preserved",
        note:      "Custom tool driving the painterly look on Daffodil + Landscape. Two artist-selectable modes — Full Style Transfer (color + texture + tone from a reference) and Texture-Only Transfer (auto-grayscale + AdaIN, preserves the original color palette). Per-channel histogram matching + patch-wise AdaIN run post-generation to deterministically correct residual color drift. Artist knobs: ControlNet mode, ControlNet strength, IP-Adapter strength, inference steps, guidance scale. PyTorch 2.11 / CUDA 13.0 on an NVIDIA RTX PRO 6000 Blackwell (96 GB VRAM) — 4K in ≈ 20 s at 20 inference steps, driven from a Gradio interface.",
        compare: {
          before: null,
          after:  null,
          labelA: "Original",
          labelB: "Stylized",
        },
      },
      {
        name:      "OpenUSD subforms",
        ref:       "Quad + Voxel as UsdGeomPointInstancer prims",
        toolchain: ["UsdGeomPointInstancer", "UsdGeomPlane", "UsdGeomCube", "primvars:displayColor"],
        output:    "USD-compatible alternative renderings of the same splat data",
        note:      "Two alternative render representations of the splat, each expressed as a USD PointInstancer prim. Quad uses proto = UsdGeomPlane (per-instance camera-facing billboards). Voxel uses proto = UsdGeomCube (uniform-grid binning with averaged colour per cell). Both carry per-instance positions, orientations, scales, and a primvars:displayColor array. Toggle live via Customize ▸ Splat in the GUI.",
      },
    ],
  },

  {
    section:   "Production",
    group:     "layer",
    layerNum:  2,
    desc:      "Per-object authoring + Unreal scene assembly — everything that goes into the dressed scene before the camera turns on.",
    toolchain: ["Houdini", "SpeedTree", "VAT bake", "Python · OSC", "Unreal Engine", "Perforce"],
    items: [
      {
        name: "Scene assembly",
        ref:  "Unreal Engine — every asset set-dressed into one scene",
        note: "Perforce-backed version control across artists. All set-dressed assets land here before the capture stage.",
      },
      {
        name:      "Gazebo",
        location:  "Centerpiece",
        worldPos:  [-0.58, -0.561, 3.774],
        toolchain: ["Houdini (3DGS SIM)", "Unreal Engine (set dress)"],
        output:    "3DGS centerpiece · Houdini-simulated splat dynamics",
        note:      "The garden's central architecture. Built in Houdini as a 3DGS simulation — splat positions are driven by a sim graph, then baked and dressed into the Unreal scene before capture.",
        embed: {
          src:   "https://player.vimeo.com/video/1193797863?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
          label: "Houdini 3DGS simulation",
          title: "Shot4B_GS-FX_V08",
        },
      },
      {
        name:      "Vine",
        location:  "Near gazebo",
        worldPos:  [-0.89, -0.926, 3.258],
        toolchain: ["Unreal Engine — Motion Graphics", "Unreal Engine — WPO shader"],
        output:    "Animated vine growth · flowers driven by Motion Graphics, stems by WPO",
        note:      "Vine growth render. The bloom heads use Unreal's Motion Graphics system for keyframed flowering; the stems run a custom material whose World Position Offset (WPO) drives the procedural growth path along the gazebo's framework.",
        embed: {
          src:   "https://player.vimeo.com/video/1191203718?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
          label: "Vine growth · Unreal MG + WPO shader",
          title: "Shot4B_Interaction",
        },
      },
      {
        name:      "Daffodil",
        location:  "Near gazebo",
        worldPos:  [0.28, -0.773, 2.226],
        toolchain: ["Houdini", "VAT bake", "Unreal Engine (set dress)", "Python · OSC · MediaPipe", "AI texture stylization"],
        output:    "Mesh + VAT animation · interactively driven in Unreal",
        note:      "Animated procedurally in Houdini and VAT-baked, then set-dressed in Unreal. Inside the Unreal session, Python · OSC · MediaPipe drives the rig live (hand gesture → OSC → blueprint). Diffuse texture passes through the AI Texture Stylization tool from L1.",
        embed: {
          src:   "https://player.vimeo.com/video/1191203670?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1",
          label: "VAT + OSC interaction",
          title: "VAT",
        },
        compare: {
          before: null,
          after:  null,
          labelA: "Original",
          labelB: "Stylized",
        },
      },
      {
        name:      "Grape Hyacinth",
        location:  "Near gazebo",
        worldPos:  [-0.195, -0.730, 2.379],
        toolchain: ["Houdini (procedural)", "Unreal Engine (set dress)"],
        note:      "Houdini-generated cluster scattered across the gazebo planters.",
        compare: {
          before: null,
          after:  null,
          labelA: "Original",
          labelB: "Stylized",
        },
      },
      {
        name:      "Tree",
        location:  "Near gazebo",
        toolchain: ["SpeedTree", "Unreal Engine (set dress)"],
        note:      "Procedural tree authored in SpeedTree, dressed into the Unreal scene before the env capture.",
      },
      {
        name:      "Landscape",
        location:  "Whole scene base",
        toolchain: ["Unreal Engine (terrain authoring)", "AI texture stylization"],
        output:    "Landscape mesh + AI-stylized ground textures",
        note:      "Terrain authored directly in Unreal; ground textures passed through the AI Texture Stylization tool from L1 to land the painterly look in the final 3DGS.",
      },
    ],
  },

  {
    section:   "3DGS",
    group:     "layer",
    layerNum:  3,
    desc:      "Capturing the dressed Unreal scene at Litchfield Studio and training it as a 3D Gaussian Splat in Postshot.",
    toolchain: ["Litchfield Studio", "COLMAP", "Postshot", "Spark"],
    items: [
      {
        name: "3D Gaussian Splatting",
        ref:  "Kerbl et al., SIGGRAPH 2023 · rendered in-browser via @sparkjsdev/spark",
        note: "The render primitive: per-splat ellipsoidal Gaussians + spherical-harmonic view-dependent colour. The composed garden ends up as a single .splat asset, rasterised in real time by Spark on Three.js + WebGL 2.",
      },
      {
        name:   "Capture",
        ref:    "Litchfield Studio capture pipeline",
        note:   "The whole Unreal scene is photographed at the Litchfield Studio rig — multi-camera array sweeping the subject for downstream reconstruction.",
      },
      {
        name:   "Pose reconstruction",
        ref:    "COLMAP Structure-from-Motion · 990 cameras recovered",
        note:   "COLMAP solves intrinsics + extrinsics for every capture frame; the resulting 990 camera poses feed the Postshot trainer (and double as the Training Cameras overlay in Tech Spec).",
        source: "src/colmap-loader.js:50",
      },
      {
        name: "Splat training",
        ref:  "Postshot — per-splat Gaussian fit + SH coefficients",
        note: "Postshot optimises the 3D Gaussian parameters (centre, scales, rotation, SH coefficients, opacity) against the COLMAP-anchored capture images. Output: public/Whole_With_Statue.splat (≈ 3 M splats).",
      },
    ],
  },
];

function renderItem(it) {
  const isAsset = Array.isArray(it.toolchain) && it.toolchain.length > 0;

  // 1. Title row — big asset name + optional location chip
  const head = `
    <header class="ts-item-head">
      <h3 class="ts-item-name">${it.name}</h3>
      ${it.location ? `<span class="ts-item-loc">${it.location}</span>` : ""}
    </header>`;

  // 2. Sub-line — short technical tagline (ref). Sits right under the title.
  const sub = it.ref ? `<div class="ts-item-sub">${it.ref}</div>` : "";

  // 3. Toolchain zone — explicit "TOOLCHAIN" label + chip row with arrows
  let chain = "";
  if (isAsset) {
    const chips = it.toolchain
      .map(t => `<span class="ts-chip">${t}</span>`)
      .join('<span class="ts-arrow">▸</span>');
    chain = `<div class="ts-zone">
        <div class="ts-zone-label">Toolchain</div>
        <div class="ts-chain">${chips}</div>
      </div>`;
  }

  // 4. Output zone — explicit "OUTPUT" label + value
  const output = it.output ? `<div class="ts-zone">
        <div class="ts-zone-label">Output</div>
        <div class="ts-zone-val">${it.output}</div>
      </div>` : "";

  // 5. Note — the readable prose paragraph
  const note = it.note ? `<p class="ts-item-note">${it.note}</p>` : "";

  // 5b. Before/after compare widget — drag the handle to wipe between the
  // pre-AI texture and the stylized output. Used by AI Stylization items;
  // declared via `compare: { before, after, labelA, labelB }` on the item.
  const compare = it.compare ? renderCompare(it.compare) : "";

  // 6. Source — small mono footer with hairline rule above
  const source = it.source ? `<div class="ts-item-src">${it.source}</div>` : "";

  return `<li class="ts-item${isAsset ? " ts-item-asset" : ""}">${head}${sub}${chain}${output}${note}${compare}${source}</li>`;
}

export function renderCompare(c) {
  const lblA = c.labelA || "Before";
  const lblB = c.labelB || "After";
  const layer = (url, fallback, cls) => url
    ? `<img class="cmp-img ${cls}" src="${url}" draggable="false" alt="">`
    : `<div class="cmp-img cmp-ph ${cls}"><span>${fallback}</span></div>`;
  return `
    <div class="ts-compare">
      <div class="cmp-frame" data-cmp>
        ${layer(c.after, "AFTER · placeholder", "cmp-img-b")}
        ${layer(c.before, "BEFORE · placeholder", "cmp-img-a")}
        <div class="cmp-handle"><div class="cmp-knob"></div></div>
        <div class="cmp-tag cmp-tag-a">${lblA}</div>
        <div class="cmp-tag cmp-tag-b">${lblB}</div>
      </div>
    </div>`;
}

// Wire the drag-to-wipe interaction on a single compare frame.
//
// Listeners live on the FRAME itself (not the tiny 2 px handle), so the
// grab target is the whole 16:9 area — much more forgiving. pointerdown
// also snaps the split to where the user clicked, so single-click works
// the same as drag. setPointerCapture on the frame routes pointermove
// events through even if the cursor drifts off the card, which means
// the compare slider keeps tracking inside draggable parents (the asset
// hover card has its own pointer handlers, but they early-return for
// targets outside .ah-head).
export function wireCompareFrame(frame) {
  // Idempotent — _show() re-runs this every time the card rebuilds, so
  // bail if we've already wired this frame.
  if (frame.dataset.cmpWired === "1") return;
  frame.dataset.cmpWired = "1";

  const imgA = frame.querySelector(".cmp-img-a");
  const handle = frame.querySelector(".cmp-handle");
  if (!imgA || !handle) return;

  let split = 0.5;
  const apply = () => {
    handle.style.left = `${(split * 100).toFixed(3)}%`;
    imgA.style.clipPath = `inset(0 ${((1 - split) * 100).toFixed(3)}% 0 0)`;
  };
  apply();

  const setAt = (clientX) => {
    const r = frame.getBoundingClientRect();
    if (r.width <= 0) return;
    split = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    apply();
  };

  let dragging = false;
  frame.addEventListener("pointerdown", (e) => {
    // Left button / primary touch only — and don't fight other handlers
    // (e.g., the asset card's text-selection on the body).
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    try { frame.setPointerCapture(e.pointerId); } catch {}
    setAt(e.clientX);
    e.preventDefault();
    e.stopPropagation();
  });
  frame.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    setAt(e.clientX);
    e.preventDefault();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { frame.releasePointerCapture(e.pointerId); } catch {}
  };
  frame.addEventListener("pointerup",     endDrag);
  frame.addEventListener("pointercancel", endDrag);
  frame.addEventListener("pointerleave",  endDrag);
}

export class TechSpec {
  constructor({ mountEl = document.body } = {}) {
    this.open = false;

    this.el = document.createElement("div");
    this.el.id = "tech-spec";
    this.el.innerHTML = `
      <div class="ts-backdrop"></div>
      <aside class="ts-panel">
        <header class="ts-header">
          <div class="ts-title">
            <span class="dot"></span>
            <span class="t">PIPELINE</span>
            <span class="ts-key">T</span>
          </div>
          <button class="ts-close" title="Close (T or Esc)">×</button>
        </header>
        <div class="ts-sub">How everything in this scene was made · click a section to fold</div>
        <div class="ts-body">
          ${TECH_SPECS.map((s, i) => {
            const groupCls = s.group ? ` ts-sec-${s.group}` : "";
            const numChip  = (s.layerNum != null)
              ? `<span class="ts-sec-num">L${s.layerNum}</span>`
              : (s.pillarIdx
                  ? `<span class="ts-sec-num">${String(s.pillarIdx).padStart(2, "0")}</span>`
                  : "");
            const itemLbl  = s.items.length === 1 ? "item" : "items";
            // Layer sections show their tool stack as a chip row in the
            // header — readable even when the section is collapsed.
            const layerTools = (s.group === "layer" && Array.isArray(s.toolchain))
              ? `<div class="ts-sec-tools">${s.toolchain.map(t => `<span class="ts-chip">${t}</span>`).join("")}</div>`
              : "";
            return `
              <section class="ts-sec${groupCls}" data-idx="${i}">
                <header class="ts-sec-head">
                  ${numChip}
                  <span class="ts-sec-name">${s.section}</span>
                  <span class="ts-sec-count">${s.items.length} ${itemLbl}</span>
                  <span class="ts-caret">▾</span>
                </header>
                <div class="ts-sec-desc">${s.desc}</div>
                ${layerTools}
                <ul class="ts-list">
                  ${s.items.map(renderItem).join("")}
                </ul>
              </section>`;
          }).join("")}
        </div>
        <footer class="ts-footer">
          <span class="ts-foot-k">Total</span>
          <span class="ts-foot-v">${TECH_SPECS.reduce((n, s) => n + s.items.length, 0)} entries · ${TECH_SPECS.length} sections</span>
        </footer>
      </aside>
    `;
    mountEl.appendChild(this.el);

    this.el.querySelector(".ts-close").addEventListener("click", () => this.close());
    // Backdrop is click-through (pointer-events:none) so drags reach the
    // canvas — no listener wired. Close via × button, Esc, or T toggle.

    this.el.querySelectorAll(".ts-sec-head").forEach(h => {
      h.addEventListener("click", () => {
        const sec = h.closest(".ts-sec");
        sec.classList.toggle("collapsed");
      });
    });

    // Wire drag handles on every inline before/after compare widget.
    this.el.querySelectorAll(".ts-compare .cmp-frame").forEach(wireCompareFrame);

    // T key toggles, Esc closes — guarded against typing into inputs.
    window.addEventListener("keydown", (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "t" || e.key === "T") this.toggle();
      else if (e.key === "Escape" && this.open) this.close();
    });
  }

  toggle()      { this.open ? this.close() : this.openOverlay(); }
  openOverlay() {
    this.open = true;
    this.el.classList.add("show");
    this.onOpenChange?.(true);
  }
  close() {
    this.open = false;
    this.el.classList.remove("show");
    this.onOpenChange?.(false);
  }
}

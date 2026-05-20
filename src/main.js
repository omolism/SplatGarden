import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { createScanModifier, EffectController, buildGUI, params as effectParams } from "./effects.js";
import { Profiler } from "./profiler.js";
import { TechSpec, TECH_SPECS } from "./tech-spec.js";
import { AssetHoverManager } from "./asset-hover.js";
import { AnnotationManager } from "./annotations.js";
import { HandController } from "./handtracking.js";
import { setupPostFX } from "./postfx.js";
import { DataLabelLayer } from "./datalabels.js";
import { VelocityField } from "./velocity-field.js";
import { GPGPUParticles } from "./gpgpu-particles.js";
// SortedParticles removed — replaced by the WarpFx post-process pass.
import { Voxelizer } from "./voxelizer.js";
import { Quadizer }  from "./quadizer.js";
import { PipelineHUD } from "./pipeline-hud.js";
import { SceneLayers } from "./scene-layers.js";
import { KeyHints } from "./key-hints.js";
import { uniforms as effectUniforms } from "./effects.js";
import { loadColmapImages, buildColmapFrustums } from "./colmap-loader.js";

// All public-folder assets resolve against BASE_URL so the same build
// works at the root (Cloudflare Pages, `npm run dev`) and under a sub-
// path (GitHub Pages — `/SplatGarden-WebViewer/`). BASE_URL always ends
// with "/" so plain concatenation is safe.
const BASE = import.meta.env.BASE_URL;
const SPLAT_URL = `${BASE}Whole_With_Statue.splat`;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const canvas       = document.getElementById("viewport");
const loadingEl    = document.getElementById("loading");
const loadingText  = document.getElementById("loading-text");
const annoLayer    = document.getElementById("annotation-layer");
const viewList     = document.getElementById("viewpoint-list");
const addBtn       = document.getElementById("add-viewpoint");
const statusEl     = document.getElementById("status");
const handToggle   = document.getElementById("hand-toggle");
const handVideo    = document.getElementById("hand-video");
const handCursor   = document.getElementById("hand-cursor");
const handCursor2  = document.getElementById("hand-cursor-2");
const handModeEl   = document.getElementById("hand-mode");

// ---------------------------------------------------------------------------
// Mobile detection — applied ONLY when the user is on a touch device.
// Desktop behaviour is untouched. Mobile flips a body class for CSS overrides,
// caps the pixel ratio harder (mobile GPUs choke on full retina at 2.6 M
// splats), disables expensive post-fx by default, auto-collapses the GUI so
// it doesn't eat half the screen, and hides hand-tracking (front-cam +
// MediaPipe is battery murder on phones).
// ---------------------------------------------------------------------------
const IS_MOBILE =
  /Mobi|Android|iPhone|iPad|iPod|Tablet/i.test(navigator.userAgent) ||
  (window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth < 900);
document.body.classList.toggle("mobile", IS_MOBILE);

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
// preserveDrawingBuffer enables canvas.toDataURL() for the A/B Compare
// snapshot path. Minor GPU cost; the headline cost was already paid by
// post-FX render targets.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x0b0f14, 1);

const scene = new THREE.Scene();
const spark = new SparkRenderer({ renderer });
scene.add(spark);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.01,
  2000,
);
camera.position.set(0, 1.5, 4);
scene.add(camera);

window.__cam = { camera };
const controls = new OrbitControls(camera, canvas);
window.__cam.controls = controls;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.7;
controls.minDistance = 0.05;
controls.maxDistance = 200;

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Post-FX (kaleidoscope) — wraps renderer with EffectComposer
// ---------------------------------------------------------------------------
const postfx = setupPostFX(renderer, scene, camera);
postfx.setSize(window.innerWidth, window.innerHeight);

// Phase-1 foundation: 2D velocity-conservation field. Hand pinch + mouse
// press inject mass/velocity at the input UV; the field convolves + advects
// each frame, exposing its current state via getTexture() for downstream
// passes (particles, voxel particles) to consume.
// Cheap at 256x256 half-float (~1ms/frame), so stepped unconditionally.
const velocityField = new VelocityField(renderer, { resolution: 256 });
window.__velocityField = velocityField;   // dev affordance for runtime inspection

// GPGPU particle system that advects through the velocity field.
// 64² = 4096 additive point sprites; off by default until the user enables
// it via the FX GUI. Bounds set wide so particles spread through a typical
// splat scene (~10 m wide).
const gpgpuParticles = new GPGPUParticles(renderer, {
  size:   64,
  bounds: { min: [-6, -2, -6], max: [6, 6, 6] },
  maxAge: 4.0,
});
// Particles live in a SEPARATE scene rendered AFTER the composer with
// autoClear=false, so they bypass every post-FX pass (Echo trails, Bloom,
// Underwater, etc.) — they always read as crisp additive sprites on top
// of the finished frame. depthTest is off since the screen depth buffer
// isn't reliable post-composer; tradeoff = particles never occlude behind
// scene geometry (additive overlay only).
gpgpuParticles.renderMat.depthTest = false;
const particleScene = new THREE.Scene();
particleScene.add(gpgpuParticles.points);
window.__gpgpuParticles = gpgpuParticles;

// Pipeline HUD — slim RENDER readout: splat count + subform bars + GPU.
// Refs may be null at construction; pipelineHUD reads them lazily via the
// refs object so later assignments to splat / voxelizer / quadizer are
// picked up automatically.
const _hudRefs = {
  splat:       null,
  voxelizer:   null,
  quadizer:    null,
  sceneLayers: null,   // wired below once SceneLayers is instantiated
};
const pipelineHUD = new PipelineHUD({
  renderer,
  refs:    _hudRefs,
  mountEl: document.getElementById("app") || document.body,
});
window.__pipelineHUD = pipelineHUD;

// Profiler — per-phase wall-clock frame timing. Toggle with P.
const profiler = new Profiler({
  mountEl: document.getElementById("app") || document.body,
});
window.__profiler = profiler;

// Tech Spec — research-bibliography overlay. Toggle with T.
// Mounted to <body> (not #app) so its z-index isn't trapped inside #app's
// fixed-positioned stacking context — otherwise lil-gui (z-index 1001 on
// <body>) would draw over it.
const techSpec = new TechSpec({
  mountEl: document.body,
});
window.__techSpec = techSpec;

// Scene layers — SuperSplat-style panel with per-layer visibility toggles.
// First splat added (in loadSplat below) becomes the primary; subsequent
// drag-drop or "+ Add" calls append secondary layers that can be hidden /
// removed without touching the primary's effects / voxel / quad bindings.
const sceneLayers = new SceneLayers({
  scene,
  mountEl: document.getElementById("left-stack") || document.body,
});
window.__sceneLayers = sceneLayers;
_hudRefs.sceneLayers = sceneLayers;   // RENDER HUD sums splats across visible layers

// Asset hover hotspots — project each TECH_SPECS asset's worldPos onto the
// viewport. Hover a dot for the poster-style info card. worldPos values
// are raw Three.js world coords (same convention as the Gazebo viewpoint).
const assetHover = new AssetHoverManager({
  mountEl: document.getElementById("app") || document.body,
  camera,
  canvas,
  items: TECH_SPECS.flatMap(s => s.items),
});
window.__assetHover = assetHover;

// Quick Guide — bottom-centre card with mouse + key shortcuts. Auto-pops on
// scene entry (showFor below in loadSplat's end), summon back with H.
const keyHints = new KeyHints({
  mountEl: document.getElementById("app") || document.body,
});
window.__keyHints = keyHints;

// Tech-Spec overlay scene — training cameras (and any future tech-spec 3D
// gizmos) live here so they bypass the post-FX composer pipeline. Rendered
// AFTER postfx.render() with autoClear=false so they sit cleanly on top.
const techOverlayScene = new THREE.Scene();
// Mobile: kill post-processing by default — Bloom is the biggest GPU tax,
// and the Polish pass is fill-rate heavy on mobile GPUs.
if (IS_MOBILE) {
  postfx.params.postEnable = false;
  postfx.params.bloomEnable = false;
  const handPanel = document.getElementById("hand-panel");
  if (handPanel) handPanel.style.display = "none";
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  postfx.setSize(w, h);
}
window.addEventListener("resize", onResize);

// ---------------------------------------------------------------------------
// Load splat
// ---------------------------------------------------------------------------
function setLoading(msg) {
  if (loadingText) loadingText.textContent = msg;
}
function hideLoading() {
  loadingEl?.classList.add("hidden");
}

let splat = null;
let effects = null;
let annotations = null;
let dataLabels = null;
let voxelizer = null;
let quadizer = null;
let cameraFrustums = null;
// Wireframe sphere shown at the hand-effector position when Effector Mode is
// active. Parented to splat so its transform is in splat-local space (same
// space as uniforms.maskCenter), no per-frame matrix math needed.
let effectorMesh = null;

// Build a SplatMesh (either from URL or fileBytes), wait for init, and
// return its world-space bounds so the caller can reframe the camera.
async function createSplat(options) {
  const m = new SplatMesh(options);
  // Postshot / Inria export convention — flip 180° around X for Y-up world.
  m.quaternion.set(1, 0, 0, 0);
  await m.initialized;
  const localBox = m.getBoundingBox(true);
  const bbox     = localBox.clone().applyMatrix4(m.matrixWorld);
  const center   = new THREE.Vector3(); bbox.getCenter(center);
  const size     = new THREE.Vector3(); bbox.getSize(size);
  const radius   = Math.max(size.x, size.y, size.z, 1.0) * 0.5;
  return { splat: m, center, size, radius };
}

async function loadSplat() {
  setLoading("Fetching splat…");

  const built = await createSplat({ url: SPLAT_URL });
  splat = built.splat;
  scene.add(splat);
  _hudRefs.splat = splat;
  sceneLayers.add({ mesh: splat, name: SPLAT_URL.split("/").pop(), isPrimary: true });

  // Wireframe sphere overlay for Effector Mode. Parented to splat so its
  // position can be copied straight from uniforms.maskCenter (already in
  // splat-local space) without any world-space conversion each frame.
  effectorMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({
      wireframe: true,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
      depthWrite: false,
      color: 0x66ddff,
    }),
  );
  effectorMesh.frustumCulled = false;
  effectorMesh.renderOrder = 998;
  effectorMesh.visible = false;
  splat.add(effectorMesh);

  setLoading("Computing bounds…");

  const center = built.center;
  const size   = built.size;
  const radius = built.radius;

  // Reframe camera
  camera.position.copy(center).add(new THREE.Vector3(0, radius * 0.4, radius * 1.8));
  controls.target.copy(center);
  controls.update();

  // ---- Effects ----
  effects = new EffectController(splat);
  splat.objectModifier = createScanModifier();
  splat.updateGenerator();
  const gui = buildGUI(effects);
  postfx.attachGUI(gui);
  // Mobile: auto-collapse every folder so the panel doesn't eat the viewport.
  if (IS_MOBILE) {
    gui.foldersRecursive().forEach(f => f.close());
    gui.close();
  }

  // ---- Voxelizer + Quadizer (USD PointInstancer-style overlays) -----------
  // Voxelizer: instanced cubes (BoxGeometry) aggregating splats into a grid.
  // Quadizer:  one camera-facing billboard per splat, reading vertex color.
  // Both pull in the shared effect uniforms so click FX animates them too.
  voxelizer = new Voxelizer({
    scene, splatMesh: splat,
    voxelSize: effectUniforms.voxelSize.value,
    fxUniforms: effectUniforms,
  });
  quadizer = new Quadizer({
    scene, splatMesh: splat,
    quadSize: effectUniforms.quadSize.value,
    fxUniforms: effectUniforms,
  });
  _hudRefs.voxelizer = voxelizer;
  _hudRefs.quadizer  = quadizer;
  gui.controllersRecursive().forEach(ctrl => {
    if (ctrl._name === "Voxel Size") {
      const prev = ctrl._onChange;
      ctrl.onChange((v) => { if (prev) prev(v); voxelizer.setVoxelSize(v); });
    } else if (ctrl._name === "Quad Size") {
      const prev = ctrl._onChange;
      ctrl.onChange((v) => { if (prev) prev(v); quadizer.setQuadSize(v); });
    }
  });

  // ---- Annotations ----
  annotations = new AnnotationManager({
    camera,
    controls,
    layerEl: annoLayer,
    listEl: viewList,
    addBtnEl: addBtn,
    statusEl,
    // localStorage key scoped to the splat URL so swapping splats doesn't
    // bring along the wrong viewpoints.
    storageKey: "splatgarden:viewpoints:" + SPLAT_URL,
  });
  // Seed defaults silently — without this guard, each seeded add() would
  // write to localStorage and wipe any saved user-added viewpoints (e.g.
  // "Gazebo") before we get a chance to read them.
  annotations._suspendSave = true;
  const centerVp = annotations.seedDefaults(center, radius);
  annotations._suspendSave = false;

  // Asset hotspot click → tween the camera close to the asset. Same Z-flip
  // as the hotspot projection so the camera lands on the visible asset
  // (not its source-tool mirror across the origin).
  assetHover.onAssetSelect = (it) => {
    if (!Array.isArray(it.worldPos)) return;
    const target   = new THREE.Vector3(it.worldPos[0], it.worldPos[1], -it.worldPos[2]);
    const position = target.clone().add(new THREE.Vector3(0, 0.5, 1.5));
    annotations.flyToPose(position, target);
  };
  // If localStorage has saved viewpoints (e.g. the user's custom "Gazebo"
  // viewpoint added in a previous session), replace the seeded defaults
  // with them. Auto-save on add/remove/rename keeps storage in sync going
  // forward, so any new viewpoint persists automatically.
  const restored = annotations.restoreFromStorage();
  if (!restored) annotations._save();   // first run: persist the defaults
  // Prefer Gazebo (user-added) → Center → first available. Gazebo only
  // exists in storage if a previous session saved it via the GUI.
  const activeVp = restored
    ? annotations.viewpoints.find(v => v.name === "Gazebo")
      || annotations.viewpoints.find(v => v.name === "Center")
      || annotations.viewpoints[0]
    : centerVp;
  if (activeVp) {
    annotations.activeId = activeVp.id;
    annotations._rebuildList();
    camera.position.copy(activeVp.position);
    controls.target.copy(activeVp.target);
    controls.update();
  }

  // ---- Data-label surveillance overlay (sits over the canvas) ----
  dataLabels = new DataLabelLayer({
    canvas,
    camera,
    annotationManager: annotations,
    appEl: document.getElementById("app"),
  });
  dataLabels.setBounds(center, size);

  // ---- Hover tooltip for camera frustums -----------------------------------
  // Manual ray-vs-point pick (cheap for ~150 cameras) — projects each frustum
  // origin to NDC and picks the closest within the line-segment hit radius.
  function installFrustumHover(frustumMesh) {
    const data       = frustumMesh.userData.frustums || [];
    const pickRadius = frustumMesh.userData.pickRadius ?? 0.05;

    const tip = document.createElement("div");
    tip.className = "frustum-tip";
    tip.style.display = "none";
    document.getElementById("app").appendChild(tip);

    const _pv = new THREE.Vector3();
    let lastHover = -1;

    canvas.addEventListener("pointermove", (e) => {
      if (!frustumMesh.visible) {
        if (tip.style.display !== "none") tip.style.display = "none";
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Pick the frustum whose origin projects closest to the cursor in screen
      // space (within the per-frustum hit radius converted to px).
      let bestI = -1, bestPx = Infinity;
      const w = rect.width, h = rect.height;
      for (let i = 0; i < data.length; i++) {
        _pv.copy(data[i].pos).project(camera);
        if (_pv.z > 1) continue;                 // behind camera
        const sx = ( _pv.x * 0.5 + 0.5) * w;
        const sy = (-_pv.y * 0.5 + 0.5) * h;
        const dx = sx - mx, dy = sy - my;
        const d  = Math.hypot(dx, dy);
        if (d < bestPx) { bestPx = d; bestI = i; }
      }

      // Convert pickRadius (world units) at the picked depth → px so the hit
      // area scales with distance (close frustums easier to hit than far).
      const HIT_PX = 14;
      if (bestI >= 0 && bestPx < HIT_PX) {
        if (bestI !== lastHover) {
          const d = data[bestI];
          const f = (n, p = 3) => Number(n).toFixed(p);
          const [qw, qx, qy, qz] = d.qRaw;

          tip.innerHTML =
            `<div class="k">CAM_ID</div><div class="v">#${d.cameraId}</div>` +
            `<div class="k">POS</div><div class="v">${f(d.pos.x, 2)}, ${f(d.pos.y, 2)}, ${f(d.pos.z, 2)}</div>` +
            `<div class="k">QUAT</div><div class="v">${f(qw)}, ${f(qx)}, ${f(qy)}, ${f(qz)}</div>`;
          lastHover = bestI;
        }
        tip.style.display = "block";
        tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
      } else {
        if (tip.style.display !== "none") tip.style.display = "none";
        lastHover = -1;
      }
    });

    canvas.addEventListener("pointerleave", () => {
      tip.style.display = "none";
      lastHover = -1;
    });
  }

  // ---- COLMAP capture poses → data-label ticks -----------------------------
  // The .bin files in public/colmap/ are the COLMAP reconstruction the splat
  // was trained from. Each entry in images.bin gives a real camera world
  // position; we use those as the ambient ticks instead of random points so
  // the surveillance overlay shows the actual capture path.
  //
  // Coordinate alignment: the splat mesh is rotated 180° around X to bring
  // Postshot's Y-down convention into Three.js's Y-up. We apply the same
  // mirror to the COLMAP positions so they sit in the same world frame.
  loadColmapImages(`${BASE}colmap/images.bin`)
    .then(images => {
      // Subsample for a less-cluttered overlay (target ~150 frustums).
      const TARGET = 150;
      const stride = Math.max(1, Math.floor(images.length / TARGET));
      const sampled = images.filter((_, i) => i % stride === 0);
      cameraFrustums = buildColmapFrustums(sampled, {
        size:  Math.max(0.015, radius * 0.0018),
        depth: Math.max(0.03,  radius * 0.0035),
      });
      cameraFrustums.visible = false;
      // Training cameras live in a SEPARATE scene rendered AFTER the
      // composer (same pattern as gpgpu particles), so they're not bloomed,
      // painterly'd, underwater'd, or smeared by Echo trails. The overlay
      // renders with depthTest=false (already set in colmap-loader) on top
      // of the composed frame.
      techOverlayScene.add(cameraFrustums);
      installFrustumHover(cameraFrustums);

      // ----- Tighter bbox for the data-label overlay --------------------
      // SplatMesh.getBoundingBox() gets blown out by outlier splats, so the
      // dashed bbox ends up far larger than the visible content. The COLMAP
      // training cameras orbit the actual subject, so their world-space
      // bounding box (slightly inset) is a much better proxy for "where the
      // interesting content lives". We rebuild the overlay using that.
      if (dataLabels && cameraFrustums.userData?.frustums?.length) {
        const colBox = new THREE.Box3();
        for (const f of cameraFrustums.userData.frustums) colBox.expandByPoint(f.pos);
        const colCenter = new THREE.Vector3(); colBox.getCenter(colCenter);
        const colSize   = new THREE.Vector3(); colBox.getSize(colSize);
        // Cameras sit OUTSIDE the subject by definition, so 0.6× their
        // spread is a tighter fit to what the viewer actually sees.
        colSize.multiplyScalar(0.6);
        dataLabels.setBounds(colCenter, colSize);
      }

      console.info(`[COLMAP] ${images.length} poses → ${sampled.length} frustums`);
    })
    .catch(err => {
      console.warn("[COLMAP] failed to load:", err?.message ?? err);
    });

  // ---- Tech Spec — split out from Overlays --------------------------------
  // Data Labels + Training Cameras live here. Master Enable toggles both
  // together. Future tech-breakdown rows (AI Stylization / VAT Anim / GPU /
  // Postshot Pipeline) will sit under the same parent.
  const dataParams = { enabled: false, dataLabels: false };
  const techParams = { techEnable: false };
  const fTechSpec = gui.addFolder("Tech Spec");
  // Master Enable cascades to both sub-toggles so flipping it (via lil-gui
  // OR via opening the Pipeline drawer with T) lights up Training Cameras
  // and Data Labels together.
  const techEnableCtrl = fTechSpec.add(techParams, "techEnable").name("Enable").onChange((v) => {
    dataParams.enabled    = v;
    dataParams.dataLabels = v;
    if (camCtrl)        camCtrl.updateDisplay();
    if (dataLabelsCtrl) dataLabelsCtrl.updateDisplay();
    if (cameraFrustums) cameraFrustums.visible = v;
    if (dataLabels)     dataLabels.setEnabled(v);
  });

  const camCtrl = fTechSpec.add(dataParams, "enabled").name("Training Cameras").onChange(v => {
    if (cameraFrustums) cameraFrustums.visible = v && techParams.techEnable;
  });
  // Postshot-style: small wireframe pyramid icon next to the label.
  const camIcon = `<svg class="ctrl-icon" viewBox="0 0 24 16" aria-hidden="true">
    <polygon points="2,8 18,2 18,14" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
    <polygon points="18,2 22,4 22,12 18,14" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
    <line x1="2" y1="8" x2="22" y2="4" stroke="currentColor" stroke-width="1.1"/>
    <line x1="2" y1="8" x2="22" y2="12" stroke="currentColor" stroke-width="1.1"/>
  </svg>`;
  const nameEl = camCtrl.domElement.querySelector(".name");
  if (nameEl) nameEl.insertAdjacentHTML("afterbegin", camIcon);
  camCtrl.domElement.title = "Lets you toggle whether training camera poses are shown in the viewport.";

  const dataLabelsCtrl = fTechSpec.add(dataParams, "dataLabels").name("Data Labels").onChange(v => {
    if (dataLabels) dataLabels.setEnabled(v && techParams.techEnable);
  });
  dataLabelsCtrl.domElement.title = "Surveillance-card overlay showing per-viewpoint metadata.";

  // Tie the Pipeline drawer (T key) to the Tech Spec master Enable. Opening
  // the drawer lights up Training Cameras + Data Labels; closing turns them
  // off again. The setValue() call routes through the onChange cascade above.
  techSpec.onOpenChange = (open) => {
    if (techEnableCtrl) techEnableCtrl.setValue(!!open);
  };

  // ---- HDR sky toggle (inside Customize) ---------------------------------
  // Loads /Skybox.hdr lazily on first activation, applies as scene.background
  // + scene.environment. Most visible when the splat is rendered as points
  // so the sky shows through; available in Gaussian mode too.
  const fOverlay = gui.addFolder("Camera Movement");   // renamed from "Overlays"
  let hdrTex = null;
  let hdrLoading = false;
  const hdrParams = { hdr: false };
  const hdrParent = gui.fCustomize || fOverlay;
  const hdrCtrl = hdrParent.add(hdrParams, "hdr").name("HDR Sky").onChange(async (v) => {
    if (v) {
      if (!hdrTex && !hdrLoading) {
        hdrLoading = true;
        try {
          const tex = await new RGBELoader().loadAsync(`${BASE}Skybox.hdr`);
          tex.mapping = THREE.EquirectangularReflectionMapping;
          hdrTex = tex;
        } catch (err) {
          console.warn("[HDR] failed to load:", err?.message ?? err);
          hdrParams.hdr = false;
          hdrCtrl.updateDisplay();
          hdrLoading = false;
          return;
        }
        hdrLoading = false;
      }
      if (hdrTex) {
        scene.background = hdrTex;
        scene.environment = hdrTex;
      }
    } else {
      scene.background = null;
      scene.environment = null;
    }
  });
  hdrCtrl.domElement.title = "Show the HDR environment behind the splat — most visible in Point mode.";

  // ---- HDR drag-and-drop upload -------------------------------------------
  // "Use My Own HDRI" button opens a centred drop zone; drag any .hdr file
  // into it and it parses via RGBELoader.parse() (no fetch), replaces the
  // current environment, and turns HDR Sky on.
  const hdrDrop = document.createElement("div");
  hdrDrop.className = "hdri-drop";
  hdrDrop.innerHTML = `
    <div class="hdri-card">
      <div class="hdri-title">Drop your .hdr file</div>
      <div class="hdri-hint">Equirectangular HDRI · click anywhere outside to cancel</div>
      <div class="hdri-status"></div>
    </div>
  `;
  hdrDrop.style.display = "none";
  document.getElementById("app").appendChild(hdrDrop);
  const hdrStatusEl = hdrDrop.querySelector(".hdri-status");

  const showHdrDrop  = () => { hdrDrop.style.display = "flex"; hdrStatusEl.textContent = ""; };
  const hideHdrDrop  = () => { hdrDrop.style.display = "none"; };
  hdrDrop.addEventListener("click", (e) => { if (e.target === hdrDrop) hideHdrDrop(); });
  hdrDrop.addEventListener("dragover", (e) => { e.preventDefault(); hdrDrop.classList.add("over"); });
  hdrDrop.addEventListener("dragleave", () => hdrDrop.classList.remove("over"));
  hdrDrop.addEventListener("drop", async (e) => {
    e.preventDefault();
    hdrDrop.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.hdr$/i.test(file.name)) {
      hdrStatusEl.textContent = `Not an .hdr file: ${file.name}`;
      return;
    }
    hdrStatusEl.textContent = `Decoding ${file.name}…`;
    try {
      const buf = await file.arrayBuffer();
      const loader = new RGBELoader();
      const tex = loader.parse(buf);            // RGBELoader.parse → DataTexture
      tex.mapping = THREE.EquirectangularReflectionMapping;
      // Dispose previous if present
      if (hdrTex) hdrTex.dispose?.();
      hdrTex = tex;
      scene.background  = hdrTex;
      scene.environment = hdrTex;
      hdrParams.hdr     = true;
      hdrCtrl.updateDisplay();
      hdrStatusEl.textContent = `Loaded — ${file.name}`;
      setTimeout(hideHdrDrop, 600);
    } catch (err) {
      hdrStatusEl.textContent = "Decode failed: " + (err?.message ?? err);
    }
  });

  // GUI button to open the drop zone — sits right under HDR Sky in Customize.
  hdrParent.add({ pick: showHdrDrop }, "pick").name("⤓ Use My Own HDRI");

  // ---- 3DGS drag-and-drop upload ------------------------------------------
  // "Use My Own 3DGS" button under 3DGS/USD opens a drop overlay; drag any
  // .splat / .ply / .spz / .ksplat file in → calls the existing
  // replaceSplatMesh() with the dropped bytes (no fetch, no extra UI).
  const splatDrop = document.createElement("div");
  splatDrop.className = "hdri-drop";
  splatDrop.innerHTML = `
    <div class="hdri-card">
      <div class="hdri-title">Drop your 3DGS asset</div>
      <div class="hdri-hint">.splat · .ply · .spz · .ksplat · click outside to cancel</div>
      <div class="hdri-status"></div>
    </div>
  `;
  splatDrop.style.display = "none";
  document.getElementById("app").appendChild(splatDrop);
  const splatStatusEl = splatDrop.querySelector(".hdri-status");

  const showSplatDrop = () => { splatDrop.style.display = "flex"; splatStatusEl.textContent = ""; };
  const hideSplatDrop = () => { splatDrop.style.display = "none"; };
  splatDrop.addEventListener("click", (e) => { if (e.target === splatDrop) hideSplatDrop(); });
  splatDrop.addEventListener("dragover",  (e) => { e.preventDefault(); splatDrop.classList.add("over"); });
  splatDrop.addEventListener("dragleave", () => splatDrop.classList.remove("over"));
  splatDrop.addEventListener("drop", async (e) => {
    e.preventDefault();
    splatDrop.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.(splat|ply|spz|ksplat)$/i.test(file.name)) {
      splatStatusEl.textContent = `Unsupported file: ${file.name}`;
      return;
    }
    splatStatusEl.textContent = `Loading ${file.name}…`;
    try {
      const buf = await file.arrayBuffer();
      await replaceSplatMesh({ fileBytes: new Uint8Array(buf), fileName: file.name });
      splatStatusEl.textContent = `Loaded — ${file.name}`;
      setTimeout(hideSplatDrop, 600);
    } catch (err) {
      splatStatusEl.textContent = "Load failed: " + (err?.message ?? err);
    }
  });

  const splatParent = gui.fLayers || gui;
  splatParent.add({ pick: showSplatDrop }, "pick").name("⤓ Use My Own 3DGS");

  // ---- Pre-authored FBX camera move (Play / Pause / Stop) ------------------
  // Drives the scene camera off the animated FBX node every frame. Three
  // states: IDLE (time=0, controls enabled), PLAYING, PAUSED.
  let camFbxRoot = null, camMixer = null, camAction = null, camAnimNode = null;
  let camMoveLoading = false;
  let camMoveState = "idle";   // "idle" | "playing" | "paused"
  let camPhaseTimers = [];           // staged transition timers
  let camMovePrevSubform = 0;        // restore on stop / finish
  let camMovePrevQuadVis = 0;
  const _camFwd = new THREE.Vector3();

  // Timeline / frame readout — visible only while the camera move is loaded.
  const CAM_FPS = 24;
  const camTimeline = document.createElement("div");
  camTimeline.className = "cam-timeline";
  camTimeline.innerHTML = `
    <div class="ct-row">
      <span class="ct-label">CAMERA MOVE</span>
      <span class="ct-time">— / —</span>
      <span class="ct-frame">— / —</span>
    </div>
    <div class="ct-bar"><div class="ct-fill"></div></div>
  `;
  camTimeline.style.display = "none";
  document.getElementById("app").appendChild(camTimeline);
  const ctTimeEl  = camTimeline.querySelector(".ct-time");
  const ctFrameEl = camTimeline.querySelector(".ct-frame");
  const ctFillEl  = camTimeline.querySelector(".ct-fill");

  // 4 equally-spaced phases across the clip duration:
  //   ¼ — Gaussian → Point         (begins immediately)
  //   ½ — Quad layer fades in      (overlay)
  //   ¾ — Quad layer fades out
  //   1 — Point → Gaussian         (back to 3DGS as the clip ends)
  function camMoveStartLerps() {
    camTimeline.style.display = "flex";
    if (!effects) return;
    camMovePrevSubform = effects.targetSubform ?? 0;
    camMovePrevQuadVis = effects.targetVis?.quad ?? 0;

    const dur  = camAction?.getClip ? camAction.getClip().duration : 25;
    const beat = (dur / 4) * 1000;   // ms per equal phase

    camPhaseTimers.forEach(t => clearTimeout(t));
    camPhaseTimers = [];

    // Phase 1 — fire now: Gaussian → Point
    effects.targetSubform = 1.0;

    // Phase 2 — Quad fades in
    camPhaseTimers.push(setTimeout(() => {
      if (camMoveState === "playing") effects.setLayerVis("quad", true);
    }, beat));

    // Phase 3 — Quad fades out
    camPhaseTimers.push(setTimeout(() => {
      if (camMoveState === "playing") effects.setLayerVis("quad", false);
    }, beat * 2));

    // Phase 4 — Point → Gaussian (return to 3DGS)
    camPhaseTimers.push(setTimeout(() => {
      if (camMoveState === "playing") effects.targetSubform = 0.0;
    }, beat * 3));
  }
  function camMoveRevertLerps() {
    camPhaseTimers.forEach(t => clearTimeout(t));
    camPhaseTimers = [];
    camTimeline.style.display = "none";
    if (!effects) return;
    effects.targetSubform = camMovePrevSubform;
    if (effects.targetVis) effects.targetVis.quad = camMovePrevQuadVis;
  }

  // Live-tunable transform on the FBX root so the user can frame the gazebo.
  // Defaults: 90° around -Y (correction confirmed earlier), small Y lift,
  // scale 0.5 (the raw FBX path overshoots; scaling shortens it). All four
  // are wired to GUI sliders below.
  // FBX camera-move transform — kept at the user's previous setting (-90°
  // around Y). Do not change without explicit ask; the Center viewpoint
  // override below handles "face the gazebo" separately.
  const camMoveXf = { ox: 0, oy: 0, oz: 0, scale: 0.5 };
  function applyCamFbxXf() {
    if (!camFbxRoot) return;
    camFbxRoot.rotation.set(0, -Math.PI / 2, 0);
    camFbxRoot.position.set(camMoveXf.ox, camMoveXf.oy, camMoveXf.oz);
    camFbxRoot.scale.set(camMoveXf.scale, camMoveXf.scale, camMoveXf.scale);
  }

  // Promise-cached load so concurrent callers (preload + user-Play) share one
  // fetch instead of racing and leaving camMixer null.
  let camLoadPromise = null;
  function loadCameraMove() {
    if (camFbxRoot)     return Promise.resolve();
    if (camLoadPromise) return camLoadPromise;
    camMoveLoading = true;
    camLoadPromise = (async () => {
      try {
        const fbx = await new FBXLoader().loadAsync(`${BASE}Shot4B_GS-FX_Camera_V01.fbx`);
        fbx.visible = false;
        scene.add(fbx);
        camFbxRoot = fbx;
        applyCamFbxXf();

        // Prefer a Camera node; fall back to the first non-root child.
        camAnimNode = null;
        fbx.traverse(o => { if (!camAnimNode && o.isCamera) camAnimNode = o; });
        if (!camAnimNode) fbx.traverse(o => { if (!camAnimNode && o !== fbx) camAnimNode = o; });
        if (!fbx.animations?.length) throw new Error("FBX has no animation");

        camMixer = new THREE.AnimationMixer(fbx);
        camAction = camMixer.clipAction(fbx.animations[0]);
        camAction.setLoop(THREE.LoopOnce);
        camAction.clampWhenFinished = true;
        camMixer.addEventListener("finished", () => {
          camMoveRevertLerps();
          camMoveState = "idle";
          controls.enabled = true;
          playCtrl.name("▶ Play Camera Move");
          statusEl.textContent = "Camera move complete";
        });

        // ----- Center viewpoint = camera-move frame CENTER_FRAME ------
        // Sample the animation POSITION at that time, but override the look
        // direction to point at the scene bounds centre (the gazebo). The
        // FBX keyframe's forward vector isn't aimed at the subject — we
        // want Center to literally face the gazebo regardless.
        const CENTER_FRAME = 460;
        const centerVpRef = annotations?.viewpoints.find(v => v.name === "Center");
        if (centerVpRef) {
          const dur = camAction.getClip().duration;
          const t   = Math.min(Math.max(CENTER_FRAME / CAM_FPS, 0), dur);
          camAction.enabled = true;
          camAction.paused  = true;
          camAction.time    = t;
          camMixer.update(0);
          camAnimNode.updateWorldMatrix(true, false);

          const sampledPos  = new THREE.Vector3();
          camAnimNode.getWorldPosition(sampledPos);

          // Reset the action so the Play button starts from the top.
          camAction.stop();
          camAction.time = 0;

          centerVpRef.position.copy(sampledPos);
          // Target = scene bounds centre (the gazebo / subject area). This
          // guarantees the Center viewpoint faces the subject no matter
          // where on the FBX path frame 460 lands.
          centerVpRef.target.copy(center);
          if (annotations.activeId === centerVpRef.id) {
            camera.position.copy(centerVpRef.position);
            controls.target.copy(centerVpRef.target);
            controls.update();
          }
        }
      } catch (err) {
        console.warn("[CameraMove] failed:", err?.message ?? err);
        statusEl.textContent = "Camera move failed: " + (err?.message ?? err);
      } finally {
        camMoveLoading = false;
      }
    })();
    return camLoadPromise;
  }

  async function playPauseCameraMove() {
    if (!camMixer) {
      statusEl.textContent = "Loading camera move…";
      await loadCameraMove();
      if (!camMixer) return;
    }
    if (camMoveState === "playing") {
      // → pause
      camAction.paused = true;
      camMoveState = "paused";
      playCtrl.name("▶ Resume Camera Move");
      statusEl.textContent = "Camera move paused";
    } else {
      // idle or paused → play
      if (camMoveState === "idle") {
        camAction.reset();
        camAction.play();
        if (annotations) annotations.tween = null;       // cancel any flyTo tween
        camMoveStartLerps();
      }
      camAction.paused = false;
      camMoveState = "playing";
      controls.enabled = false;
      playCtrl.name("⏸ Pause Camera Move");
      statusEl.textContent = "Playing camera move…";
    }
  }

  function stopCameraMove() {
    if (!camMixer) return;
    camAction.stop();
    camMoveRevertLerps();
    camMoveState = "idle";
    controls.enabled = true;
    playCtrl.name("▶ Play Camera Move");
    statusEl.textContent = "Camera move stopped";
  }

  const camMoveParams = { play: () => playPauseCameraMove(), stop: () => stopCameraMove() };
  const playCtrl = fOverlay.add(camMoveParams, "play").name("▶ Play Camera Move");
  playCtrl.domElement.title = "Play / pause the pre-authored camera move (Shot4B_GS-FX_Camera_V01.fbx).";
  const stopCtrl = fOverlay.add(camMoveParams, "stop").name("■ Stop Camera Move");
  stopCtrl.domElement.title = "Reset the camera move to the beginning and return control to the user.";
  // Live tuning so you can frame the gazebo while the move plays.
  const fCamTune = fOverlay.addFolder("Camera Move Tuning").close();
  fCamTune.add(camMoveXf, "ox",    -30, 30, 0.1).name("Offset X").onChange(applyCamFbxXf);
  fCamTune.add(camMoveXf, "oy",    -10, 20, 0.1).name("Offset Y").onChange(applyCamFbxXf);
  fCamTune.add(camMoveXf, "oz",    -30, 30, 0.1).name("Offset Z").onChange(applyCamFbxXf);
  fCamTune.add(camMoveXf, "scale", 0.05, 3.0, 0.05).name("Scale").onChange(applyCamFbxXf);

  // Per-frame sync: copy the animated FBX node's world transform to the scene
  // camera. When PAUSED the mixer's deltaTime is 0 so the camera holds still
  // but the scene continues to render normally.
  window.__camMoveTick = (dt) => {
    if (!camMixer || !camAnimNode) return;
    if (camMoveState === "idle") return;
    camMixer.update(camMoveState === "paused" ? 0 : dt);
    camAnimNode.updateWorldMatrix(true, false);
    camAnimNode.getWorldPosition(camera.position);
    camAnimNode.getWorldQuaternion(camera.quaternion);
    _camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).add(_camFwd);

    // Drive the on-screen timeline label
    const dur = camAction.getClip().duration;
    const t   = Math.min(camAction.time, dur);
    const frT = Math.floor(t   * CAM_FPS);
    const frD = Math.floor(dur * CAM_FPS);
    ctTimeEl.textContent  = `${t.toFixed(2)}s / ${dur.toFixed(2)}s`;
    ctFrameEl.textContent = `F ${frT} / ${frD}`;
    ctFillEl.style.width  = `${(t / dur) * 100}%`;
  };


  // ---- Raycaster ----
  const raycaster = new THREE.Raycaster();
  // For splats, the threshold scales with model size
  raycaster.params.Points = { threshold: Math.max(0.02, radius * 0.005) };
  annotations.setRaycaster(raycaster, splat);

  // ---- Brush mode + click handler ----
  // Brush off (default) → click-to-trigger (one-shot FX at click point).
  // Brush on             → press + drag = continuous paint via effects.brushAt.
  // Same flow drives mouse pointer events AND hand-pinch (see hand block below).
  const brushParams = { brush: false, effector: false };
  // Interaction folder (top-level under Customize, not nested under FX) —
  // these toggles control INPUT MODE (camera vs paint), which is a global
  // behaviour, not a click-effect setting. Living next to FX keeps it
  // discoverable but separates the concerns.
  const fInteraction = (gui.fCustomize || gui).addFolder("Interaction");
  fInteraction.add(brushParams, "brush").name("Brush Mode")
    .onChange(v => {
      canvas.style.cursor = v ? "crosshair" : "";
      // Lock OrbitControls while brushing so drag doesn't accidentally
      // tumble the camera — the user wants the brush stroke to register
      // as paint, not as a viewport rotation. Re-enables on toggle off.
      controls.enabled = !v;
    });
  const brushParent = fInteraction;   // legacy local — Effector Mode below appends here
  // Effector Mode (TD-style sphere effector for Dissolve). When on, brush
  // press+drag drives a spatial mask that dissolves splats inside the sphere;
  // splats outside snap back to home. Auto-switches effect to "Dissolve &
  // Reform" since the spatial override only lives in that shader path.
  brushParent.add(brushParams, "effector").name("Effector Mode")
    .onChange(v => {
      if (v) {
        params.effect = "Dissolve & Reform";
        // Refresh the Effect dropdown so the GUI shows the auto-switch.
        gui.controllersRecursive().forEach(c => {
          if (c.property === "effect") c.updateDisplay();
        });
        canvas.style.cursor = "crosshair";
      } else {
        effects.setMaskCenter(null);
        if (effectorMesh) effectorMesh.visible = false;
        if (!brushParams.brush) canvas.style.cursor = "";
      }
    });

  // ---- GPGPU Particles (Phase 2) --------------------------------------------
  // Top-level "Particles" folder under Customize — the particle system is a
  // separate render layer from the click-FX (which modify the splat shader),
  // so it lives outside FX to avoid conceptual blur. All knobs use the
  // gpParticle* prefix per the dedicated-params-per-fx preference.
  const gpParticleParams = {
    enable:        false,
    pointSize:     16.0,
    fieldStrength: 3.0,
    damping:       0.94,
    gravityY:      -0.4,
    alpha:         1.0,
    colorCool:     "#4cbfff",
    colorHot:      "#ff8c33",
  };
  const fGpParticles = (gui.fCustomize || gui).addFolder("Particles").close();
  fGpParticles.add(gpParticleParams, "enable").name("Enable")
    .onChange(v => gpgpuParticles.setEnabled(v));
  gpgpuParticles.setEnabled(gpParticleParams.enable);
  fGpParticles.add(gpParticleParams, "pointSize", 1, 60, 0.5).name("Point Size")
    .onChange(v => gpgpuParticles.setPointSize(v));
  fGpParticles.add(gpParticleParams, "fieldStrength", 0, 12, 0.1).name("Field Strength")
    .onChange(v => gpgpuParticles.setFieldStrength(v));
  fGpParticles.add(gpParticleParams, "damping", 0.5, 0.999, 0.001).name("Damping")
    .onChange(v => gpgpuParticles.setDamping(v));
  fGpParticles.add(gpParticleParams, "gravityY", -3, 3, 0.05).name("Gravity Y")
    .onChange(v => gpgpuParticles.setGravity(v));
  fGpParticles.add(gpParticleParams, "alpha", 0.05, 2.0, 0.01).name("Alpha")
    .onChange(v => gpgpuParticles.setAlphaMul(v));
  fGpParticles.addColor(gpParticleParams, "colorCool").name("Color Cool")
    .onChange(v => gpgpuParticles.setColorCool(v));
  fGpParticles.addColor(gpParticleParams, "colorHot").name("Color Hot")
    .onChange(v => gpgpuParticles.setColorHot(v));

  // ---- Phase 3: Seed particles from USD voxel layer --------------------
  // Voxelizer caches cellPositions/cellCount/cellBoundsMin/Max after each
  // rebuild. Button reads those, expands the particle AABB to the voxel
  // bounds (so seeded particles aren't immediately OOB-respawned), and
  // blits voxel positions into the pos RT. Particle count stays fixed
  // (4096) — voxels cycle if there are more, repeat if fewer.
  const voxelSeedActions = {
    seedFromVoxels: () => {
      if (!voxelizer || !voxelizer.cellPositions || !voxelizer.cellCount) {
        statusEl.textContent = "Voxel layer has no data yet — enable Voxel layer first";
        return;
      }
      // 10% margin around voxel AABB so drift doesn't respawn at boundary.
      const mn = voxelizer.cellBoundsMin.clone();
      const mx = voxelizer.cellBoundsMax.clone();
      const pad = mx.clone().sub(mn).multiplyScalar(0.10);
      mn.sub(pad); mx.add(pad);
      gpgpuParticles.setBounds(mn, mx);
      gpgpuParticles.seedFromPositions(voxelizer.cellPositions, voxelizer.cellCount);

      // Clear any accumulated velocity-field impulses so the freshly-seeded
      // particles read at the voxel positions instead of being immediately
      // blown away by leftover mass from earlier cursor / pinch interaction.
      velocityField.clear();

      // HIDE the voxel layer — the voxel cubes have been "transformed" into
      // particles; leaving the bright instanced cubes visible drowns out the
      // additive particle sprites. effects.params.voxelLayer drives the
      // animated voxelVis uniform → voxelizer.setOpacity() fades the cubes
      // out smoothly. (The voxel data itself stays cached on voxelizer so
      // re-toggling Voxel rebuilds without re-iterating splats.)
      const fxParams = effects?.params;
      if (fxParams && fxParams.voxelLayer) {
        fxParams.voxelLayer = false;
        gui.controllersRecursive().forEach(c => {
          if (c.property === "voxelLayer" && c.object === fxParams) c.updateDisplay();
        });
      }

      gpgpuParticles.setEnabled(true);
      gpParticleParams.enable = true;
      gui.controllersRecursive().forEach(c => {
        if (c.property === "enable" && c.object === gpParticleParams) c.updateDisplay();
      });
      statusEl.textContent = `Seeded ${gpgpuParticles.N} particles from ${voxelizer.cellCount} voxels — voxel layer hidden`;
    },
  };
  fGpParticles.add(voxelSeedActions, "seedFromVoxels").name("Seed from USD Voxels");

  function rayHitLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width)  * 2 - 1,
      -((clientY - rect.top)  / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(splat, false);
    if (!hits?.[0]) return null;
    return { hit: hits[0], local: splat.worldToLocal(hits[0].point.clone()) };
  }

  let downPos = null;
  let mouseBrushing = false;
  // Raycasting 2.6 M splats is O(N), so throttle to ~30 Hz and skip when
  // the cursor barely moved since the last hit. Effects.brushAt's own
  // smoothing keeps the visual continuous between samples.
  let _lastBrushRayMs = 0;
  let _lastBrushX = -1e9, _lastBrushY = -1e9;
  const BRUSH_RAY_MS = 33;            // ~30 Hz
  const BRUSH_SKIP_PX2 = 9;           // 3 px

  function brushAtScreen(clientX, clientY) {
    const now = performance.now();
    const dx = clientX - _lastBrushX, dy = clientY - _lastBrushY;
    if (now - _lastBrushRayMs < BRUSH_RAY_MS && dx*dx + dy*dy < BRUSH_SKIP_PX2) return;
    _lastBrushRayMs = now;
    _lastBrushX = clientX; _lastBrushY = clientY;
    const r = rayHitLocal(clientX, clientY);
    if (r) {
      effects.brushAt(r.local);
      if (brushParams.effector) effects.setMaskCenter(r.local);
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    downPos = { x: e.clientX, y: e.clientY };
    if (brushParams.brush) {
      _lastBrushRayMs = 0; _lastBrushX = -1e9; _lastBrushY = -1e9;
      brushAtScreen(e.clientX, e.clientY);
      mouseBrushing = true;
    }
    // Inject mass + velocity into the global velocity field at the cursor.
    // Velocity vector is zero on press (no cursor delta yet); subsequent
    // moves push velocity proportional to delta — handled in pointermove.
    if (velocityField) {
      const rect = canvas.getBoundingClientRect();
      velocityField.inject(
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height,
        0, 0, 1.2, 0.06,
      );
    }
  });

  // Pointer-MOVE injects velocity into the field proportional to cursor
  // delta (so dragging stirs the field, not just clicking). Throttled to
  // ~30 Hz to keep the inject pass cost negligible.
  let _vfMoveMs = 0, _vfPrevX = -1, _vfPrevY = -1;
  canvas.addEventListener("pointermove", (e) => {
    if (!velocityField) return;
    const now = performance.now();
    if (now - _vfMoveMs < 33) return;
    _vfMoveMs = now;
    const rect = canvas.getBoundingClientRect();
    const ux = (e.clientX - rect.left) / rect.width;
    const uy = 1.0 - (e.clientY - rect.top) / rect.height;
    if (_vfPrevX >= 0) {
      const vx = (ux - _vfPrevX) * 60.0;   // pixels-per-frame → field-velocity
      const vy = (uy - _vfPrevY) * 60.0;
      velocityField.inject(ux, uy, vx, vy, 0.25, 0.05);
    }
    _vfPrevX = ux; _vfPrevY = uy;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!mouseBrushing || !brushParams.brush) return;
    brushAtScreen(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (mouseBrushing) {
      effects.releaseBrush();
      if (brushParams.effector) effects.setMaskCenter(null);
      mouseBrushing = false;
      downPos = null;
      return;
    }
    if (!downPos) return;
    const dx = e.clientX - downPos.x;
    const dy = e.clientY - downPos.y;
    downPos = null;
    if (dx * dx + dy * dy > 9) return; // drag, not click

    const r = rayHitLocal(e.clientX, e.clientY);
    if (!r) { statusEl.textContent = "No splat hit at click"; return; }

    // Defer to annotation system if user armed "+ Add"
    if (annotations.handleCanvasClick(r.hit.point)) return;

    // Otherwise → trigger scan effect at hit point (in object space)
    effects.triggerAt(r.local);
    autoEnableEchoForClick();
    statusEl.textContent = `Hit (${r.hit.point.x.toFixed(2)}, ${r.hit.point.y.toFixed(2)}, ${r.hit.point.z.toFixed(2)})`;
  });

  // ---- Auto Echo Trails for click FX  (simple on/off, no lerp) ------------
  // Click → echoOn = true. A single setTimeout flips it off once the FX
  // window (fxDur + fadeTail) closes. Persistence and Mix are NOT
  // modulated — the user's GUI values are used as-is the whole time, so
  // there's zero surprise. Consecutive clicks reset the timer.
  let _echoAutoTimer = null;
  const _echoGuiCtls = [];
  function refreshEchoGui() {
    if (_echoGuiCtls.length === 0) {
      gui.controllersRecursive().forEach(c => {
        if (c._name === "Enable" && c.object === postfx.params) {
          _echoGuiCtls.push(c);
        }
      });
    }
    for (const c of _echoGuiCtls) c.updateDisplay();
  }
  function autoEnableEchoForClick() {
    if (!postfx?.params) return;
    postfx.params.echoOn = true;
    refreshEchoGui();
    if (_echoAutoTimer) clearTimeout(_echoAutoTimer);
    const fxDur    = effectUniforms?.duration?.value ?? 2.5;
    const fadeTail = effects?.fadeTailS ?? 0.9;
    // Extra grace period so the persistence buffer can decay to invisibility
    // BEFORE we disable echoPass. Without this, the pass turning off snaps
    // any remaining trail content to black — looks like the trail vanished
    // in the middle of a fade-out. Solve for the time it takes persistence
    // to decay the trail to ~5% visibility at 60 fps; clamp the result so a
    // wild persistence value doesn't keep echo running forever.
    const persist  = Math.max(postfx.params.echoPersist, 0.5);
    const fadeOutS = Math.max(1, Math.min(15,
                       Math.log(0.05) / Math.log(persist) / 60));
    const durMs    = (fxDur + fadeTail + fadeOutS) * 1000;
    _echoAutoTimer = setTimeout(() => {
      postfx.params.echoOn = false;
      refreshEchoGui();
      _echoAutoTimer = null;
    }, durMs);
  }
  // Expose for the hand-tracking block below to share the same logic
  window.__brushParams = brushParams;
  window.__effects = effects;
  window.__effectUniforms = effectUniforms;
  window.__effectorMesh = effectorMesh;
  window.__postfx = postfx;

  // ---- Keyboard ----
  window.addEventListener("keydown", (e) => {
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
    if (e.key >= "1" && e.key <= "9") {
      annotations.flyToIndex(parseInt(e.key, 10) - 1);
    } else if (e.key === "v" || e.key === "V") {
      annotations.armAddViewpoint();
    } else if (e.key === "c" || e.key === "C") {
      // Overwrite the "Center" viewpoint with the current camera pose.
      const cvp = annotations.viewpoints.find(v => v.name === "Center");
      if (cvp) {
        cvp.position.copy(camera.position);
        cvp.target.copy(controls.target);
        statusEl.textContent = "Center viewpoint updated";
      }
    } else if (e.key === "r" || e.key === "R") {
      camera.position.copy(center).add(new THREE.Vector3(0, radius * 0.4, radius * 1.8));
      controls.target.copy(center);
      controls.update();
      annotations.activeId = null;
      annotations._rebuildList();
    }
  });

  // ---- WASD / QE flythrough (like SuperSplat editor) -------------------
  // W/S — forward / backward along the look direction
  // A/D — strafe along camera right
  // Q/E — drop / rise along world up
  // Shift — 3× speed boost
  // Modifies BOTH camera.position and controls.target so the look direction
  // is preserved (we're moving the whole "rig" not just the camera).
  const moveKeys = { w:false, a:false, s:false, d:false, q:false, e:false, shift:false };
  window.addEventListener("keydown", (e) => {
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k in moveKeys) { moveKeys[k] = true; }
    if (e.key === "Shift") moveKeys.shift = true;
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k in moveKeys) { moveKeys[k] = false; }
    if (e.key === "Shift") moveKeys.shift = false;
  });
  // Blur — clear stuck keys (e.g. user alt-tabs while holding W)
  window.addEventListener("blur", () => {
    Object.keys(moveKeys).forEach(k => moveKeys[k] = false);
  });

  const _moveForward = new THREE.Vector3();
  const _moveRight   = new THREE.Vector3();
  const _moveDelta   = new THREE.Vector3();
  const MOVE_SPEED = Math.max(radius * 0.4, 1.5); // scene-aware base speed (m/s)
  // Expose so the animation loop can call it
  window.__wasdStep = (dt) => {
    if (annotations?.tween) return;        // suspend while camera is tweening
    if (twoPinchActive || onePinchActive) return; // don't fight hand control
    const speed = (moveKeys.shift ? 3.0 : 1.0) * MOVE_SPEED * dt;
    _moveDelta.set(0, 0, 0);
    camera.getWorldDirection(_moveForward);
    _moveRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    if (moveKeys.w) _moveDelta.addScaledVector(_moveForward,  speed);
    if (moveKeys.s) _moveDelta.addScaledVector(_moveForward, -speed);
    if (moveKeys.a) _moveDelta.addScaledVector(_moveRight,   -speed);
    if (moveKeys.d) _moveDelta.addScaledVector(_moveRight,    speed);
    if (moveKeys.q) _moveDelta.y -= speed;
    if (moveKeys.e) _moveDelta.y += speed;
    if (_moveDelta.lengthSq() > 1e-9) {
      camera.position.add(_moveDelta);
      controls.target.add(_moveDelta);
    }
  };

  // ---- Hand tracking (optional) ----
  const handHintEl = (() => {
    let el = document.querySelector("#hand-panel .hand-status");
    if (!el) {
      el = document.createElement("div");
      el.className = "hand-status";
      el.style.cssText = "font-size:10px;color:var(--text-dim);min-height:14px;";
      document.getElementById("hand-panel").appendChild(el);
    }
    return el;
  })();
  const handErrorEl = document.getElementById("hand-error");

  // Reuse the raycaster set up above. ndc scratch vector to avoid alloc.
  const ndc = new THREE.Vector2();
  const _palmHit = new THREE.Vector3();
  // Raycasting 2.6M splats is O(N), so we throttle it to ~30Hz and skip when
  // the cursor barely moved since the last raycast. HandController emits
  // onPalmActive at full 60fps with smoothed coords; smoothing of the hit
  // point between raycasts is handled by EffectController.brushAt + update.
  let _lastRayMs = 0;
  let _lastRayX = -1e9, _lastRayY = -1e9;

  // Reusable helper: project screen XY → object-space hit point on the splat.
  // Returns the THREE.Vector3 _palmHit (mutated) or null when missing.
  function screenToLocalHit(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top)  / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(splat, false);
    if (!hits?.[0]) return null;
    _palmHit.copy(hits[0].point);
    splat.worldToLocal(_palmHit);
    return _palmHit;
  }

  // ===== Hand-driven camera control =====
  //
  // STATE MACHINE  (matches Apple Vision Pro / iPad multi-touch metaphor):
  //
  //   IDLE        — no pinching hands. Cursor only.
  //   ONE_PINCH   — one hand pinching:
  //                   • drag       → manual orbit (spherical around target)
  //                   • brief tap  → click → dissolve
  //   TWO_PINCH   — both hands pinching (two-hand mode only):
  //                   • spread/contract → zoom (camera distance to target)
  //                   • parallel drag   → pan (translate both target + camera)
  //
  // OrbitControls is disabled while ONE_PINCH or TWO_PINCH is active so the
  // mouse path doesn't compete with the synthesised hand path.
  // ============================================================================
  const PINCH_DRAG_THRESHOLD_PX = 6;

  // Scratch math objects (reused, never re-allocated per frame)
  const _orbitOffset  = new THREE.Vector3();
  const _orbitSph     = new THREE.Spherical();
  const _camRight     = new THREE.Vector3();
  const _camUp        = new THREE.Vector3();
  const _panVec       = new THREE.Vector3();

  // ----- ONE_PINCH state -----
  let onePinchActive   = false;
  let onePinchMoved    = false;
  const onePinchStart  = { x: 0, y: 0 };
  const onePinchPrev   = { x: 0, y: 0 };

  // ----- TWO_PINCH state (snapshots taken when entering the state) -----
  let twoPinchActive   = false;
  let twoPinchDist0    = 0;
  const twoPinchMid0   = { x: 0, y: 0 };
  const twoCamPos0     = new THREE.Vector3();
  const twoTarget0     = new THREE.Vector3();

  function handOrbit(dx, dy) {
    _orbitOffset.copy(camera.position).sub(controls.target);
    _orbitSph.setFromVector3(_orbitOffset);
    const sens = 2 * Math.PI * 0.7 / window.innerHeight;
    _orbitSph.theta -= dx * sens;
    _orbitSph.phi   -= dy * sens;
    _orbitSph.phi    = Math.max(0.001, Math.min(Math.PI - 0.001, _orbitSph.phi));
    _orbitOffset.setFromSpherical(_orbitSph);
    camera.position.copy(controls.target).add(_orbitOffset);
    camera.lookAt(controls.target);
  }

  function startTwoPinch(p1, p2) {
    twoPinchActive = true;
    const dx = p1.x - p2.x, dy = p1.y - p2.y;
    twoPinchDist0   = Math.hypot(dx, dy) || 1;
    twoPinchMid0.x  = (p1.x + p2.x) * 0.5;
    twoPinchMid0.y  = (p1.y + p2.y) * 0.5;
    twoCamPos0.copy(camera.position);
    twoTarget0.copy(controls.target);
    controls.enabled = false;
  }

  function updateTwoPinch(p1, p2) {
    if (!twoPinchActive) return;
    const dx = p1.x - p2.x, dy = p1.y - p2.y;
    const d  = Math.hypot(dx, dy) || 1;
    const midX = (p1.x + p2.x) * 0.5;
    const midY = (p1.y + p2.y) * 0.5;

    // ----- Zoom: distance scales inversely with hand spread ratio -----
    const scale       = d / twoPinchDist0;
    const startOffset = _orbitOffset.copy(twoCamPos0).sub(twoTarget0);
    const startDist   = startOffset.length();
    const newDist     = startDist / Math.max(scale, 0.05);

    // ----- Pan: screen midpoint delta → world-space translation -----
    camera.getWorldDirection(_panVec);                  // forward
    _camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const fovRad           = camera.fov * Math.PI / 180;
    const worldPerPxAtTarg = 2 * startDist * Math.tan(fovRad / 2) / window.innerHeight;
    const screenDx         = midX - twoPinchMid0.x;
    const screenDy         = midY - twoPinchMid0.y;
    _panVec.copy(_camRight).multiplyScalar(-screenDx * worldPerPxAtTarg)
           .addScaledVector(_camUp,        +screenDy * worldPerPxAtTarg);

    // Apply zoom + pan to target and camera.
    controls.target.copy(twoTarget0).add(_panVec);
    const newOffset = startOffset.clone().setLength(newDist);
    camera.position.copy(controls.target).add(newOffset);
    camera.lookAt(controls.target);
  }

  function endTwoPinch() {
    twoPinchActive = false;
    controls.enabled = true;
  }

  function startOnePinch(p) {
    onePinchActive = true;
    onePinchMoved  = false;
    onePinchStart.x = onePinchPrev.x = p.x;
    onePinchStart.y = onePinchPrev.y = p.y;
    const ux = p.x / window.innerWidth;
    const uy = 1.0 - p.y / window.innerHeight;
    // Pinch start also seeds the velocity field with a fresh impulse — same
    // pattern as mouse press. Subsequent pinch-moves push velocity (handled
    // in updateOnePinch).
    if (velocityField) velocityField.inject(ux, uy, 0, 0, 1.5, 0.07);
  }

  let handBrushing = false;
  let _handBrushMs = 0, _handBrushX = -1e9, _handBrushY = -1e9;
  function updateOnePinch(p) {
    if (!onePinchActive) return;
    // Pinch-drag stirs the velocity field — same pattern as mouse-move,
    // velocity proportional to per-frame delta. Throttled implicitly by
    // HandController's input rate; cheap enough to call every event.
    if (velocityField) {
      const ux = p.x / window.innerWidth;
      const uy = 1.0 - p.y / window.innerHeight;
      const ox = onePinchPrev.x / window.innerWidth;
      const oy = 1.0 - onePinchPrev.y / window.innerHeight;
      const vx = (ux - ox) * 60.0;
      const vy = (uy - oy) * 60.0;
      if (vx * vx + vy * vy > 1e-6) {
        velocityField.inject(ux, uy, vx, vy, 0.30, 0.06);
      }
    }
    const brushOn = window.__brushParams?.brush;
    if (brushOn) {
      // Brush mode: pinch+move paints continuously at the palm hit point.
      // Throttle the splat raycast (O(N)) to ~30Hz + skip micro-moves.
      controls.enabled = false;
      handBrushing = true;
      const now = performance.now();
      const dx = p.x - _handBrushX, dy = p.y - _handBrushY;
      if (now - _handBrushMs >= 33 || dx*dx + dy*dy >= 9) {
        _handBrushMs = now; _handBrushX = p.x; _handBrushY = p.y;
        const local = screenToLocalHit(p.x, p.y);
        if (local) {
          effects.brushAt(local);
          if (window.__brushParams?.effector) effects.setMaskCenter(local);
        }
      }
      onePinchPrev.x = p.x; onePinchPrev.y = p.y;
      return;
    }
    if (!onePinchMoved) {
      const dx = p.x - onePinchStart.x, dy = p.y - onePinchStart.y;
      if (dx*dx + dy*dy > PINCH_DRAG_THRESHOLD_PX ** 2) {
        onePinchMoved = true;
        controls.enabled = false;
      }
    }
    if (onePinchMoved) {
      handOrbit(p.x - onePinchPrev.x, p.y - onePinchPrev.y);
    }
    onePinchPrev.x = p.x; onePinchPrev.y = p.y;
  }

  function endOnePinch(p) {
    if (!onePinchActive) return;
    if (handBrushing) {
      effects.releaseBrush();
      if (window.__brushParams?.effector) effects.setMaskCenter(null);
      handBrushing = false;
    } else if (!onePinchMoved) {
      // Quick tap → click → dissolve (no brush)
      const local = screenToLocalHit(p.x, p.y);
      if (local) {
        effects.triggerAt(local);
      }
    }
    onePinchActive = false;
    onePinchMoved  = false;
    controls.enabled = true;
  }

  const hand = new HandController({
    canvas,
    video: handVideo,
    cursorEl:  handCursor,
    cursorEl2: handCursor2,
    statusEl:  handHintEl,
    mode:      "single",
    onHandsUpdate: (hands) => {
      const pinching = hands.filter(h => h.present && h.pinching);
      const lastP    = pinching[pinching.length - 1]?.cursor;

      if (pinching.length === 2) {
        if (onePinchActive) { endOnePinch(onePinchPrev); }
        if (!twoPinchActive) startTwoPinch(pinching[0].cursor, pinching[1].cursor);
        else                 updateTwoPinch(pinching[0].cursor, pinching[1].cursor);
      } else if (pinching.length === 1) {
        if (twoPinchActive) endTwoPinch();
        if (!onePinchActive) startOnePinch(pinching[0].cursor);
        else                 updateOnePinch(pinching[0].cursor);
      } else {
        if (twoPinchActive) endTwoPinch();
        if (onePinchActive) endOnePinch(lastP || onePinchPrev);
      }
    },
  });
  hand.onError = (info) => {
    handErrorEl.hidden = false;
    handErrorEl.querySelector(".title").textContent = info.message;
    handErrorEl.querySelector(".hint").textContent  = info.hint;
    handToggle.classList.remove("active", "loading");
    handToggle.classList.add("error");
    handToggle.querySelector(".state").textContent = "ERR";
  };

  handToggle.addEventListener("click", async () => {
    // Clear stale error UI on retry
    handErrorEl.hidden = true;
    handToggle.classList.remove("error");
    handToggle.classList.add("loading");
    handToggle.querySelector(".state").textContent = "…";
    const on = await hand.toggle();
    handToggle.classList.remove("loading");
    if (!handToggle.classList.contains("error")) {
      handToggle.classList.toggle("active", on);
      handToggle.querySelector(".state").textContent = on ? "ON" : "OFF";
    }
  });

  // 1-Hand / 2-Hand mode switch
  handModeEl?.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.mode; // "single" | "two"
      handModeEl.querySelectorAll("button").forEach(b =>
        b.classList.toggle("active", b === btn));
      hand.setMode(m);
    });
  });

  // ---- Drag-and-drop splat upload -----------------------------------------
  // Drop adds a NEW secondary layer alongside the primary splat (the original
  // load). Effects / voxel / quad / annotations stay bound to the primary.
  // Use replaceSplatMesh() programmatically if you want the swap-and-rebind
  // behavior instead — drag-drop no longer triggers it.
  const dropZone = document.getElementById("drop-zone");

  async function addSplatLayer(options) {
    setLoading("Loading splat layer…");
    try {
      const built = await createSplat(options);
      sceneLayers.add({ mesh: built.splat, name: options.fileName || "Layer" });
      statusEl.textContent = `+ ${options.fileName || "splat"}`;

      // Bundled-scene-specific overlays (Training Cameras / Data Labels /
      // Daffodil + Grape Hyacinth hotspots) don't match a user-uploaded
      // splat — turn them off so the new asset is presented cleanly.
      // Re-enable via the Tech Spec Enable checkbox + reload if needed.
      if (typeof techEnableCtrl !== "undefined" && techEnableCtrl) {
        techEnableCtrl.setValue(false);
      }
      assetHover?.setVisible(false);
    } finally {
      hideLoading();
    }
  }

  // Hidden file input wired to Scene panel's "+ Add" button.
  const addSplatInput = document.createElement("input");
  addSplatInput.type   = "file";
  addSplatInput.accept = ".splat,.ply,.spz,.ksplat";
  addSplatInput.style.display = "none";
  document.body.appendChild(addSplatInput);
  addSplatInput.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";   // allow re-picking the same file
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      await addSplatLayer({ fileBytes: new Uint8Array(buf), fileName: f.name });
    } catch (err) {
      console.error("Add splat layer failed:", err);
      statusEl.textContent = "Load failed: " + (err?.message ?? err);
    }
  });
  sceneLayers.onAddRequest = () => addSplatInput.click();

  async function replaceSplatMesh(options) {
    setLoading("Loading splat…");
    if (splat) {
      scene.remove(splat);
      if (typeof splat.dispose === "function") splat.dispose();
    }
    voxelizer?.dispose?.();
    quadizer?.dispose?.();

    const built = await createSplat(options);
    splat = built.splat;
    scene.add(splat);
    splat.objectModifier = createScanModifier();
    splat.updateGenerator();

    // Re-point all downstream consumers at the new mesh
    if (effects)    effects.mesh    = splat;
    if (voxelizer)  voxelizer.splatMesh = splat;
    if (quadizer)   quadizer.splatMesh  = splat;
    _hudRefs.splat  = splat;     // keep Pipeline HUD pointed at live splat

    // Reframe + reset annotations / labels / raycast threshold
    const { center: c2, size: s2, radius: r2 } = built;
    camera.position.copy(c2).add(new THREE.Vector3(0, r2 * 0.4, r2 * 1.8));
    controls.target.copy(c2);
    controls.update();

    raycaster.params.Points = { threshold: Math.max(0.02, r2 * 0.005) };
    annotations.setRaycaster(raycaster, splat);
    annotations.viewpoints.slice().forEach(vp => annotations.removeViewpoint(vp.id));
    annotations.seedDefaults(c2, r2);
    dataLabels?.setBounds(c2, s2);

    hideLoading();
    statusEl.textContent = `${s2.x.toFixed(1)} × ${s2.y.toFixed(1)} × ${s2.z.toFixed(1)} m`;
  }

  // We have to count dragenter/dragleave to know when the user has truly left
  // the window — leaving a child element fires dragleave but the file is still
  // being dragged.
  let _dragDepth = 0;
  const SPLAT_EXT_RE = /\.(splat|ply|spz|ksplat)$/i;
  function showDrop(on) { dropZone.classList.toggle("active", on); }

  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    _dragDepth++;
    showDrop(true);
  });
  window.addEventListener("dragover",  (e) => {
    if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
  });
  window.addEventListener("dragleave", (e) => {
    _dragDepth = Math.max(0, _dragDepth - 1);
    if (_dragDepth === 0) showDrop(false);
  });
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    _dragDepth = 0;
    showDrop(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!SPLAT_EXT_RE.test(file.name)) {
      statusEl.textContent = `Unsupported file: ${file.name}`;
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      await addSplatLayer({ fileBytes: new Uint8Array(buf), fileName: file.name });
    } catch (err) {
      console.error("Add splat layer failed:", err);
      setLoading("Load failed: " + (err?.message ?? err));
      setTimeout(() => hideLoading(), 2500);
    }
  });

  hideLoading();
  // Pop the Quick Guide once the splash is out of the way — short delay
  // so the user's eye lands on the scene first, then the card slides up.
  setTimeout(() => keyHints?.showFor(6500), 700);

  // First-time hint so users know the default FX preset is click-armed —
  // otherwise they open the app, see the splat, don't realize clicking the
  // model fires the effect, and assume the FX panel is broken. Replaced by
  // hit coords on the first click; until then, this message stays.
  const initialPreset = effects?.params?.effect ?? "Slime Molds";
  statusEl.textContent =
    `${(size.x).toFixed(1)} × ${(size.y).toFixed(1)} × ${(size.z).toFixed(1)} m  ·  click the splat to fire "${initialPreset}"`;

  // Preload the FBX so Center=frame460 takes effect at startup. The promise
  // is fire-and-forget — concurrent calls from the Play button share it via
  // camLoadPromise.
  loadCameraMove();

  // Scan public/manifest.json for any other splat assets and load them as
  // hidden secondary layers. The Scene panel exposes them with eye toggles
  // so the user can swap which splat is rendering.
  loadAdditionalSplatLayers();
}

async function loadAdditionalSplatLayers() {
  let list = [];
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" });
    if (!res.ok) return;
    list = await res.json();
  } catch { return; }
  if (!Array.isArray(list)) return;

  const primaryFile = SPLAT_URL.replace(/^\//, "");
  const secondaries = list.filter(f => typeof f === "string" && f && f !== primaryFile);

  for (const fname of secondaries) {
    try {
      const built = await createSplat({ url: `${BASE}${fname}` });
      const layer = sceneLayers.add({ mesh: built.splat, name: fname });
      if (layer) sceneLayers.setVisible(layer.id, false);   // hidden so it doesn't double-render
    } catch (err) {
      console.warn(`Skipping ${fname}:`, err?.message ?? err);
    }
  }
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let frameCount = 0;
let fpsLastMs = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  profiler.beginFrame();
  profiler.begin("logic");

  // Annotation tween + screen-space marker update
  if (annotations) {
    annotations.updateTween(dt);
    annotations.updateMarkers(window.innerWidth, window.innerHeight);
  }

  // Data-label overlay (cards + bbox + ambient ticks)
  if (dataLabels) dataLabels.update(window.innerWidth, window.innerHeight);

  // Effector Mode wireframe sphere — tracks the hand-driven mask center.
  // maskCenter / maskRadius are written by effects.setMaskCenter() in the
  // brush handlers; visibility gated on uMaskActive so the sphere only
  // shows while the user is actively pressing / pinching.
  if (effectorMesh) {
    const on = effectUniforms.maskActive.value > 0.5;
    effectorMesh.visible = on;
    if (on) {
      effectorMesh.position.copy(effectUniforms.maskCenter.value);
      effectorMesh.scale.setScalar(effectUniforms.maskRadius.value);
    }
  }

  // Voxelizer / Quadizer opacity follows their layer-visibility uniform,
  // which is animated by EffectController when the corresponding checkbox
  // toggles. Build is lazy on first reveal (~2-3s JS pass over 2.6M splats).
  if (voxelizer) {
    const v = effectUniforms.voxelVis.value;
    if (v > 0.005 && !voxelizer.mesh && !voxelizer._busy) voxelizer.rebuild();
    voxelizer.setOpacity(v);
    voxelizer.syncFxUniforms(effectUniforms);
  }
  if (quadizer) {
    const q = effectUniforms.quadVis.value;
    if (q > 0.005 && !quadizer.mesh && !quadizer._busy) quadizer.rebuild();
    quadizer.setOpacity(q);
    quadizer.syncFxUniforms(effectUniforms);
  }

  // Effect uniforms
  if (effects) effects.update(dt);

  // WASD / QE flythrough
  if (window.__wasdStep) window.__wasdStep(dt);

  // Pre-authored FBX camera move (drives camera while playing / paused)
  if (window.__camMoveTick) window.__camMoveTick(dt);

  controls.update();
  // Tick the Echo-Trails bell-curve ramp (no-op when idle).
  // (Echo auto-toggle handled by setTimeout in autoEnableEchoForClick — no per-frame tick needed.)
  // Convolve + advect the velocity field one step. Downstream readers
  // (Phase 2 particles, Phase 3 voxel particles) sample its texture.
  profiler.mark("step");
  velocityField.step();
  gpgpuParticles.step(dt, camera, velocityField.getTexture());
  // Sorted-particles sim removed — Warp FX is a pure-shader post-pass with
  // no companion sim, so the composer just renders directly.
  profiler.mark("compose");
  // Bypass the EffectComposer entirely when Post-Process is disabled —
  // otherwise the composer still runs RenderPass + every passthrough pass,
  // which lights up the compose phase for nothing.
  if (postfx.params?.postEnable === false) {
    renderer.render(scene, camera);
  } else {
    postfx.render(dt);
  }
  // GPGPU particles + Tech-Spec gizmos live in their own scenes rendered
  // AFTER the composer so they bypass every post-FX pass (Echo, Bloom,
  // Painterly, Underwater, etc.). autoClear=false preserves the composed
  // pixels underneath; both scenes are additive/overlay-style.
  profiler.mark("overlay");
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  if (gpgpuParticles.points.visible) {
    renderer.render(particleScene, camera);
  }
  if (techOverlayScene.children.length > 0) {
    renderer.render(techOverlayScene, camera);
  }
  renderer.autoClear = prevAutoClear;

  profiler.mark("hud");
  // Pipeline HUD — read live render-info / pass counts / particle stats
  // and refresh DOM at ~2 Hz inside the module.
  pipelineHUD.tick(performance.now(), dt * 1000);
  // Asset hover hotspots — project worldPos to screen each frame.
  assetHover?.update();

  // FPS readout — uses raw performance.now() (NOT the clamped dt, which
  // pegs at 20 fps because dt is capped at 50 ms). One decimal place so
  // sub-60 variation is visible. Suffix is regex-replaced so any base
  // text (size, hit coords, the initial hint, etc.) keeps its fps tail.
  frameCount++;
  const _fpsNow = performance.now();
  if (!fpsLastMs) fpsLastMs = _fpsNow;
  if (_fpsNow - fpsLastMs >= 500) {
    const fps = (frameCount * 1000 / (_fpsNow - fpsLastMs)).toFixed(1);
    if (statusEl) {
      const base = statusEl.textContent.replace(/\s*•\s*[\d.]+\s*fps$/, '');
      statusEl.textContent = `${base} • ${fps} fps`;
    }
    frameCount = 0;
    fpsLastMs = _fpsNow;
  }
  profiler.endFrame();
});

loadSplat().catch((err) => {
  console.error(err);
  setLoading("Failed to load: " + (err?.message ?? err));
});

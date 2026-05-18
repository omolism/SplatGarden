import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { createScanModifier, EffectController, buildGUI } from "./effects.js";
import { AnnotationManager } from "./annotations.js";
import { HandController } from "./handtracking.js";
import { setupPostFX } from "./postfx.js";
import { DataLabelLayer } from "./datalabels.js";
import { Voxelizer } from "./voxelizer.js";
import { Quadizer }  from "./quadizer.js";
import { uniforms as effectUniforms } from "./effects.js";
import { loadColmapImages, buildColmapFrustums } from "./colmap-loader.js";

const SPLAT_URL = "/Whole_With_Statue.splat";

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
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  });
  const centerVp = annotations.seedDefaults(center, radius);
  if (centerVp) {
    camera.position.copy(centerVp.position);
    controls.target.copy(centerVp.target);
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
  loadColmapImages("/colmap/images.bin")
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
      scene.add(cameraFrustums);
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
  const techParams = { techEnable: true };
  const fTechSpec = gui.addFolder("Tech Spec");
  const techEnableCtrl = fTechSpec.add(techParams, "techEnable").name("Enable").onChange((v) => {
    if (dataLabels) dataLabels.setEnabled(v && dataParams.dataLabels);
    if (cameraFrustums) cameraFrustums.visible = v && dataParams.enabled;
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
          const tex = await new RGBELoader().loadAsync("/Skybox.hdr");
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
        const fbx = await new FBXLoader().loadAsync("/Shot4B_GS-FX_Camera_V01.fbx");
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

  // ---- Click handler ----
  let downPos = null;
  canvas.addEventListener("pointerdown", (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!downPos) return;
    const dx = e.clientX - downPos.x;
    const dy = e.clientY - downPos.y;
    downPos = null;
    if (dx * dx + dy * dy > 9) return; // drag, not click

    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(splat, false);
    const hit = hits?.[0];
    if (!hit) {
      statusEl.textContent = "No splat hit at click";
      return;
    }

    // Defer to annotation system if user armed "+ Add"
    if (annotations.handleCanvasClick(hit.point)) return;

    // Otherwise → trigger scan effect at hit point (in object space)
    const localPoint = splat.worldToLocal(hit.point.clone());
    effects.triggerAt(localPoint);
    statusEl.textContent = `Hit (${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)})`;
  });

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
  }

  function updateOnePinch(p) {
    if (!onePinchActive) return;
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
    if (!onePinchMoved) {
      // Quick tap → click → dissolve
      const local = screenToLocalHit(p.x, p.y);
      if (local) effects.triggerAt(local);
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

  // (Body tracking is parked as a wish-list feature — bodytracking.js stays
  // in the repo for future use; UI / wiring intentionally omitted.)

  // ---- Drag-and-drop splat upload -----------------------------------------
  // Hot-swap the splat without a page reload. Closures over voxelizer /
  // quadizer / annotations / dataLabels / raycaster mean the existing
  // controllers + GUI wiring stay intact; we just point them at the new mesh.
  const dropZone = document.getElementById("drop-zone");

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
      await replaceSplatMesh({ fileBytes: new Uint8Array(buf), fileName: file.name });
    } catch (err) {
      console.error("Splat replace failed:", err);
      setLoading("Load failed: " + (err?.message ?? err));
      setTimeout(() => hideLoading(), 2500);
    }
  });

  hideLoading();
  statusEl.textContent = `${(size.x).toFixed(1)} × ${(size.y).toFixed(1)} × ${(size.z).toFixed(1)} m`;

  // Preload the FBX so Center=frame460 takes effect at startup. The promise
  // is fire-and-forget — concurrent calls from the Play button share it via
  // camLoadPromise.
  loadCameraMove();
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let frameCount = 0;
let fpsAccum = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  // Annotation tween + screen-space marker update
  if (annotations) {
    annotations.updateTween(dt);
    annotations.updateMarkers(window.innerWidth, window.innerHeight);
  }

  // Data-label overlay (cards + bbox + ambient ticks)
  if (dataLabels) dataLabels.update(window.innerWidth, window.innerHeight);

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
  postfx.render(dt);

  frameCount++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    const fps = (frameCount / fpsAccum).toFixed(0);
    if (statusEl && !statusEl.textContent.startsWith("Hit") && !statusEl.textContent.startsWith("Click")) {
      const base = statusEl.textContent.split(" • ")[0];
      statusEl.textContent = `${base} • ${fps} fps`;
    }
    frameCount = 0;
    fpsAccum = 0;
  }
});

loadSplat().catch((err) => {
  console.error(err);
  setLoading("Failed to load: " + (err?.message ?? err));
});

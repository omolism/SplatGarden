import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
      cameraFrustums = buildColmapFrustums(images, {
        size: Math.max(0.06, radius * 0.012),
        depth: Math.max(0.10, radius * 0.022),
      });
      cameraFrustums.visible = false;
      scene.add(cameraFrustums);
      console.info(`[COLMAP] loaded ${images.length} capture poses`);
    })
    .catch(err => {
      console.warn("[COLMAP] failed to load:", err?.message ?? err);
    });

  const dataParams = { enabled: false };
  const fOverlay = gui.addFolder("Overlays");
  const camCtrl = fOverlay.add(dataParams, "enabled").name("Training Cameras").onChange(v => {
    dataLabels.setEnabled(v);
    if (cameraFrustums) cameraFrustums.visible = v;
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

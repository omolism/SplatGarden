import * as THREE from "three";

// ---------------------------------------------------------------------------
// Sketchfab-style annotation system.
// Each viewpoint = a saved camera pose (position + target) anchored to a 3D
// point in world space. The world point gets a numbered hotspot rendered in
// HTML, projected to screen every frame. Clicking it (or the sidebar row)
// smoothly tweens the camera over to that pose.
// ---------------------------------------------------------------------------

let _id = 0;
const nextId = () => ++_id;

export class AnnotationManager {
  constructor({ camera, controls, layerEl, listEl, addBtnEl, statusEl, storageKey = null }) {
    this.camera = camera;
    this.controls = controls;
    this.layerEl = layerEl;
    this.listEl = listEl;
    this.statusEl = statusEl;
    this.storageKey = storageKey;
    this._suspendSave = false;

    this.viewpoints = []; // { id, name, anchor:Vec3, position:Vec3, target:Vec3, el:HTMLElement }
    this.activeId = null;
    this.tween = null;

    // Pending "click on splat to anchor" mode triggered by + Add
    this.pendingAdd = false;
    this.onArmedChange = null;

    addBtnEl.addEventListener("click", () => {
      this.armAddViewpoint();
    });

    // Hidden world-position scratch buffer
    this._v = new THREE.Vector3();
    this._raycaster = null; // set externally
  }

  setStorageKey(key) {
    this.storageKey = key;
  }

  _save() {
    if (this._suspendSave || !this.storageKey) return;
    try {
      const data = this.viewpoints.map(v => ({
        name: v.name,
        anchor:   [v.anchor.x,   v.anchor.y,   v.anchor.z],
        position: [v.position.x, v.position.y, v.position.z],
        target:   [v.target.x,   v.target.y,   v.target.z],
        createdAt: v.createdAt,
      }));
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (_) { /* quota / disabled — silent */ }
  }

  /**
   * Replace current viewpoints with whatever is in localStorage under storageKey.
   * @returns {boolean} true if at least one viewpoint was restored.
   */
  restoreFromStorage() {
    if (!this.storageKey) return false;
    let raw;
    try { raw = localStorage.getItem(this.storageKey); } catch { return false; }
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch { return false; }
    if (!Array.isArray(data) || data.length === 0) return false;

    // Wipe + bulk-restore. Suspend save BEFORE removes so the shrinking
    // viewpoints array never gets written back to storage as `[]` mid-way.
    this._suspendSave = true;
    try {
      this.viewpoints.slice().forEach(vp => this.removeViewpoint(vp.id));
      for (const d of data) {
        this.addViewpoint({
          name: d.name,
          anchor:   new THREE.Vector3(d.anchor[0],   d.anchor[1],   d.anchor[2]),
          position: new THREE.Vector3(d.position[0], d.position[1], d.position[2]),
          target:   new THREE.Vector3(d.target[0],   d.target[1],   d.target[2]),
          createdAt: d.createdAt,
        });
      }
    } finally {
      this._suspendSave = false;
    }
    // Save once at the end so storage reflects the final restored state.
    this._save();
    return true;
  }

  setRaycaster(raycaster, splatMesh) {
    this._raycaster = raycaster;
    this._splat = splatMesh;
  }

  armAddViewpoint() {
    this.pendingAdd = !this.pendingAdd;
    this._setStatus(this.pendingAdd ? "Click on the splat to anchor a new viewpoint…" : "");
    if (this.onArmedChange) this.onArmedChange(this.pendingAdd);
  }

  // Called from the canvas click handler. Returns true if it consumed the click.
  handleCanvasClick(worldHitPoint) {
    if (!this.pendingAdd) return false;
    this.pendingAdd = false;
    if (this.onArmedChange) this.onArmedChange(false);
    this._setStatus("");
    if (worldHitPoint) {
      this.addViewpoint({
        anchor: worldHitPoint.clone(),
        position: this.camera.position.clone(),
        target: this.controls.target.clone(),
      });
    }
    return true;
  }

  addViewpoint({ anchor, position, target, name }) {
    const id = nextId();
    const vp = {
      id,
      name: name ?? `View ${this.viewpoints.length + 1}`,
      anchor,
      position,
      target,
      el: null,
    };

    // DOM marker
    const dot = document.createElement("div");
    dot.className = "annotation";
    dot.textContent = String(this.viewpoints.length + 1);
    dot.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.flyTo(id);
    });
    this.layerEl.appendChild(dot);
    vp.el = dot;

    this.viewpoints.push(vp);
    this._rebuildList();
    this._save();
    return vp;
  }

  removeViewpoint(id) {
    const idx = this.viewpoints.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const vp = this.viewpoints[idx];
    vp.el?.remove();
    this.viewpoints.splice(idx, 1);
    // Renumber labels
    this.viewpoints.forEach((v, i) => {
      v.el.textContent = String(i + 1);
    });
    if (this.activeId === id) this.activeId = null;
    this._rebuildList();
    this._save();
  }

  _rebuildList() {
    this.listEl.innerHTML = "";
    this.viewpoints.forEach((vp, i) => {
      const li = document.createElement("li");
      if (vp.id === this.activeId) li.classList.add("active");

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = String(i + 1);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = vp.name;
      name.title = "Double-click to rename";
      name.addEventListener("dblclick", () => {
        const nv = prompt("Rename viewpoint", vp.name);
        if (nv && nv.trim()) {
          vp.name = nv.trim();
          this._rebuildList();
          this._save();
        }
      });

      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "×";
      del.title = "Delete";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeViewpoint(vp.id);
      });

      li.append(badge, name, del);
      li.addEventListener("click", () => this.flyTo(vp.id));
      this.listEl.appendChild(li);
    });
  }

  flyTo(id) {
    const vp = this.viewpoints.find((v) => v.id === id);
    if (!vp) return;

    this.activeId = id;
    this._rebuildList();

    // Disable controls during tween
    this.controls.enabled = false;
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const dur = 0.9; // seconds
    this.tween = {
      t: 0,
      duration: dur,
      fromPos, fromTarget,
      toPos: vp.position.clone(),
      toTarget: vp.target.clone(),
    };
  }

  // Number-key shortcut
  flyToIndex(i /* 0-based */) {
    const vp = this.viewpoints[i];
    if (vp) this.flyTo(vp.id);
  }

  // Tween to an arbitrary (position, target) pose without registering a
  // sidebar viewpoint — used by ad-hoc destinations like asset hotspots.
  flyToPose(position, target, duration = 0.9) {
    this.controls.enabled = false;
    this.activeId = null;          // not a saved viewpoint
    this._rebuildList();
    this.tween = {
      t: 0,
      duration,
      fromPos:    this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos:      position.clone(),
      toTarget:   target.clone(),
    };
  }

  // Smoothstep easing
  _ease(x) { return x * x * (3 - 2 * x); }

  updateTween(dt) {
    if (!this.tween) return;
    this.tween.t += dt;
    const a = Math.min(1, this.tween.t / this.tween.duration);
    const e = this._ease(a);
    this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, e);
    this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
    this.controls.update();
    if (a >= 1) {
      this.tween = null;
      this.controls.enabled = true;
    }
  }

  // Project anchors to screen each frame
  updateMarkers(width, height) {
    if (!this.viewpoints.length) return;
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const camPos = this.camera.position;

    for (const vp of this.viewpoints) {
      this._v.copy(vp.anchor);
      // Vector from camera to anchor
      const dx = this._v.x - camPos.x;
      const dy = this._v.y - camPos.y;
      const dz = this._v.z - camPos.z;
      const behind = dx * camDir.x + dy * camDir.y + dz * camDir.z <= 0;

      this._v.project(this.camera);
      const x = (this._v.x * 0.5 + 0.5) * width;
      const y = (-this._v.y * 0.5 + 0.5) * height;

      if (behind || this._v.x < -1.2 || this._v.x > 1.2 || this._v.y < -1.2 || this._v.y > 1.2) {
        vp.el.style.display = "none";
      } else {
        vp.el.style.display = "flex";
        vp.el.style.transform = `translate(${x}px, ${y}px)`;
      }
    }
  }

  _setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg || "--";
  }

  // Seed a handful of default viewpoints around the model
  seedDefaults(boundsCenter, boundsRadius) {
    const r = boundsRadius * 1.6;
    const presets = [
      { name: "Front",  pos: new THREE.Vector3( 0, boundsRadius * 0.3,  r) },
      { name: "Right",  pos: new THREE.Vector3( r, boundsRadius * 0.3,  0) },
      { name: "Back",   pos: new THREE.Vector3( 0, boundsRadius * 0.3, -r) },
      { name: "Left",   pos: new THREE.Vector3(-r, boundsRadius * 0.3,  0) },
      { name: "Top",    pos: new THREE.Vector3( 0,  r * 1.1,  0.001) },
      // Center = framed close on the Grape Hyacinth cluster — the showcase's
      // hero asset. Camera sits ~1.6 m behind and slightly above, target lands
      // on the flowers themselves. Worldpos uses the Z-flipped frame (the
      // same one asset-hover hotspots project in) so the framing matches the
      // floating hotspot location.
      { name: "Center",
        absoluteTarget: new THREE.Vector3(-0.195, -0.730, -2.379),
        positionOffset: new THREE.Vector3(0, 0.4, 1.5) },
    ];
    let centerVp = null;
    for (const p of presets) {
      let position, target, anchor;
      if (p.absoluteTarget) {
        target   = p.absoluteTarget.clone();
        position = p.positionOffset
          ? target.clone().add(p.positionOffset)
          : target.clone().add(new THREE.Vector3(0, boundsRadius * 0.3, r));
        anchor   = target.clone();
      } else {
        position = boundsCenter.clone().add(p.pos);
        target   = boundsCenter.clone().add(p.targetOffset ?? new THREE.Vector3());
        anchor   = boundsCenter.clone().add(p.pos.clone().normalize().multiplyScalar(boundsRadius * 0.6));
      }
      const vp = this.addViewpoint({ name: p.name, anchor, position, target });
      if (p.name === "Center") centerVp = vp;
    }
    // Center = the default startup pose. Mark it active in the sidebar so it
    // matches the camera the loader places after seeding.
    if (centerVp) {
      this.activeId = centerVp.id;
      this._rebuildList();
    }
    return centerVp;
  }
}

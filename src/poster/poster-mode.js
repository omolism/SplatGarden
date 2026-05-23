// ---------------------------------------------------------------------------
// Poster Mode — alternate top-level presentation for a single VAT-animated
// asset, framed by a sci-fi infographic HUD. Sister mode to the default
// Studio Mode (3DGS scene + FX + hotspots + Tech Breakdown drawer).
//
// Architecture (Phase 1 scaffold):
//   • Own THREE.Scene + PerspectiveCamera (not shared with Studio).
//   • setActive(bool) toggles render dispatch — the main animation loop
//     in src/main.js early-returns to PosterMode.update() when active,
//     skipping the heavy splat / FX / overlay pipeline.
//   • HUD is DOM-based (src/poster/poster-hud.js), positioned absolute
//     over the canvas. Pointer-events:none on the outer container so
//     mouse drags reach the canvas; selective re-enable on interactive
//     widgets.
//   • Hand-tracking pipeline (src/handtracking.js) is shared — both modes
//     subscribe to the same smoothed-landmark stream. PosterMode adds its
//     own subscriber in Phase 6 (pinch → VAT time, palm → yaw).
//
// Phase 1 ships ONLY the toggle + scene + a placeholder green wireframe
// icosahedron where the daffodil will go. Phase 3 swaps the placeholder
// for the real FBX driven by the VAT shader.
//
// Per-mode body classes (mode-studio / mode-poster) drive CSS reactivity
// — same pattern as body.touch / body.phone-device / body.intro-playing.
// ---------------------------------------------------------------------------

import * as THREE from "three";

export class PosterMode {
  /**
   * @param {object} opts
   * @param {THREE.WebGLRenderer} opts.renderer — shared with Studio
   * @param {HTMLElement}         opts.mountEl  — where the HUD attaches
   */
  constructor({ renderer, mountEl }) {
    this.renderer = renderer;
    this.mountEl  = mountEl;
    this.active   = false;
    this.hud      = null;

    // Scene — black void. The HUD overlay carries the visual context;
    // the 3D scene's job is to render the asset cleanly without competing.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Camera — fixed angle, looking slightly down at where the flower
    // mesh will sit. Yaw range ±35° is wired in Phase 6 from hand input.
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    this.camera.position.set(0, 0.65, 2.6);
    this.camera.lookAt(0, 0.45, 0);

    // Lighting — single key + green-tinted rim to harmonise with the
    // accent color in the HUD. Soft ambient lifts the shadow areas so
    // the asset doesn't disappear into the black background.
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6dffb3, 0.35);
    rim.position.set(-3, 1.5, -2);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x303030, 0.4));

    // Placeholder for Phase 1 — green wireframe icosahedron. Phase 3
    // replaces this with the real FBX driven by the VAT shader. Kept
    // around the same scale and position the flower will land at, so
    // the HUD layout can be tuned now without waiting on the real mesh.
    this._placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 3),
      new THREE.MeshBasicMaterial({
        color: 0x6dffb3,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      })
    );
    this._placeholder.position.set(0, 0.5, 0);
    this.scene.add(this._placeholder);

    // Subtle ground shadow disc — anchors the asset visually without
    // adding a hard floor. Pure black with low alpha gradient via a
    // RingGeometry sandwich; keeps the scene from looking like the
    // mesh floats in pure void.
    const shadow = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.6, 64),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.001;
    this.scene.add(shadow);
  }

  /** Visible state toggle. Called from main.js when mode flips. */
  setActive(active) {
    this.active = active;
    if (this.hud) this.hud.setVisible(active);
  }

  isActive() { return this.active; }

  /** Wire the HUD instance after construction (HUD has its own module). */
  setHUD(hud) {
    this.hud = hud;
    if (this.hud) this.hud.setVisible(this.active);
  }

  /** Driven by the parent renderer's resize handler. */
  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * One-frame update + render. Called from main.js's animation loop
   * when active. Returns true if rendered (so main.js knows to skip
   * the studio render path this frame).
   */
  update(dt) {
    if (!this.active) return false;
    // Placeholder rotation — gentle spin so the wireframe reads as
    // alive. Replaced by VAT-driven animation in Phase 3.
    if (this._placeholder) this._placeholder.rotation.y += dt * 0.35;
    if (this.hud) this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
    return true;
  }
}

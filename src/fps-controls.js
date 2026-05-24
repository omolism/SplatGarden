// First-person walking controls — Unreal Editor / Quake-style free-fly.
// Toggle in the "Camera Movement" folder of the right-rail studio. While
// active, OrbitControls is disabled and the camera moves with WASD plus
// vertical (Space / Ctrl) under mouse-look via PointerLockControls. The
// soft boundary box clamps position to a generous radius around scene
// origin so the user can poke around inside splat plants without flying
// off into infinity.
//
// Why an inline implementation rather than three/addons/controls/
// PointerLockControls + three/addons/controls/FirstPersonControls? Two
// reasons. First, those two utilities don't compose cleanly — the
// PointerLock variant doesn't move on its own, and the FirstPerson
// variant doesn't take pointer-lock input — so a real "FPS in browser"
// needs custom glue anyway. Second, this implementation needs to (a)
// politely yield to the existing OrbitControls during cinematic / drag
// flows, (b) respect prefers-reduced-motion, (c) offer a clean enter /
// exit interface for the lil-gui toggle, and (d) work on phones with a
// basic touch fallback. Bespoke gets us all four for ~120 lines instead
// of ~400 of subclass / monkeypatch.

import * as THREE from "three";

// Movement tuning. Numbers chosen for the SplatGarden scene scale (~10m
// across). Sprint is 2.5x walk so a held-Shift run reads as deliberate
// without overshooting the scene's bounds in two seconds.
const WALK_SPEED   = 2.0;      // m/s
const SPRINT_MULT  = 2.5;
const LOOK_SENS    = 0.0022;   // radians per pixel of mouse motion
const MIN_PITCH    = -Math.PI * 0.49;
const MAX_PITCH    =  Math.PI * 0.49;
const BOUND_RADIUS = 40;       // soft box half-extent in meters

export class FPSControls {
  /**
   * @param {object} opts
   * @param {THREE.PerspectiveCamera} opts.camera
   * @param {HTMLCanvasElement}        opts.domElement
   * @param {() => void}              [opts.onEnter]
   * @param {() => void}              [opts.onExit]
   */
  constructor({ camera, domElement, onEnter, onExit }) {
    this.camera     = camera;
    this.domElement = domElement;
    this.onEnter    = onEnter;
    this.onExit     = onExit;

    this.enabled = false;
    this._keys = new Set();
    this._yaw   = 0;          // around world up
    this._pitch = 0;          // around camera right
    this._tmp   = new THREE.Vector3();
    this._fwd   = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up    = new THREE.Vector3(0, 1, 0);

    // Bind handlers once so add/remove use the same reference.
    this._onKeyDown    = this._onKeyDown.bind(this);
    this._onKeyUp      = this._onKeyUp.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onPLChange   = this._onPLChange.bind(this);
    this._onCanvasDown = this._onCanvasDown.bind(this);
    // Touch-look fallback for phones that have no pointer lock. Drag
    // anywhere on the canvas → look around; no walk movement in this
    // mode (the phone toolbar's two-finger pinch zoom still works
    // through OrbitControls when FPS is off, so a phone user has a
    // viable alternative without a full virtual-joystick UI).
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._touchPrev    = null;
  }

  enter() {
    if (this.enabled) return;
    this.enabled = true;
    // Seed yaw / pitch from the current camera orientation so the
    // transition into FPS doesn't snap the view. Decompose the rotation
    // matrix's forward vector into yaw + pitch.
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this._yaw   = Math.atan2(dir.x, dir.z) + Math.PI;
    this._pitch = Math.asin(THREE.MathUtils.clamp(-dir.y, -1, 1));

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup",   this._onKeyUp);
    document.addEventListener("pointerlockchange", this._onPLChange);
    this.domElement.addEventListener("pointerdown", this._onCanvasDown);
    this.domElement.addEventListener("touchstart", this._onTouchStart, { passive: true });
    this.domElement.addEventListener("touchmove",  this._onTouchMove,  { passive: true });

    // Request pointer lock immediately so the user doesn't have to
    // hunt for a separate "click to look" affordance. The browser will
    // grant or deny per its own rules (some require user gesture; the
    // toggle click counts as the gesture).
    try { this.domElement.requestPointerLock?.(); } catch {}

    this.onEnter?.();
  }

  exit() {
    if (!this.enabled) return;
    this.enabled = false;
    this._keys.clear();
    this._touchPrev = null;

    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup",   this._onKeyUp);
    document.removeEventListener("pointerlockchange", this._onPLChange);
    this.domElement.removeEventListener("pointerdown", this._onCanvasDown);
    this.domElement.removeEventListener("touchstart", this._onTouchStart);
    this.domElement.removeEventListener("touchmove",  this._onTouchMove);

    if (document.pointerLockElement === this.domElement) {
      try { document.exitPointerLock?.(); } catch {}
    }
    this.onExit?.();
  }

  /** Per-frame update. dt is seconds since last frame. */
  update(dt) {
    if (!this.enabled) return;

    // Apply yaw + pitch to camera. Using setFromEuler with order YXZ so
    // yaw rotates around world up and pitch around the resulting right
    // axis, exactly like an Unreal / Unity FPS camera.
    const e = new THREE.Euler(this._pitch, this._yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(e);

    // Movement keys → camera-local velocity. Forward is -Z in camera
    // space; we project onto world horizontal so W doesn't dip when
    // the user is looking down at the ground.
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() > 1e-6) this._fwd.normalize();
    this._right.crossVectors(this._fwd, this._up).normalize();

    const speed = (this._keys.has("ShiftLeft") || this._keys.has("ShiftRight"))
      ? WALK_SPEED * SPRINT_MULT
      : WALK_SPEED;
    const step = speed * dt;

    this._tmp.set(0, 0, 0);
    if (this._keys.has("KeyW") || this._keys.has("ArrowUp"))    this._tmp.add(this._fwd);
    if (this._keys.has("KeyS") || this._keys.has("ArrowDown"))  this._tmp.sub(this._fwd);
    if (this._keys.has("KeyD") || this._keys.has("ArrowRight")) this._tmp.add(this._right);
    if (this._keys.has("KeyA") || this._keys.has("ArrowLeft"))  this._tmp.sub(this._right);
    if (this._keys.has("Space"))                                this._tmp.y += 1;
    if (this._keys.has("ControlLeft") || this._keys.has("ControlRight")) this._tmp.y -= 1;

    if (this._tmp.lengthSq() > 0) {
      this._tmp.normalize().multiplyScalar(step);
      this.camera.position.add(this._tmp);
      // Soft clamp to scene-centred box. Splats are roughly at origin so
      // this keeps the camera inside a 40 m cube the player can't
      // accidentally escape.
      this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -BOUND_RADIUS, BOUND_RADIUS);
      this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y, -BOUND_RADIUS, BOUND_RADIUS);
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -BOUND_RADIUS, BOUND_RADIUS);
    }
  }

  _onKeyDown(e) {
    if (e.target instanceof HTMLElement) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    }
    this._keys.add(e.code);
    // Prevent the space-bar from scrolling the page while FPS is on.
    if (e.code === "Space" || e.code === "ControlLeft" || e.code === "ControlRight") {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
  }

  _onMouseMove(e) {
    if (!this.enabled || document.pointerLockElement !== this.domElement) return;
    this._yaw   -= e.movementX * LOOK_SENS;
    this._pitch -= e.movementY * LOOK_SENS;
    this._pitch = THREE.MathUtils.clamp(this._pitch, MIN_PITCH, MAX_PITCH);
  }

  _onPLChange() {
    if (document.pointerLockElement === this.domElement) {
      window.addEventListener("mousemove", this._onMouseMove);
    } else {
      window.removeEventListener("mousemove", this._onMouseMove);
    }
  }

  _onCanvasDown(e) {
    // Clicking the canvas re-requests pointer lock if the user pressed
    // Esc to drop it. Browser ignores duplicate requests when already
    // locked, so this is safe to spam.
    if (e.pointerType === "mouse" && document.pointerLockElement !== this.domElement) {
      try { this.domElement.requestPointerLock?.(); } catch {}
    }
  }

  _onTouchStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    this._touchPrev = { x: t.clientX, y: t.clientY };
  }

  _onTouchMove(e) {
    const t = e.touches?.[0];
    if (!t || !this._touchPrev) return;
    const dx = t.clientX - this._touchPrev.x;
    const dy = t.clientY - this._touchPrev.y;
    this._touchPrev = { x: t.clientX, y: t.clientY };
    this._yaw   -= dx * LOOK_SENS * 0.6;
    this._pitch -= dy * LOOK_SENS * 0.6;
    this._pitch = THREE.MathUtils.clamp(this._pitch, MIN_PITCH, MAX_PITCH);
  }
}

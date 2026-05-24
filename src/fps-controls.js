// First-person walking controls — Unreal Editor / Quake-style free-fly.
// Toggle in the "Camera Movement" folder of the right-rail studio. While
// active, OrbitControls is disabled and the camera moves with WASD plus
// vertical (Space / Ctrl) under mouse-look via PointerLockControls. On
// touch devices, the left half of the canvas is a virtual joystick for
// walking and the right half is a drag-pad for look — the two zones
// support simultaneous fingers (multi-touch), so the user can walk and
// look at the same time the way an actual FPS controller plays. A soft
// boundary box clamps position to a generous radius around scene origin
// so the user can poke around inside splat plants without flying off
// into infinity.
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
// real virtual-joystick UI rather than a degraded fallback. Bespoke
// gets us all four.

import * as THREE from "three";

// Movement tuning. Numbers chosen for the SplatGarden scene scale (~10m
// across). Sprint is 2.5x walk so a held-Shift run reads as deliberate
// without overshooting the scene's bounds in two seconds.
const WALK_SPEED   = 2.0;      // m/s
const SPRINT_MULT  = 2.5;
const LOOK_SENS    = 0.0022;   // radians per pixel of mouse motion
const TOUCH_LOOK_SENS = 0.004; // radians per pixel of touch drag — slightly
                               // hotter than mouse because the finger sweeps
                               // less linear distance per intent.
const MIN_PITCH    = -Math.PI * 0.49;
const MAX_PITCH    =  Math.PI * 0.49;
const BOUND_RADIUS = 40;       // soft box half-extent in meters

// Joystick tuning.
const JOY_DEADZONE = 8;        // px — finger has to move at least this far
                               // before walk vector engages; kills jitter
                               // from a still finger that wandered 2 px.
const JOY_MAX_RADIUS = 60;     // px — stick clamps to this radius from
                               // the touch-down anchor; |stick|/MAX gives
                               // walk magnitude in [0, 1].

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

    // Virtual joystick state. _walkVector is consumed by update() each
    // frame; x is strafe (right positive), y is forward (positive = move
    // forward). Set by the walk-half touch handler; zeroed on touchend.
    this._walkVector = new THREE.Vector2(0, 0);
    // Multi-touch table — identifier → { kind, anchorX, anchorY,
    // prevX, prevY, baseEl, stickEl }. "kind" is "walk" or "look";
    // walk touches own a joystick visual pinned at their anchor.
    this._activeTouches = new Map();

    // Bind handlers once so add/remove use the same reference.
    this._onKeyDown    = this._onKeyDown.bind(this);
    this._onKeyUp      = this._onKeyUp.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onPLChange   = this._onPLChange.bind(this);
    this._onCanvasDown = this._onCanvasDown.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._onTouchEnd   = this._onTouchEnd.bind(this);
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
    this.domElement.addEventListener("touchstart",  this._onTouchStart, { passive: true });
    this.domElement.addEventListener("touchmove",   this._onTouchMove,  { passive: true });
    this.domElement.addEventListener("touchend",    this._onTouchEnd,   { passive: true });
    this.domElement.addEventListener("touchcancel", this._onTouchEnd,   { passive: true });

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
    this._walkVector.set(0, 0);
    // Tear down any joystick visuals still in the DOM.
    for (const entry of this._activeTouches.values()) {
      entry.baseEl?.remove();
      entry.stickEl?.remove();
    }
    this._activeTouches.clear();

    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup",   this._onKeyUp);
    document.removeEventListener("pointerlockchange", this._onPLChange);
    this.domElement.removeEventListener("pointerdown", this._onCanvasDown);
    this.domElement.removeEventListener("touchstart",  this._onTouchStart);
    this.domElement.removeEventListener("touchmove",   this._onTouchMove);
    this.domElement.removeEventListener("touchend",    this._onTouchEnd);
    this.domElement.removeEventListener("touchcancel", this._onTouchEnd);

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

    // Compose movement intent from keyboard + virtual joystick.
    // forward in [-1, 1], strafe in [-1, 1].
    let forward = 0, strafe = 0;
    if (this._keys.has("KeyW") || this._keys.has("ArrowUp"))    forward += 1;
    if (this._keys.has("KeyS") || this._keys.has("ArrowDown"))  forward -= 1;
    if (this._keys.has("KeyD") || this._keys.has("ArrowRight")) strafe  += 1;
    if (this._keys.has("KeyA") || this._keys.has("ArrowLeft"))  strafe  -= 1;
    // Joystick contributions. _walkVector.y is "forward" (positive =
    // away from the camera anchor, i.e. push the stick up); .x is
    // "strafe" (positive = stick to the right).
    forward += this._walkVector.y;
    strafe  += this._walkVector.x;

    this._tmp.set(0, 0, 0);
    if (forward !== 0) this._tmp.addScaledVector(this._fwd,   forward);
    if (strafe  !== 0) this._tmp.addScaledVector(this._right, strafe);
    if (this._keys.has("Space"))                                this._tmp.y += 1;
    if (this._keys.has("ControlLeft") || this._keys.has("ControlRight")) this._tmp.y -= 1;

    if (this._tmp.lengthSq() > 0) {
      // Normalise so a fully-pushed joystick (~1.0) doesn't compound
      // with a held W into 2× speed. Diagonal still gets √2/2 per axis
      // after normalise, matching the keyboard-only convention.
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
    // locked, so this is safe to spam. Mouse only — touch flows go
    // through the joystick handlers below.
    if (e.pointerType === "mouse" && document.pointerLockElement !== this.domElement) {
      try { this.domElement.requestPointerLock?.(); } catch {}
    }
  }

  // ---- Multi-touch virtual joystick ----------------------------------
  // Two zones: left half of the canvas → walk joystick (anchor at touch
  // start position); right half → look pad (delta drag). Both work
  // simultaneously via different touch identifiers, so a thumb on each
  // side gives proper walk-and-look behaviour. The joystick visual
  // (base ring + stick) lives in the DOM and follows the user's finger.
  _onTouchStart(e) {
    if (!this.enabled) return;
    const w = window.innerWidth;
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      const kind = (x < w / 2) ? "walk" : "look";
      const entry = {
        kind,
        anchorX: x, anchorY: y,
        prevX: x,   prevY: y,
        baseEl: null, stickEl: null,
      };
      if (kind === "walk") {
        entry.baseEl  = this._spawnJoystickEl("fps-joy-base",  x, y);
        entry.stickEl = this._spawnJoystickEl("fps-joy-stick", x, y);
      }
      this._activeTouches.set(t.identifier, entry);
    }
  }

  _onTouchMove(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      const entry = this._activeTouches.get(t.identifier);
      if (!entry) continue;
      const x = t.clientX, y = t.clientY;
      if (entry.kind === "walk") {
        const dx = x - entry.anchorX;
        const dy = y - entry.anchorY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(dist, JOY_MAX_RADIUS);
        const norm = clamped / JOY_MAX_RADIUS;
        const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
        // Move the visible stick to follow the finger (clamped to the
        // joystick ring so it doesn't fly off the base).
        const sx = entry.anchorX + Math.cos(angle) * clamped;
        const sy = entry.anchorY + Math.sin(angle) * clamped;
        if (entry.stickEl) {
          entry.stickEl.style.transform = `translate(${sx}px, ${sy}px)`;
        }
        if (dist > JOY_DEADZONE) {
          // Y is screen-down-positive, but walking "up" on the stick
          // means walking FORWARD, so flip the sign.
          this._walkVector.set(Math.cos(angle) * norm, -Math.sin(angle) * norm);
        } else {
          this._walkVector.set(0, 0);
        }
      } else {
        // Look — delta from previous finger position. Hotter sensitivity
        // than mouse because finger sweep is shorter linear distance.
        const dx = x - entry.prevX;
        const dy = y - entry.prevY;
        this._yaw   -= dx * TOUCH_LOOK_SENS;
        this._pitch -= dy * TOUCH_LOOK_SENS;
        this._pitch = THREE.MathUtils.clamp(this._pitch, MIN_PITCH, MAX_PITCH);
        entry.prevX = x;
        entry.prevY = y;
      }
    }
  }

  _onTouchEnd(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      const entry = this._activeTouches.get(t.identifier);
      if (!entry) continue;
      if (entry.kind === "walk") {
        // Stop walking and tear down the joystick visual. Other walk
        // touches (rare — most users only use one walk finger at a
        // time) keep contributing if still active, since the walkVector
        // is overwritten on every touchmove anyway.
        this._walkVector.set(0, 0);
        entry.baseEl?.remove();
        entry.stickEl?.remove();
      }
      this._activeTouches.delete(t.identifier);
    }
  }

  _spawnJoystickEl(className, x, y) {
    const el = document.createElement("div");
    el.className = className;
    el.setAttribute("aria-hidden", "true");
    // translate(...) instead of left/top so the browser composites the
    // joystick on the GPU and we avoid layout thrash during touchmove.
    el.style.transform = `translate(${x}px, ${y}px)`;
    document.body.appendChild(el);
    return el;
  }
}

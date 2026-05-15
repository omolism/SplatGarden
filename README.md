# SplatGarden — Interactive Gaussian-Splat Viewer

A SuperSplat-style browser viewer for 3D Gaussian Splatting models, with
Sketchfab-style multi-viewpoint navigation and click-triggered "ion scan"
shader effects.

Built on **Spark** (advanced 3DGS renderer for Three.js) + **Three.js** + **Vite**.

---

## Features

| | |
|---|---|
| **Renderer** | [Spark](https://sparkjs.dev) `@sparkjsdev/spark` — programmable splat engine with GPU shader-graph (Dyno) injection |
| **Default asset** | `public/Whole_With_Statue_Cleanup.splat` (~83 MB, 2.6 M splats) |
| **Controls** | OrbitControls (mouse drag = orbit, scroll = zoom, right-drag = pan) |
| **Viewpoints** | Sketchfab-style numbered hotspots in 3D + sidebar list. Smooth eased camera tween between poses. <kbd>1</kbd>–<kbd>9</kbd> to switch, <kbd>V</kbd> to add, <kbd>R</kbd> to reset |
| **Click interaction** | Three.js Raycaster against the SplatMesh — click anywhere on the model to trigger the scan effect at the world-space hit point |
| **Effects** | Three real-time GPU shader effects, switchable from the panel: `Wave & Tint`, `Dissolve & Reform`, `Scan Line` |
| **Tunable params** | Color, Radius, Speed, Intensity, Duration |

### The three effects

1. **Wave & Tint** — radial ripple from the click point with per-splat jitter; color uniform dyes the wave crests.
2. **Dissolve & Reform** — splats inside the impact radius explode outward, hold briefly, then snap back. Glowing tint mid-flight.
3. **Scan Line** — thin Tron-style expanding shell sweeps outward; splats it touches pop and glow.

All three live in a single `dyno.Dyno` shader, branched on a uniform `int`, so switching never recompiles.

---

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173
# or
npm run build && npm run preview
```

> First load decompresses the 83 MB `.splat` — give it a few seconds. Subsequent loads are instant thanks to browser cache.

### Use your own splat

Drop a `.splat` / `.ply` / `.spz` / `.ksplat` into `public/`, then edit
`SPLAT_URL` at the top of `src/main.js`.

---

## File layout

```
public/
  Whole_With_Statue_Cleanup.splat   # default asset (83 MB)
src/
  main.js          # scene, renderer, raycast, animation loop
  effects.js       # 3 shader effects (dyno) + uniforms + lil-gui panel
  annotations.js   # Sketchfab-style hotspots + smooth camera tween
  style.css        # dark UI theme
index.html         # canvas + sidebar + GUI mount points
vite.config.js
package.json
```

---

## How the effect works (1-minute version)

Spark's `dyno` system lets you compose a per-splat shader from JS:

```js
const uHit = dyno.dynoVec3(new THREE.Vector3()); // live uniform
splat.objectModifier = dyno.dynoBlock(
  { gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat },
  ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes:  { gsplat: dyno.Gsplat, uHit: "vec3", /* ... */ },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({inputs, outputs}) => `
        ${outputs.gsplat} = ${inputs.gsplat};
        // modify center, rgba based on distance from hit point...
      `,
    });
    return { gsplat: d.apply({ gsplat, uHit, /* ... */ }).gsplat };
  },
);
splat.updateGenerator();
```

Each frame, JS bumps `uHit.value` / `uTime.value` and calls
`splat.updateVersion()` — no shader recompile, just uniform updates.

When the user clicks, a `THREE.Raycaster` intersects the SplatMesh
(Spark provides a WASM-accelerated ray-splat hit test), and the hit
world-point is transformed to object space and stored in `uHit`. A
`timeCounter` resets and animates over the configured `duration`.

---

## Tips

- The first time after a code change, lil-gui may carry over saved
  parameter values from `localStorage` — clear with browser devtools
  if you want clean defaults.
- For very large scenes, the splat-ray intersection is O(N) and can take
  a noticeable time per click. Consider switching to screen-space
  picking against the depth buffer for instant feedback on huge scenes.
- The shader assumes Y-up. If your scene comes from Postshot / Inria,
  the default `splat.quaternion.set(1, 0, 0, 0)` (180° X flip) usually
  fixes orientation. Adjust in `main.js` if your asset differs.

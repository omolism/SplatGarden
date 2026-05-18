import { dyno } from "@sparkjsdev/spark";
import * as THREE from "three";
import GUI from "lil-gui";

// ---------------------------------------------------------------------------
// FX-grade scan/dissolve effects for SplatMesh
//
// Design notes (FX artist perspective):
//   - All randomness driven by a smooth 3D value noise + fbm so the effect
//     reads as a textured material, not as procedural code.
//   - Dissolve uses a "threshold map" = signed distance to hit + fbm offset,
//     so the burn front breaks up organically instead of being a clean ring.
//   - Each effect has a sharp emissive edge band (FX cliché but it works).
//     Splats inside the edge are pushed in size & color before being released.
//   - Per-splat seed (hash of position) drives unique fly-direction, delay,
//     and hero/extra factor so the dissolved cloud has depth instead of moving
//     as a single shell.
//   - RGB phase-shift on Wave & Tint gives a free chromatic-aberration look.
// ---------------------------------------------------------------------------

export const uniforms = {
  time:        dyno.dynoFloat(0.0),
  hit:         dyno.dynoVec3(new THREE.Vector3(0, 0, 1e6)),
  color:       dyno.dynoVec3(new THREE.Vector3(0.8, 0.8, 0.8)),
  radius:      dyno.dynoFloat(2.0),
  speed:       dyno.dynoFloat(4.0),
  intensity:   dyno.dynoFloat(0.6),
  effect:      dyno.dynoInt(0),
  active:      dyno.dynoFloat(0.0),
  duration:    dyno.dynoFloat(2.5),
  noiseScale:  dyno.dynoFloat(1.0),
  edgeWidth:   dyno.dynoFloat(0.18),
  emissive:    dyno.dynoFloat(2.5),

  // ---- Independent layer visibility (NEW) ----
  // Each layer can be shown/hidden independently. Gaussian and Point share the
  // same SplatMesh, so they're mutually exclusive sub-forms (picked via
  // splatSubform), but Splat / Quad / Voxel layers can all be visible at once.
  //
  //   splatSubform : 0 = Gaussian (soft falloff), 1 = Point (isotropic dots)
  //   splatVis     : 0..1 fade for SplatMesh (Gaussian or Point — whichever sub-form)
  //   quadVis      : 0..1 fade for Quadizer billboards
  //   voxelVis     : 0..1 fade for Voxelizer cubes
  // splatSubform lerps continuously between 0 (Gaussian) and 1 (Point) so the
  // segmented toggle animates instead of snapping.
  splatSubform: dyno.dynoFloat(0.0),
  splatVis:    dyno.dynoFloat(1.0),
  quadVis:     dyno.dynoFloat(0.0),
  voxelVis:    dyno.dynoFloat(0.0),
  pointSize:   dyno.dynoFloat(0.0015),
  quadSize:    dyno.dynoFloat(0.0064),
  voxelSize:   dyno.dynoFloat(0.013),

  // Global multiplier on the effect's contribution (1 = full, 0 = no effect).
  effectStrength: dyno.dynoFloat(0.0),

  // ---- Dissolve-specific FX knobs ----
  // windDir         : world-direction drift for dissolved particles (also bends edge)
  // edgeRagged      : 0 = smooth boundary, 1 = fbm-distorted ragged boundary
  // wispAmt         : 0 = uniform alpha, 1 = noise-driven wisps & smoke gradient
  // flyMax          : max distance multiplier for hero particles (1=mild, 6=spray)
  windDir:    dyno.dynoVec3(new THREE.Vector3(0, 0, 0)),
  edgeRagged: dyno.dynoFloat(0.6),
  wispAmt:    dyno.dynoFloat(0.7),
  flyMax:     dyno.dynoFloat(3.5),

  // ---- Mask reveal (palm / body driven) ----
  // Inside the mask, pointMode is LOCALLY inverted: if the scene is currently
  // crystallized, a moving "hole" lets you peek at the underlying splats;
  // if the scene is splats, the mask reveals the crystallized form within.
  maskActive: dyno.dynoFloat(0.0),                        // 0 / 1 toggle
  maskCenter: dyno.dynoVec3(new THREE.Vector3()),         // object-space
  maskRadius: dyno.dynoFloat(0.6),                        // world units
  maskShape:  dyno.dynoInt(0),                            // 0 = sphere, 1 = cube
  maskSoft:   dyno.dynoFloat(0.25),                       // soft-edge fraction

  // ---- Body-shape mask (5 body landmarks, OR-ed with palm mask) ----
  bodyActive: dyno.dynoFloat(0.0),
  bodyRadius: dyno.dynoFloat(0.5),
  bodyP0:     dyno.dynoVec3(new THREE.Vector3()),         // head
  bodyP1:     dyno.dynoVec3(new THREE.Vector3()),         // left hand
  bodyP2:     dyno.dynoVec3(new THREE.Vector3()),         // right hand
  bodyP3:     dyno.dynoVec3(new THREE.Vector3()),         // left foot
  bodyP4:     dyno.dynoVec3(new THREE.Vector3()),         // right foot
};

export const params = {
  effect: "Wave & Tint",
  color: "#cccccc",
  radius: 2.0,
  speed: 4.0,
  intensity: 0.6,
  duration: 2.5,
  noiseScale: 1.0,
  edgeWidth: 0.18,
  emissive: 2.5,

  // Layer toggles (true = visible, false = hidden). On toggle the controller
  // animates the corresponding uniform 0↔1 smoothly.
  splatLayer:  true,
  quadLayer:   false,
  voxelLayer:  false,
  splatSubform: "Gaussian",   // "Gaussian" | "Point"
  pointSize: 0.0025,
  quadSize:  0.0064,
  voxelSize: 0.013,
  fadeTail: 0.9,              // tail-fade duration (s) for one-shot FX

  maskShape: "Sphere",
  maskRadius: 0.6,
  maskSoft: 0.25,
  bodyRadius: 0.5,

  windX: 0.0,
  windY: 0.0,
  windZ: 0.0,
  edgeRagged: 0.6,
  wispAmt:    0.7,
  flyMax:     3.5,
};

const SUBFORM_INDEX = { Gaussian: 0, Point: 1 };
const MASK_SHAPE_INDEX = { Sphere: 0, Cube: 1 };

const EFFECT_INDEX = {
  "Wave & Tint": 0,
  "Dissolve & Reform": 1,
  "Scan Line": 2,
  "Spiral Smear": 3,
};

export function createScanModifier() {
  return dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const shader = new dyno.Dyno({
        inTypes: {
          gsplat:      dyno.Gsplat,
          uTime:       "float",
          uHit:        "vec3",
          uColor:      "vec3",
          uRadius:     "float",
          uSpeed:      "float",
          uIntensity:  "float",
          uEffect:     "int",
          uActive:     "float",
          uDuration:   "float",
          uNoiseScale: "float",
          uEdgeWidth:  "float",
          uEmissive:   "float",
          uSplatSubform: "float",
          uSplatVis:     "float",
          uPointSize:    "float",
          uEffectStrength: "float",
          uMaskActive: "float",
          uMaskCenter: "vec3",
          uMaskRadius: "float",
          uMaskShape:  "int",
          uMaskSoft:   "float",
          uBodyActive: "float",
          uBodyRadius: "float",
          uBodyP0:     "vec3",
          uBodyP1:     "vec3",
          uBodyP2:     "vec3",
          uBodyP3:     "vec3",
          uBodyP4:     "vec3",
          uWindDir:    "vec3",
          uEdgeRagged: "float",
          uWispAmt:    "float",
          uFlyMax:     "float",
        },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [
          dyno.unindent(`
            // ---- Hashing & noise ------------------------------------------
            float hash11(float p) {
              p = fract(p * 0.1031);
              p *= p + 33.33;
              p *= p + p;
              return fract(p);
            }
            vec3 hash33(vec3 p) {
              p = fract(p * vec3(0.1031, 0.1030, 0.0973));
              p += dot(p, p.yxz + 33.33);
              return fract((p.xxy + p.yxx) * p.zyx);
            }

            // Smooth 3D value noise (cheap, plenty of detail for FX)
            float vnoise(vec3 p) {
              vec3 i = floor(p);
              vec3 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              float n000 = hash33(i + vec3(0,0,0)).x;
              float n100 = hash33(i + vec3(1,0,0)).x;
              float n010 = hash33(i + vec3(0,1,0)).x;
              float n110 = hash33(i + vec3(1,1,0)).x;
              float n001 = hash33(i + vec3(0,0,1)).x;
              float n101 = hash33(i + vec3(1,0,1)).x;
              float n011 = hash33(i + vec3(0,1,1)).x;
              float n111 = hash33(i + vec3(1,1,1)).x;
              float x0 = mix(n000, n100, f.x);
              float x1 = mix(n010, n110, f.x);
              float x2 = mix(n001, n101, f.x);
              float x3 = mix(n011, n111, f.x);
              float y0 = mix(x0, x1, f.y);
              float y1 = mix(x2, x3, f.y);
              return mix(y0, y1, f.z);
            }
            // 3-octave fbm — adds the "burn paper" raggedness
            float fbm(vec3 p) {
              float v = 0.0;
              float a = 0.5;
              for (int i = 0; i < 3; i++) {
                v += a * vnoise(p);
                p *= 2.07;
                a *= 0.5;
              }
              return v;
            }
            // Symmetric pulse around center, falls off over width
            float pulse(float x, float center, float width) {
              return smoothstep(width, 0.0, abs(x - center));
            }
            // Smooth edge band: peaks at threshold, falls off in both directions
            float edgeBand(float val, float threshold, float width) {
              return pulse(val, threshold, width);
            }
            // Color helpers
            vec3 toLinear(vec3 c) { return c; } // working in linear-ish already

            // ---- 3D Worley / cellular noise ------------------------------
            // Returns distance to the nearest randomised cell point. Produces
            // organic blob clusters — splats in the same cell get similar
            // values, giving group-coherent variation instead of pure-random.
            float cellular(vec3 p) {
              vec3 i = floor(p);
              vec3 f = fract(p);
              float minDist = 1.0;
              for (int x = -1; x <= 1; x++) {
                for (int y = -1; y <= 1; y++) {
                  for (int z = -1; z <= 1; z++) {
                    vec3 nb   = vec3(float(x), float(y), float(z));
                    vec3 pt   = hash33(i + nb);
                    vec3 diff = nb + pt - f;
                    minDist   = min(minDist, dot(diff, diff));
                  }
                }
              }
              return sqrt(minDist);                // 0 .. ~1.4
            }

            // ---- Quaternion helpers (xyz=axis*sin(θ/2), w=cos(θ/2)) -------
            vec4 quatFromUnit(vec3 d) {
              // Build the shortest-arc quaternion rotating +X onto d (unit).
              vec3 fromV = vec3(1.0, 0.0, 0.0);
              float c = dot(fromV, d);
              if (c < -0.9999) return vec4(0.0, 1.0, 0.0, 0.0);  // 180° around Y
              vec3 ax = cross(fromV, d);
              vec4 q  = vec4(ax, 1.0 + c);
              return q / length(q);
            }
            vec4 quatNlerp(vec4 a, vec4 b, float t) {
              // Sign-aware nlerp — flip b if dot is negative so we take short path
              float d = dot(a, b);
              vec4  bb = d < 0.0 ? -b : b;
              vec4  q  = mix(a, bb, t);
              return q / max(length(q), 1e-6);
            }
          `),
        ],
        statements: ({ inputs, outputs }) =>
          dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            if (${inputs.uActive} >= 0.5) {
              vec3 center  = ${inputs.gsplat}.center;
              vec3 scales  = ${inputs.gsplat}.scales;
              vec4 rgba    = ${inputs.gsplat}.rgba;

              // Per-splat seed — same per frame, varies per splat
              vec3  seed   = ${inputs.gsplat}.center;
              vec3  rand3  = hash33(seed * 17.137);
              float rand1  = rand3.x;
              float rand2  = rand3.y;
              float rand3v = rand3.z;

              // Hit-space coordinates
              vec3  toHit  = center - ${inputs.uHit};
              float dist   = length(toHit);
              vec3  dir    = dist > 1e-5 ? toHit / dist : vec3(0.0, 1.0, 0.0);

              float t      = ${inputs.uTime};
              float tNorm  = clamp(t / max(${inputs.uDuration}, 1e-4), 0.0, 1.0);
              float life   = 1.0 - tNorm;

              // Noise sampled in object space; uNoiseScale tunes chunkiness
              vec3  np     = (center - ${inputs.uHit}) * ${inputs.uNoiseScale};
              float n      = fbm(np * 1.5);                 // 0..1
              float nSigned= n * 2.0 - 1.0;                 // -1..1

              if (${inputs.uEffect} == 0) {
                // ==============================================================
                // Effect 0 — Wave & Tint  (richer ripple, noisy front, RGB shift)
                // ==============================================================
                float reach   = ${inputs.uRadius};
                float ringMask= smoothstep(reach, 0.0, dist);

                // Two superposed waves of different freqs → less monotone
                float phase   = t * ${inputs.uSpeed} - dist * 5.0;
                float wave1   = sin(phase + nSigned * 1.2) * exp(-t * 0.7);
                float wave2   = sin(phase * 1.7 + nSigned * 2.0) * exp(-t * 0.9) * 0.4;
                float wave    = (wave1 + wave2) * ringMask;

                // Position: outward push along radial, plus directional jitter
                vec3 jitter   = (rand3 - 0.5) * 2.0;
                center += dir    * wave * ${inputs.uIntensity} * 0.6;
                center += jitter * wave * ${inputs.uIntensity} * 0.30;

                // RGB chromatic separation — sample wave at phase-shifted distances
                float w_r = sin(phase + 0.6 + nSigned * 1.2) * exp(-t * 0.7) * ringMask;
                float w_g = wave1                                              * ringMask;
                float w_b = sin(phase - 0.6 + nSigned * 1.2) * exp(-t * 0.7) * ringMask;
                vec3 chroma = vec3(pow(abs(w_r), 2.0), pow(abs(w_g), 2.0), pow(abs(w_b), 2.0));

                // Hot crest tint
                vec3 hot = mix(${inputs.uColor}, vec3(1.0), 0.4); // bias toward white at peak
                rgba.rgb = mix(rgba.rgb, ${inputs.uColor}, clamp(chroma.g * 1.4, 0.0, 0.85));
                rgba.rgb += hot * chroma * ${inputs.uEmissive} * 0.45;

                // Subtle "pop" in size on the wave crest
                float pop = clamp(pow(abs(wave), 3.0), 0.0, 1.0);
                scales *= 1.0 + pop * 0.25;

              } else if (${inputs.uEffect} == 1) {
                // ==============================================================
                // Effect 1 — Dissolve & Reform   (the FX-grade rewrite)
                //
                // We define a per-splat "burn coordinate":
                //     b = dist + noise * radius * 0.45
                // and an animated cutoff that sweeps b from 0 → radius and
                // back to 0. Splats whose b ≤ cutoff are "burnt":
                //   • in [cutoff − edge, cutoff]      → edge band (emissive)
                //   • in [0, cutoff − edge)           → dissolved (flying / fading)
                // ==============================================================
                // ----- Noise-warped radius for hair-like ragged boundary -----
                float radiusFx     = ${inputs.uRadius} * 1.4;
                float edgeNoise01  = fbm(seed * 9.0 + vec3(0.13, 0.27, 0.41));
                float edgeBend     = edgeNoise01 * 2.0 - 1.0;                  // -1..1
                float effRadius    = radiusFx * (1.0 + edgeBend * ${inputs.uEdgeRagged} * 0.55);
                float burn         = dist + nSigned * effRadius * 0.45;

                // Sweep: 0..0.5 burn outward, 0.5..1 reform inward
                float p   = tNorm;
                float fwd = smoothstep(0.0, 0.50, p);
                float rev = smoothstep(0.50, 1.0, p);
                float cutoff = mix(0.0, effRadius, fwd) * (1.0 - rev) + mix(effRadius, 0.0, rev) * rev;

                float edgeW  = max(${inputs.uEdgeWidth} * effRadius, 0.001);
                float burnt  = step(burn, cutoff);
                float onEdge = burnt * smoothstep(cutoff - edgeW, cutoff, burn);
                float gone   = burnt * (1.0 - onEdge);

                // ----- Flight trajectory: jitter + global wind direction -----
                vec3 jitter = normalize((rand3 - 0.5) * 2.0 + dir * 0.4 + vec3(0.0, 0.7, 0.0));
                vec3 flyDir = normalize(jitter + ${inputs.uWindDir} * 1.4);

                // Hero particles fly farther — controlled by uFlyMax
                float hero   = step(0.88, rand1);
                float flyMag = ${inputs.uIntensity}
                             * (0.6 + hero * (${inputs.uFlyMax} - 0.6) + rand2 * 0.8);

                float dissolveTime = clamp(
                  (cutoff - burn) / max(effRadius, 1e-4) - rand2 * 0.15, 0.0, 1.0);
                float traj = dissolveTime * (1.0 - rev * rev);

                vec3 fly = flyDir * flyMag * traj;
                // Constant wind drift on dissolved particles (streak push)
                fly += ${inputs.uWindDir} * traj * 0.6 * gone;
                // Subtle vertical wobble
                fly.y += sin(t * 2.0 + rand2 * 6.28) * 0.05 * traj;

                center += fly * gone;
                center += jitter * onEdge * 0.04 * ${inputs.uIntensity};

                // ----- Color / emission -----
                vec3 emit = ${inputs.uColor};
                vec3 edgeColor = mix(emit, vec3(1.0, 0.95, 0.85), 0.35);
                rgba.rgb = mix(rgba.rgb, edgeColor, onEdge);
                rgba.rgb += edgeColor * onEdge * ${inputs.uEmissive};
                rgba.rgb = mix(rgba.rgb, emit, gone * 0.55);

                // ----- Alpha — wispy fbm gives smoke-like density variation
                float wispNoise01 = fbm(seed * 14.0 + vec3(t * 0.4, t * 0.6, 0.0));
                float wispMul     = mix(1.0, wispNoise01 * 1.6, ${inputs.uWispAmt} * gone);

                float alphaCurve = mix(1.0, 0.0, gone * (0.35 + dissolveTime * 0.65) * (1.0 - rev));
                rgba.a *= alphaCurve * wispMul;
                scales *= mix(1.0, 1.45, onEdge);
                scales *= mix(1.0, 0.55, gone * (1.0 - rev) * 0.85);

              } else if (${inputs.uEffect} == 3) {
                // ==============================================================
                // Effect 3 — Spiral Smear
                //
                // A focal point (uHit) holds the subject in place while splats
                // around it orbit and drift outward as iridescent ribbon trails.
                // Outer splats lag behind inner ones (angle ∝ dist) → the band
                // reads as a spiral. Wind direction biases the drift so the
                // whole thing tears off to one side like the painted-flower
                // reference. Per-splat seeded delay & hero factor break the
                // sheet into N independent ribbons.
                //
                // Reused knobs:
                //   uRadius     — outer reach of the swirl
                //   uSpeed      — base rotation speed
                //   uIntensity  — twist amount (angle accumulated per unit dist)
                //   uFlyMax     — trail length along uWindDir
                //   uEmissive   — iridescent rim brightness
                //   uColor      — base tint mixed under the rainbow shift
                // ==============================================================
                // ----- Localised band mask -------------------------------
                // The subject (close to uHit) stays sharp, the far field
                // stays untouched — only splats inside an annulus participate.
                float reach     = ${inputs.uRadius} * 1.6;
                float inner     = ${inputs.uRadius} * 0.50;
                float innerMask = smoothstep(inner * 0.4, inner, dist);  // 0 near hit
                float outerMask = smoothstep(reach, reach * 0.55, dist); // 0 past reach
                float bandMask  = innerMask * outerMask;
                // Roughen the band edge with fbm so it doesn't read as a perfect ring
                bandMask        = clamp(bandMask + (n - 0.5) * 0.35 * ${inputs.uEdgeRagged}, 0.0, 1.0);

                // ----- Directional bias: only the wind side smears -------
                float windLen   = length(${inputs.uWindDir});
                float windBias  = 1.0;
                if (windLen > 1e-3) {
                  float align   = dot(dir, ${inputs.uWindDir} / windLen);   // -1..1
                  windBias      = pow(max(align, 0.0), 0.7);                // 0..1, sharper on aligned side
                  windBias      = mix(0.10, 1.0, windBias);                 // keep a sliver everywhere
                }
                float fxMask    = bandMask * windBias;

                // ----- Per-splat noise variation -------------------------
                // Cellular noise groups nearby splats into "blobs" that share
                // a trail-length multiplier — some clusters fly far, others
                // barely move. Animated fbm adds an in-flight curl so each
                // ribbon wobbles independently instead of moving as a sheet.
                float cell      = cellular(seed * 0.55);                // 0..~1.4
                float cellNorm  = clamp(cell / 1.2, 0.0, 1.0);
                float curlA     = fbm(seed * 1.8 + vec3(${inputs.uTime} * 0.45, 0.0, 0.0)) - 0.5;
                float curlB     = fbm(seed * 1.8 + vec3(0.0, ${inputs.uTime} * 0.45, 5.7)) - 0.5;
                float curlC     = fbm(seed * 1.8 + vec3(2.3, 0.0, ${inputs.uTime} * 0.45)) - 0.5;
                vec3  curlVec   = vec3(curlA, curlB, curlC) * 2.0;       // -1..1 per axis

                // Per-splat staggered start → fans out into separate ribbons.
                float delay     = rand1 * 0.35;
                float a         = clamp((tNorm - delay) / max(1.0 - delay, 1e-4), 0.0, 1.0);
                float strength  = pow(a, 0.6) * (1.0 - pow(1.0 - a, 4.0));

                // Spiral angle: time-base + per-splat phase + radius twist
                // + curl perturbation so the orbit is non-uniform.
                float ang = ${inputs.uTime} * ${inputs.uSpeed} * 0.45
                          + dist * ${inputs.uIntensity} * 1.4
                          + rand2 * 0.6
                          + curlA * 1.8;
                float cs  = cos(ang * strength);
                float sn  = sin(ang * strength);
                // Rotate the splat offset around the world-up axis through uHit.
                vec3 r   = toHit;
                vec3 rRot = vec3(r.x * cs - r.z * sn, r.y, r.x * sn + r.z * cs);

                // Hero particles ride farther along the wind direction; cell
                // noise gives clustered "hero blobs" instead of random ones.
                float hero  = step(0.80, rand1);
                float cellBoost = mix(0.4, 1.6, cellNorm);               // 0.4..1.6
                float trail = ${inputs.uFlyMax}
                            * (0.20 + hero * 0.55 + rand2 * 0.30)
                            * cellBoost;
                vec3  drift = ${inputs.uWindDir} * dist * trail * 0.18 * strength;
                // Curl pushes the drift laterally so paths aren't straight.
                drift += curlVec * dist * 0.10 * strength;
                // Tiny vertical wobble for life
                drift.y += sin(${inputs.uTime} * 3.0 + rand2 * 6.28) * 0.04 * strength;

                // Mix between original offset and transformed offset by fxMask.
                // Splats outside the band keep their original world position.
                vec3 newOffset = mix(r, rRot + drift, fxMask);
                center = ${inputs.uHit} + newOffset;

                // ===== Mild streak via bounded scale change =================
                // Gaussian splats render via a covariance ellipsoid built from
                // (quaternion, scales). Setting scales to a large world-meter
                // value or rotating the quaternion away from the trained
                // covariance makes the gaussian "vanish" (the ellipsoid spans
                // so many pixels its per-pixel alpha drops below visible).
                //
                // So we keep the quaternion alone and clamp the scale change
                // to a SMALL multiplier of the splat's own size — the trail
                // illusion comes mostly from displacement, not from
                // anisotropic stretching.
                vec3 disp      = newOffset - r;
                float dispLen  = length(disp);
                float trailMix = fxMask * strength;

                vec3  srcScales = ${inputs.gsplat}.scales;
                float baseThick = max((srcScales.x + srcScales.y + srcScales.z) / 3.0, 1e-4);

                // Stretch factor 0..2 — translates "how far the splat moved"
                // into a bounded multiplier of its own size.
                float reachRef    = max(${inputs.uRadius}, 0.5);
                float stretchAmt  = clamp(dispLen / reachRef, 0.0, 1.0) * 2.0;
                // Lengthen one axis modestly, thin the others slightly.
                vec3  streakScales = srcScales * vec3(1.0 + stretchAmt, mix(1.0, 0.75, stretchAmt * 0.5), mix(1.0, 0.75, stretchAmt * 0.5));
                scales = mix(srcScales, streakScales, trailMix);

                // Tip of long streaks fades a little so trails feather out.
                rgba.a *= mix(1.0, 0.75, trailMix * 0.4);

                // NOTE: per-splat colour is intentionally NOT modified — every
                // splat carries its source RGB so the smear looks like the
                // subject's own material flowing.

              } else {
                // ==============================================================
                // Effect 2 — Scan Line  (double ring, noise breakup, afterglow)
                // ==============================================================
                float reach    = ${inputs.uRadius};
                float waveFront= t * ${inputs.uSpeed};

                // Noise breaks the ring up — splats slightly ahead/behind the front
                float effDist  = dist + nSigned * reach * 0.10;

                float lineW    = max(reach * 0.06, 0.04);
                float ringA    = pulse(effDist, waveFront,             lineW);            // primary
                float ringB    = pulse(effDist, waveFront - lineW*2.5, lineW * 0.7) * 0.6;// trailing
                float ring     = ringA + ringB;

                // Afterglow — splats behind the front retain a fading tint
                float behind   = smoothstep(waveFront, waveFront - reach * 0.9, effDist);
                float afterGlow= behind * life * 0.45;

                float reachMsk = smoothstep(reach * 1.3, 0.0, dist);
                float scan     = ring * reachMsk;

                // Position pop on the ring; very small
                vec3 jitter  = (rand3 - 0.5) * 2.0;
                center += dir    * scan * ${inputs.uIntensity} * 0.18;
                center += jitter * scan * ${inputs.uIntensity} * 0.10;

                // Emissive ring with hot-white core
                vec3 hot = mix(${inputs.uColor}, vec3(1.0), 0.6);
                rgba.rgb = mix(rgba.rgb, ${inputs.uColor}, clamp(afterGlow + scan * 0.4, 0.0, 0.95));
                rgba.rgb += hot * scan * ${inputs.uEmissive};

                // Ring splats puff briefly
                scales *= 1.0 + scan * 0.5;
              }

              ${outputs.gsplat}.center = center;
              ${outputs.gsplat}.scales = scales;
              ${outputs.gsplat}.rgba   = rgba;
            }

            // ================================================================
            // Soft fade-out gate — smooth blend between the original splat
            // and whatever the effect produced. Lets the controller ramp
            // strength 1→0 over a tail period instead of snapping off.
            // ================================================================
            {
              float s = clamp(${inputs.uEffectStrength}, 0.0, 1.0);
              ${outputs.gsplat}.center = mix(${inputs.gsplat}.center, ${outputs.gsplat}.center, s);
              ${outputs.gsplat}.scales = mix(${inputs.gsplat}.scales, ${outputs.gsplat}.scales, s);
              ${outputs.gsplat}.rgba   = mix(${inputs.gsplat}.rgba,   ${outputs.gsplat}.rgba,   s);
            }

            // ================================================================
            // Splat sub-form + layer visibility.
            //
            //   uSplatSubform = 0 → Gaussian (leave scales unchanged)
            //                 = 1 → Point    (collapse scales to uPointSize)
            //   uSplatVis     → multiplies final splat alpha (0 = invisible)
            //
            // Mask reveal (palm / body): inside the mask region, sub-form is
            // inverted — i.e. a "hole" of Gaussians in a Point-form scene or
            // vice-versa.
            // ================================================================
            float maskMix = 0.0;
            float soft = max(${inputs.uMaskSoft}, 0.001);
            if (${inputs.uMaskActive} > 0.5) {
              vec3 d = ${outputs.gsplat}.center - ${inputs.uMaskCenter};
              float mDist = (${inputs.uMaskShape} == 1)
                ? max(abs(d.x), max(abs(d.y), abs(d.z)))
                : length(d);
              float r0 = ${inputs.uMaskRadius} * (1.0 - soft);
              float r1 = ${inputs.uMaskRadius};
              maskMix = 1.0 - smoothstep(r0, r1, mDist);
            }
            if (${inputs.uBodyActive} > 0.5) {
              float br0 = ${inputs.uBodyRadius} * (1.0 - soft);
              float br1 = ${inputs.uBodyRadius};
              vec3 c = ${outputs.gsplat}.center;
              float dMin = length(c - ${inputs.uBodyP0});
              dMin = min(dMin, length(c - ${inputs.uBodyP1}));
              dMin = min(dMin, length(c - ${inputs.uBodyP2}));
              dMin = min(dMin, length(c - ${inputs.uBodyP3}));
              dMin = min(dMin, length(c - ${inputs.uBodyP4}));
              maskMix = max(maskMix, 1.0 - smoothstep(br0, br1, dMin));
            }

            // Effective sub-form per splat: invert inside the mask.
            //   Gaussian (0) inverted → Point (1), and vice-versa.
            //   Smooth blend: subform value in [0, 1] for soft mask edges.
            float baseSubform = clamp(${inputs.uSplatSubform}, 0.0, 1.0);
            float effSubform  = mix(baseSubform, 1.0 - baseSubform, maskMix);

            // Apply Point shrink proportional to effSubform
            if (effSubform > 0.001) {
              vec3 dotScale = vec3(${inputs.uPointSize});
              ${outputs.gsplat}.scales =
                mix(${outputs.gsplat}.scales, dotScale, effSubform);
              // Boost alpha so the dots stay legible against the dark background
              vec4 rr = ${outputs.gsplat}.rgba;
              rr.a = mix(rr.a, max(rr.a, 0.92), effSubform);
              ${outputs.gsplat}.rgba = rr;
            }

            // Layer visibility — gate the whole splat layer.
            ${outputs.gsplat}.rgba.a *= clamp(${inputs.uSplatVis}, 0.0, 1.0);
          `),
      });

      return {
        gsplat: shader.apply({
          gsplat,
          uTime:       uniforms.time,
          uHit:        uniforms.hit,
          uColor:      uniforms.color,
          uRadius:     uniforms.radius,
          uSpeed:      uniforms.speed,
          uIntensity:  uniforms.intensity,
          uEffect:     uniforms.effect,
          uActive:     uniforms.active,
          uDuration:   uniforms.duration,
          uNoiseScale: uniforms.noiseScale,
          uEdgeWidth:  uniforms.edgeWidth,
          uEmissive:   uniforms.emissive,
          uSplatSubform: uniforms.splatSubform,
          uSplatVis:     uniforms.splatVis,
          uPointSize:    uniforms.pointSize,
          uEffectStrength: uniforms.effectStrength,
          uMaskActive: uniforms.maskActive,
          uMaskCenter: uniforms.maskCenter,
          uMaskRadius: uniforms.maskRadius,
          uMaskShape:  uniforms.maskShape,
          uMaskSoft:   uniforms.maskSoft,
          uBodyActive: uniforms.bodyActive,
          uBodyRadius: uniforms.bodyRadius,
          uBodyP0:     uniforms.bodyP0,
          uBodyP1:     uniforms.bodyP1,
          uBodyP2:     uniforms.bodyP2,
          uBodyP3:     uniforms.bodyP3,
          uBodyP4:     uniforms.bodyP4,
          uWindDir:    uniforms.windDir,
          uEdgeRagged: uniforms.edgeRagged,
          uWispAmt:    uniforms.wispAmt,
          uFlyMax:     uniforms.flyMax,
        }).gsplat,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export class EffectController {
  constructor(splatMesh) {
    this.mesh = splatMesh;
    this.timeCounter = 0;
    this.activeTimer = 0;
    this.continuous   = false;
    this.targetHit    = new THREE.Vector3();
    this.smoothedHit  = new THREE.Vector3();
    this.hitSeeded    = false;
    this.hitLerpRate  = 14;

    // Layer visibility animation: each layer's uniform value lerps toward
    // its target (driven by checkbox toggle in the GUI). 1/s — frame-rate
    // independent via exp-decay in update().
    this.visTransitionRate = 1.2;
    this.targetVis = {
      splat: params.splatLayer ? 1.0 : 0.0,
      quad:  params.quadLayer  ? 1.0 : 0.0,
      voxel: params.voxelLayer ? 1.0 : 0.0,
    };

    // Gaussian ↔ Point sub-form lerp. Toggling sets targetSubform to 0 or 1;
    // update() exp-decays the uniform toward it for a smooth shape morph.
    this.targetSubform     = SUBFORM_INDEX[params.splatSubform] ?? 0;
    this.subformLerpRate   = 1.2;
    uniforms.splatSubform.value = this.targetSubform;
    // Seed uniforms to match targets so we don't fade in unnecessarily on load.
    uniforms.splatVis.value = this.targetVis.splat;
    uniforms.quadVis.value  = this.targetVis.quad;
    uniforms.voxelVis.value = this.targetVis.voxel;

    this.fadeTailS = params.fadeTail;
    this.applyParams();
  }
  applyParams() {
    uniforms.effect.value     = EFFECT_INDEX[params.effect] ?? 0;
    uniforms.radius.value     = params.radius;
    uniforms.speed.value      = params.speed;
    uniforms.intensity.value  = params.intensity;
    uniforms.duration.value   = params.duration;
    uniforms.noiseScale.value = params.noiseScale;
    uniforms.edgeWidth.value  = params.edgeWidth;
    uniforms.emissive.value   = params.emissive;
    // Just retarget; the per-frame lerp in update() handles the morph.
    this.targetSubform = SUBFORM_INDEX[params.splatSubform] ?? 0;
    uniforms.pointSize.value  = params.pointSize;
    // Mirror size values into uniforms so downstream consumers (Voxelizer /
    // Quadizer construction) have a single source of truth.
    uniforms.quadSize.value   = params.quadSize;
    uniforms.voxelSize.value  = params.voxelSize;
    uniforms.maskShape.value  = MASK_SHAPE_INDEX[params.maskShape] ?? 0;
    uniforms.maskRadius.value = params.maskRadius;
    uniforms.maskSoft.value   = params.maskSoft;
    uniforms.bodyRadius.value = params.bodyRadius;
    uniforms.windDir.value.set(params.windX, params.windY, params.windZ);
    uniforms.edgeRagged.value = params.edgeRagged;
    uniforms.wispAmt.value    = params.wispAmt;
    uniforms.flyMax.value     = params.flyMax;
    const c = new THREE.Color(params.color);
    uniforms.color.value.set(c.r, c.g, c.b);
    this.mesh?.updateVersion();
  }

  // Layer visibility — animate via the rAF loop. layer: "splat"|"quad"|"voxel".
  setLayerVis(layer, on) {
    if (!(layer in this.targetVis)) return;
    this.targetVis[layer] = on ? 1.0 : 0.0;
  }

  // Move the reveal mask to a new object-space center; pass null/undefined to disable.
  setMaskCenter(localPoint) {
    if (localPoint) {
      uniforms.maskCenter.value.copy(localPoint);
      uniforms.maskActive.value = 1.0;
    } else {
      uniforms.maskActive.value = 0.0;
    }
    this.mesh?.updateVersion();
  }

  // Body-silhouette mask: pass {head, lhand, rhand, lfoot, rfoot} as object-space
  // THREE.Vector3 (or null/undefined to disable).
  setBodyPoints(pts) {
    if (!pts) {
      uniforms.bodyActive.value = 0.0;
    } else {
      uniforms.bodyP0.value.copy(pts.head);
      uniforms.bodyP1.value.copy(pts.lhand);
      uniforms.bodyP2.value.copy(pts.rhand);
      uniforms.bodyP3.value.copy(pts.lfoot);
      uniforms.bodyP4.value.copy(pts.rfoot);
      uniforms.bodyActive.value = 1.0;
    }
    this.mesh?.updateVersion();
  }

  // Discrete one-shot (used by mouse click)
  triggerAt(localPoint) {
    uniforms.hit.value.copy(localPoint);
    uniforms.active.value = 1.0;
    uniforms.effectStrength.value = 1.0;
    this.timeCounter = 0.0;
    this.activeTimer = params.duration + this.fadeTailS;
    this.continuous = false;
  }
  // Continuous "brush" — call as often as you have a hit (raycast result).
  // Updates targetHit only; the smoothing + time loop happen in update().
  brushAt(localPoint) {
    this.targetHit.copy(localPoint);
    if (!this.hitSeeded || !this.continuous) {
      this.smoothedHit.copy(localPoint);
      uniforms.hit.value.copy(localPoint);
      this.hitSeeded = true;
    }
    uniforms.active.value = 1.0;
    uniforms.effectStrength.value = 1.0;
    this.continuous = true;
  }
  // Source went away — enter the tail fade (smooth 1→0) instead of cutting
  releaseBrush() {
    if (!this.continuous) return;
    this.continuous = false;
    this.activeTimer = this.fadeTailS;
  }
  update(dt) {
    // ---- Animate layer visibility (independent of FX state) -------------
    {
      let dirty = false;
      const layers = [
        ["splat", uniforms.splatVis],
        ["quad",  uniforms.quadVis],
        ["voxel", uniforms.voxelVis],
      ];
      const k = 1 - Math.exp(-this.visTransitionRate * dt);
      for (const [name, u] of layers) {
        const target = this.targetVis[name];
        if (Math.abs(u.value - target) > 1e-4) {
          u.value += (target - u.value) * k;
          dirty = true;
        }
      }
      if (dirty) this.mesh.updateVersion();
    }

    // ---- Gaussian ↔ Point sub-form lerp (independent of FX state) -------
    {
      const u = uniforms.splatSubform;
      if (Math.abs(u.value - this.targetSubform) > 1e-4) {
        const k = 1 - Math.exp(-this.subformLerpRate * dt);
        u.value += (this.targetSubform - u.value) * k;
        this.mesh?.updateVersion();
      }
    }

    if (uniforms.active.value < 0.5) return;
    this.timeCounter += dt;

    if (this.continuous) {
      // Smooth hit toward latest target — kills jitter from discrete raycast updates
      const k = 1 - Math.exp(-this.hitLerpRate * dt);
      this.smoothedHit.lerp(this.targetHit, k);
      uniforms.hit.value.copy(this.smoothedHit);

      const dur = Math.max(uniforms.duration.value, 0.1);
      if (this.timeCounter >= dur) this.timeCounter -= dur; // loop
      uniforms.time.value = this.timeCounter;
      uniforms.effectStrength.value = 1.0;
    } else {
      // One-shot / brush-release tail. We let `time` keep advancing so the
      // animation continues to play out, but we ramp `effectStrength` 1→0
      // during the last fadeTailS seconds so splats blend back smoothly.
      this.activeTimer -= dt;
      uniforms.time.value = this.timeCounter;

      const tail = this.fadeTailS;
      if (this.activeTimer < tail && tail > 1e-4) {
        const tNorm = Math.max(0, this.activeTimer / tail);     // 1 → 0 over tail
        // smoothstep curve for a creamy ease-out
        uniforms.effectStrength.value = tNorm * tNorm * (3.0 - 2.0 * tNorm);
      } else {
        uniforms.effectStrength.value = 1.0;
      }

      if (this.activeTimer <= 0.0) {
        uniforms.active.value         = 0.0;
        uniforms.effectStrength.value = 0.0;
        uniforms.time.value           = 0.0;
        this.hitSeeded                = false;
      }
    }
    this.mesh.updateVersion();
  }
}

// ---------------------------------------------------------------------------
// GUI — grouped for the FX-style param surface
// ---------------------------------------------------------------------------
const PRESETS = {
  "Cyan Plasma":    { effect: "Wave & Tint",        color: "#00e0ff", radius: 2.5, speed: 6.0, intensity: 0.7, duration: 2.2, noiseScale: 1.0, edgeWidth: 0.18, emissive: 2.5, edgeRagged: 0.4, wispAmt: 0.5, flyMax: 2.0, windX: 0,    windY: 0,   windZ: 0 },
  "Magenta Burn":   { effect: "Dissolve & Reform",  color: "#ff3aa9", radius: 2.0, speed: 4.0, intensity: 1.0, duration: 3.2, noiseScale: 0.8, edgeWidth: 0.22, emissive: 3.5, edgeRagged: 0.7, wispAmt: 0.7, flyMax: 3.5, windX: 0,    windY: 0,   windZ: 0 },
  "Hot Embers":     { effect: "Dissolve & Reform",  color: "#ff8a1a", radius: 2.5, speed: 4.0, intensity: 1.4, duration: 3.8, noiseScale: 1.4, edgeWidth: 0.30, emissive: 4.0, edgeRagged: 0.9, wispAmt: 0.9, flyMax: 5.0, windX: 0,    windY: 0.3, windZ: 0 },
  "Hair Spray":     { effect: "Dissolve & Reform",  color: "#f4d3c8", radius: 1.6, speed: 4.0, intensity: 1.5, duration: 4.5, noiseScale: 1.6, edgeWidth: 0.35, emissive: 1.8, edgeRagged: 1.1, wispAmt: 1.2, flyMax: 6.0, windX: -0.9, windY: 0.4, windZ: 0 },
  "Tron Sweep":     { effect: "Scan Line",          color: "#7ef0ff", radius: 3.5, speed: 7.0, intensity: 0.6, duration: 2.0, noiseScale: 0.6, edgeWidth: 0.10, emissive: 3.2, edgeRagged: 0.3, wispAmt: 0.2, flyMax: 2.0, windX: 0,    windY: 0,   windZ: 0 },
  "Toxic Pulse":    { effect: "Wave & Tint",        color: "#9eff3a", radius: 3.0, speed: 8.0, intensity: 0.5, duration: 1.8, noiseScale: 1.2, edgeWidth: 0.15, emissive: 3.0, edgeRagged: 0.4, wispAmt: 0.4, flyMax: 2.0, windX: 0,    windY: 0,   windZ: 0 },
  "Iris Spiral":    { effect: "Spiral Smear",       color: "#ff7fc8", radius: 3.0, speed: 5.0, intensity: 1.4, duration: 3.6, noiseScale: 1.0, edgeWidth: 0.18, emissive: 2.8, edgeRagged: 0.5, wispAmt: 0.7, flyMax: 4.0, windX: 1.0,  windY: 0,   windZ: 0 },
  "Vortex Drift":   { effect: "Spiral Smear",       color: "#9dd8ff", radius: 4.0, speed: 3.5, intensity: 2.0, duration: 4.5, noiseScale: 1.0, edgeWidth: 0.18, emissive: 2.0, edgeRagged: 0.5, wispAmt: 0.6, flyMax: 6.0, windX: 0.6,  windY: 0.2, windZ: -0.4 },
};

export function buildGUI(controller) {
  const gui = new GUI({ title: "Scan Effect" });

  const presetKeys = Object.keys(PRESETS);
  const presetObj = { preset: presetKeys[0] };

  // ----- Top-level: 3DGS / USD (formerly "Layers") -------------------------
  // Kept OUT of Customize so the data-source / instancer choices are visually
  // distinct from styling controls.
  const fLayers = gui.addFolder("3DGS/USD");

  // ----- Top-level: Customize → everything visual --------------------------
  const fCustomize = gui.addFolder("Customize");

  // FX section — all click-effect controls grouped to reduce confusion.
  const fFX = fCustomize.addFolder("FX");
  fFX.add(presetObj, "preset", presetKeys).name("Preset").onChange((name) => {
    Object.assign(params, PRESETS[name]);
    controller.applyParams();
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  });

  const fCore = fFX.addFolder("Core");
  fCore.add(params, "effect", Object.keys(EFFECT_INDEX)).name("Effect").onChange(() => controller.applyParams());
  fCore.addColor(params, "color").name("Color").onChange(() => controller.applyParams());
  fCore.add(params, "radius",    0.1, 10.0, 0.05).name("Radius").onChange(() => controller.applyParams());
  fCore.add(params, "duration",  0.3,  8.0, 0.1 ).name("Duration (s)").onChange(() => controller.applyParams());
  fCore.add(params, "intensity", 0.0,  3.0, 0.01).name("Intensity").onChange(() => controller.applyParams());

  const fStyle = fFX.addFolder("Style").close();
  fStyle.add(params, "speed",      0.1, 20.0, 0.1 ).name("Speed / Freq").onChange(() => controller.applyParams());
  fStyle.add(params, "noiseScale", 0.1,  5.0, 0.05).name("Noise Scale").onChange(() => controller.applyParams());
  fStyle.add(params, "edgeWidth",  0.02, 0.6, 0.01).name("Edge Width").onChange(() => controller.applyParams());
  fStyle.add(params, "emissive",   0.0,  8.0, 0.05).name("Emissive Boost").onChange(() => controller.applyParams());
  fStyle.add(params, "fadeTail",   0.0,  3.0, 0.05).name("Fade Tail (s)").onChange(() => {
    controller.fadeTailS = params.fadeTail;
  });

  // ---- Dissolve-specific FX knobs (also bias Wave a bit) ----
  const fDis = fFX.addFolder("Dissolve FX").close();
  fDis.add(params, "edgeRagged", 0.0, 1.5, 0.01).name("Edge Ragged").onChange(() => controller.applyParams());
  fDis.add(params, "wispAmt",    0.0, 1.5, 0.01).name("Wisp Alpha").onChange(() => controller.applyParams());
  fDis.add(params, "flyMax",     0.5, 8.0, 0.05).name("Hero Fly Max").onChange(() => controller.applyParams());
  fDis.add(params, "windX",     -2.0, 2.0, 0.02).name("Wind X").onChange(() => controller.applyParams());
  fDis.add(params, "windY",     -2.0, 2.0, 0.02).name("Wind Y").onChange(() => controller.applyParams());
  fDis.add(params, "windZ",     -2.0, 2.0, 0.02).name("Wind Z").onChange(() => controller.applyParams());

  fFX.add({
    test: () => { controller.triggerAt(uniforms.hit.value); },
  }, "test").name("▶ Replay at last hit");
  fLayers.add(params, "splatLayer").name("Splat")
    .onChange((v) => controller.setLayerVis("splat", v));
  // Splat sub-form: segmented Gaussian / Point toggle. Lil-gui's select is
  // too hidden — render a button group inline so it sits visually under the
  // Splat checkbox.
  const subformRow = document.createElement("div");
  subformRow.className = "subform-toggle";
  // Each cell wraps a button + a hover-popover explaining what that sub-form
  // is (data source / training pipeline / per-splat data). Tooltips are
  // portalled into <body> below to escape lil-gui's panel transform.
  subformRow.innerHTML = `
    <span class="subform-cell"><button data-val="Gaussian">Gaussian</button></span>
    <span class="subform-cell"><button data-val="Point">Point</button></span>
  `;
  // Portalled tooltips
  const SUBFORM_TIPS = {
    Gaussian: `<div class="k">SOURCE</div><div class="v">Unreal Engine capture</div>
               <div class="k">TRAIN</div><div class="v">Postshot</div>
               <div class="k">SHAPE</div><div class="v">3D anisotropic Gaussian</div>
               <div class="k">DATA</div><div class="v">RGB · scales · quaternion · alpha</div>`,
    Point:    `<div class="k">SOURCE</div><div class="v">Gaussian centres collapsed</div>
               <div class="k">SHAPE</div><div class="v">isotropic point</div>
               <div class="k">SIZE</div><div class="v">uniform — set by "Point Size"</div>
               <div class="k">USE</div><div class="v">raw structure / sparse view</div>`,
  };
  subformRow.querySelectorAll(".subform-cell").forEach(cell => {
    const val = cell.querySelector("button")?.dataset.val;
    const tip = document.createElement("div");
    tip.className = "subform-tip";
    tip.innerHTML = SUBFORM_TIPS[val] || "";
    document.body.appendChild(tip);
    cell._tip = tip;
  });
  const subformSync = () => {
    subformRow.querySelectorAll("button").forEach(b =>
      b.classList.toggle("active", b.dataset.val === params.splatSubform));
  };
  subformRow.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      params.splatSubform = b.dataset.val;
      controller.applyParams();
      subformSync();
    });
  });
  subformSync();
  // Inject after the Splat checkbox row inside the Layers folder.
  const splatRow = fLayers.controllers[fLayers.controllers.length - 1].domElement;
  splatRow.insertAdjacentElement("afterend", subformRow);
  fLayers.add(params, "pointSize",  0.0005, 0.05,  0.0005).name("Point Size")
    .onChange(() => controller.applyParams());

  const quadCtrl = fLayers.add(params, "quadLayer").name("Quad")
    .onChange((v) => controller.setLayerVis("quad", v));
  fLayers.add(params, "quadSize",   0.0001, 0.05,  0.0001).name("Quad Size")
    .onChange(() => controller.applyParams());

  const voxelCtrl = fLayers.add(params, "voxelLayer").name("Voxel")
    .onChange((v) => controller.setLayerVis("voxel", v));
  fLayers.add(params, "voxelSize",  0.0005, 0.40,  0.0005).name("Voxel Size")
    .onChange(() => controller.applyParams());

  // ---- USD spec badges on the Quad / Voxel rows ---------------------------
  // Both layers are conceptually USD PointInstancer overlays — one prototype
  // per layer (Plane for Quad, Cube for Voxel). The badge is a tiny inline
  // tag; hovering opens a styled popover with a short OpenUSD primer and a
  // "Read more" link that jumps to openusd.org.
  const USD_DOCS_URL = "https://openusd.org/release/api/class_usd_geom_point_instancer.html";
  const attachUsdBadge = (ctrl, proto) => {
    const nameEl = ctrl.domElement.querySelector(".name");
    if (!nameEl) return;

    const wrap = document.createElement("span");
    wrap.className = "usd-spec-wrap";

    const badge = document.createElement("span");
    badge.className = "usd-spec";
    badge.textContent = `PointInstancer › ${proto}`;
    wrap.appendChild(badge);

    const tip = document.createElement("div");
    tip.className = "usd-tooltip";
    tip.innerHTML =
      `<div class="k">SCHEMA</div><div class="v">UsdGeomPointInstancer</div>` +
      `<div class="k">PROTO</div><div class="v">UsdGeom${proto}</div>` +
      `<div class="k">ATTRS</div><div class="v">positions, orientations, scales</div>` +
      `<div class="k">COLOR</div><div class="v">primvars:displayColor (vertex)</div>` +
      `<div class="k">DOCS</div><div class="v">` +
        `<a class="t-link" href="${USD_DOCS_URL}" target="_blank" rel="noopener noreferrer">openusd.org →</a>` +
      `</div>`;
    // Portal the tooltip to <body> so position:fixed isn't broken by
    // lil-gui's transform. JS toggles a .show class on hover.
    document.body.appendChild(tip);
    wrap._tip = tip;
    nameEl.appendChild(wrap);
  };
  attachUsdBadge(quadCtrl,  "Plane");
  attachUsdBadge(voxelCtrl, "Cube");

  // ---- Hover-tooltip wiring (body-portalled, viewport-clamped) -----------
  // lil-gui panels use CSS transforms which break `position: fixed` on any
  // descendant (it gets positioned relative to the transformed ancestor
  // instead of the viewport, landing off-screen). To work around that we
  // moved the tooltips into <body>, and toggle a .show class on hover.
  function pinPopover(wrap, tip) {
    const wr   = wrap.getBoundingClientRect();
    const tipW = tip.offsetWidth  || 240;
    const tipH = tip.offsetHeight || 80;
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    const pad  = 8;
    let left = wr.left;                       // align to trigger's left
    let top  = wr.top - tipH - pad;            // default: above the trigger
    if (left + tipW > vw - pad) left = vw - pad - tipW;
    if (left < pad) left = pad;
    if (top  < pad) top  = wr.bottom + pad;    // not enough room above → below
    if (top + tipH > vh - pad) top = Math.max(pad, vh - pad - tipH);
    tip.style.left = `${left}px`;
    tip.style.top  = `${top}px`;
  }
  function installPopover(wrap, tip) {
    if (!wrap || !tip) return;
    const show = () => {
      pinPopover(wrap, tip);
      // Inline styles guarantee win regardless of CSS cascade quirks
      tip.style.opacity        = "1";
      tip.style.visibility     = "visible";
      tip.style.pointerEvents  = "auto";
      tip.classList.add("show");
    };
    const hide = () => {
      tip.style.opacity        = "0";
      tip.style.visibility     = "hidden";
      tip.style.pointerEvents  = "none";
      tip.classList.remove("show");
    };
    wrap.addEventListener("mouseenter", show);
    wrap.addEventListener("mouseleave", hide);
    tip .addEventListener("mouseleave", hide);
  }
  gui.domElement.querySelectorAll(".usd-spec-wrap").forEach(w => installPopover(w, w._tip));
  gui.domElement.querySelectorAll(".subform-cell" ).forEach(w => installPopover(w, w._tip));

  // ---- Reveal Mask — temporarily disabled in the UI -----------------------
  // The mask uniforms still exist for the shader but the GUI surface is
  // hidden so the user isn't confused by knobs that aren't being used right
  // now. Force the mask off as well so any stale hand-tracking state can't
  // bleed through.
  uniforms.maskActive.value = 0.0;
  uniforms.bodyActive.value = 0.0;

  // Expose folder refs so postfx.attachGUI / main.js can place their
  // controls inside the right parents (Customize / FX / 3DGS-USD).
  gui.fCustomize = fCustomize;
  gui.fFX        = fFX;
  gui.fLayers    = fLayers;

  return gui;
}

import * as THREE from "three";
import { EffectComposer }   from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass }       from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass }       from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass }  from "three/addons/postprocessing/UnrealBloomPass.js";

// ---------------------------------------------------------------------------
// Kaleidoscope post-process — Kusama-style mirrored repetition.
//
// Algorithm (screen space, per pixel):
//   1. Compute polar coords (r, θ) from screen center, aspect-corrected.
//   2. Fold θ into a wedge of size 2π / N where N is the segment count.
//   3. Mirror within the wedge so adjacent wedges are reflections.
//   4. Re-cartesianize → sample the source texture.
//   5. Sample coords outside [0,1] use mirrored-repeat for endless tiling.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// "Polish" pass — Sketchfab-style finishing effects all in one shader so we
// don't pay the cost of N composer passes. Vignette + chromatic aberration +
// film grain + colour (exposure/contrast/saturation) + tone mapping.
// Each effect has its own enable / amount uniform.
// ---------------------------------------------------------------------------
const PolishShader = {
  uniforms: {
    tDiffuse:        { value: null },
    uTime:           { value: 0.0 },

    // Lens distortion (After-Effects "Optics Compensation" style)
    uLensOn:         { value: 0.0 },
    uLensAmt:        { value: 0.20 },   // + barrel, - pincushion
    uLensZoom:       { value: 1.00 },   // re-zoom to compensate for shrink
    uLensDispersion: { value: 0.0 },    // per-channel warp = lens chromatic
    uLensCenterX:    { value: 0.5 },    // optical centre (0..1 screen UV)
    uLensCenterY:    { value: 0.5 },
    uLensSqueeze:    { value: 1.0 },    // anamorphic Y scale (>1 = horiz-stretch)
    uLensFisheye:    { value: 0.0 },    // 0 = polynomial, 1 = sphere-projection
    uLensFOV:        { value: 1.0 },    // strength of the sphere warp (fisheye mode)

    // Vignette
    uVignetteOn:     { value: 0.0 },
    uVignetteAmt:    { value: 1.0 },
    uVignetteSoft:   { value: 0.6 },

    // Chromatic aberration (screen-space radial RGB split)
    uChromaOn:       { value: 0.0 },
    uChromaAmt:      { value: 0.0035 },

    // Film grain
    uGrainOn:        { value: 0.0 },
    uGrainAmt:       { value: 0.08 },

    // Colour
    uExposure:       { value: 1.0 },
    uContrast:       { value: 1.0 },
    uSaturation:     { value: 1.0 },

    // Tone-mapping: 0 None, 1 Reinhard, 2 Cineon, 3 ACES
    uTonemap:        { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uLensOn, uLensAmt, uLensZoom, uLensDispersion;
    uniform float uLensCenterX, uLensCenterY, uLensSqueeze, uLensFisheye, uLensFOV;
    uniform float uVignetteOn, uVignetteAmt, uVignetteSoft;
    uniform float uChromaOn,   uChromaAmt;
    uniform float uGrainOn,    uGrainAmt;
    uniform float uExposure, uContrast, uSaturation;
    uniform int   uTonemap;
    varying vec2 vUv;

    // Lens warp with two modes:
    //   • Polynomial (default) — barrel/pincushion via k * r² + k·0.35 * r⁴
    //   • Fisheye (uLensFisheye > 0) — blend in a sphere-projection curve so
    //     the corners bend like a real fisheye lens at high FOV.
    // 'extra' tweaks curvature per RGB channel (prism FX).
    // 'uLensCenterX/Y' move the optical centre; 'uLensSqueeze' Y-scales pre-warp
    // for anamorphic stretch.
    vec2 lensWarp(vec2 uv, float extra) {
      vec2 centre = vec2(uLensCenterX, uLensCenterY);
      vec2 c = uv - centre;
      // Anamorphic squeeze: scale Y before warping
      c.y *= uLensSqueeze;

      float r2 = dot(c, c);
      float r  = sqrt(r2);
      float k  = uLensAmt + extra;

      // Polynomial warp factor (always applied)
      float polyW = 1.0 + k * r2 + k * 0.35 * r2 * r2;

      // Fisheye warp factor: r' = tan(r * fov) / fov — sphere projection
      // (degrades to identity at fov=0). Blend by uLensFisheye.
      float fov = max(uLensFOV, 0.01);
      float fishR = tan(r * fov) / fov;
      float fishW = (r > 1e-4) ? fishR / r : 1.0;

      float warp = mix(polyW, fishW, clamp(uLensFisheye, 0.0, 1.0));
      c *= warp;
      c.y /= uLensSqueeze;                       // undo squeeze post-warp
      c /= max(uLensZoom, 1e-3);
      return c + centre;
    }

    // Hash for grain
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // Tone-mapping operators
    vec3 reinhard(vec3 c) { return c / (1.0 + c); }
    vec3 cineon(vec3 c) {
      c = max(vec3(0.0), c - 0.004);
      return (c * (6.2 * c + 0.5)) / (c * (6.2 * c + 1.7) + 0.06);
    }
    vec3 aces(vec3 c) {
      const float a = 2.51, b = 0.03, d = 2.43, e = 0.59, f = 0.14;
      return clamp((c * (a * c + b)) / (c * (d * c + e) + f), 0.0, 1.0);
    }

    void main() {
      vec2 uv = vUv;
      vec3 col;

      // Lens distortion (barrel/pincushion + per-channel dispersion).
      // Outside [0,1] returns black so the corners don't sample garbage.
      if (uLensOn > 0.5) {
        vec2 uvR = lensWarp(uv,  uLensDispersion);
        vec2 uvG = lensWarp(uv,  0.0);
        vec2 uvB = lensWarp(uv, -uLensDispersion);
        bool inB = (uvG.x > 0.0 && uvG.x < 1.0 && uvG.y > 0.0 && uvG.y < 1.0);
        col.r = inB ? texture2D(tDiffuse, uvR).r : 0.0;
        col.g = inB ? texture2D(tDiffuse, uvG).g : 0.0;
        col.b = inB ? texture2D(tDiffuse, uvB).b : 0.0;
        uv = uvG;                                  // downstream samples use warped uv
      } else if (uChromaOn > 0.5) {
        // Chromatic aberration (screen-space radial RGB split)
        vec2 dir = uv - 0.5;
        col.r = texture2D(tDiffuse, uv + dir *  uChromaAmt      ).r;
        col.g = texture2D(tDiffuse, uv                          ).g;
        col.b = texture2D(tDiffuse, uv - dir *  uChromaAmt      ).b;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }

      // Exposure (linear scale of HDR-ish values prior to tone-map)
      col *= uExposure;

      // Tone-mapping
      if      (uTonemap == 1) col = reinhard(col);
      else if (uTonemap == 2) col = cineon(col);
      else if (uTonemap == 3) col = aces(col);

      // Saturation
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);

      // Contrast around 0.5
      col = (col - 0.5) * uContrast + 0.5;

      // Vignette
      if (uVignetteOn > 0.5) {
        vec2 vd = uv - 0.5;
        float d = length(vd);
        float v = smoothstep(0.75, 0.25, d / max(uVignetteSoft, 1e-3));
        col *= mix(1.0, v, uVignetteAmt);
      }

      // Film grain — small luminance noise
      if (uGrainOn > 0.5) {
        float n = hash(uv * vec2(640.0, 360.0) + uTime * 17.0) - 0.5;
        col += n * uGrainAmt;
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const KaleidoscopeShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uSegments: { value: 6.0 },
    uRotation: { value: 0.0 },
    uEnable:   { value: 0.0 },
    uZoom:     { value: 1.0 },
    uAspect:   { value: 1.0 },
    uCenter:   { value: new THREE.Vector2(0.5, 0.5) },
    uMix:      { value: 1.0 }, // 0 = original, 1 = full kaleidoscope
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #define TAU 6.28318530718
    uniform sampler2D tDiffuse;
    uniform float uSegments;
    uniform float uRotation;
    uniform float uEnable;
    uniform float uZoom;
    uniform float uAspect;
    uniform vec2  uCenter;
    uniform float uMix;
    varying vec2 vUv;

    // Mirror-wrap UV into [0,1]
    vec2 mirrorWrap(vec2 uv) {
      vec2 m = mod(uv, 2.0);
      return mix(m, 2.0 - m, step(1.0, m));
    }

    void main() {
      vec4 orig = texture2D(tDiffuse, vUv);
      if (uEnable < 0.5) { gl_FragColor = orig; return; }

      // Aspect-corrected vector from kaleidoscope center
      vec2 p = vUv - uCenter;
      p.x *= uAspect;

      float r = length(p) * uZoom;
      float a = atan(p.y, p.x) + uRotation;

      // Wedge fold + mirror reflection
      float seg = TAU / max(uSegments, 1.0);
      a = mod(a, seg);
      a = abs(a - seg * 0.5);

      // Reconstruct sample position
      vec2 q = vec2(cos(a), sin(a)) * r;
      q.x /= uAspect;
      vec2 sampleUv = mirrorWrap(q + uCenter);

      vec4 kaleido = texture2D(tDiffuse, sampleUv);
      gl_FragColor = mix(orig, kaleido, clamp(uMix, 0.0, 1.0));
    }
  `,
};

export function setupPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // UnrealBloomPass — selective glow on bright pixels. Strength / radius /
  // threshold tuned for the FX-tinted splat highlights (default off).
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.0,   // strength (0 = disabled by default)
    0.6,   // radius
    0.85,  // threshold (only pixels brighter than this bloom)
  );
  composer.addPass(bloomPass);

  // Polish pass — vignette / chromatic aberration / grain / colour / tonemap
  const polishPass = new ShaderPass(PolishShader);
  composer.addPass(polishPass);

  const kaleidoPass = new ShaderPass(KaleidoscopeShader);
  composer.addPass(kaleidoPass);

  // Final pass must render to screen
  kaleidoPass.renderToScreen = true;

  const params = {
    enable:        false,
    segments:      6,
    rotationSpeed: 0.0,     // radians per second
    zoom:          1.0,
    mix:           1.0,     // crossfade against the un-kaleidoscoped image
    centerX:       0.5,
    centerY:       0.5,

    // Master switch for ALL post-processing (Bloom + Polish pass). When off,
    // both passes are disabled in one click regardless of individual settings.
    postEnable:    true,

    // 3DGS-tuned defaults: ACES tonemap + subtle exposure / contrast /
    // saturation bumps give splats a polished cinema look without crushing
    // detail or oversaturating. Bloom on, vignette/chroma/grain off so the
    // baseline is clean and the user adds them in only when they want them.
    bloomEnable:    true,
    bloomStrength:  0.3,
    bloomRadius:    0.84,
    bloomThreshold: 0.82,

    lensOn:        false,
    lensAmt:       0.20,
    lensZoom:      1.00,
    lensDispersion: 0.0,
    lensCenterX:   0.5,
    lensCenterY:   0.5,
    lensSqueeze:   1.0,
    lensFisheye:   0.0,
    lensFOV:       1.0,
    vignetteOn:    false,
    vignetteAmt:   0.4,
    vignetteSoft:  0.8,
    chromaOn:      false,
    chromaAmt:     0.0025,
    grainOn:       false,
    grainAmt:      0.05,
    exposure:      1.10,
    contrast:      1.08,
    saturation:    1.15,
    tonemap:       "None",     // None | Reinhard | Cineon | ACES
  };

  const TONEMAP_INDEX = { None: 0, Reinhard: 1, Cineon: 2, ACES: 3 };

  let rotation = 0.0;

  function setSize(w, h) {
    composer.setSize(w, h);
    kaleidoPass.uniforms.uAspect.value = w / h;
    bloomPass.setSize(w, h);
  }

  let polishTime = 0;
  function update(dt) {
    rotation += params.rotationSpeed * dt;
    kaleidoPass.uniforms.uEnable.value   = params.enable ? 1.0 : 0.0;
    kaleidoPass.uniforms.uSegments.value = params.segments;
    kaleidoPass.uniforms.uRotation.value = rotation;
    kaleidoPass.uniforms.uZoom.value     = params.zoom;
    kaleidoPass.uniforms.uMix.value      = params.mix;
    kaleidoPass.uniforms.uCenter.value.set(params.centerX, params.centerY);

    bloomPass.strength  = params.bloomStrength;
    bloomPass.radius    = params.bloomRadius;
    bloomPass.threshold = params.bloomThreshold;
    bloomPass.enabled   = params.postEnable && params.bloomEnable && params.bloomStrength > 0.001;

    polishTime += dt;
    const u = polishPass.uniforms;
    u.uTime.value           = polishTime;
    u.uLensOn.value         = params.lensOn ? 1.0 : 0.0;
    u.uLensAmt.value        = params.lensAmt;
    u.uLensZoom.value       = params.lensZoom;
    u.uLensDispersion.value = params.lensDispersion;
    u.uLensCenterX.value    = params.lensCenterX;
    u.uLensCenterY.value    = params.lensCenterY;
    u.uLensSqueeze.value    = params.lensSqueeze;
    u.uLensFisheye.value    = params.lensFisheye;
    u.uLensFOV.value        = params.lensFOV;
    u.uVignetteOn.value    = params.vignetteOn ? 1.0 : 0.0;
    u.uVignetteAmt.value   = params.vignetteAmt;
    u.uVignetteSoft.value  = params.vignetteSoft;
    u.uChromaOn.value      = params.chromaOn ? 1.0 : 0.0;
    u.uChromaAmt.value     = params.chromaAmt;
    u.uGrainOn.value       = params.grainOn ? 1.0 : 0.0;
    u.uGrainAmt.value      = params.grainAmt;
    u.uExposure.value      = params.exposure;
    u.uContrast.value      = params.contrast;
    u.uSaturation.value    = params.saturation;
    u.uTonemap.value       = TONEMAP_INDEX[params.tonemap] ?? 0;
    polishPass.enabled = params.postEnable && (
      params.lensOn || params.vignetteOn || params.chromaOn || params.grainOn ||
      params.exposure !== 1.0 || params.contrast !== 1.0 ||
      params.saturation !== 1.0 || params.tonemap !== "None"
    );
  }

  function render(dt) {
    update(dt);
    composer.render();
  }

  function attachGUI(parentGui) {
    // Post-Process lives under Customize, Kaleidoscope under FX. Fall back to
    // the parent if those refs aren't exposed (older buildGUI shape).
    const customizeParent = parentGui.fCustomize || parentGui;
    const fxParent        = parentGui.fFX        || parentGui;

    // Post-Process — Sketchfab-style finishing effects, all under one folder.
    // The master "Enable" checkbox at the top kills every pass at once.
    const fPost = customizeParent.addFolder("Post-Process").close();
    fPost.add(params, "postEnable").name("Enable");

    const fBloom = fPost.addFolder("Bloom");
    fBloom.add(params, "bloomEnable").name("Enable");
    fBloom.add(params, "bloomStrength",  0.0,  2.5, 0.02).name("Strength");
    fBloom.add(params, "bloomRadius",    0.0,  1.5, 0.02).name("Radius");
    fBloom.add(params, "bloomThreshold", 0.0,  1.5, 0.01).name("Threshold");

    fPost.add(params, "tonemap", Object.keys(TONEMAP_INDEX)).name("Tonemap");
    fPost.add(params, "exposure",   0.0, 3.0, 0.01).name("Exposure");
    fPost.add(params, "contrast",   0.5, 2.0, 0.01).name("Contrast");
    fPost.add(params, "saturation", 0.0, 2.0, 0.01).name("Saturation");

    const fLens = fPost.addFolder("Lens Distortion").close();
    fLens.add(params, "lensOn").name("Enable");
    fLens.add(params, "lensFisheye",     0.0, 1.0, 0.01 ).name("Fisheye Blend");
    fLens.add(params, "lensFOV",         0.1, 2.5, 0.01 ).name("Fisheye FOV");
    fLens.add(params, "lensAmt",        -1.0, 2.0, 0.01 ).name("Distortion");
    fLens.add(params, "lensZoom",        0.5, 2.0, 0.01 ).name("Zoom");
    fLens.add(params, "lensDispersion", -0.15, 0.15, 0.005).name("Dispersion");
    fLens.add(params, "lensCenterX",     0.0, 1.0, 0.005).name("Center X");
    fLens.add(params, "lensCenterY",     0.0, 1.0, 0.005).name("Center Y");
    fLens.add(params, "lensSqueeze",     0.5, 2.0, 0.01 ).name("Anamorphic Squeeze");

    const fVig = fPost.addFolder("Vignette").close();
    fVig.add(params, "vignetteOn").name("Enable");
    fVig.add(params, "vignetteAmt",  0.0, 1.5, 0.02).name("Amount");
    fVig.add(params, "vignetteSoft", 0.1, 1.5, 0.02).name("Softness");
    const fChroma = fPost.addFolder("Chromatic Aberration").close();
    fChroma.add(params, "chromaOn").name("Enable");
    fChroma.add(params, "chromaAmt", 0.0, 0.02, 0.0005).name("Amount");
    const fGrain = fPost.addFolder("Film Grain").close();
    fGrain.add(params, "grainOn").name("Enable");
    fGrain.add(params, "grainAmt", 0.0, 0.4, 0.005).name("Amount");

    const f = fxParent.addFolder("Kaleidoscope").close();
    f.add(params, "enable").name("Enable");
    f.add(params, "segments", 3, 24, 1).name("Segments");
    f.add(params, "rotationSpeed", 0, 1.5, 0.02).name("Rotation Speed");
    f.add(params, "zoom", 0.4, 3.0, 0.05).name("Zoom");
    f.add(params, "mix", 0.0, 1.0, 0.02).name("Mix");
    f.add(params, "centerX", 0.0, 1.0, 0.01).name("Center X");
    f.add(params, "centerY", 0.0, 1.0, 0.01).name("Center Y");
    return f;
  }

  return { composer, params, render, setSize, attachGUI };
}

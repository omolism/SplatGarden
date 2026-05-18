import * as THREE from "three";
import { EffectComposer }   from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass }       from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass }       from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass }  from "three/addons/postprocessing/UnrealBloomPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { uniforms as effectUniforms } from "./effects.js";

// ---------------------------------------------------------------------------
// EchoPass — Notch-style motion trails.
//
// Maintains a "feedback" render target that holds the previous frame's
// output. Each frame combines the current pipeline state with the
// feedback texture via `max(current, feedback × persistence)` so bright
// trails linger and slowly decay. The combined result becomes the next
// frame's feedback.
// ---------------------------------------------------------------------------
class EchoPass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse:     { value: null },
      tFeedback:    { value: null },
      uPersistence: { value: 0.90 },
      uMix:         { value: 1.0 },
    };
    this.feedbackRT = new THREE.WebGLRenderTarget(1, 1);
    this.tempRT     = new THREE.WebGLRenderTarget(1, 1);
    this.combineMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tFeedback;
        uniform float uPersistence;
        uniform float uMix;
        varying vec2 vUv;
        void main() {
          vec4 cur  = texture2D(tDiffuse,  vUv);
          vec4 prev = texture2D(tFeedback, vUv) * uPersistence;
          vec4 trail = max(cur, prev);
          gl_FragColor = mix(cur, trail, uMix);
        }
      `,
    });
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: this.combineMat.vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
      `,
    });
    this.combineQuad = new FullScreenQuad(this.combineMat);
    this.copyQuad    = new FullScreenQuad(this.copyMat);
  }
  setSize(w, h) {
    this.feedbackRT.setSize(w, h);
    this.tempRT.setSize(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    // 1) Combine cur + feedback into tempRT
    this.uniforms.tDiffuse.value  = readBuffer.texture;
    this.uniforms.tFeedback.value = this.feedbackRT.texture;
    renderer.setRenderTarget(this.tempRT);
    this.combineQuad.render(renderer);
    // 2) Swap feedback / temp so feedbackRT holds the new combined result
    const t = this.feedbackRT;
    this.feedbackRT = this.tempRT;
    this.tempRT = t;
    // 3) Copy combined output to writeBuffer (or screen if final)
    this.copyMat.uniforms.tDiffuse.value = this.feedbackRT.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copyQuad.render(renderer);
  }
  dispose() {
    this.feedbackRT.dispose();
    this.tempRT.dispose();
    this.combineMat.dispose();
    this.copyMat.dispose();
    this.combineQuad.dispose();
    this.copyQuad.dispose();
  }
}

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

// ---------------------------------------------------------------------------
// PainterlyShader — three NPR looks branched on a single uStyle int:
//   1  Monet      — Kuwahara filter (oil-painting brushstrokes)
//   2  Matisse    — posterize + Sobel black outline + super-saturated
//   3  Van Gogh   — flow-aligned directional brushstrokes
// 0 (None) returns the source unchanged — cheap fallback when the user
// hasn't picked a style.
// ---------------------------------------------------------------------------
const PainterlyShader = {
  uniforms: {
    tDiffuse:             { value: null },
    uStyle:               { value: 0 },
    uResolution:          { value: new THREE.Vector2(1, 1) },
    uTime:                { value: 0.0 },
    uMonetRadius:         { value: 4.0 },   // Kuwahara neighbourhood radius (px)
    uMatissePosterize:    { value: 5.0 },   // colour quantization steps per channel
    uMatisseEdgeThresh:   { value: 0.15 },  // Sobel threshold above which we draw outline
    uMatisseSaturation:   { value: 1.6 },
    uVanGoghStroke:       { value: 6.0 },   // brushstroke length in pixels
    uVanGoghTurb:         { value: 8.0 },   // flow-field turbulence scale
    uVanGoghSat:          { value: 1.5 },   // saturation boost
    uSeuratDotSize:       { value: 14.0 },  // grid cell size in px
    uSeuratSat:           { value: 1.6 },   // dot colour saturation boost
    uSeuratPaper:         { value: 0.92 },  // background tint (paper luminance)
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
    uniform int   uStyle;
    uniform vec2  uResolution;
    uniform float uTime;
    uniform float uMonetRadius;
    uniform float uMatissePosterize, uMatisseEdgeThresh, uMatisseSaturation;
    uniform float uVanGoghStroke, uVanGoghTurb, uVanGoghSat;
    uniform float uSeuratDotSize, uSeuratSat, uSeuratPaper;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // ---- Kuwahara (Monet) -------------------------------------------------
    // Samples 4 overlapping (radius+1)² quadrants around the pixel, picks
    // the mean of the lowest-variance one. Edges stay sharp; smooth regions
    // get smoothed → oil-paint brushstroke look.
    vec3 kuwahara(vec2 uv) {
      vec2 px = 1.0 / uResolution;
      float r = uMonetRadius;
      vec3  bestMean = vec3(0.0);
      float bestVar  = 1e9;
      const int R = 4;     // hard-coded radius for loop unroll
      for (int q = 0; q < 4; q++) {
        int dx = (q == 1 || q == 3) ?  1 : -1;
        int dy = (q == 2 || q == 3) ?  1 : -1;
        vec3 sum   = vec3(0.0);
        vec3 sumSq = vec3(0.0);
        float n    = 0.0;
        for (int i = 0; i <= R; i++) {
          for (int j = 0; j <= R; j++) {
            vec2 o = vec2(float(i * dx), float(j * dy)) * px * (r / float(R));
            vec3 c = texture2D(tDiffuse, uv + o).rgb;
            sum   += c;
            sumSq += c * c;
            n     += 1.0;
          }
        }
        vec3 mean = sum / n;
        vec3 v    = sumSq / n - mean * mean;
        float vv  = max(0.0, v.r + v.g + v.b);
        if (vv < bestVar) { bestVar = vv; bestMean = mean; }
      }
      return bestMean;
    }

    void main() {
      if (uStyle == 0) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec3 col;
      vec2 px = 1.0 / uResolution;

      // ---- 1. Monet — Kuwahara -------------------------------------------
      if (uStyle == 1) {
        col = kuwahara(vUv);
        col *= 1.04;                                 // slight brightness lift
        col.r += 0.015; col.g += 0.005;              // warm bias
      }
      // ---- 2. Matisse — posterize + Sobel + saturate ---------------------
      else if (uStyle == 2) {
        col = texture2D(tDiffuse, vUv).rgb;
        // Sobel edge detection on luma
        float l00 = luma(texture2D(tDiffuse, vUv + px * vec2(-1.0, -1.0)).rgb);
        float l01 = luma(texture2D(tDiffuse, vUv + px * vec2( 0.0, -1.0)).rgb);
        float l02 = luma(texture2D(tDiffuse, vUv + px * vec2( 1.0, -1.0)).rgb);
        float l10 = luma(texture2D(tDiffuse, vUv + px * vec2(-1.0,  0.0)).rgb);
        float l12 = luma(texture2D(tDiffuse, vUv + px * vec2( 1.0,  0.0)).rgb);
        float l20 = luma(texture2D(tDiffuse, vUv + px * vec2(-1.0,  1.0)).rgb);
        float l21 = luma(texture2D(tDiffuse, vUv + px * vec2( 0.0,  1.0)).rgb);
        float l22 = luma(texture2D(tDiffuse, vUv + px * vec2( 1.0,  1.0)).rgb);
        float gx = -l00 - 2.0 * l10 - l20 + l02 + 2.0 * l12 + l22;
        float gy = -l00 - 2.0 * l01 - l02 + l20 + 2.0 * l21 + l22;
        float edge = sqrt(gx * gx + gy * gy);
        // Posterize colour
        col = floor(col * uMatissePosterize + 0.5) / uMatissePosterize;
        // Boost saturation
        float lum = luma(col);
        col = mix(vec3(lum), col, uMatisseSaturation);
        // Black outline on strong edges
        float edgeMask = smoothstep(uMatisseEdgeThresh, uMatisseEdgeThresh + 0.08, edge);
        col *= 1.0 - edgeMask * 0.9;
      }
      // ---- 4. Seurat — pointillism ---------------------------------------
      // Snap to a dot-grid, sample the cell-centre colour, and render each
      // pixel either as a saturated coloured dot (inside the grid radius)
      // or as a paper-tone background. Reads like tiny brush-points across
      // a paper canvas, the way Seurat's dot painting builds up tone.
      else if (uStyle == 4) {
        vec2 grid = px * uSeuratDotSize;
        vec2 cell = floor(vUv / grid) * grid + grid * 0.5;
        vec3 cc = texture2D(tDiffuse, cell).rgb;
        float lum = luma(cc);
        cc = mix(vec3(lum), cc, uSeuratSat);
        vec2 frac = (vUv - cell) / grid;
        float d = length(frac);
        float mask = smoothstep(0.5, 0.40, d);
        vec3 paper = vec3(uSeuratPaper);
        col = mix(paper, cc, mask);
      }
      // ---- 3. Van Gogh — flow-aligned directional brushstrokes ----------
      // Samples N taps along a noise-driven direction → each pixel becomes
      // an averaged smear that follows the underlying flow field, like
      // Starry Night's swirling strokes.
      else if (uStyle == 3) {
        // Build a smooth flow direction from a noisy "angle field"
        float ang = (hash21(floor(vUv * uVanGoghTurb)) +
                     hash21(floor(vUv * uVanGoghTurb * 1.7) + 7.3)) * 6.28318;
        vec2  dir = vec2(cos(ang), sin(ang));
        vec3 sum  = vec3(0.0);
        float n   = 0.0;
        for (int i = -6; i <= 6; i++) {
          vec2 off = dir * float(i) * px * uVanGoghStroke;
          sum += texture2D(tDiffuse, vUv + off).rgb;
          n   += 1.0;
        }
        col = sum / n;
        // Boost saturation — Van Gogh palette runs hot
        float lum = luma(col);
        col = mix(vec3(lum), col, uVanGoghSat);
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

  // Painterly — Monet (Kuwahara) / Matisse (posterize + Sobel) / Pollock
  const painterlyPass = new ShaderPass(PainterlyShader);
  composer.addPass(painterlyPass);

  // Echo / Trails — Notch-style motion smear via feedback texture
  const echoPass = new EchoPass();
  composer.addPass(echoPass);

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

    echoOn:        false,
    echoPersist:   0.97,    // 0.90 → 0.97 = much longer trails before they fade
    echoMix:       1.00,

    painterly:           "None",   // None | Monet | Matisse | Van Gogh | Seurat
    monetRadius:         4.0,
    matissePosterize:    5.0,
    matisseEdge:         0.6,      // bumped from 0.15
    matisseSaturation:   1.6,
    vanGoghStroke:       6.0,
    vanGoghTurb:         8.0,
    vanGoghSat:          1.5,
    seuratDotSize:       14.0,
    seuratSat:           1.6,
    seuratPaper:         0.92,

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
  const PAINTERLY_INDEX = { None: 0, Monet: 1, Matisse: 2, "Van Gogh": 3, Seurat: 4 };

  let rotation = 0.0;

  function setSize(w, h) {
    composer.setSize(w, h);
    kaleidoPass.uniforms.uAspect.value = w / h;
    bloomPass.setSize(w, h);
    echoPass.setSize(w, h);
    painterlyPass.uniforms.uResolution.value.set(w, h);
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

    echoPass.enabled = params.postEnable && params.echoOn;
    echoPass.uniforms.uPersistence.value = params.echoPersist;
    echoPass.uniforms.uMix.value         = params.echoMix;

    const styleIdx = PAINTERLY_INDEX[params.painterly] ?? 0;
    // Painterly is a 2D post-process — operates on every pixel of the framebuffer.
    // It would smear Quad / Voxel overlays alongside the splat. Auto-disable
    // when either overlay layer is visible so the effect stays splat-only.
    const quadShown  = (effectUniforms?.quadVis?.value  ?? 0) > 0.05;
    const voxelShown = (effectUniforms?.voxelVis?.value ?? 0) > 0.05;
    painterlyPass.enabled = params.postEnable && styleIdx !== 0 && !quadShown && !voxelShown;
    const pu = painterlyPass.uniforms;
    pu.uStyle.value             = styleIdx;
    pu.uTime.value              = polishTime;
    pu.uMonetRadius.value       = params.monetRadius;
    pu.uMatissePosterize.value  = params.matissePosterize;
    pu.uMatisseEdgeThresh.value = params.matisseEdge;
    pu.uMatisseSaturation.value = params.matisseSaturation;
    pu.uVanGoghStroke.value     = params.vanGoghStroke;
    pu.uVanGoghTurb.value       = params.vanGoghTurb;
    pu.uVanGoghSat.value        = params.vanGoghSat;
    pu.uSeuratDotSize.value     = params.seuratDotSize;
    pu.uSeuratSat.value         = params.seuratSat;
    pu.uSeuratPaper.value       = params.seuratPaper;

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

    // Painterly is a NPR finishing pass. Style selector at the top; each
    // style's tunables live inside their own sub-folder so the user only
    // sees the knobs that matter for the current look. Folders auto-open
    // when their style is selected (and the others auto-close).
    // Painterly: Style picker AT THE TOP, per-style detail folders below.
    // Switching style auto-opens only the relevant detail folder.
    const fPaint = fPost.addFolder("Painterly").close();
    let fMonet, fMatisse, fVanGogh, fSeurat;
    fPaint.add(params, "painterly", Object.keys(PAINTERLY_INDEX)).name("Style")
      .onChange((v) => {
        [fMonet, fMatisse, fVanGogh, fSeurat].forEach(f => f?.close());
        if (v === "Monet")    fMonet.open();
        if (v === "Matisse")  fMatisse.open();
        if (v === "Van Gogh") fVanGogh.open();
        if (v === "Seurat")   fSeurat.open();
      });
    fMonet   = fPaint.addFolder("Monet").close();
    fMatisse = fPaint.addFolder("Matisse").close();
    fVanGogh = fPaint.addFolder("Van Gogh").close();
    fSeurat  = fPaint.addFolder("Seurat").close();
    fMonet.add(params, "monetRadius",         1,   8,  0.5 ).name("Radius");
    fMatisse.add(params, "matissePosterize",  2,  12,  1   ).name("Posterize");
    fMatisse.add(params, "matisseEdge",       0.0, 1.0, 0.01).name("Edge");
    fMatisse.add(params, "matisseSaturation", 0.5, 3.0, 0.05).name("Saturation");
    fVanGogh.add(params, "vanGoghStroke",     2,  16,  0.5 ).name("Stroke Length");
    fVanGogh.add(params, "vanGoghTurb",       2,  24,  0.5 ).name("Turbulence");
    fVanGogh.add(params, "vanGoghSat",        0.5, 2.5, 0.05).name("Saturation");
    fSeurat.add(params, "seuratDotSize",      4,   40, 0.5 ).name("Dot Size");
    fSeurat.add(params, "seuratSat",          0.5, 3.0, 0.05).name("Saturation");
    fSeurat.add(params, "seuratPaper",        0.0, 1.0, 0.01).name("Paper Tint");

    const fEcho = fPost.addFolder("Echo Trails").close();
    fEcho.add(params, "echoOn").name("Enable");
    fEcho.add(params, "echoPersist", 0.5, 0.99, 0.005).name("Persistence");
    fEcho.add(params, "echoMix",     0.0, 1.0,  0.01 ).name("Mix");

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

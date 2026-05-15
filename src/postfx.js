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

    bloomStrength:  0.0,
    bloomRadius:    0.6,
    bloomThreshold: 0.85,
  };

  let rotation = 0.0;

  function setSize(w, h) {
    composer.setSize(w, h);
    kaleidoPass.uniforms.uAspect.value = w / h;
    bloomPass.setSize(w, h);
  }

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
    bloomPass.enabled   = params.bloomStrength > 0.001;
  }

  function render(dt) {
    update(dt);
    composer.render();
  }

  function attachGUI(parentGui) {
    const fBloom = parentGui.addFolder("Bloom");
    fBloom.add(params, "bloomStrength",  0.0,  2.5, 0.02).name("Strength");
    fBloom.add(params, "bloomRadius",    0.0,  1.5, 0.02).name("Radius");
    fBloom.add(params, "bloomThreshold", 0.0,  1.5, 0.01).name("Threshold");

    const f = parentGui.addFolder("Kaleidoscope");
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

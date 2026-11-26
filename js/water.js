// Stylised ocean: CPU waves on the near mesh, shader colour for depth, foam and sparkle.
import * as THREE from 'three';
import { HMIN, HMAX, WORLD } from './terrain.js';

const VERT = `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = `
  uniform float uTime, uNight, uLevel, uHMin, uHMax, uWorld;
  uniform vec3 uFogColor;
  uniform float uFogNear, uFogFar;
  uniform sampler2D uHeight;
  varying vec3 vWorld;
  void main() {
    vec2 uv = vWorld.xz / uWorld + 0.5;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float enc = texture2D(uHeight, clamp(uv, 0.001, 0.999)).r;
    float th = mix(uHMin, uHMax, enc);
    float depth = uLevel - th;
    vec3 shallow = vec3(0.36, 0.72, 0.66);
    vec3 midc = vec3(0.07, 0.42, 0.66);
    vec3 deep = vec3(0.02, 0.14, 0.36);
    float d = clamp(depth, -0.4, 8.0);
    vec3 col = mix(shallow, midc, smoothstep(-0.1, 1.7, d));
    col = mix(col, deep, smoothstep(1.3, 5.5, d));
    col = mix(deep * 0.85, col, inside);
    col = mix(col, col * vec3(0.28, 0.42, 0.72), uNight * 0.85);

    float shore = inside * (1.0 - smoothstep(0.0, 0.45, abs(depth)));
    float ripple = sin(vWorld.x * 0.55 + uTime * 1.3) * sin(vWorld.z * 0.47 - uTime * 0.9);
    float foam = shore * smoothstep(0.35, 0.95, ripple * 0.5 + 0.5);
    col = mix(col, vec3(0.93, 0.97, 0.96), foam * 0.72);

    float crest = smoothstep(0.12, 0.24, vWorld.y - uLevel);
    float sp = sin(vWorld.x * 0.71 + uTime * 1.4) * sin(vWorld.z * 0.63 - uTime * 1.1);
    sp = pow(max(sp, 0.0), 12.0);
    col += vec3(1.0, 0.98, 0.92) * sp * crest * 0.22 * (1.0 - uNight * 0.35);

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(abs(viewDir.y), 0.0, 1.0), 2.2);
    col += vec3(0.65, 0.82, 0.9) * fres * 0.16 * (1.0 - uNight * 0.5);

    float dist = length(cameraPosition - vWorld);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, 0.9);
  }
`;

export class Water {
  constructor(scene, terrain, { segments = 80 } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    const geo = new THREE.PlaneGeometry(420, 420, segments, segments).rotateX(-Math.PI / 2);
    this.base = geo.attributes.position.array.slice();
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uLevel: { value: 0 },
        uHMin: { value: HMIN },
        uHMax: { value: HMAX },
        uWorld: { value: WORLD },
        uHeight: { value: terrain.heightTex },
        uFogColor: { value: new THREE.Color('#cfeefa') },
        uFogNear: { value: 90 },
        uFogFar: { value: 300 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'water';
    scene.add(this.mesh);
    // Flat far-ocean plane so the sea reaches the horizon without extra vertices.
    const shape = new THREE.Shape([new THREE.Vector2(-2500, -2500), new THREE.Vector2(2500, -2500), new THREE.Vector2(2500, 2500), new THREE.Vector2(-2500, 2500)]);
    shape.holes.push(new THREE.Path([new THREE.Vector2(-210, -210), new THREE.Vector2(-210, 210), new THREE.Vector2(210, 210), new THREE.Vector2(210, -210)]));
    const far = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), this.material);
    far.position.y = 0;
    this.mesh.add(far);
    this.level = 0;
    this.choppy = 0;
  }

  setLevel(y) {
    this.level = y;
    this.mesh.position.y = y;
    this.material.uniforms.uLevel.value = y;
  }

  update(t, night) {
    const p = this.geo.attributes.position.array, b = this.base;
    const amp = 0.16 + this.choppy * 0.22;
    for (let i = 0; i < p.length; i += 3) {
      const x = b[i], z = b[i + 2];
      // Ease the waves out so the tiled centre meets the flat far ocean without a crack.
      const fall = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, z), 150, 205);
      const wave = Math.sin(x * 0.16 + t * 1.1) * amp + Math.cos(z * 0.21 + t * 0.9) * amp * 0.8 + Math.sin((x + z) * 0.35 + t * 1.7) * amp * 0.35;
      p[i + 1] = wave * fall;
    }
    this.geo.attributes.position.needsUpdate = true;
    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uNight.value = night;
    u.uLevel.value = this.level;
    const fog = this.scene.fog;
    if (fog) {
      u.uFogColor.value.copy(fog.color);
      u.uFogNear.value = fog.near;
      u.uFogFar.value = fog.far;
    }
  }
}

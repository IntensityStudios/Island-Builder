// Sky dome, sun/moon lighting, stars and the day/night cycle.
import * as THREE from 'three';

const NIGHT_TOP = new THREE.Color('#070b24'), NIGHT_MID = new THREE.Color('#1a2458'), NIGHT_BOT = new THREE.Color('#24315f');
const DAY_TOP = new THREE.Color('#3d8fe0'), DAY_MID = new THREE.Color('#f3d7b0'), DAY_BOT = new THREE.Color('#c5ecfb');
const DUSK_TOP = new THREE.Color('#6a4f92'), DUSK_MID = new THREE.Color('#ff8a5a'), DUSK_BOT = new THREE.Color('#ffb07a');
const GREY = new THREE.Color('#9aa3ab');
const SUN_COL = new THREE.Color('#fff3d4'), DUSK_SUN = new THREE.Color('#ff9a4a'), MOON_COL = new THREE.Color('#b9c6ff');

export class Sky {
  constructor(scene, { shadowSize = 2048 } = {}) {
    this.scene = scene;
    this.time = 12;          // hours 0..24
    this.overcast = 0;       // 0..1, driven by weather
    this.fogBoost = 0;       // 0..1, extra fog for "fog" weather
    this.night = 0;          // 0 day .. 1 night (read by other systems)

    // Gradient sky dome (follows the camera) with a warm horizon and a soft sun disc.
    this.uniforms = {
      top: { value: DAY_TOP.clone() },
      mid: { value: DAY_MID.clone() },
      bottom: { value: DAY_BOT.clone() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#ffd7a1') },
      sunGlow: { value: 1 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform vec3 top, mid, bottom, sunDir, sunColor;
          uniform float sunGlow;
          varying vec3 vP;
          void main() {
            float h = vP.y;
            vec3 col = mix(bottom, mid, smoothstep(-0.18, 0.08, h));
            col = mix(col, top, smoothstep(0.02, 0.72, h));
            float d = max(dot(normalize(vP), normalize(sunDir)), 0.0);
            col += sunColor * (pow(d, 90.0) * 0.55 + pow(d, 7.0) * 0.28) * sunGlow;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);
    this.dome = dome;

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 * Math.PI, v = Math.random() * 0.9 + 0.08;
      const r = 450;
      p[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * r;
      p[i * 3 + 1] = v * r;
      p[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Visible sun & moon discs
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }));
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 8), new THREE.MeshBasicMaterial({ color: '#e6ecff', fog: false }));
    scene.add(this.sunMesh, this.moonMesh);

    // Lights
    this.hemi = new THREE.HemisphereLight('#ffe7c4', '#7d9a55', 0.85);
    scene.add(this.hemi);
    this.fill = new THREE.DirectionalLight('#d5e4ff', 0.35);
    this.fill.position.set(-30, 24, 18);
    scene.add(this.fill);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    this._fillPos = new THREE.Vector3();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const s = this.sun.shadow.camera;
    s.left = -55; s.right = 55; s.top = 55; s.bottom = -55; s.near = 1; s.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.08;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog('#cfeefa', 90, 300);
    this.update(new THREE.Vector3());
  }

  /** Recompute everything for the current time. `camPos` keeps the dome centred. */
  update(camPos) {
    const a = (this.time / 24) * Math.PI * 2 - Math.PI / 2; // 6h = sunrise, 12h = noon
    const sunY = Math.sin(a), sunX = Math.cos(a);
    const day = THREE.MathUtils.smoothstep(sunY, -0.18, 0.22);
    const dusk = Math.exp(-((sunY / 0.22) ** 2));
    this.night = 1 - day;

    const top = new THREE.Color().lerpColors(NIGHT_TOP, DAY_TOP, day).lerp(DUSK_TOP, dusk * (0.35 + 0.45 * (1 - day)));
    const mid = new THREE.Color().lerpColors(NIGHT_MID, DAY_MID, day).lerp(DUSK_MID, dusk * 0.85);
    const bot = new THREE.Color().lerpColors(NIGHT_BOT, DAY_BOT, day).lerp(DUSK_BOT, dusk * 0.8);
    const oc = this.overcast * (0.35 + 0.65 * day);
    const grey = GREY.clone().multiplyScalar(0.4 + 0.55 * day);
    top.lerp(grey, oc * 0.8);
    mid.lerp(grey, oc * 0.65);
    bot.lerp(grey, oc * 0.7);
    this.uniforms.top.value.copy(top);
    this.uniforms.mid.value.copy(mid);
    this.uniforms.bottom.value.copy(bot);

    // Fog matches the horizon colour.
    this.scene.fog.color.copy(bot);
    const near = THREE.MathUtils.lerp(150, 6, this.fogBoost) * (1 - this.overcast * 0.4);
    const far = THREE.MathUtils.lerp(460, 55, this.fogBoost) * (1 - this.overcast * 0.35);
    this.scene.fog.near = near;
    this.scene.fog.far = far;

    // Sun by day, moon by night (same directional light so only one shadow map).
    const dist = 120;
    const sunDir = new THREE.Vector3(sunX, sunY, 0.35).normalize();
    const lightDir = day > 0.02 ? sunDir : sunDir.clone().negate();
    const c = camPos || new THREE.Vector3();
    this.sun.position.copy(lightDir).multiplyScalar(dist);
    this.sun.target.position.set(0, 0, 0);
    this._fillPos.copy(lightDir).multiplyScalar(-70);
    this._fillPos.y += 36;
    this.fill.position.copy(this._fillPos);
    const sunCol = new THREE.Color().lerpColors(SUN_COL, DUSK_SUN, dusk);
    this.uniforms.sunDir.value.copy(sunDir);
    this.uniforms.sunColor.value.copy(sunCol);
    this.uniforms.sunGlow.value = (0.25 + day * 0.75) * (1 - this.overcast * 0.85);
    if (day > 0.02) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 2.35 * day * (1 - this.overcast * 0.65);
    } else {
      this.sun.color.copy(MOON_COL);
      this.sun.intensity = 0.72 * (1 - this.overcast * 0.55);
    }
    this.hemi.intensity = 0.42 + 0.55 * day;
    this.hemi.color.lerpColors(new THREE.Color('#3d4c86'), new THREE.Color('#ffe6c2'), day);
    this.hemi.groundColor.lerpColors(new THREE.Color('#1c2436'), new THREE.Color('#7f9a52'), day);
    this.fill.intensity = 0.18 + 0.28 * day;
    this.fill.color.lerpColors(new THREE.Color('#6d7ec4'), new THREE.Color('#d5e6ff'), day);

    this.sunMesh.position.copy(sunDir).multiplyScalar(420).add(c);
    this.moonMesh.position.copy(sunDir).multiplyScalar(-420).add(c);
    this.sunMesh.visible = sunY > -0.1 && this.overcast < 0.9;
    this.moonMesh.visible = sunY < 0.1;
    this.sunMesh.material.color.setRGB(sunCol.r * 1.7, sunCol.g * 1.35, sunCol.b * 0.95);
    this.moonMesh.material.color.setRGB(0.75, 0.85, 1.35);
    this.dome.position.copy(c);
    this.stars.position.copy(c);
    this.starMat.opacity = Math.max(0, this.night * 1.1 - 0.1) * (1 - this.overcast * 0.9);
  }
}

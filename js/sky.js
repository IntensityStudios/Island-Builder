// Sky dome, sun/moon lighting, stars and the day/night cycle.
import * as THREE from 'three';

const NIGHT_TOP = new THREE.Color('#0a1030'), NIGHT_BOT = new THREE.Color('#1f2a55');
const DAY_TOP = new THREE.Color('#3f9be0'), DAY_BOT = new THREE.Color('#cfeefa');
const DUSK_TOP = new THREE.Color('#5b6fb0'), DUSK_BOT = new THREE.Color('#ffa86b');
const GREY = new THREE.Color('#9aa3ab');
const SUN_COL = new THREE.Color('#fff1d6'), DUSK_SUN = new THREE.Color('#ffb070'), MOON_COL = new THREE.Color('#9fb4ff');

export class Sky {
  constructor(scene, { shadowSize = 2048 } = {}) {
    this.scene = scene;
    this.time = 12;          // hours 0..24
    this.overcast = 0;       // 0..1, driven by weather
    this.fogBoost = 0;       // 0..1, extra fog for "fog" weather
    this.night = 0;          // 0 day .. 1 night (read by other systems)

    // Gradient sky dome (follows the camera).
    this.uniforms = { top: { value: DAY_TOP.clone() }, bottom: { value: DAY_BOT.clone() } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.05, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
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
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#6b8a4a', 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const s = this.sun.shadow.camera;
    s.left = -55; s.right = 55; s.top = 55; s.bottom = -55; s.near = 1; s.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
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

    const top = new THREE.Color().lerpColors(NIGHT_TOP, DAY_TOP, day).lerp(DUSK_TOP, dusk * 0.5 * day + dusk * 0.2);
    const bot = new THREE.Color().lerpColors(NIGHT_BOT, DAY_BOT, day).lerp(DUSK_BOT, dusk * 0.75);
    const oc = this.overcast * (0.35 + 0.65 * day);
    top.lerp(GREY.clone().multiplyScalar(0.35 + 0.65 * day), oc * 0.75);
    bot.lerp(GREY.clone().multiplyScalar(0.4 + 0.6 * day), oc * 0.75);
    this.uniforms.top.value.copy(top);
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
    const sunCol = new THREE.Color().lerpColors(SUN_COL, DUSK_SUN, dusk);
    if (day > 0.02) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 2.6 * day * (1 - this.overcast * 0.7);
    } else {
      this.sun.color.copy(MOON_COL);
      this.sun.intensity = 0.9 * (1 - this.overcast * 0.6);
    }
    this.hemi.intensity = 0.55 + 0.65 * day;
    this.hemi.color.lerpColors(new THREE.Color('#4f5e9a'), new THREE.Color('#d6ecff'), day);
    this.hemi.groundColor.lerpColors(new THREE.Color('#1d2230'), new THREE.Color('#6b8a4a'), day);

    this.sunMesh.position.copy(sunDir).multiplyScalar(420).add(c);
    this.moonMesh.position.copy(sunDir).multiplyScalar(-420).add(c);
    this.sunMesh.visible = sunY > -0.1 && this.overcast < 0.9;
    this.moonMesh.visible = sunY < 0.1;
    this.sunMesh.material.color.copy(sunCol);
    this.dome.position.copy(c);
    this.stars.position.copy(c);
    this.starMat.opacity = Math.max(0, this.night * 1.1 - 0.1) * (1 - this.overcast * 0.9);
  }
}

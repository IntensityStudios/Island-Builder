// Weather: clear, rain, snow, fog. Particles live in a box that follows the camera.
import * as THREE from 'three';

const BOX = { x: 70, y: 40, z: 70 };

export class Weather {
  constructor(scene, sky, water) {
    this.sky = sky;
    this.water = water;
    this.type = 'clear';
    this.mix = { rain: 0, snow: 0, fog: 0, overcast: 0 }; // smoothed amounts 0..1

    // Rain: short line segments
    const nR = 1600;
    const rp = new Float32Array(nR * 6);
    for (let i = 0; i < nR; i++) {
      const x = (Math.random() - 0.5) * BOX.x, y = Math.random() * BOX.y, z = (Math.random() - 0.5) * BOX.z;
      rp.set([x, y, z, x + 0.05, y - 0.9, z], i * 6);
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: '#b8cde0', transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // Snow: soft points
    const nS = 1400;
    const sp = new Float32Array(nS * 3);
    this.snowSeed = new Float32Array(nS);
    for (let i = 0; i < nS; i++) {
      sp.set([(Math.random() - 0.5) * BOX.x, Math.random() * BOX.y, (Math.random() - 0.5) * BOX.z], i * 3);
      this.snowSeed[i] = Math.random() * 100;
    }
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snowMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.28, transparent: true, opacity: 0, depthWrite: false });
    this.snow = new THREE.Points(this.snowGeo, this.snowMat);
    this.snow.frustumCulled = false;
    scene.add(this.snow);
  }

  set(type) { this.type = type; }

  update(dt, t, center) {
    const target = {
      rain: this.type === 'rain' ? 1 : 0,
      snow: this.type === 'snow' ? 1 : 0,
      fog: this.type === 'fog' ? 1 : this.type === 'snow' ? 0.25 : this.type === 'rain' ? 0.15 : 0,
      overcast: this.type === 'clear' ? 0 : this.type === 'fog' ? 0.6 : 0.85,
    };
    const k = Math.min(1, dt * 1.2);
    for (const key in target) this.mix[key] += (target[key] - this.mix[key]) * k;

    this.sky.overcast = this.mix.overcast;
    this.sky.fogBoost = this.mix.fog;
    this.water.choppy = this.mix.rain;

    // Centre the particle box above the viewer.
    const base = new THREE.Vector3(center.x, Math.max(center.y - 10, -2), center.z);

    this.rain.visible = this.mix.rain > 0.01;
    this.rainMat.opacity = 0.55 * this.mix.rain;
    if (this.rain.visible) {
      this.rain.position.copy(base);
      const p = this.rainGeo.attributes.position.array;
      const fall = dt * 32;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= fall; p[i + 4] -= fall;
        if (p[i + 4] < 0) { const y = BOX.y + Math.random() * 4; p[i + 1] = y; p[i + 4] = y - 0.9; }
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }

    this.snow.visible = this.mix.snow > 0.01;
    this.snowMat.opacity = 0.9 * this.mix.snow;
    if (this.snow.visible) {
      this.snow.position.copy(base);
      const p = this.snowGeo.attributes.position.array;
      for (let i = 0, n = 0; i < p.length; i += 3, n++) {
        const s = this.snowSeed[n];
        p[i] += Math.sin(t * 0.8 + s) * dt * 0.6;
        p[i + 1] -= dt * (1.6 + (s % 1));
        p[i + 2] += Math.cos(t * 0.7 + s) * dt * 0.6;
        if (p[i + 1] < 0) p[i + 1] = BOX.y;
      }
      this.snowGeo.attributes.position.needsUpdate = true;
    }
  }
}

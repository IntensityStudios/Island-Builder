// Low-poly animated ocean. Waves are computed on the CPU (cheap at this resolution).
import * as THREE from 'three';

export class Water {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(420, 420, 84, 84).rotateX(-Math.PI / 2);
    this.base = geo.attributes.position.array.slice();
    this.geo = geo;
    this.material = new THREE.MeshStandardMaterial({
      color: '#3aa6c9', transparent: true, opacity: 0.86, roughness: 0.2, metalness: 0.05, flatShading: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'water';
    scene.add(this.mesh);
    // Flat far-ocean plane so the sea reaches the horizon without extra vertices.
    // A huge square with a square hole exactly where the detailed mesh sits (no overlap).
    const shape = new THREE.Shape([new THREE.Vector2(-2500, -2500), new THREE.Vector2(2500, -2500), new THREE.Vector2(2500, 2500), new THREE.Vector2(-2500, 2500)]);
    shape.holes.push(new THREE.Path([new THREE.Vector2(-210, -210), new THREE.Vector2(-210, 210), new THREE.Vector2(210, 210), new THREE.Vector2(210, -210)]));
    const far = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), this.material);
    far.position.y = -0.05;
    this.mesh.add(far);
    this.level = 0;
    this.choppy = 0; // extra wave height during storms
  }

  setLevel(y) { this.level = y; this.mesh.position.y = y; }

  update(t, night) {
    const p = this.geo.attributes.position.array, b = this.base;
    const amp = 0.18 + this.choppy * 0.25;
    for (let i = 0; i < p.length; i += 3) {
      const x = b[i], z = b[i + 2];
      p[i + 1] = Math.sin(x * 0.16 + t * 1.1) * amp + Math.cos(z * 0.21 + t * 0.9) * amp * 0.8 + Math.sin((x + z) * 0.35 + t * 1.7) * amp * 0.35;
    }
    this.geo.attributes.position.needsUpdate = true;
    // Slightly darker, deeper water at night.
    this.material.color.setRGB(0.18 - night * 0.08, 0.56 - night * 0.3, 0.76 - night * 0.32);
  }
}

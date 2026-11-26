// Heightmap terrain: a regular grid of vertices with per-vertex height and paint.
// Colors come from height/slope ("auto") unless a vertex has been painted.
import * as THREE from 'three';
import { jitter } from './noise.js';

export const GRID = 64;                 // grid segments per side
export const WORLD = 96;                // world units per side
export const CELL = WORLD / GRID;       // size of one grid cell
export const SIDE = GRID + 1;           // vertices per side
export const VERTS = SIDE * SIDE;
export const HMIN = -8, HMAX = 24;      // height clamp

/** Paint palette. Index 0 means "auto" (height-based colour). */
export const PAINTS = [
  { name: 'Auto', color: null },
  { name: 'Grass', color: '#7cbf5a' },
  { name: 'Forest', color: '#4e8c3f' },
  { name: 'Sand', color: '#e9d49b' },
  { name: 'Dirt', color: '#9b7351' },
  { name: 'Path', color: '#cfae7a' },
  { name: 'Rock', color: '#8e9096' },
  { name: 'Snow', color: '#f3f6f8' },
  { name: 'Blossom', color: '#eba6c8' },
  { name: 'Moss', color: '#a3b84a' },
  { name: 'Clay', color: '#c9764f' },
  { name: 'Lava', color: '#3a3236' },
];
const PAINT_COLORS = PAINTS.map((p) => (p.color ? new THREE.Color(p.color) : null));

// Auto palette
const C_DEEP = new THREE.Color('#c2ae7c');
const C_SAND = new THREE.Color('#ead59c');
const C_GRASS = new THREE.Color('#7cbf5a');
const C_GRASS2 = new THREE.Color('#5fa449');
const C_ROCK = new THREE.Color('#8b8a8f');
const C_SNOW = new THREE.Color('#f4f7fa');

export class Terrain {
  constructor(scene) {
    this.heights = new Float32Array(VERTS);
    this.paint = new Uint8Array(VERTS);
    this.waterLevel = 0;

    // Build an indexed grid. Diagonals alternate for a nicer low-poly look.
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(VERTS * 3);
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i;
        pos[k * 3] = i * CELL - WORLD / 2;
        pos[k * 3 + 2] = j * CELL - WORLD / 2;
      }
    }
    const idx = [];
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const a = j * SIDE + i, b = a + 1, c = a + SIDE, d = c + 1;
        if ((i + j) % 2 === 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, c, d, a, d, b);
      }
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3));
    this.geometry = geo;

    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = 'terrain';
    scene.add(this.mesh);

    // A wide sandy seabed so the ocean never looks bottomless.
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(5200, 5200).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#a8976c', roughness: 1 })
    );
    bed.position.y = HMIN + 1.5;
    scene.add(bed);
    this.seabed = bed;
  }

  /** Grid index for vertex (i, j). */
  static index(i, j) { return j * SIDE + i; }

  /** Bilinear height sample at world (x, z). Outside the grid returns the seabed. */
  heightAt(x, z) {
    const gx = (x + WORLD / 2) / CELL, gz = (z + WORLD / 2) / CELL;
    if (gx < 0 || gz < 0 || gx > GRID || gz > GRID) return HMIN + 1.5;
    const i = Math.min(GRID - 1, Math.floor(gx)), j = Math.min(GRID - 1, Math.floor(gz));
    const fx = gx - i, fz = gz - j, h = this.heights;
    const a = h[j * SIDE + i], b = h[j * SIDE + i + 1], c = h[(j + 1) * SIDE + i], d = h[(j + 1) * SIDE + i + 1];
    return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
  }

  /** Approximate slope (rise over run) at vertex k. */
  slopeAt(i, j) {
    const h = this.heights, c = h[j * SIDE + i];
    let m = 0;
    if (i > 0) m = Math.max(m, Math.abs(c - h[j * SIDE + i - 1]));
    if (i < GRID) m = Math.max(m, Math.abs(c - h[j * SIDE + i + 1]));
    if (j > 0) m = Math.max(m, Math.abs(c - h[(j - 1) * SIDE + i]));
    if (j < GRID) m = Math.max(m, Math.abs(c - h[(j + 1) * SIDE + i]));
    return m / CELL;
  }

  /** Height/slope based colour for a vertex (used when paint index is 0). */
  autoColor(i, j, out) {
    const h = this.heights[j * SIDE + i];
    const w = this.waterLevel;
    const slope = this.slopeAt(i, j);
    if (h < w - 0.3) out.copy(C_DEEP);
    else if (h < w + 0.7) out.copy(C_SAND);
    else if (h < 12) {
      out.lerpColors(C_GRASS, C_GRASS2, Math.min(1, Math.max(0, (h - 2) / 8)));
      if (slope > 1.3) out.lerp(C_ROCK, Math.min(1, (slope - 1.3) / 0.8)); // cliffs blend to rock
    } else if (h < 15) out.copy(slope > 1.8 ? C_ROCK : C_ROCK.clone().lerp(C_SNOW, (h - 12) / 6));
    else out.copy(C_SNOW);
    return out;
  }

  /** Push heights/paint into the GPU buffers. Cheap enough to do every stroke frame. */
  update() {
    const pos = this.geometry.attributes.position.array;
    const col = this.geometry.attributes.color.array;
    const tmp = new THREE.Color();
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i;
        pos[k * 3 + 1] = this.heights[k];
        const p = this.paint[k];
        if (p && PAINT_COLORS[p]) tmp.copy(PAINT_COLORS[p]);
        else this.autoColor(i, j, tmp);
        const v = 1 + jitter(k) * 0.04; // subtle per-vertex variation
        col[k * 3] = tmp.r * v; col[k * 3 + 1] = tmp.g * v; col[k * 3 + 2] = tmp.b * v;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }

  /**
   * Apply a brush at world (x, z).
   * @param {'raise'|'lower'|'smooth'|'flatten'|'paint'} tool
   * @param {number} radius world units
   * @param {number} strength 0..1
   * @param {number} dt seconds since last application
   * @param {object} opts { target: flatten height, paint: palette index }
   */
  applyBrush(tool, x, z, radius, strength, dt, opts = {}) {
    const h = this.heights;
    const gx = (x + WORLD / 2) / CELL, gz = (z + WORLD / 2) / CELL, gr = radius / CELL;
    const i0 = Math.max(0, Math.floor(gx - gr)), i1 = Math.min(GRID, Math.ceil(gx + gr));
    const j0 = Math.max(0, Math.floor(gz - gr)), j1 = Math.min(GRID, Math.ceil(gz + gr));
    const src = tool === 'smooth' ? h.slice() : null;
    let changed = false;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i - gx, j - gz) / gr;
        if (d > 1) continue;
        const fall = 0.5 + 0.5 * Math.cos(d * Math.PI); // smooth cosine falloff
        const k = j * SIDE + i;
        if (tool === 'raise') h[k] += strength * 10 * dt * fall;
        else if (tool === 'lower') h[k] -= strength * 10 * dt * fall;
        else if (tool === 'flatten') h[k] += (opts.target - h[k]) * Math.min(1, strength * 8 * dt * fall);
        else if (tool === 'smooth') {
          let s = 0, n = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii > GRID || jj > GRID) continue;
            s += src[jj * SIDE + ii]; n++;
          }
          h[k] += (s / n - h[k]) * Math.min(1, strength * 10 * dt * fall);
        } else if (tool === 'paint') {
          if (d <= 0.85) this.paint[k] = opts.paint ?? 0;
        }
        h[k] = Math.min(HMAX, Math.max(HMIN, h[k]));
        changed = true;
      }
    }
    if (changed) this.update();
    return changed;
  }

  /** Is (x, z) dry land (above water by a margin)? */
  isLand(x, z, margin = 0.25) {
    return this.heightAt(x, z) > this.waterLevel + margin;
  }
}

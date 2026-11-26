// Heightmap terrain: a regular grid of vertices with per-vertex height and paint.
// Colors come from height/slope ("auto") unless a vertex has been painted.
import * as THREE from 'three';
import { jitter, fbm } from './noise.js';
import { sharedGradient } from './props.js';

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
const C_DEEP = new THREE.Color('#b7a06e');
const C_SAND = new THREE.Color('#f0d9a4');
const C_SAND2 = new THREE.Color('#e0c48a');
const C_GRASS = new THREE.Color('#7ec45c');
const C_GRASS2 = new THREE.Color('#4f9a42');
const C_GRASS3 = new THREE.Color('#9ed072');
const C_DRY = new THREE.Color('#c9d67e');
const C_ROCK = new THREE.Color('#8d8b90');
const C_SNOW = new THREE.Color('#f7f8fb');
const TMP = new THREE.Color();
const TMP2 = new THREE.Color();

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

    // Smooth normals + a soft toon ramp. Flat shading ignores vertex colours on MeshToonMaterial.
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: sharedGradient() });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = 'terrain';
    scene.add(this.mesh);

    // A wide sandy seabed so the ocean never looks bottomless.
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(5200, 5200).rotateX(-Math.PI / 2),
      new THREE.MeshToonMaterial({ color: '#c6b48c', gradientMap: sharedGradient() })
    );
    bed.position.y = HMIN + 1.5;
    scene.add(bed);
    this.seabed = bed;

    // Low-res height field sampled by the water shader for shore foam and depth colour.
    this.heightData = new Uint8Array(SIDE * SIDE * 4);
    this.heightTex = new THREE.DataTexture(this.heightData, SIDE, SIDE);
    this.heightTex.format = THREE.RGBAFormat;
    this.heightTex.type = THREE.UnsignedByteType;
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.wrapS = this.heightTex.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTex.generateMipmaps = false;
    this.heightTex.colorSpace = THREE.LinearSRGBColorSpace;
    this.heightTex.needsUpdate = true;
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
  autoColor(i, j, out, n, n2) {
    const h = this.heights[j * SIDE + i];
    const w = this.waterLevel;
    const slope = this.slopeAt(i, j);
    if (h < w - 1.3) out.copy(C_DEEP);
    else if (h < w + 0.25) {
      out.copy(C_DEEP).lerp(C_SAND, THREE.MathUtils.smoothstep(h, w - 1.3, w + 0.25));
      out.lerp(C_SAND2, n2 * 0.35);
    } else if (h < w + 1.45) {
      const beach = THREE.MathUtils.smoothstep(h, w + 0.15, w + 1.45);
      TMP2.copy(C_GRASS).lerp(C_GRASS2, n * 0.7);
      out.copy(C_SAND).lerp(C_SAND2, n2 * 0.45);
      out.lerp(TMP2, beach);
    } else if (h < 12) {
      out.copy(C_GRASS).lerp(C_GRASS2, Math.min(1, Math.max(0, (h - 2) / 9)));
      out.lerp(C_GRASS3, n * 0.5);
      out.lerp(C_DRY, n2 * 0.28);
      if (slope > 0.85) out.lerp(C_ROCK, Math.min(1, (slope - 0.85) / 1.15));
    } else if (h < 16) {
      const snow = THREE.MathUtils.smoothstep(h, 11.2, 15.2);
      out.copy(C_ROCK).lerp(C_SNOW, snow);
      if (slope > 1.45) out.lerp(C_ROCK, 0.45 * (1 - snow));
    } else out.copy(C_SNOW);
    return out;
  }

  /** Push heights/paint into the GPU buffers. Cheap enough to do every stroke frame. */
  update() {
    const pos = this.geometry.attributes.position.array;
    const col = this.geometry.attributes.color.array;
    const tmp = TMP;
    const span = HMAX - HMIN;
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i;
        const x = i * CELL, z = j * CELL;
        const n = fbm(x * 0.045, z * 0.045, 4, 3);
        const n2 = fbm(x * 0.12 + 8, z * 0.12, 15, 2);
        pos[k * 3 + 1] = this.heights[k];
        const p = this.paint[k];
        if (p && PAINT_COLORS[p]) {
          tmp.copy(PAINT_COLORS[p]);
          tmp.lerp(C_SAND2, (n2 - 0.5) * 0.12);
        } else this.autoColor(i, j, tmp, n, n2);
        const v = 0.96 + jitter(k) * 0.035 + (n - 0.5) * 0.06;
        col[k * 3] = tmp.r * v; col[k * 3 + 1] = tmp.g * v; col[k * 3 + 2] = tmp.b * v;
        const enc = Math.max(0, Math.min(255, ((this.heights[k] - HMIN) / span) * 255));
        this.heightData[k * 4] = enc;
        this.heightData[k * 4 + 3] = 255;
      }
    }
    this.heightTex.needsUpdate = true;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
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

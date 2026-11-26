// Random island generator: heights from warped radial falloff + fBm, then props.
import { makeRng, fbm } from './noise.js';
import { SIDE, VERTS, CELL, WORLD, GRID } from './terrain.js';

/**
 * @param {number} seed
 * @param {import('./terrain.js').Terrain} terrain used for height queries while placing props
 * @returns {{heights: Float32Array, paint: Uint8Array, props: object[]}}
 */
export function generateIsland(seed, terrain, waterLevel = 0) {
  const rng = makeRng(seed);
  const heights = new Float32Array(VERTS);
  const paint = new Uint8Array(VERTS);
  const ox = rng() * 100, oz = rng() * 100;
  const peakX = (rng() - 0.5) * 18, peakZ = (rng() - 0.5) * 18;
  const mountain = 4 + rng() * 9;
  const radius = 0.62 + rng() * 0.18;

  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      const x = i * CELL - WORLD / 2, z = j * CELL - WORLD / 2;
      const nx = x / (WORLD / 2), nz = z / (WORLD / 2);
      // Warp the radius with noise so coastlines are irregular.
      const warp = (fbm(nx * 2 + ox, nz * 2 + oz, seed, 3) - 0.5) * 0.55;
      const r = Math.hypot(nx, nz) + warp;
      const island = Math.max(0, Math.min(1, (radius - r) / 0.35)); // 0 = sea, 1 = inland
      const shaped = island * island * (3 - 2 * island);
      const hills = fbm(nx * 3 + oz, nz * 3 + ox, seed + 5, 4);
      const peak = Math.exp(-((x - peakX) ** 2 + (z - peakZ) ** 2) / 380) * mountain;
      let h = -6 + shaped * (7.5 + hills * 4) + shaped * peak;
      // Terrace a little for that cozy diorama feel.
      h = h * 0.85 + Math.round(h / 1.5) * 1.5 * 0.15;
      heights[j * SIDE + i] = h;
    }
  }

  // Temporarily load heights into the terrain so we can query them.
  terrain.heights.set(heights);
  terrain.waterLevel = waterLevel;

  const props = [];
  const flatEnough = (x, z) => {
    const h = terrain.heightAt(x, z);
    return Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(terrain.heightAt(x + dx * 1.2, z + dz * 1.2) - h))) < 0.6;
  };
  const randPos = () => ({ x: (rng() - 0.5) * (WORLD - 8), z: (rng() - 0.5) * (WORLD - 8) });
  const near = (x, z, d) => props.some((p) => Math.hypot(p.x - x, p.z - z) < d);
  const push = (type, x, z, scale = 0.85 + rng() * 0.35) => props.push({ type, x, z, rot: rng() * Math.PI * 2, scale, seed: (rng() * 1000) | 0 });

  // A little village: houses on flat land with lamps and a campfire.
  let village = null;
  for (let t = 0; t < 300 && !village; t++) {
    const p = randPos(), h = terrain.heightAt(p.x, p.z);
    if (h > waterLevel + 1.2 && h < waterLevel + 6 && flatEnough(p.x, p.z)) village = p;
  }
  if (village) {
    push('campfire', village.x, village.z, 1);
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 30; t++) {
        const a = rng() * Math.PI * 2, d = 5 + rng() * 6;
        const x = village.x + Math.cos(a) * d, z = village.z + Math.sin(a) * d;
        const h = terrain.heightAt(x, z);
        if (h > waterLevel + 0.9 && flatEnough(x, z) && !near(x, z, 3.5)) {
          push(rng() < 0.7 ? 'house' : 'hut', x, z, 0.9 + rng() * 0.2);
          props[props.length - 1].rot = Math.atan2(village.x - x, village.z - z); // face the fire
          if (rng() < 0.7) push('lamp', x + Math.cos(a + 0.6) * 2.2, z + Math.sin(a + 0.6) * 2.2, 1);
          break;
        }
      }
    }
    if (rng() < 0.6) push('well', village.x + 2.5, village.z - 2, 1);
    push('bench', village.x - 2, village.z + 1.5, 1);
  }

  // Windmill on a hill, lighthouse near the shore.
  for (let t = 0; t < 200; t++) {
    const p = randPos(), h = terrain.heightAt(p.x, p.z);
    if (h > waterLevel + 4 && h < 11 && flatEnough(p.x, p.z) && !near(p.x, p.z, 5)) { push('windmill', p.x, p.z, 1); break; }
  }
  for (let t = 0; t < 300; t++) {
    const p = randPos(), h = terrain.heightAt(p.x, p.z);
    if (h > waterLevel + 0.8 && h < waterLevel + 2.5 && !near(p.x, p.z, 5) && Math.hypot(p.x, p.z) > 20) { push('lighthouse', p.x, p.z, 1); break; }
  }

  // A dock pointing out to sea from a beach.
  for (let t = 0; t < 400; t++) {
    const p = randPos(), h = terrain.heightAt(p.x, p.z);
    if (h > waterLevel - 0.6 && h < waterLevel - 0.1) {
      const rot = Math.atan2(p.x, p.z); // outward from the centre
      props.push({ type: 'dock', x: p.x + Math.sin(rot) * 1.5, z: p.z + Math.cos(rot) * 1.5, rot, scale: 1, seed: 1 });
      break;
    }
  }

  // Vegetation and rocks
  const count = 520 + Math.floor(rng() * 200);
  for (let k = 0; k < count; k++) {
    const p = randPos(), h = terrain.heightAt(p.x, p.z);
    if (h < waterLevel + 0.3 || near(p.x, p.z, 1.6)) continue;
    const roll = rng();
    if (h < waterLevel + 1.0) { if (roll < 0.35) push('palm', p.x, p.z); else if (roll < 0.45) push('rock', p.x, p.z); }
    else if (h < 9) {
      const forest = fbm(p.x * 0.05 + 3, p.z * 0.05, seed + 9, 2);
      if (forest > 0.52) push(roll < 0.55 ? 'pine' : roll < 0.85 ? 'oak' : 'birch', p.x, p.z);
      else if (roll < 0.25) push('oak', p.x, p.z);
      else if (roll < 0.33) push('cherry', p.x, p.z);
      else if (roll < 0.5) push('bush', p.x, p.z);
      else if (roll < 0.66) push('flowers', p.x, p.z);
      else if (roll < 0.72) push('rock', p.x, p.z);
      else if (roll < 0.75) push('mushroom', p.x, p.z, 0.6 + rng() * 0.3);
    } else if (h < 13) { if (roll < 0.4) push('pine', p.x, p.z); else if (roll < 0.6) push('boulder', p.x, p.z, 0.6 + rng() * 0.5); }
    else if (roll < 0.3) push('rock', p.x, p.z);
  }
  return { heights, paint, props };
}

/** A flat, gently rounded starter island for Reset. */
export function flatIsland() {
  const heights = new Float32Array(VERTS);
  for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
    const x = i / GRID - 0.5, z = j / GRID - 0.5;
    const r = Math.hypot(x, z) * 2;
    const t = Math.max(0, Math.min(1, (0.7 - r) / 0.25));
    heights[j * SIDE + i] = -6 + t * t * (3 - 2 * t) * 7.5;
  }
  return { heights, paint: new Uint8Array(VERTS), props: [] };
}

/**
 * Wide, flat-ish default landmass for Clear Island.
 * No sculpting, no paint, no props — an empty island to build on.
 * Distinct from flatIsland(), which stays the smaller blank beach used by Reset.
 */
export function baseIsland() {
  const heights = new Float32Array(VERTS);
  for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
    const x = i / GRID - 0.5, z = j / GRID - 0.5;
    const r = Math.hypot(x * 1.04, z * 1.04) * 2;
    const t = Math.max(0, Math.min(1, (0.98 - r) / 0.22));
    const s = t * t * (3 - 2 * t);
    const swell = Math.max(0, 1 - (x * x + z * z) * 5.5);
    heights[j * SIDE + i] = -6.2 + s * (7.35 + swell * 0.4);
  }
  return { heights, paint: new Uint8Array(VERTS), props: [] };
}

// Procedural props built from primitives, plus the PropManager that owns them.
// To add a new prop: add an entry to PROP_TYPES with a build() function.
import * as THREE from 'three';
import { makeRng } from './noise.js';

// ---------------------------------------------------------------------------
// Shared geometry / material caches (props share GPU resources).
// ---------------------------------------------------------------------------
const geoCache = new Map();
const matCache = new Map();
const glowMats = []; // { mat, base, night } – emissive strength follows night factor

function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 7) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r, h, s = 7) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const ico = (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const dode = (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));
const sphere = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 8, 6));

/** Flat-shaded matte material, cached by colour. */
export function mat(color, rough = 0.85) {
  const key = `${color}|${rough}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: true }));
  return matCache.get(key);
}
/** Emissive material that brightens at night (windows, lanterns, flames). */
function glowMat(color, base = 0.15, night = 1.6) {
  const key = `g${color}|${base}|${night}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.6, flatShading: true });
    matCache.set(key, m);
    glowMats.push({ mat: m, base, night });
  }
  return matCache.get(key);
}

// Soft additive halo sprite used around lights at night.
let haloTexture = null;
const haloMats = new Map();
function haloMat(color) {
  if (!haloTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    haloTexture = new THREE.CanvasTexture(c);
  }
  if (!haloMats.has(color)) {
    haloMats.set(color, new THREE.SpriteMaterial({ map: haloTexture, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  }
  return haloMats.get(color);
}

/** Add a mesh to a group with shadows enabled. */
function add(group, geometry, material, x = 0, y = 0, z = 0, rot = null, scale = null) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
/** Register a glow point (halo + candidate for the point-light pool). */
function glow(group, x, y, z, color, size = 1.6, power = 1, flicker = false) {
  const s = new THREE.Sprite(haloMat(color));
  s.position.set(x, y, z);
  s.scale.setScalar(size);
  s.userData.isHalo = true;
  group.add(s);
  (group.userData.glow ||= []).push({ local: new THREE.Vector3(x, y, z), color, power, flicker });
}

// ---------------------------------------------------------------------------
// Prop catalogue
//   snap:   'ground' (sit on terrain) | 'water' (float at water level, e.g. docks)
//   radius: collision radius for walk mode (0 = walk through)
//   deck:   walkable top surface {w, l, h} in local space (docks/bridges)
// ---------------------------------------------------------------------------
const WOOD = '#a87b51', TRUNK = '#8a5a3b', STONE = '#9c9a94';

export const PROP_TYPES = {
  oak: { label: 'Oak', icon: '🌳', radius: 0.4, build(g, r) {
    add(g, cyl(0.2, 0.3, 1.6), mat(TRUNK), 0, 0.8, 0);
    const leaf = mat(r() < 0.5 ? '#5fae4e' : '#6dbb55');
    add(g, ico(1.1), leaf, 0, 2.3, 0);
    add(g, ico(0.8), leaf, 0.6, 1.95, 0.3);
    add(g, ico(0.75), mat('#4f9a45'), -0.55, 2.05, -0.3);
  } },
  pine: { label: 'Pine', icon: '🌲', radius: 0.35, build(g) {
    add(g, cyl(0.16, 0.24, 1.2), mat(TRUNK), 0, 0.6, 0);
    for (let k = 0; k < 3; k++) add(g, cone(1.3 - k * 0.32, 1.6, 7), mat(k % 2 ? '#2f7a4a' : '#358752'), 0, 1.5 + k * 0.85, 0);
  } },
  birch: { label: 'Birch', icon: '🌿', radius: 0.3, build(g) {
    add(g, cyl(0.11, 0.15, 2.6), mat('#efeae0'), 0, 1.3, 0);
    add(g, box(0.24, 0.08, 0.24), mat('#3b3a36'), 0, 0.9, 0);
    add(g, box(0.22, 0.06, 0.22), mat('#3b3a36'), 0, 1.7, 0);
    add(g, dode(0.9), mat('#b5d35a'), 0, 2.9, 0);
    add(g, dode(0.55), mat('#c8dc6a'), 0.45, 2.4, 0.2);
  } },
  palm: { label: 'Palm', icon: '🌴', radius: 0.3, build(g) {
    const bark = mat('#b08a5a');
    let x = 0;
    for (let k = 0; k < 5; k++) { add(g, cyl(0.15, 0.19, 0.72), bark, x, 0.36 + k * 0.66, 0, [0, 0, -0.1 * k]); x += 0.07 * k; }
    const top = new THREE.Group(); top.position.set(x, 3.45, 0); g.add(top);
    const leaf = mat('#4fa84a');
    for (let k = 0; k < 7; k++) {
      const pivot = new THREE.Group(); pivot.rotation.y = (k / 7) * Math.PI * 2; top.add(pivot);
      add(pivot, box(1.9, 0.05, 0.42), leaf, 0.9, -0.25, 0, [0, 0, -0.45]);
    }
    for (let k = 0; k < 3; k++) add(top, sphere(0.13), mat('#6b4a2b'), Math.cos(k * 2.1) * 0.2, -0.2, Math.sin(k * 2.1) * 0.2);
  } },
  cherry: { label: 'Blossom', icon: '🌸', radius: 0.4, build(g) {
    add(g, cyl(0.17, 0.27, 1.5), mat('#6e4630'), 0, 0.75, 0);
    add(g, ico(1.0), mat('#f2a7c9'), 0, 2.15, 0);
    add(g, ico(0.7), mat('#f7c3db'), 0.6, 1.9, 0.2);
    add(g, ico(0.65), mat('#e98fb8'), -0.5, 1.95, -0.3);
  } },
  bush: { label: 'Bush', icon: '🍀', radius: 0, build(g) {
    add(g, ico(0.6), mat('#4f9a45'), 0, 0.45, 0);
    add(g, ico(0.45), mat('#5fae4e'), 0.45, 0.35, 0.1);
    add(g, ico(0.4), mat('#468c3e'), -0.4, 0.3, -0.1);
  } },
  flowers: { label: 'Flowers', icon: '🌼', radius: 0, build(g, r) {
    const cols = ['#ff6b8b', '#ffd166', '#c77dff', '#ffffff', '#ff9f1c', '#7ad3ff'];
    for (let k = 0; k < 8; k++) {
      const a = r() * Math.PI * 2, d = r() * 0.7, x = Math.cos(a) * d, z = Math.sin(a) * d;
      add(g, cyl(0.025, 0.025, 0.4, 4), mat('#3f8a43'), x, 0.2, z);
      add(g, ico(0.11), mat(cols[Math.floor(r() * cols.length)]), x, 0.42, z);
    }
  } },
  mushroom: { label: 'Shroom', icon: '🍄', radius: 0.3, build(g) {
    add(g, cyl(0.22, 0.28, 0.9, 8), mat('#f4ead6'), 0, 0.45, 0);
    add(g, sphere(0.75), mat('#d9473b'), 0, 0.95, 0, null, [1, 0.6, 1]);
    for (let k = 0; k < 5; k++) add(g, sphere(0.1), mat('#ffffff'), Math.cos(k * 1.3) * 0.45, 1.25 - (k % 2) * 0.1, Math.sin(k * 1.3) * 0.45);
  } },
  rock: { label: 'Rock', icon: '🪨', radius: 0.6, build(g) {
    add(g, dode(0.7), mat('#8e9096'), 0, 0.3, 0, [0.3, 0.6, 0], [1, 0.7, 0.9]);
    add(g, dode(0.35), mat('#a3a5aa'), 0.6, 0.15, 0.3, [0.5, 0.2, 0.1]);
  } },
  boulder: { label: 'Boulder', icon: '⛰️', radius: 1.4, build(g) {
    add(g, ico(1.4), mat('#85878d'), 0, 0.8, 0, [0.2, 0.4, 0.1], [1.2, 0.8, 1]);
    add(g, ico(0.8), mat('#9a9ca1'), 1.1, 0.4, 0.6, [0.6, 0.1, 0.3]);
    add(g, ico(0.5), mat('#7ec06a'), -0.4, 1.55, 0.2, null, [1, 0.35, 1]); // moss cap
  } },
  house: { label: 'House', icon: '🏠', radius: 1.6, build(g, r) {
    const roofs = ['#c8553d', '#4f6d7a', '#7a9e3a', '#a05c8c'];
    add(g, box(2.6, 1.8, 2.2), mat('#f3e3c3'), 0, 0.9, 0);
    add(g, cone(2.1, 1.3, 4), mat(roofs[Math.floor(r() * roofs.length)]), 0, 2.45, 0, [0, Math.PI / 4, 0], [1, 1, 0.86]);
    add(g, box(0.3, 0.8, 0.3), mat('#8c6b5a'), 0.7, 2.7, -0.4);
    add(g, box(0.55, 0.95, 0.06), mat('#7a4e2d'), 0, 0.48, 1.11);
    const win = glowMat('#ffd27a', 0.05, 2.2);
    add(g, box(0.45, 0.45, 0.06), win, -0.85, 1.15, 1.11);
    add(g, box(0.45, 0.45, 0.06), win, 0.85, 1.15, 1.11);
    add(g, box(0.06, 0.45, 0.45), win, 1.31, 1.1, 0);
    add(g, box(0.06, 0.45, 0.45), win, -1.31, 1.1, 0);
    glow(g, 0, 1.2, 1.4, '#ffcf7a', 2.6, 0.7);
  } },
  hut: { label: 'Hut', icon: '🛖', radius: 1.3, build(g) {
    add(g, cyl(1.1, 1.2, 1.3, 8), mat('#c9a46b'), 0, 0.65, 0);
    add(g, cone(1.65, 1.4, 8), mat('#d9b65a'), 0, 2.0, 0);
    add(g, box(0.5, 0.85, 0.08), mat('#5a3d27'), 0, 0.43, 1.12);
    add(g, box(0.32, 0.3, 0.06), glowMat('#ffbf5e', 0.05, 2), 0.65, 0.85, 0.92, [0, 0.6, 0]);
  } },
  tent: { label: 'Tent', icon: '⛺', radius: 1.1, build(g) {
    add(g, cone(1.3, 1.7, 4), mat('#e76f51'), 0, 0.85, 0, [0, Math.PI / 4, 0]);
    add(g, box(0.5, 0.7, 0.05), mat('#4a2c22'), 0, 0.35, 0.93);
    add(g, cyl(0.04, 0.04, 0.5, 4), mat(WOOD), 0, 1.85, 0);
  } },
  windmill: { label: 'Windmill', icon: '🌬️', radius: 1.1, build(g) {
    add(g, cyl(0.7, 1.1, 3.6, 8), mat('#efe6d2'), 0, 1.8, 0);
    add(g, cone(0.95, 1.0, 8), mat('#8b4b3b'), 0, 4.1, 0);
    add(g, box(0.5, 0.8, 0.08), mat('#6b4a2b'), 0, 0.4, 1.02);
    add(g, box(0.35, 0.35, 0.06), glowMat('#ffd27a', 0.05, 2), 0, 2.4, 0.86);
    const blades = new THREE.Group(); blades.position.set(0, 3.4, 1.0); g.add(blades);
    add(blades, cyl(0.15, 0.15, 0.3, 6), mat('#6b4a2b'), 0, 0, 0, [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Group(); p.rotation.z = (k * Math.PI) / 2; blades.add(p);
      add(p, box(0.08, 2.3, 0.04), mat('#6b4a2b'), 0, 1.2, 0.05);
      add(p, box(0.5, 1.8, 0.03), mat('#f8f3e6'), 0.25, 1.4, 0.07);
    }
    g.userData.spin = blades;
  } },
  lighthouse: { label: 'Lighthouse', icon: '🗼', radius: 1.3, build(g) {
    add(g, cyl(1.15, 1.3, 1.0, 8), mat(STONE), 0, 0.5, 0);
    for (let k = 0; k < 4; k++) {
      const rb = 0.95 - k * 0.09, rt = rb - 0.09;
      add(g, cyl(rt, rb, 1.4, 8), mat(k % 2 ? '#d64545' : '#f6f1e7'), 0, 1.7 + k * 1.4, 0);
    }
    add(g, cyl(0.75, 0.75, 0.12, 8), mat('#3b3a36'), 0, 6.65, 0);
    add(g, cyl(0.5, 0.5, 0.7, 8), glowMat('#fff2a8', 0.3, 3), 0, 7.05, 0);
    add(g, cone(0.7, 0.7, 8), mat('#d64545'), 0, 7.75, 0);
    glow(g, 0, 7.05, 0, '#fff2a8', 6, 2.2);
  } },
  well: { label: 'Well', icon: '🪣', radius: 0.8, build(g) {
    add(g, cyl(0.7, 0.75, 0.6, 10), mat(STONE), 0, 0.3, 0);
    add(g, cyl(0.55, 0.55, 0.05, 10), mat('#3a8fb7', 0.3), 0, 0.5, 0);
    add(g, box(0.1, 1.3, 0.1), mat(WOOD), 0.62, 1.0, 0);
    add(g, box(0.1, 1.3, 0.1), mat(WOOD), -0.62, 1.0, 0);
    add(g, cone(1.0, 0.55, 4), mat('#c8553d'), 0, 1.9, 0, [0, Math.PI / 4, 0]);
  } },
  fence: { label: 'Fence', icon: '🚧', radius: 0, build(g) {
    const w = mat('#b07d4f');
    add(g, box(0.15, 0.9, 0.15), w, -1, 0.45, 0);
    add(g, box(0.15, 0.9, 0.15), w, 1, 0.45, 0);
    add(g, box(2.15, 0.1, 0.08), w, 0, 0.35, 0);
    add(g, box(2.15, 0.1, 0.08), w, 0, 0.7, 0);
  } },
  lamp: { label: 'Lamp', icon: '🏮', radius: 0.15, build(g) {
    add(g, cyl(0.18, 0.22, 0.15, 8), mat('#3d3d3d'), 0, 0.08, 0);
    add(g, cyl(0.05, 0.07, 2.2, 6), mat('#4a4a4a'), 0, 1.1, 0);
    add(g, box(0.32, 0.38, 0.32), glowMat('#ffd27a', 0.2, 3), 0, 2.3, 0);
    add(g, cone(0.28, 0.22, 4), mat('#3d3d3d'), 0, 2.6, 0, [0, Math.PI / 4, 0]);
    glow(g, 0, 2.3, 0, '#ffcf7a', 2.4, 1);
  } },
  campfire: { label: 'Campfire', icon: '🔥', radius: 0, build(g) {
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add(g, dode(0.16), mat('#7d7b78'), Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55); }
    for (let k = 0; k < 3; k++) add(g, cyl(0.08, 0.08, 0.9, 5), mat('#6b4a2b'), 0, 0.12, 0, [Math.PI / 2, (k * Math.PI) / 3, 0.3]);
    const f1 = add(g, cone(0.26, 0.75, 6), glowMat('#ff7a1f', 1.2, 1.6), 0, 0.48, 0);
    const f2 = add(g, cone(0.15, 0.5, 6), glowMat('#ffd35a', 1.4, 1.6), 0.03, 0.42, 0.02);
    f1.castShadow = f2.castShadow = false;
    g.userData.flames = [f1, f2];
    glow(g, 0, 0.6, 0, '#ff9a3c', 2.6, 1.3, true);
  } },
  bench: { label: 'Bench', icon: '🪑', radius: 0, build(g) {
    const w = mat(WOOD);
    add(g, box(1.6, 0.1, 0.5), w, 0, 0.45, 0);
    add(g, box(1.6, 0.4, 0.08), w, 0, 0.75, -0.22);
    for (const x of [-0.7, 0.7]) add(g, box(0.1, 0.45, 0.45), mat('#5a3d27'), x, 0.22, 0);
  } },
  barrel: { label: 'Barrel', icon: '🛢️', radius: 0.4, build(g) {
    add(g, cyl(0.38, 0.38, 0.9, 10), mat('#9b6a3f'), 0, 0.45, 0);
    add(g, cyl(0.4, 0.4, 0.07, 10), mat('#55555a'), 0, 0.2, 0);
    add(g, cyl(0.4, 0.4, 0.07, 10), mat('#55555a'), 0, 0.7, 0);
  } },
  dock: { label: 'Dock', icon: '🛶', radius: 0, snap: 'water', deck: { w: 1.7, l: 4.2, h: 0.06 }, build(g) {
    for (let k = 0; k < 7; k++) add(g, box(1.7, 0.12, 0.55), mat(k % 2 ? '#a87b51' : '#b88a5e'), 0, 0, -1.8 + k * 0.6);
    for (const [x, z] of [[-0.75, -1.9], [0.75, -1.9], [-0.75, 1.9], [0.75, 1.9]]) add(g, cyl(0.09, 0.09, 2.6, 6), mat('#6b4a2b'), x, -1.2, z);
  } },
  bridge: { label: 'Bridge', icon: '🌉', radius: 0, snap: 'water', deck: { w: 1.6, l: 6, h: 0.35 }, build(g) {
    for (let k = 0; k < 9; k++) {
      const z = -3 + k * 0.75, y = Math.cos((z / 3) * Math.PI * 0.5) * 0.6;
      add(g, box(1.6, 0.12, 0.7), mat(k % 2 ? '#a87b51' : '#b88a5e'), 0, y, z, [(-z / 3) * 0.35, 0, 0]);
      for (const x of [-0.75, 0.75]) add(g, box(0.08, 0.6, 0.08), mat('#6b4a2b'), x, y + 0.3, z);
    }
    for (const x of [-0.75, 0.75]) add(g, box(0.06, 0.06, 6.2), mat('#6b4a2b'), x, 0.95, 0);
  } },
};
export const PROP_ORDER = Object.keys(PROP_TYPES);

// ---------------------------------------------------------------------------
// PropManager – owns prop records ({id,type,x,z,rot,scale}) and their meshes.
// ---------------------------------------------------------------------------
export class PropManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);
    this.records = [];
    this.objects = new Map();
    this.nextId = 1;
    this.night = 0;

    // Small pool of real point lights, assigned to the glow points nearest the focus.
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight('#ffb55e', 0, 14, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.lightTimer = 0;
    this.focus = new THREE.Vector3();
  }

  /** Build the mesh group for one record. */
  buildObject(rec) {
    const def = PROP_TYPES[rec.type];
    const g = new THREE.Group();
    def.build(g, makeRng(rec.seed ?? rec.id * 7919));
    g.userData.propId = rec.id;
    return g;
  }

  add(rec) {
    if (!PROP_TYPES[rec.type]) return null;
    rec = { rot: 0, scale: 1, ...rec };
    if (rec.id == null || this.objects.has(rec.id)) rec.id = this.nextId;
    this.nextId = Math.max(this.nextId, rec.id + 1);
    if (rec.seed == null) rec.seed = (Math.random() * 1000) | 0;
    const obj = this.buildObject(rec);
    this.records.push(rec);
    this.objects.set(rec.id, obj);
    this.group.add(obj);
    this.refresh(rec);
    return rec;
  }

  remove(id) {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.group.remove(obj);
    this.objects.delete(id);
    this.records = this.records.filter((r) => r.id !== id);
  }

  get(id) { return this.records.find((r) => r.id === id) || null; }

  clear() {
    for (const obj of this.objects.values()) this.group.remove(obj);
    this.objects.clear();
    this.records = [];
  }

  /** Replace all props with a list of plain records. */
  load(list = []) {
    this.clear();
    this.nextId = 1;
    for (const r of list) this.add({ ...r });
  }

  toList() { return this.records.map((r) => ({ ...r })); }

  /** Height a prop should sit at. */
  groundY(rec) {
    const def = PROP_TYPES[rec.type];
    const h = this.terrain.heightAt(rec.x, rec.z);
    if (def.snap === 'water') return Math.max(h, this.terrain.waterLevel + 0.35);
    return h - 0.05;
  }

  /** Apply a record's transform to its mesh. */
  refresh(rec) {
    const obj = this.objects.get(rec.id);
    if (!obj) return;
    obj.position.set(rec.x, this.groundY(rec), rec.z);
    obj.rotation.y = rec.rot;
    obj.scale.setScalar(rec.scale);
  }

  /** Re-seat every prop on the terrain (after sculpting / water change). */
  snapAll() { for (const r of this.records) this.refresh(r); }

  /** Raycast props; returns the hit record or null. */
  pick(raycaster) {
    const hits = raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      let o = h.object;
      if (o.userData.isHalo) continue;
      while (o && o.userData.propId == null) o = o.parent;
      if (o) return this.get(o.userData.propId);
    }
    return null;
  }

  /** Circles used for walk-mode collision. */
  colliders() {
    const out = [];
    for (const r of this.records) {
      const rad = PROP_TYPES[r.type].radius;
      if (rad > 0) out.push({ x: r.x, z: r.z, r: rad * r.scale });
    }
    return out;
  }

  /** Walkable deck height at (x, z) (docks/bridges), or -Infinity. */
  deckHeight(x, z) {
    let best = -Infinity;
    for (const r of this.records) {
      const deck = PROP_TYPES[r.type].deck;
      if (!deck) continue;
      const dx = x - r.x, dz = z - r.z, c = Math.cos(-r.rot), s = Math.sin(-r.rot);
      const lx = (dx * c - dz * s) / r.scale, lz = (dx * s + dz * c) / r.scale;
      if (Math.abs(lx) <= deck.w / 2 && Math.abs(lz) <= deck.l / 2) {
        const arch = r.type === 'bridge' ? Math.cos((lz / 3) * Math.PI * 0.5) * 0.6 : 0;
        best = Math.max(best, this.groundY(r) + (deck.h + arch) * r.scale);
      }
    }
    return best;
  }

  /** Per-frame animation, glow levels and light-pool assignment. */
  update(dt, time, night) {
    this.night = night;
    for (const g of glowMats) g.mat.emissiveIntensity = g.base + g.night * night;
    for (const m of haloMats.values()) m.opacity = 0.75 * night;

    const flick = 0.85 + Math.sin(time * 17) * 0.08 + Math.sin(time * 29) * 0.07;
    for (const obj of this.objects.values()) {
      if (obj.userData.spin) obj.userData.spin.rotation.z += dt * 1.1;
      if (obj.userData.flames) {
        obj.userData.flames[0].scale.set(1, flick + 0.1, 1);
        obj.userData.flames[1].scale.set(1, 1.15 - (flick - 0.85), 1);
      }
    }

    // Reassign the light pool a few times per second to the closest glow points.
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.4;
      const cands = [];
      const v = new THREE.Vector3();
      for (const obj of this.objects.values()) {
        if (!obj.userData.glow) continue;
        for (const gp of obj.userData.glow) {
          v.copy(gp.local).applyMatrix4(obj.matrixWorld);
          cands.push({ pos: v.clone(), gp, d: v.distanceToSquared(this.focus) });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      this.lights.forEach((l, i) => {
        const c = cands[i];
        l.userData.cand = c || null;
        if (c) { l.position.copy(c.pos); l.color.set(c.gp.color); }
      });
    }
    for (const l of this.lights) {
      const c = l.userData.cand;
      l.intensity = c ? night * 9 * c.gp.power * (c.gp.flicker ? flick : 1) : 0;
    }
  }
}

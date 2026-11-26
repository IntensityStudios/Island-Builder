// Little low-poly character models shared by NPCs and the walk-mode avatar.
import * as THREE from 'three';
import { mat } from './props.js';

function part(parent, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
/** A limb that swings from a pivot at its top. */
function limb(parent, w, h, color, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  part(pivot, new THREE.BoxGeometry(w, h, w), mat(color), 0, -h / 2, 0);
  return pivot;
}

const SHIRTS = ['#e76f51', '#2a9d8f', '#e9c46a', '#8e7dbe', '#f4a261', '#5b8bd9', '#d96c9b'];
const SKINS = ['#f1c7a3', '#d9a27c', '#a8704f', '#7a4e33', '#f6d7bd'];
const HATS = ['#3b3a36', '#c8553d', '#4f6d7a', '#e9c46a', null, null];

/** Villager (~1.5 units tall). Options let the avatar pick its own colours. */
export function makeVillager(r = Math.random, opts = {}) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(r() * a.length)];
  const shirt = opts.shirt || pick(SHIRTS), skin = opts.skin || pick(SKINS);
  const hat = opts.hat !== undefined ? opts.hat : pick(HATS);
  const legs = [limb(g, 0.13, 0.45, '#4a4e69', -0.11, 0.46, 0), limb(g, 0.13, 0.45, '#4a4e69', 0.11, 0.46, 0)];
  part(g, new THREE.CylinderGeometry(0.24, 0.3, 0.6, 7), mat(shirt), 0, 0.75, 0);
  const arms = [limb(g, 0.1, 0.45, shirt, -0.32, 1.0, 0), limb(g, 0.1, 0.45, shirt, 0.32, 1.0, 0)];
  part(g, new THREE.IcosahedronGeometry(0.23, 1), mat(skin), 0, 1.3, 0);
  part(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), mat('#222'), -0.08, 1.33, 0.21);
  part(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), mat('#222'), 0.08, 1.33, 0.21);
  if (hat) {
    part(g, new THREE.CylinderGeometry(0.32, 0.32, 0.04, 8), mat(hat), 0, 1.47, 0);
    part(g, new THREE.CylinderGeometry(0.17, 0.2, 0.2, 8), mat(hat), 0, 1.57, 0);
  }
  g.userData = { legs, arms, kind: 'villager' };
  return g;
}

export function makeBunny(r = Math.random) {
  const g = new THREE.Group();
  const fur = mat(r() < 0.5 ? '#f3efe9' : '#c9a98a');
  const body = new THREE.Group(); g.add(body);
  part(body, new THREE.IcosahedronGeometry(0.25, 0), fur, 0, 0.25, 0).scale.set(1, 0.9, 1.25);
  part(body, new THREE.IcosahedronGeometry(0.16, 0), fur, 0, 0.42, 0.25);
  part(body, new THREE.BoxGeometry(0.06, 0.25, 0.04), fur, -0.06, 0.62, 0.22);
  part(body, new THREE.BoxGeometry(0.06, 0.25, 0.04), fur, 0.06, 0.62, 0.22);
  part(body, new THREE.IcosahedronGeometry(0.07, 0), mat('#ffffff'), 0, 0.3, -0.3);
  g.userData = { body, kind: 'bunny' };
  return g;
}

export function makeSheep() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  part(body, new THREE.IcosahedronGeometry(0.42, 0), mat('#f5f3ee'), 0, 0.55, 0).scale.set(1, 0.85, 1.25);
  part(body, new THREE.BoxGeometry(0.22, 0.24, 0.26), mat('#3b3a36'), 0, 0.65, 0.5);
  for (const [x, z] of [[-0.18, -0.25], [0.18, -0.25], [-0.18, 0.25], [0.18, 0.25]]) part(body, new THREE.BoxGeometry(0.08, 0.3, 0.08), mat('#3b3a36'), x, 0.15, z);
  g.userData = { body, kind: 'sheep' };
  return g;
}

export function makeChicken() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  part(body, new THREE.IcosahedronGeometry(0.2, 0), mat('#fbf7ef'), 0, 0.3, 0).scale.set(1, 1, 1.2);
  part(body, new THREE.IcosahedronGeometry(0.12, 0), mat('#fbf7ef'), 0, 0.5, 0.15);
  part(body, new THREE.ConeGeometry(0.04, 0.1, 4), mat('#f4a261'), 0, 0.5, 0.29).rotation.x = Math.PI / 2;
  part(body, new THREE.BoxGeometry(0.04, 0.08, 0.1), mat('#d62828'), 0, 0.62, 0.15);
  part(body, new THREE.BoxGeometry(0.03, 0.15, 0.03), mat('#f4a261'), -0.07, 0.08, 0);
  part(body, new THREE.BoxGeometry(0.03, 0.15, 0.03), mat('#f4a261'), 0.07, 0.08, 0);
  g.userData = { body, kind: 'chicken' };
  return g;
}

/** Animate walking limbs. `phase` advances with distance travelled; `moving` 0..1. */
export function animateVillager(obj, phase, moving) {
  const s = Math.sin(phase) * 0.7 * moving;
  const { legs, arms } = obj.userData;
  legs[0].rotation.x = s; legs[1].rotation.x = -s;
  arms[0].rotation.x = -s * 0.8; arms[1].rotation.x = s * 0.8;
}

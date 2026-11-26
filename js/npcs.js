// Wandering villagers and critters that stay on dry land.
import * as THREE from 'three';
import { makeVillager, makeBunny, makeSheep, makeChicken, animateVillager } from './characters.js';
import { WORLD } from './terrain.js';

const CRITTERS = [makeBunny, makeSheep, makeChicken];

export class NpcManager {
  constructor(scene, terrain, props) {
    this.terrain = terrain;
    this.props = props;
    this.group = new THREE.Group();
    this.group.name = 'npcs';
    scene.add(this.group);
    this.list = [];
    this.counts = { villager: 4, critter: 6 };
  }

  /** Random dry-land point, optionally near (x, z). */
  randomLand(x = 0, z = 0, radius = WORLD / 2 - 4, tries = 60) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (Math.abs(px) > WORLD / 2 - 2 || Math.abs(pz) > WORLD / 2 - 2) continue;
      if (this.terrain.isLand(px, pz, 0.4)) return { x: px, z: pz };
    }
    return null;
  }

  setCounts(villager, critter) {
    this.counts = { villager: Math.max(0, Math.min(20, villager)), critter: Math.max(0, Math.min(30, critter)) };
    this.respawn();
  }

  respawn() {
    for (const n of this.list) this.group.remove(n.obj);
    this.list = [];
    for (let i = 0; i < this.counts.villager; i++) this.spawn('villager', makeVillager());
    for (let i = 0; i < this.counts.critter; i++) this.spawn('critter', CRITTERS[i % CRITTERS.length]());
  }

  spawn(kind, obj) {
    const p = this.randomLand();
    const n = { kind, obj, x: p?.x ?? 0, z: p?.z ?? 0, tx: 0, tz: 0, wait: Math.random() * 3, phase: Math.random() * 6, yaw: Math.random() * 6, speed: kind === 'villager' ? 1.3 : 1.0 + Math.random() * 0.8 };
    n.tx = n.x; n.tz = n.z;
    obj.visible = !!p;
    this.group.add(obj);
    this.list.push(n);
  }

  /** Re-home NPCs that ended up in water (e.g. after sculpting or water rising). */
  validate() {
    for (const n of this.list) {
      if (!this.terrain.isLand(n.x, n.z, 0.1)) {
        const p = this.randomLand();
        n.obj.visible = !!p;
        if (p) { n.x = n.tx = p.x; n.z = n.tz = p.z; }
      } else n.obj.visible = true;
    }
  }

  update(dt) {
    const colliders = this.props.colliders();
    for (const n of this.list) {
      if (!n.obj.visible) continue;
      let moving = 0;
      if (n.wait > 0) n.wait -= dt;
      else {
        const dx = n.tx - n.x, dz = n.tz - n.z, d = Math.hypot(dx, dz);
        if (d < 0.3) {
          n.wait = 1 + Math.random() * 4;
          const p = this.randomLand(n.x, n.z, 10, 15);
          if (p) { n.tx = p.x; n.tz = p.z; }
        } else {
          const step = Math.min(d, n.speed * dt);
          const nx = n.x + (dx / d) * step, nz = n.z + (dz / d) * step;
          if (this.terrain.isLand(nx, nz, 0.15)) {
            n.x = nx; n.z = nz; moving = 1;
            n.phase += step * (n.kind === 'villager' ? 5 : 7);
            const wantYaw = Math.atan2(dx, dz);
            let dy = wantYaw - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            n.yaw += dy * Math.min(1, dt * 6);
          } else { n.tx = n.x; n.tz = n.z; }
          // Gently slide around solid props.
          for (const c of colliders) {
            const ox = n.x - c.x, oz = n.z - c.z, od = Math.hypot(ox, oz), min = c.r + 0.3;
            if (od < min && od > 0.001) { n.x = c.x + (ox / od) * min; n.z = c.z + (oz / od) * min; }
          }
        }
      }
      const y = this.terrain.heightAt(n.x, n.z);
      n.obj.position.set(n.x, y, n.z);
      n.obj.rotation.y = n.yaw;
      const ud = n.obj.userData;
      if (ud.kind === 'villager') animateVillager(n.obj, n.phase, moving);
      else if (ud.kind === 'bunny') ud.body.position.y = moving ? Math.abs(Math.sin(n.phase)) * 0.3 : 0;
      else if (ud.kind === 'sheep') ud.body.rotation.z = moving ? Math.sin(n.phase) * 0.06 : 0;
      else if (ud.kind === 'chicken') ud.body.rotation.x = moving ? Math.sin(n.phase * 2) * 0.1 : Math.max(0, Math.sin(n.phase + performance.now() / 300)) * 0.5;
    }
  }
}

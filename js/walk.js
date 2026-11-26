// Walk mode: explore the island as a little villager.
// PC: WASD/arrows + mouse (click to lock pointer), Space jump, Shift run, V camera.
// Touch: left joystick to move, drag anywhere else to look, on-screen jump/view buttons.
import * as THREE from 'three';
import { makeVillager, animateVillager } from './characters.js';
import { WORLD } from './terrain.js';

export class WalkMode {
  constructor({ camera, canvas, scene, terrain, props, audio }) {
    Object.assign(this, { camera, canvas, terrain, props, audio });
    this.active = false;
    this.firstPerson = false;
    this.pos = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.pitch = -0.3;
    this.facing = 0;
    this.phase = 0;
    this.onGround = false;
    this.swimming = false;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.jumpQueued = false;
    this.tvSteer = false; // TV remote: left/right turn the camera instead of strafing

    this.avatar = makeVillager(Math.random, { shirt: '#ff7f50', skin: '#f1c7a3', hat: '#e9c46a' });
    this.avatar.visible = false;
    scene.add(this.avatar);
    this.bindInput();
  }

  bindInput() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (e.code === 'KeyV') this.toggleView();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Mouse look: pointer lock if available, otherwise drag.
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement !== c && c.requestPointerLock) {
          try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
        }
      }
      if (drag == null) { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (document.pointerLockElement === c) { this.look(e.movementX, e.movementY, 0.0025); return; }
      if (drag && drag.id === e.pointerId) {
        const s = e.pointerType === 'touch' ? 0.006 : 0.004;
        this.look(e.clientX - drag.x, e.clientY - drag.y, s);
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    const end = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);

    // Virtual joystick
    const joy = document.getElementById('joystick'), knob = document.getElementById('joystick-knob');
    let jid = null;
    const setJoy = (e) => {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const max = r.width / 2 - 10, d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / max; this.joy.y = dy / max;
    };
    joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(e.pointerId); setJoy(e); e.stopPropagation(); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) setJoy(e); });
    const jend = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', jend);
    joy.addEventListener('pointercancel', jend);

    document.getElementById('btn-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); this.jumpQueued = true; });
    document.getElementById('btn-view').addEventListener('click', () => this.toggleView());
  }

  look(dx, dy, s) {
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.3, this.firstPerson ? 1.3 : 0.5);
  }

  toggleView() { this.firstPerson = !this.firstPerson; this.audio?.click(); }

  /** Start walking at the nearest dry spot to (x, z). */
  enter(x, z, yaw = 0) {
    let spot = { x, z };
    if (!this.terrain.isLand(x, z, 0.2)) {
      // Spiral outwards looking for land.
      outer: for (let r = 2; r < WORLD; r += 2) for (let a = 0; a < Math.PI * 2; a += 0.4) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (Math.abs(px) < WORLD / 2 - 2 && Math.abs(pz) < WORLD / 2 - 2 && this.terrain.isLand(px, pz, 0.3)) { spot = { x: px, z: pz }; break outer; }
      }
    }
    this.pos.set(spot.x, this.terrain.heightAt(spot.x, spot.z) + 0.5, spot.z);
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = -0.3;
    this.active = true;
    this.avatar.visible = !this.firstPerson;
  }

  exit() {
    this.active = false;
    this.avatar.visible = false;
    this.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    if (this.tvSteer) {
      if (k.has('ArrowLeft')) this.yaw += dt * 1.8;
      if (k.has('ArrowRight')) this.yaw -= dt * 1.8;
    }
    let mx = (k.has('KeyD') || (!this.tvSteer && k.has('ArrowRight')) ? 1 : 0) - (k.has('KeyA') || (!this.tvSteer && k.has('ArrowLeft')) ? 1 : 0) + this.joy.x;
    let mz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.joy.y;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.95;
    const speed = (run ? 10 : 5.5) * (this.swimming ? 0.5 : 1);

    // Camera-relative movement
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const vx = (fx * mz + rx * mx) * speed, vz = (fz * mz + rz * mx) * speed;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    const lim = WORLD / 2 - 1;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);

    // Push out of solid props
    for (const c of this.props.colliders()) {
      const ox = this.pos.x - c.x, oz = this.pos.z - c.z, d = Math.hypot(ox, oz), min = c.r + 0.35;
      if (d < min && d > 1e-4) { this.pos.x = c.x + (ox / d) * min; this.pos.z = c.z + (oz / d) * min; }
    }

    // Vertical: gravity, ground, decks and swimming
    const ground = Math.max(this.terrain.heightAt(this.pos.x, this.pos.z), this.props.deckHeight(this.pos.x, this.pos.z));
    const water = this.terrain.waterLevel;
    this.swimming = ground < water - 1.0 && this.pos.y <= water - 0.9;
    if (this.jumpQueued && (this.onGround || this.swimming)) { this.vy = this.swimming ? 5 : 8; this.audio?.whoosh(); }
    this.jumpQueued = false;
    this.vy -= 22 * dt;
    this.pos.y += this.vy * dt;
    this.onGround = false;
    if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.onGround = true; }
    else if (ground < water - 1.0 && this.pos.y < water - 1.0) { this.pos.y = water - 1.0; this.vy = Math.max(this.vy, 0); }

    // Avatar
    const moving = len > 0.05 ? 1 : 0;
    if (moving) {
      const want = Math.atan2(vx, vz);
      let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 10);
      this.phase += dt * speed * 1.6;
    }
    this.avatar.position.copy(this.pos);
    this.avatar.rotation.y = this.facing;
    animateVillager(this.avatar, this.phase, moving);
    this.avatar.visible = !this.firstPerson;

    // Camera
    const cam = this.camera;
    if (this.firstPerson) {
      cam.position.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      const dist = 6;
      const head = new THREE.Vector3(this.pos.x, this.pos.y + 1.3, this.pos.z);
      const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(dist);
      cam.position.copy(head).add(off);
      const minY = Math.max(this.terrain.heightAt(cam.position.x, cam.position.z), water) + 0.6;
      if (cam.position.y < minY) cam.position.y = minY;
      cam.lookAt(head);
    }
  }
}

// Build-mode interaction: sculpting, painting, placing and selecting props.
import * as THREE from 'three';
import { MOUSE, TOUCH } from 'three';
import { PROP_TYPES } from './props.js';
import { WORLD } from './terrain.js';

const SCULPT = ['raise', 'lower', 'smooth', 'flatten', 'paint'];
const RING_COLORS = { raise: '#ffffff', lower: '#ffb4a2', smooth: '#a2d2ff', flatten: '#ffe066', paint: '#c3f0ca' };

export class BuildTools {
  constructor({ world, camera, canvas, controls, history, audio }) {
    Object.assign(this, { world, camera, canvas, controls, history, audio });
    this.tool = 'orbit';
    this.brush = { size: 5, strength: 0.5 };
    this.paintIndex = 1;
    this.propType = 'oak';
    this.selectedId = null;
    this.enabled = true;
    this.onSelectionChange = () => {};
    this.onToolChange = () => {};

    this.raycaster = new THREE.Raycaster();
    this.pointers = new Map();     // active pointers on the canvas
    this.stroke = null;            // { id, x, y, target }
    this.drag = null;              // prop drag
    this.tap = null;               // possible tap (place / select)
    this.hover = null;             // last hover client position (mouse)

    // Brush cursor ring that hugs the terrain
    const n = 64;
    this.ringGeo = new THREE.BufferGeometry();
    this.ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.ring = new THREE.LineLoop(this.ringGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }));
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    world.scene.add(this.ring);

    // TV / remote cursor: a beacon that sits on the island and is moved with the D-pad.
    this.cursor = new THREE.Vector3(0, 0, 0);
    this.cursorActive = false;
    this.cursorMark = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), new THREE.MeshBasicMaterial({ color: '#ffe14a', depthTest: false }));
    pole.position.y = 1.5;
    pole.renderOrder = 12;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), new THREE.MeshBasicMaterial({ color: '#fff4b0', depthTest: false }));
    gem.position.y = 2.7;
    gem.renderOrder = 12;
    this.cursorMark.add(pole, gem);
    this.cursorMark.visible = false;
    this.cursorGem = gem;
    world.scene.add(this.cursorMark);

    // Selection marker
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, depthTest: false }));
    this.selRing.renderOrder = 11;
    this.selRing.visible = false;
    world.scene.add(this.selRing);

    // Ghost preview for placing
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = null;

    this.bind();
    this.setTool('orbit');
  }

  // ---- tool state ---------------------------------------------------------
  setTool(tool) {
    this.tool = tool;
    this.cancelStroke();
    const c = this.controls;
    const orbit = tool === 'orbit';
    // In "View" the primary button orbits; with a tool active it is reserved for the tool.
    c.mouseButtons = { LEFT: orbit ? MOUSE.ROTATE : -1, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
    c.touches = { ONE: orbit ? TOUCH.ROTATE : -1, TWO: orbit ? TOUCH.DOLLY_PAN : TOUCH.DOLLY_ROTATE };
    if (tool !== 'select') this.select(null);
    this.updateGhost();
    this.onToolChange(tool);
  }
  setPropType(type) { this.propType = type; this.updateGhost(); }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.onSelectionChange(id);
  }
  get selected() { return this.selectedId != null ? this.world.props.get(this.selectedId) : null; }

  // ---- raycasting ---------------------------------------------------------
  setRay(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }
  /** Ground point under the pointer (terrain, or the water plane as a fallback). */
  groundHit(clientX, clientY) {
    this.setRay(clientX, clientY);
    const hit = this.raycaster.intersectObject(this.world.terrain.mesh, false)[0];
    let p = hit ? hit.point.clone() : null;
    if (!p) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.world.terrain.waterLevel);
      p = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    }
    if (!p || Math.abs(p.x) > WORLD / 2 || Math.abs(p.z) > WORLD / 2) return null;
    return p;
  }

  // ---- pointer handling ---------------------------------------------------
  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    c.addEventListener('pointerleave', () => { this.hover = null; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onDown(e) {
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.audio.start();
    if (this.pointers.size > 1) { this.cancelStroke(); this.tap = null; this.drag = null; return; } // two fingers = camera
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.tool === 'orbit') return;

    if (SCULPT.includes(this.tool)) {
      const p = this.groundHit(e.clientX, e.clientY);
      if (!p) return;
      this.history.record();
      this.stroke = { id: e.pointerId, x: e.clientX, y: e.clientY, target: p.y };
      this.lastApply = performance.now();
      return;
    }
    this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    if (this.tool === 'select') {
      this.setRay(e.clientX, e.clientY);
      const rec = this.world.props.pick(this.raycaster);
      if (rec) {
        this.select(rec.id);
        const p = this.groundHit(e.clientX, e.clientY);
        this.drag = { id: e.pointerId, rec, ox: rec.x - (p?.x ?? rec.x), oz: rec.z - (p?.z ?? rec.z), recorded: false };
        this.audio.click();
      }
    }
  }

  onMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'mouse') this.hover = { x: e.clientX, y: e.clientY };
    if (this.stroke && this.stroke.id === e.pointerId) { this.stroke.x = e.clientX; this.stroke.y = e.clientY; }
    if (this.drag && this.drag.id === e.pointerId) {
      if (this.tap && Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) < 6) return;
      const p = this.groundHit(e.clientX, e.clientY);
      if (!p) return;
      if (!this.drag.recorded) { this.history.record(); this.drag.recorded = true; }
      const rec = this.world.props.get(this.drag.rec.id);
      if (!rec) return;
      rec.x = THREE.MathUtils.clamp(p.x + this.drag.ox, -WORLD / 2, WORLD / 2);
      rec.z = THREE.MathUtils.clamp(p.z + this.drag.oz, -WORLD / 2, WORLD / 2);
      this.world.props.refresh(rec);
    }
  }

  onUp(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.stroke && this.stroke.id === e.pointerId) this.endStroke();
    if (this.drag && this.drag.id === e.pointerId) {
      if (this.drag.recorded) this.world.changed();
      this.drag = null;
    }
    const tap = this.tap;
    this.tap = null;
    if (cancelled || !tap || tap.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
    if (moved > 12 || performance.now() - tap.t > 600) return;
    if (this.tool === 'place') this.placeAt(e.clientX, e.clientY);
    else if (this.tool === 'select') {
      this.setRay(e.clientX, e.clientY);
      if (!this.world.props.pick(this.raycaster)) this.select(null);
    }
  }

  cancelStroke() { if (this.stroke) this.endStroke(); }
  endStroke() {
    this.stroke = null;
    this.world.props.snapAll();
    this.world.npcs.validate();
    this.world.changed();
  }

  // ---- actions ------------------------------------------------------------
  placeAt(clientX, clientY) {
    const p = this.groundHit(clientX, clientY);
    if (p) this.placeAtWorld(p);
  }
  placeAtWorld(p) {
    const def = PROP_TYPES[this.propType];
    if (!def.snap && p.y < this.world.terrain.waterLevel - 1.5) { this.audio.remove(); return; } // too deep
    this.history.record();
    this.world.props.add({ type: this.propType, x: p.x, z: p.z, rot: this.ghostRot ?? Math.random() * Math.PI * 2, scale: 0.9 + Math.random() * 0.2 });
    this.ghostRot = Math.random() * Math.PI * 2;
    this.audio.pop();
    this.world.changed();
  }

  /** Point on the terrain (or water) under the remote cursor. */
  pointOnCursor() {
    const y = this.world.terrain.heightAt(this.cursor.x, this.cursor.z);
    const surface = Math.max(y, this.world.terrain.waterLevel);
    return new THREE.Vector3(this.cursor.x, surface, this.cursor.z);
  }
  moveCursor(dx, dz) {
    const lim = WORLD / 2 - 1;
    this.cursor.x = THREE.MathUtils.clamp(this.cursor.x + dx, -lim, lim);
    this.cursor.z = THREE.MathUtils.clamp(this.cursor.z + dz, -lim, lim);
  }
  setCursorActive(on) {
    this.cursorActive = on;
    this.cursorMark.visible = !!on && this.enabled;
  }
  /** OK / Enter on the remote cursor. Sculpt tools keep applying until endCursorStroke(). */
  useCursor() {
    const p = this.pointOnCursor();
    if (this.tool === 'place') this.placeAtWorld(p);
    else if (this.tool === 'select') this.selectNear(p.x, p.z);
    else if (SCULPT.includes(this.tool)) this.beginCursorStroke();
  }
  beginCursorStroke() {
    if (this.stroke?.world) return;
    const p = this.pointOnCursor();
    this.history.record();
    this.stroke = { id: 'tv', x: 0, y: 0, target: p.y, world: true };
  }
  endCursorStroke() {
    if (this.stroke?.world) this.endStroke();
  }
  selectNear(x, z) {
    let best = null, bestD = 2.4;
    for (const r of this.world.props.records) {
      const d = Math.hypot(r.x - x, r.z - z);
      const reach = Math.max(bestD, ((PROP_TYPES[r.type].radius || 0.7) * r.scale) + 0.7);
      if (d <= reach && d < (best ? bestD : reach + 0.01)) { best = r; bestD = d; }
    }
    this.select(best ? best.id : null);
    if (best) this.audio.click();
  }

  rotateSelected(delta) { this.editSelected((r) => { r.rot += delta; }); }
  scaleSelected(f) { this.editSelected((r) => { r.scale = THREE.MathUtils.clamp(r.scale * f, 0.3, 4); }); }
  editSelected(fn) {
    const r = this.selected;
    if (!r) return;
    this.history.record();
    fn(r);
    this.world.props.refresh(r);
    this.audio.click();
    this.world.changed();
  }
  deleteSelected() {
    const r = this.selected;
    if (!r) return;
    this.history.record();
    this.world.props.remove(r.id);
    this.select(null);
    this.audio.remove();
    this.world.changed();
  }
  duplicateSelected() {
    const r = this.selected;
    if (!r) return;
    this.history.record();
    const copy = this.world.props.add({ ...r, id: undefined, x: r.x + 1.5 * r.scale, z: r.z + 1.0 * r.scale });
    this.select(copy.id);
    this.audio.pop();
    this.world.changed();
  }

  // ---- visuals ------------------------------------------------------------
  updateGhost() {
    if (this.ghost) { this.world.scene.remove(this.ghost); this.ghost = null; }
    if (this.tool !== 'place') return;
    const g = new THREE.Group();
    PROP_TYPES[this.propType].build(g, Math.random);
    g.traverse((o) => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; } if (o.isSprite) o.visible = false; });
    g.visible = false;
    this.ghost = g;
    this.ghostRot = Math.random() * Math.PI * 2;
    this.world.scene.add(g);
  }

  drawRing(p) {
    const arr = this.ringGeo.attributes.position.array, n = arr.length / 3, t = this.world.terrain;
    const r = this.brush.size;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      arr[i * 3] = x; arr[i * 3 + 1] = Math.max(t.heightAt(x, z), t.waterLevel) + 0.15; arr[i * 3 + 2] = z;
    }
    this.ringGeo.attributes.position.needsUpdate = true;
    this.ring.material.color.set(RING_COLORS[this.tool] || '#ffffff');
    this.ring.visible = true;
  }

  /** Per-frame: apply active brush stroke, update cursor ring / ghost / selection. */
  update(dt) {
    this.ring.visible = false;
    if (this.ghost) this.ghost.visible = false;
    if (!this.enabled) { this.selRing.visible = false; return; }

    const showCursor = this.cursorActive && this.enabled;
    this.cursorMark.visible = showCursor;
    if (showCursor) {
      const cp = this.pointOnCursor();
      this.cursorMark.position.set(cp.x, cp.y, cp.z);
      this.cursorGem.rotation.y += dt * 1.6;
      if (SCULPT.includes(this.tool)) this.drawRing(cp);
      else if (this.ghost) {
        const def = PROP_TYPES[this.propType];
        const y = def.snap === 'water' ? Math.max(cp.y, this.world.terrain.waterLevel + 0.35) : cp.y;
        this.ghost.position.set(cp.x, y, cp.z);
        this.ghost.rotation.y = this.ghostRot;
        this.ghost.visible = true;
      }
    }

    if (this.stroke) {
      const p = this.stroke.world ? this.pointOnCursor() : this.groundHit(this.stroke.x, this.stroke.y);
      if (p) {
        this.world.terrain.applyBrush(this.tool, p.x, p.z, this.brush.size, this.brush.strength, Math.min(dt, 0.05), { target: this.stroke.target, paint: this.paintIndex });
        this.world.props.snapAll();
        this.drawRing(p);
      }
    } else if (!showCursor && this.hover && SCULPT.includes(this.tool)) {
      const p = this.groundHit(this.hover.x, this.hover.y);
      if (p) this.drawRing(p);
    } else if (!showCursor && this.hover && this.ghost && this.pointers.size === 0) {
      const p = this.groundHit(this.hover.x, this.hover.y);
      if (p) {
        const def = PROP_TYPES[this.propType];
        const y = def.snap === 'water' ? Math.max(p.y, this.world.terrain.waterLevel + 0.35) : p.y;
        this.ghost.position.set(p.x, y, p.z);
        this.ghost.rotation.y = this.ghostRot;
        this.ghost.visible = true;
      }
    }

    const sel = this.selected;
    this.selRing.visible = !!sel;
    if (sel) {
      const obj = this.world.props.objects.get(sel.id);
      const r = Math.max(0.8, (PROP_TYPES[sel.type].radius || 0.6) + 0.4) * sel.scale;
      this.selRing.position.set(sel.x, obj.position.y + 0.08, sel.z);
      this.selRing.scale.setScalar(r);
      this.selRing.material.opacity = 0.6 + Math.sin(performance.now() / 200) * 0.3;
    }
  }
}

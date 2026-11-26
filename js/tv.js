// TV / remote mode. Arrow keys, OK/Enter and Back drive the UI and the island.
// PC mouse, touch and keyboard shortcuts keep working when this mode is off.
import * as THREE from 'three';

const TV_UA = /SmartTV|Smart-TV|SMART-TV|Tizen|Web0S|webOS|WebOS|Android TV|BRAVIA|Roku|AFT|HbbTV|Viera|NetCast|AppleTV|CrKey|GoogleTV|TV Safari/i;

export function wantsTvMode() {
  const q = new URLSearchParams(location.search).get('tv');
  if (q === '1') return true;
  if (q === '0') return false;
  try {
    const saved = sessionStorage.getItem('islandTv');
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch { /* private mode */ }
  return TV_UA.test(navigator.userAgent || '');
}

function isOk(e) {
  return e.key === 'Enter' || e.key === 'OK' || e.key === 'Select' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
}
function isBack(e) {
  const k = e.keyCode || e.which || 0;
  return e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'XF86Back'
    || e.code === 'BrowserBack' || e.code === 'Escape' || e.code === 'Backspace'
    || k === 8 || k === 27 || k === 461 || k === 10009;
}
function arrowDir(e) {
  if (e.key === 'ArrowUp' || e.code === 'ArrowUp') return 'up';
  if (e.key === 'ArrowDown' || e.code === 'ArrowDown') return 'down';
  if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') return 'left';
  if (e.key === 'ArrowRight' || e.code === 'ArrowRight') return 'right';
  return null;
}

export class TvMode {
  constructor({ world, tools, walk, controls, camera, canvas, ui, actions, audio }) {
    Object.assign(this, { world, tools, walk, controls, camera, canvas, ui, actions, audio });
    this.enabled = false;
    this.cursorMode = false;
    this.held = new Set();
    this.holdTime = 0;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this.bind();
    ui.onWorldToggle = (open) => this.onWorld(open);
    ui.onModalOpen = () => this.onModal();
    if (wantsTvMode()) this.setEnabled(true, false);
    document.getElementById('btn-tv').onclick = () => { this.audio.start(); this.setEnabled(!this.enabled); this.audio.click(); };
    document.getElementById('tv-island').onclick = () => this.focusIsland();
    document.getElementById('tv-cam-left').onclick = () => this.orbit(0.28, 0);
    document.getElementById('tv-cam-right').onclick = () => this.orbit(-0.28, 0);
    document.getElementById('tv-zoom-in').onclick = () => this.zoom(0.82);
    document.getElementById('tv-zoom-out').onclick = () => this.zoom(1.22);
    document.getElementById('tv-rot-l').onclick = () => tools.rotateSelected(-Math.PI / 8);
    document.getElementById('tv-rot-r').onclick = () => tools.rotateSelected(Math.PI / 8);
    document.getElementById('tv-del').onclick = () => tools.deleteSelected();
  }

  bind() {
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('keyup', (e) => {
      const dir = arrowDir(e);
      if (dir) this.held.delete(e.code || e.key);
      if (this.enabled && this.cursorMode && isOk(e)) this.tools.endCursorStroke();
    }, true);
    window.addEventListener('blur', () => { this.held.clear(); this.tools.endCursorStroke(); });
  }

  setEnabled(on, toast = true) {
    this.enabled = on;
    document.body.classList.toggle('tv', on);
    document.getElementById('btn-tv').classList.toggle('active', on);
    this.controls.enableKeys = !on;
    this.walk.tvSteer = on && this.walk.active;
    try { sessionStorage.setItem('islandTv', on ? '1' : '0'); } catch { /* ignore */ }
    if (on) {
      this.ui.toggleWorld(false);
      this.focusIsland();
      if (toast) this.ui.toast('TV mode — arrows move the cursor, OK uses the tool, Back opens the menu');
    } else {
      this.cursorMode = false;
      document.body.classList.remove('tv-cursor');
      this.tools.setCursorActive(false);
      this.held.clear();
    }
  }

  focusIsland() {
    if (!this.enabled || this.walk.active) return;
    this.cursorMode = true;
    document.body.classList.add('tv-cursor');
    this.tools.setCursorActive(true);
    this.canvas.focus({ preventScroll: true });
  }

  leaveCursor() {
    this.cursorMode = false;
    this.held.clear();
    this.tools.endCursorStroke();
    document.body.classList.remove('tv-cursor');
    this.tools.setCursorActive(false);
  }

  onWorld(open) {
    if (!this.enabled) return;
    if (open) {
      this.leaveCursor();
      requestAnimationFrame(() => document.querySelector('#world button, #world input')?.focus());
    }
  }

  onModal() {
    if (!this.enabled) return;
    this.leaveCursor();
    requestAnimationFrame(() => {
      const btn = document.querySelector('#modal .modal-actions .extra') || document.getElementById('modal-close');
      btn?.focus();
    });
  }

  onWalk(active) {
    if (!this.enabled) { this.walk.tvSteer = false; return; }
    this.walk.tvSteer = active;
    if (active) {
      this.leaveCursor();
      const tip = document.getElementById('walk-tip');
      if (tip) tip.textContent = 'Arrows move and turn · OK jumps · Back returns to build';
      this.canvas.focus({ preventScroll: true });
    } else this.focusIsland();
  }

  modalOpen() { return !document.getElementById('modal').classList.contains('hidden'); }
  worldOpen() { return !document.getElementById('world').classList.contains('hidden'); }

  onBack() {
    if (this.modalOpen()) { this.ui.closeModal(); return; }
    if (this.worldOpen()) { this.ui.toggleWorld(false); this.focusIsland(); return; }
    if (this.walk.active) { this.actions.toggleWalk(); return; }
    if (this.cursorMode) {
      this.leaveCursor();
      const current = document.querySelector('#tools button.active') || document.querySelector('#tools button');
      current?.focus();
      return;
    }
    this.focusIsland();
  }

  onKey(e) {
    if (!this.enabled) return;
    const typing = e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range'));
    if (typing) return;

    if (isBack(e)) {
      e.preventDefault();
      e.stopPropagation();
      this.onBack();
      return;
    }

    const dir = arrowDir(e);
    if (dir) {
      const range = e.target && e.target.type === 'range';
      const horizontal = dir === 'left' || dir === 'right';
      if (range && horizontal && !this.cursorMode && !this.walk.active) return; // let the slider move
      if (this.shouldDrive()) {
        if (this.cursorMode && !this.walk.active) {
          e.preventDefault();
          e.stopPropagation();
          this.held.add(e.code || e.key);
        }
        return; // walk mode: let WalkMode see the arrows
      }
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.moveFocus(dir);
      return;
    }

    if (isOk(e)) {
      const ae = document.activeElement;
      const onControl = ae && (ae.tagName === 'BUTTON' || ae.tagName === 'A' || ae.type === 'range');
      if (onControl) return; // native click / default
      if (this.walk.active) {
        e.preventDefault();
        e.stopPropagation();
        this.walk.jumpQueued = true;
        return;
      }
      if (this.cursorMode) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) this.tools.useCursor();
      }
    }
  }

  /** Arrows drive the cursor or the walker instead of moving UI focus. */
  shouldDrive() {
    if (this.modalOpen() || this.worldOpen()) return false;
    if (this.walk.active) return true;
    return this.cursorMode;
  }

  focusables() {
    const modal = document.getElementById('modal');
    const root = modal.classList.contains('hidden') ? document.getElementById('app') : modal;
    const nodes = [...root.querySelectorAll('button, input[type="range"], a[href]')];
    return nodes.filter((el) => {
      if (el.disabled || el.id === 'scene') return false;
      if (el.closest('.hidden')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
  }

  moveFocus(dir) {
    const list = this.focusables();
    if (!list.length) return;
    const cur = list.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { list[0].focus(); return; }
    const cr = cur.getBoundingClientRect();
    const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      if (dir === 'left' && dx >= -4) continue;
      if (dir === 'right' && dx <= 4) continue;
      if (dir === 'up' && dy >= -4) continue;
      if (dir === 'down' && dy <= 4) continue;
      const primary = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
      const secondary = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (secondary > primary * 2.4 + 80) continue;
      const score = primary + secondary * 1.35;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    (best || cur).focus();
  }

  orbit(dTheta, dPhi) {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta += dTheta;
    sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 0.2, Math.PI * 0.47);
    sph.makeSafe();
    offset.setFromSpherical(sph);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  zoom(scale) {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const dist = THREE.MathUtils.clamp(offset.length() * scale, this.controls.minDistance, this.controls.maxDistance);
    offset.setLength(dist);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  update(dt) {
    if (!this.enabled || !this.cursorMode || this.walk.active) { this.holdTime = 0; return; }
    let ax = (this.held.has('ArrowRight') ? 1 : 0) - (this.held.has('ArrowLeft') ? 1 : 0);
    let az = (this.held.has('ArrowUp') ? 1 : 0) - (this.held.has('ArrowDown') ? 1 : 0);
    if (!ax && !az) { this.holdTime = 0; return; }
    this.holdTime += dt;
    const accel = 1 + Math.min(4, this.holdTime * 2.4);
    const speed = 9 * accel * dt;
    const len = Math.hypot(ax, az) || 1;
    ax /= len; az /= len;
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) this._fwd.set(0, 0, -1);
    this._fwd.normalize();
    this._right.set(-this._fwd.z, 0, this._fwd.x); // camera right
    this.tools.moveCursor(this._right.x * ax * speed + this._fwd.x * az * speed, this._right.z * ax * speed + this._fwd.z * az * speed);
  }
}

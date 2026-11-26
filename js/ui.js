// DOM user interface: tool palette, context panel, world panel, toasts and modals.
import { PROP_TYPES, PROP_ORDER } from './props.js';
import { PAINTS } from './terrain.js';

const $ = (id) => document.getElementById(id);

const TOOL_INFO = {
  orbit: { title: '🎥 View', hint: 'Drag to orbit · Right-drag rotates · Scroll / pinch to zoom · Shift+drag or two fingers to pan.' },
  raise: { title: '⛰️ Raise terrain', hint: 'Hold and drag over the island to build hills.' },
  lower: { title: '🕳️ Lower terrain', hint: 'Hold and drag to dig valleys, bays and lakes.' },
  smooth: { title: '〰️ Smooth', hint: 'Soften bumps and sharp edges.' },
  flatten: { title: '▭ Flatten', hint: 'Levels terrain to the height where you started the stroke. Great for building plots.' },
  paint: { title: '🎨 Paint', hint: 'Pick a colour and paint the ground. "Auto" restores height-based colours.' },
  place: { title: '🌲 Place', hint: 'Pick a prop, then tap/click the island to place it.' },
  select: { title: '👆 Select', hint: 'Tap a prop to select it, drag it to move. Q/E rotate · +/- scale · Del delete · Ctrl+D duplicate.' },
};

export class UI {
  constructor({ world, tools, history, audio, actions }) {
    Object.assign(this, { world, tools, history, audio, actions });
    this.context = $('context');
    this.bindTopbar();
    this.bindTools();
    this.bindWorldPanel();
    tools.onToolChange = () => { this.syncTools(); this.renderContext(); };
    tools.onSelectionChange = () => this.renderContext();
    history.onChange = () => this.syncHistory();
    this.syncTools();
    this.renderContext();
    this.syncHistory();
    this.syncWorld();
    this.onWorldToggle = () => {};
    this.onModalOpen = () => {};
    const shortPhone = window.matchMedia('(max-width: 720px)').matches || this.shortLandscape();
    this.toggleWorld(!shortPhone); // open by default on desktop only
  }

  // ---- top bar ------------------------------------------------------------
  bindTopbar() {
    $('btn-undo').onclick = () => { this.history.undo(); this.audio.click(); };
    $('btn-redo').onclick = () => { this.history.redo(); this.audio.click(); };
    $('btn-mode').onclick = () => this.actions.toggleWalk();
    $('btn-mute').onclick = () => this.toggleMute();
    $('btn-panel').onclick = () => { this.toggleWorld(); this.audio.click(); };
    $('btn-close-world').onclick = () => this.toggleWorld(false);
    $('modal-close').onclick = () => this.closeModal();
    $('modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') this.closeModal(); });
    this.syncMute();
  }
  /** Show/hide the world panel (on phones it temporarily hides the tool panel). */
  toggleWorld(show = $('world').classList.contains('hidden')) {
    $('world').classList.toggle('hidden', !show);
    document.body.classList.toggle('world-open', show);
    this.onWorldToggle(show);
  }
  toggleMute() { this.audio.start(); this.audio.setMuted(!this.audio.muted); this.syncMute(); this.audio.click(); }
  syncMute() { $('btn-mute').textContent = this.audio.muted ? '🔇' : '🔊'; }
  syncHistory() {
    $('btn-undo').disabled = !this.history.undoStack.length;
    $('btn-redo').disabled = !this.history.redoStack.length;
    $('btn-undo').style.opacity = this.history.undoStack.length ? 1 : 0.4;
    $('btn-redo').style.opacity = this.history.redoStack.length ? 1 : 0.4;
  }
  setWalking(on) {
    document.body.classList.toggle('walking', on);
    $('btn-mode').innerHTML = on ? '🛠️<span class="mode-label"> Build</span>' : '🚶<span class="mode-label"> Walk</span>';
  }

  // ---- tool palette -------------------------------------------------------
  bindTools() {
    for (const b of document.querySelectorAll('#tools button[data-tool]')) {
      b.onclick = () => { this.tools.setTool(b.dataset.tool); this.audio.click(); };
    }
    $('btn-clear-tool').onclick = () => { this.actions.clearIsland(); this.audio.click(); };
  }
  syncTools() {
    for (const b of document.querySelectorAll('#tools button[data-tool]')) b.classList.toggle('active', b.dataset.tool === this.tools.tool);
  }

  // ---- context panel ------------------------------------------------------
  renderContext() {
    const t = this.tools, info = TOOL_INFO[t.tool], el = this.context;
    el.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = info.title;
    el.appendChild(title);

    if (['raise', 'lower', 'smooth', 'flatten', 'paint'].includes(t.tool)) {
      if (t.tool === 'paint') {
        const pal = document.createElement('div');
        pal.className = 'palette';
        PAINTS.forEach((p, i) => {
          const b = document.createElement('button');
          b.className = 'swatch' + (t.paintIndex === i ? ' active' : '');
          b.title = p.name;
          b.style.background = p.color || 'linear-gradient(135deg,#ead59c 0 33%,#7cbf5a 33% 66%,#f4f7fa 66%)';
          b.onclick = () => { t.paintIndex = i; this.audio.click(); this.renderContext(); };
          pal.appendChild(b);
        });
        el.appendChild(pal);
      }
      const s = document.createElement('div');
      s.className = 'sliders';
      s.innerHTML = `<label>Size <input type="range" id="brush-size" min="1.5" max="14" step="0.5" value="${t.brush.size}"></label>` +
        (t.tool !== 'paint' ? `<label>Strength <input type="range" id="brush-strength" min="0.05" max="1" step="0.05" value="${t.brush.strength}"></label>` : '');
      el.appendChild(s);
      s.querySelector('#brush-size').oninput = (e) => { t.brush.size = +e.target.value; };
      const st = s.querySelector('#brush-strength');
      if (st) st.oninput = (e) => { t.brush.strength = +e.target.value; };
    }

    if (t.tool === 'place') {
      const pal = document.createElement('div');
      pal.className = 'palette';
      for (const type of PROP_ORDER) {
        const d = PROP_TYPES[type];
        const b = document.createElement('button');
        b.className = t.propType === type ? 'active' : '';
        b.innerHTML = `${d.icon}<small>${d.label}</small>`;
        b.onclick = () => { t.setPropType(type); this.audio.click(); pal.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); };
        pal.appendChild(b);
      }
      el.appendChild(pal);
    }

    if (t.tool === 'select' && t.selected) {
      const d = PROP_TYPES[t.selected.type];
      title.textContent = `${d.icon} ${d.label} selected`;
      const a = document.createElement('div');
      a.className = 'actions';
      const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.innerHTML = label; b.className = cls; b.onclick = fn; a.appendChild(b); };
      btn('⟲ Rotate', () => t.rotateSelected(-Math.PI / 8));
      btn('⟳', () => t.rotateSelected(Math.PI / 8));
      btn('➖ Smaller', () => t.scaleSelected(1 / 1.15));
      btn('➕ Bigger', () => t.scaleSelected(1.15));
      btn('⧉ Duplicate', () => t.duplicateSelected());
      btn('🗑️ Delete', () => t.deleteSelected(), 'danger');
      btn('✕', () => t.select(null));
      el.appendChild(a);
    } else {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = info.hint;
      el.appendChild(hint);
    }
    this.armHintFade();
  }

  /** In a short landscape phone, the hint card fades so it doesn't cover the island. */
  onLayoutMode() { this.armHintFade(); }
  shortLandscape() {
    return document.body.classList.contains('short-land')
      || window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  }
  armHintFade() {
    clearTimeout(this.hintTimer);
    const el = this.context;
    el.classList.remove('hint-gone', 'hint-card-gone');
    if (!el.querySelector('.hint') || !this.shortLandscape() || document.body.classList.contains('tv')) return;
    const onlyHint = !el.querySelector('.palette, .sliders, .actions');
    this.hintTimer = setTimeout(() => {
      if (!this.shortLandscape()) return;
      el.classList.add('hint-gone');
      if (onlyHint) el.classList.add('hint-card-gone');
    }, 3200);
  }

  // ---- world panel --------------------------------------------------------
  bindWorldPanel() {
    const w = this.world;
    $('time').oninput = (e) => { w.settings.autoTime = false; w.setTime(+e.target.value); this.syncWorld(); };
    $('time').onchange = () => w.changed();
    $('btn-autotime').onclick = () => { w.settings.autoTime = !w.settings.autoTime; this.audio.click(); this.syncWorld(); w.changed(); };
    $('water').oninput = (e) => { w.setWaterLevel(+e.target.value, false); this.syncWorld(); };
    $('water').onchange = () => w.changed();
    for (const b of document.querySelectorAll('#weather button')) {
      b.onclick = () => { w.setWeather(b.dataset.weather); this.audio.click(); this.syncWorld(); w.changed(); };
    }
    for (const b of document.querySelectorAll('[data-npc]')) {
      b.onclick = () => {
        const d = +b.dataset.d, s = w.settings;
        if (b.dataset.npc === 'villager') w.setCounts(s.villagers + d, s.critters);
        else w.setCounts(s.villagers, s.critters + d);
        this.audio.click(); this.syncWorld(); w.changed();
      };
    }
    const a = this.actions;
    $('btn-save').onclick = () => a.save();
    $('btn-load').onclick = () => a.load();
    $('btn-export').onclick = () => a.exportJSON();
    $('btn-import').onclick = () => $('file-import').click();
    $('file-import').onchange = (e) => { const f = e.target.files[0]; if (f) a.importJSON(f); e.target.value = ''; };
    $('btn-share').onclick = () => a.share();
    $('btn-random').onclick = () => a.random();
    $('btn-reset').onclick = () => a.reset();
    $('btn-clear').onclick = () => a.clearIsland();
    $('btn-help').onclick = () => a.help();
  }

  /** Refresh world panel widgets from settings. */
  syncWorld() {
    const s = this.world.settings;
    const hh = Math.floor(s.time), mm = Math.floor((s.time - hh) * 60);
    $('time-label').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (document.activeElement !== $('time')) $('time').value = s.time;
    $('btn-autotime').classList.toggle('active', !!s.autoTime);
    $('water').value = s.waterLevel;
    $('water-label').textContent = (+s.waterLevel).toFixed(1);
    for (const b of document.querySelectorAll('#weather button')) b.classList.toggle('active', b.dataset.weather === s.weather);
    $('npc-villager').textContent = s.villagers;
    $('npc-critter').textContent = s.critters;
  }

  // ---- feedback -----------------------------------------------------------
  toast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  modal(html, extraButtons = []) {
    $('modal-body').innerHTML = html;
    const actions = document.querySelector('.modal-actions');
    actions.querySelectorAll('.extra').forEach((b) => b.remove());
    for (const { label, onClick, cls } of extraButtons) {
      const b = document.createElement('button');
      b.className = 'extra ' + (cls || '');
      b.textContent = label;
      b.onclick = onClick;
      actions.insertBefore(b, $('modal-close'));
    }
    $('modal').classList.remove('hidden');
    this.onModalOpen();
  }
  closeModal() { $('modal').classList.add('hidden'); }
}

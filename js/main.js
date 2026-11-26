// Island Builder – entry point. Wires renderer, camera, systems, UI and the main loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { World } from './world.js';
import { BuildTools } from './tools.js';
import { History } from './history.js';
import { WalkMode } from './walk.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { TvMode } from './tv.js';
import { generateIsland, flatIsland, baseIsland } from './generator.js';
import * as storage from './storage.js';

// ---------------------------------------------------------------------------
// Renderer / camera
// ---------------------------------------------------------------------------
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const pixelCap = isTouch ? 1.25 : 1.5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
camera.position.set(-40, 40, -60);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 150;
controls.maxPolarAngle = Math.PI * 0.47;
controls.listenToKeyEvents(window);

// Light post stack on larger screens. Phones skip it (MSAA + a lower pixel ratio only).
let composer = null;
let bloomPass = null;
let gradePass = null;
let fxaaPass = null;
if (!isTouch) {
  // Unsigned-byte targets. Half-float composer buffers come out blank on some GPUs (including software GL).
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.18, 0.35, 0.88);
  composer.addPass(bloomPass);
  gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uNight: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uNight; varying vec2 vUv;
      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        vec3 c = src.rgb;
        c = mix(c, c * vec3(1.04, 1.01, 0.97), 0.35 * (1.0 - uNight));
        float vig = smoothstep(0.9, 0.3, length(vUv - 0.5));
        c *= mix(0.82, 1.0, vig);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  composer.addPass(gradePass);
  fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);
  composer.addPass(new OutputPass());
}

/** Size the canvas to the *visible* area (handles mobile URL bars via visualViewport). */
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, pixelCap);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  if (composer) {
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    if (fxaaPass) fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();
// Portrait screens see less horizontally, so start the camera further back.
camera.position.multiplyScalar(THREE.MathUtils.clamp(0.75 / camera.aspect, 1, 1.8));

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------
const audio = new AudioEngine();
const world = new World(scene, { shadowSize: isTouch ? 1024 : 2048, lite: isTouch });
const history = new History(() => world.snapshot(), (s) => world.restore(s));
const tools = new BuildTools({ world, camera, canvas, controls, history, audio });
const walk = new WalkMode({ camera, canvas, scene, terrain: world.terrain, props: world.props, audio });

let ui; // created below (needs actions)

// Debounced autosave whenever the island changes.
let autosaveTimer = 0;
world.onChange = () => {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => storage.autoSave(world.getState()), 800);
};

// ---------------------------------------------------------------------------
// Actions (used by UI buttons and keyboard shortcuts)
// ---------------------------------------------------------------------------
let orbitSaved = null;
const actions = {
  toggleWalk() {
    audio.start();
    if (walk.active) {
      walk.exit();
      if (orbitSaved) { camera.position.copy(orbitSaved.pos); controls.target.copy(orbitSaved.target); }
      controls.enabled = true;
      tools.enabled = true;
      ui.setWalking(false);
    } else {
      orbitSaved = { pos: camera.position.clone(), target: controls.target.clone() };
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
      const yaw = Math.atan2(-dir.x, -dir.z);
      tools.select(null);
      tools.enabled = false;
      controls.enabled = false;
      walk.enter(controls.target.x, controls.target.z, yaw);
      ui.toggleWorld(false); // clear the view (⚙️ reopens it)
      ui.setWalking(true);
      ui.toast(isTouch ? 'Left stick to move · drag to look' : 'WASD to move · click to look around · Tab to build');
    }
    tv?.onWalk(walk.active);
    audio.whoosh();
  },
  save() {
    ui.toast(storage.saveSlot(world.getState()) ? '💾 Island saved on this device' : 'Could not save (storage full or blocked)');
    audio.chime();
  },
  load() {
    const s = storage.loadSlot();
    if (!s) { ui.toast('No saved island yet'); return; }
    history.record();
    world.setState(s);
    ui.syncWorld();
    ui.toast('📂 Loaded your saved island');
    audio.chime();
  },
  exportJSON() { storage.exportFile(world.getState()); ui.toast('⬇️ Exported my-island.json'); audio.click(); },
  async importJSON(file) {
    try {
      const s = await storage.importFile(file);
      history.record();
      world.setState(s);
      ui.syncWorld();
      ui.toast('⬆️ Island imported');
      audio.chime();
    } catch (e) { ui.toast('Import failed: ' + e.message, 3500); }
  },
  async share() {
    audio.click();
    const url = await storage.shareUrl(world.getState());
    const esc = url.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const buttons = [{ label: '📋 Copy link', cls: 'accent', onClick: () => copyText(url) }];
    if (navigator.share) buttons.unshift({ label: '📤 Share…', onClick: () => navigator.share({ title: 'My island', text: 'Check out my island!', url }).catch(() => {}) });
    ui.modal(`<h3>🔗 Share your island</h3><p>Anyone who opens this link will see your island exactly as it is now (${(url.length / 1024).toFixed(1)} KB link).</p><textarea readonly id="share-text">${esc}</textarea>`, buttons);
    document.getElementById('share-text').addEventListener('focus', (e) => e.target.select());
  },
  random() {
    history.record();
    const s = generateIsland((Math.random() * 1e9) | 0, world.terrain, world.settings.waterLevel);
    world.setState({ ...s, settings: world.settings });
    ui.syncWorld();
    ui.toast('🎲 A brand-new island!');
    audio.chime();
  },
  reset() {
    ui.modal('<h3>🧹 Reset to a blank beach?</h3><p>This is the small rounded beach, separate from Clear Island. You can still undo it.</p>', [
      { label: 'Reset beach', cls: 'danger', onClick: () => {
        history.record();
        world.setState({ ...flatIsland(), settings: world.settings });
        tools.select(null);
        ui.closeModal();
        ui.toast('Blank beach');
        audio.whoosh();
      } },
    ]);
  },
  clearIsland() {
    ui.modal('<h3>🏝️ Clear island?</h3><p>Terrain goes back to the wide, flat starter island. Every prop and paint stroke is removed. You can undo this. Reset still makes the smaller blank beach, and Random builds a new island.</p>', [
      { label: 'Clear island', cls: 'danger', onClick: () => {
        history.record();
        world.setState({ ...baseIsland(), settings: world.settings });
        world.npcs.respawn();
        tools.select(null);
        ui.closeModal();
        ui.syncWorld();
        ui.toast('Empty island — ready to build');
        audio.whoosh();
      } },
    ]);
  },
  help() {
    ui.modal(`<h3>🏝️ Island Builder</h3>
      <p><b>Build mode</b></p><ul>
      <li>Pick a tool on the toolbar. <b>View</b> lets you orbit; with any other tool, drag the right mouse button (or use two fingers) to move the camera.</li>
      <li>Keys: <kbd>1</kbd>–<kbd>8</kbd> tools · <kbd>[</kbd>/<kbd>]</kbd> brush size · <kbd>Q</kbd>/<kbd>E</kbd> rotate · <kbd>+</kbd>/<kbd>-</kbd> scale · <kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo · <kbd>N</kbd> toggle day/night · <kbd>M</kbd> mute · <kbd>G</kbd> world panel</li></ul>
      <p><b>Walk mode</b> (<kbd>Tab</kbd>)</p><ul>
      <li>PC: <kbd>WASD</kbd> move · mouse look (click to lock) · <kbd>Space</kbd> jump · <kbd>Shift</kbd> run · <kbd>V</kbd> first/third person · <kbd>Tab</kbd>/<kbd>Esc</kbd> back to building</li>
      <li>Phone: left stick to move (push all the way to run), drag to look, buttons to jump and switch view.</li></ul>
      <p><b>Clear Island</b> restores the wide empty starter island and removes every prop (undoable). <b>Reset</b> is the smaller blank beach. <b>Random</b> builds a new island.</p>
      <p><b>TV / remote</b> (button, or add <kbd>?tv=1</kbd>)</p><ul>
      <li>Arrows move a cursor on the island. Hold an arrow to go faster. OK / Enter uses the current tool.</li>
      <li>Back (Backspace, Escape, or the remote Back key) closes a panel, leaves the cursor for the menu, or returns from walking to build mode.</li>
      <li>On-screen buttons rotate and zoom the camera, and rotate or delete the selected prop.</li>
      <li>In walk mode, arrows move and turn, OK jumps, Back goes back to building.</li></ul>
      <p>Your island autosaves on this device. Use <b>Share link</b> to send it to anyone.</p>`);
  },
};

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); ui.toast('📋 Link copied!'); }
  catch {
    const ta = document.getElementById('share-text');
    if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy'); ui.toast('📋 Link copied!'); } catch { ui.toast('Select the link and copy it'); } }
  }
  audio.chime();
}

ui = new UI({ world, tools, history, audio, actions });
const tv = new TvMode({ world, tools, walk, controls, camera, canvas, ui, actions, audio });

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
const TOOL_KEYS = ['orbit', 'place', 'select', 'raise', 'lower', 'smooth', 'flatten', 'paint'];
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.code === 'Tab') { e.preventDefault(); actions.toggleWalk(); return; }
  if (e.code === 'Escape') {
    if (!document.getElementById('modal').classList.contains('hidden')) ui.closeModal();
    else if (walk.active) actions.toggleWalk();
    else tools.select(null);
    return;
  }
  if (e.code === 'KeyM') { ui.toggleMute(); return; }
  if (walk.active) return;
  if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); return; }
  if (ctrl && e.code === 'KeyY') { e.preventDefault(); history.redo(); return; }
  if (ctrl && e.code === 'KeyD') { e.preventDefault(); tools.duplicateSelected(); return; }
  if (ctrl) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= TOOL_KEYS.length) { tools.setTool(TOOL_KEYS[n - 1]); audio.click(); return; }
  switch (e.code) {
    case 'BracketLeft': tools.brush.size = Math.max(1.5, tools.brush.size - 0.5); ui.renderContext(); break;
    case 'BracketRight': tools.brush.size = Math.min(14, tools.brush.size + 0.5); ui.renderContext(); break;
    case 'KeyQ': tools.rotateSelected(-Math.PI / 8); break;
    case 'KeyE': tools.rotateSelected(Math.PI / 8); break;
    case 'Equal': case 'NumpadAdd': tools.scaleSelected(1.15); break;
    case 'Minus': case 'NumpadSubtract': tools.scaleSelected(1 / 1.15); break;
    case 'Delete': case 'Backspace': tools.deleteSelected(); break;
    case 'KeyN': world.settings.autoTime = false; world.setTime(world.sky.night > 0.5 ? 12 : 22); ui.syncWorld(); world.changed(); break;
    case 'KeyG': ui.toggleWorld(); break;
    case 'KeyH': actions.help(); break;
  }
});
// First interaction unlocks audio.
window.addEventListener('pointerdown', () => audio.start(), { once: true });

// ---------------------------------------------------------------------------
// Initial island: share link > autosave > random
// ---------------------------------------------------------------------------
async function loadFromHash() {
  const m = location.hash.match(/^#i=(.+)$/);
  if (!m) return false;
  try {
    world.setState(await storage.decodeShare(m[1]));
    ui.syncWorld();
    history.clear();
    // Drop the hash so a later reload uses the autosave (with the visitor's edits).
    window.history.replaceState(null, '', location.pathname + location.search);
    ui.toast('🏝️ Loaded a shared island!');
    return true;
  } catch (e) {
    console.warn('Bad share link', e);
    ui.toast('That share link looks broken – here is a fresh island instead', 3500);
    return false;
  }
}

async function init() {
  if (!(await loadFromHash())) {
    const saved = storage.loadAutoSave();
    if (saved) world.setState(saved);
    else world.setState({ ...generateIsland(93324, world.terrain, 0), settings: { time: 10 } });
    ui.syncWorld();
  }
  window.addEventListener('hashchange', () => loadFromHash());
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0, uiTimer = 0;
const tmpTarget = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  if (walk.active) walk.update(dt);
  else {
    controls.update();
    // Keep the orbit target over the island.
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -55, 55);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -55, 55);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, -2, 20);
  }
  tools.update(dt);
  tmpTarget.copy(walk.active ? walk.pos : controls.target);
  world.update(dt, elapsed, camera.position, tmpTarget);
  audio.update(dt, { night: world.sky.night, rain: world.weather.mix.rain, wind: world.weather.mix.snow });
  tv.update(dt);
  uiTimer -= dt;
  if (uiTimer <= 0) { uiTimer = 0.5; ui.syncWorld(); } // keeps sliders/labels in sync
  if (composer) {
    bloomPass.strength = 0.12 + world.sky.night * 0.38;
    gradePass.uniforms.uNight.value = world.sky.night;
    composer.render();
  } else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

init().then(() => {
  requestAnimationFrame(frame);
  window.__islandReady = true;
});

// Handy for debugging / automated tests / future extensions.
window.__island = { THREE, world, tools, walk, history, actions, storage, camera, controls, ui, tv };

// World: owns every simulation system and the serialisable island state.
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { PropManager } from './props.js';
import { Sky } from './sky.js';
import { Weather } from './weather.js';
import { NpcManager } from './npcs.js';

export const DEFAULT_SETTINGS = { waterLevel: 0, time: 10, autoTime: false, weather: 'clear', villagers: 4, critters: 6 };

export class World {
  constructor(scene, { shadowSize = 2048 } = {}) {
    this.scene = scene;
    this.terrain = new Terrain(scene);
    this.water = new Water(scene);
    this.props = new PropManager(scene, this.terrain);
    this.sky = new Sky(scene, { shadowSize });
    this.weather = new Weather(scene, this.sky, this.water);
    this.npcs = new NpcManager(scene, this.terrain, this.props);
    this.settings = { ...DEFAULT_SETTINGS };
    this.onChange = () => {}; // called whenever the island itself changes (for autosave)
  }

  /** Full state (terrain + props + settings) as plain data. */
  getState() {
    return {
      heights: this.terrain.heights.slice(),
      paint: this.terrain.paint.slice(),
      props: this.props.toList(),
      settings: { ...this.settings },
    };
  }

  /** Load a full state. Missing settings fall back to defaults. */
  setState(state) {
    this.terrain.heights.set(state.heights);
    this.terrain.paint.set(state.paint);
    const s = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
    this.settings = s;
    this.setWaterLevel(s.waterLevel, false);
    this.props.load(state.props);
    this.props.snapAll();
    this.setTime(s.time);
    this.setWeather(s.weather);
    this.npcs.setCounts(s.villagers, s.critters);
    this.changed();
  }

  /** Lightweight snapshot for undo/redo (terrain + props only). */
  snapshot() {
    return { heights: this.terrain.heights.slice(), paint: this.terrain.paint.slice(), props: this.props.toList() };
  }
  restore(snap) {
    this.terrain.heights.set(snap.heights);
    this.terrain.paint.set(snap.paint);
    this.terrain.update();
    this.props.load(snap.props);
    this.npcs.validate();
    this.changed();
  }

  setWaterLevel(y, notify = true) {
    this.settings.waterLevel = y;
    this.terrain.waterLevel = y;
    this.water.setLevel(y);
    this.terrain.update();      // beach colour follows the water line
    this.props.snapAll();       // docks float
    this.npcs.validate();
    if (notify) this.changed();
  }
  setTime(t) { this.settings.time = ((t % 24) + 24) % 24; this.sky.time = this.settings.time; }
  setWeather(w) { this.settings.weather = w; this.weather.set(w); }
  setCounts(v, c) {
    this.npcs.setCounts(v, c);
    this.settings.villagers = this.npcs.counts.villager;
    this.settings.critters = this.npcs.counts.critter;
  }

  changed() { this.onChange(); }

  /** Per-frame update. `view` = camera position, `focus` = what the player is looking at. */
  update(dt, t, view, focus) {
    if (this.settings.autoTime) this.setTime(this.settings.time + dt * 0.2); // ~2 min per day
    this.sky.update(view);
    this.weather.update(dt, t, view);
    this.water.update(t, this.sky.night);
    this.props.focus.copy(focus);
    this.props.update(dt, t, this.sky.night);
    this.npcs.update(dt);
  }
}

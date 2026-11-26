// Ambient soundscape + UI sounds, fully synthesized with Web Audio (no files).
// Layers: ocean waves, wind, rain, daytime birds, night crickets.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('islandBuilder.muted') === '1';
    this.night = 0;
    this.rain = 0;
    this.birdTimer = 2;
    this.cricketTimer = 1;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // Shared 2-second noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 2; }

    const loop = (filterType, freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g };
    };
    // Ocean: low-passed noise with a slow swelling LFO on the gain.
    this.ocean = loop('lowpass', 420, 0.7, 0.12);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(this.ocean.g.gain); lfo.start();
    // Wind: band-passed noise with drifting frequency.
    this.wind = loop('bandpass', 600, 0.8, 0.04);
    const wl = ctx.createOscillator(); wl.frequency.value = 0.05;
    const wg = ctx.createGain(); wg.gain.value = 250;
    wl.connect(wg).connect(this.wind.f.frequency); wl.start();
    // Rain: bright hiss, faded in by weather.
    this.rainLayer = loop('highpass', 1800, 0.5, 0);
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('islandBuilder.muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  /** Short pitched blip for UI feedback. */
  blip(freq = 660, dur = 0.08, type = 'sine', vol = 0.15, slide = 1.5) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  click() { this.blip(880, 0.05, 'triangle', 0.08, 1.2); }
  pop() { this.blip(420, 0.12, 'sine', 0.2, 2.2); }
  remove() { this.blip(500, 0.14, 'triangle', 0.15, 0.4); }
  whoosh() { this.blip(200, 0.3, 'sine', 0.12, 3); }
  chime() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sine', 0.1, 1.01), i * 90)); }

  /** Called every frame with the current mood. */
  update(dt, { night, rain, wind = 0 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.rainLayer.g.gain.setTargetAtTime(rain * 0.16, t, 0.5);
    this.wind.g.gain.setTargetAtTime(0.035 + wind * 0.05 + rain * 0.03, t, 0.5);
    if (this.muted) return;
    // Birds by day (not in rain), crickets at night.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 2 + Math.random() * 5;
      if (night < 0.4 && rain < 0.3) this.chirp();
    }
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 0.6 + Math.random() * 1.2;
      if (night > 0.6 && rain < 0.3) this.cricket();
    }
  }

  chirp() {
    const n = 2 + Math.floor(Math.random() * 4), base = 2200 + Math.random() * 1600;
    for (let i = 0; i < n; i++) setTimeout(() => this.blip(base * (0.9 + Math.random() * 0.2), 0.07, 'sine', 0.035, 1.4), i * 110);
  }
  cricket() {
    for (let i = 0; i < 3; i++) setTimeout(() => this.blip(4200, 0.03, 'square', 0.012, 1.0), i * 45);
  }
}

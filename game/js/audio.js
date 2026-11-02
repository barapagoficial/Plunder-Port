'use strict';
// ===== Audio: efectos, ambiente y música procedural (todo sintetizado) =====
const Sfx = {
  ctx: null, master: null, sfx: null, music: null, amb: null, verb: null, ready: false,
  last: {},
  init() {
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(comp);
      this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(comp);
      this.amb = c.createGain(); this.amb.gain.value = 0.0; this.amb.connect(comp);
      // reverberación
      this.verb = c.createConvolver();
      const len = c.sampleRate * 1.8, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      this.verb.buffer = ir;
      const vg = c.createGain(); vg.gain.value = 0.25; this.verb.connect(vg); vg.connect(comp);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.ready = true;
    } catch (e) { this.ready = false; }
  },
  resume() {
    if (!this.ready) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.ambStarted) { this.ambStarted = true; this.startAmbience(); Music.start(); }
  },
  applySettings() {
    if (!this.ready || !S) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(S.sound ? 0.8 : 0, t, 0.05);
    this.amb.gain.setTargetAtTime(S.sound ? 0.5 : 0, t, 0.3);
    this.music.gain.setTargetAtTime(S.music ? 0.32 : 0, t, 0.5);
  },
  out(dest, verb) {
    if (verb) { const s = this.ctx.createGain(); s.connect(dest || this.sfx); const v = this.ctx.createGain(); v.gain.value = verb; s.connect(v); v.connect(this.verb); return s; }
    return dest || this.sfx;
  },
  noise(dur, freq, vol, type, q, dest, verb, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out(dest, verb));
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
    return f;
  },
  tone(freq, dur, vol, type, slide, dest, delay, attack, verb) {
    const c = this.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(dest, verb)); o.start(t); o.stop(t + dur + 0.05);
  },
  play(n, vol) {
    if (!this.ready || !S || !S.sound) return;
    const now = performance.now();
    if (this.last[n] && now - this.last[n] < 50) return;
    this.last[n] = now;
    const v = vol === undefined ? 1 : vol;
    try {
      switch (n) {
        case 'cannon': this.noise(0.7, 900, 0.7 * v, 'lowpass', 0, null, 0.5); this.tone(110, 0.45, 0.6 * v, 'sine', 35); this.noise(0.12, 3000, 0.3 * v, 'highpass'); break;
        case 'cannon2': this.noise(0.6, 500, 0.35 * v, 'lowpass', 0, null, 0.6); this.tone(80, 0.35, 0.25 * v, 'sine', 30); break;
        case 'boom': this.noise(1.4, 400, 0.8 * v, 'lowpass', 0, null, 0.6); this.tone(60, 0.9, 0.6 * v, 'sine', 22); this.noise(0.5, 2500, 0.25 * v, 'bandpass', 1, null, 0, 0.1); break;
        case 'hit': this.noise(0.25, 1400, 0.45 * v, 'bandpass', 2); this.tone(180, 0.15, 0.25 * v, 'square', 70); break;
        case 'crack': this.noise(0.18, 2200, 0.4 * v, 'bandpass', 3); this.noise(0.3, 600, 0.3 * v, 'lowpass', 0, null, 0, 0.04); break;
        case 'coin': this.tone(1568, 0.25, 0.12 * v, 'sine', 0, null, 0, 0, 0.3); this.tone(2093, 0.35, 0.1 * v, 'sine', 0, null, 0.06, 0, 0.3); this.tone(3136, 0.15, 0.04 * v, 'sine', 0, null, 0.06); break;
        case 'coins': for (let i = 0; i < 9; i++) this.tone(1400 + Math.random() * 1200, 0.18, 0.07 * v, 'sine', 0, null, i * 0.05 + Math.random() * 0.03, 0, 0.2); break;
        case 'treasure': [523, 659, 784, 1047, 1319].forEach((f, i) => { this.tone(f, 0.5, 0.12 * v, 'triangle', 0, null, i * 0.09, 0.01, 0.4); this.tone(f * 2, 0.3, 0.03 * v, 'sine', 0, null, i * 0.09); }); break;
        case 'fanfare': [[392, 0], [523, .15], [659, .3], [784, .45], [659, .62], [784, .75], [1047, .9]].forEach(([f, d]) => { this.tone(f, 0.35, 0.12 * v, 'sawtooth', 0, null, d, 0.02, 0.4); this.tone(f / 2, 0.35, 0.08 * v, 'triangle', 0, null, d); }); break;
        case 'buy': this.tone(660, 0.12, 0.13 * v, 'triangle'); this.tone(990, 0.2, 0.13 * v, 'triangle', 0, null, 0.08); this.noise(0.08, 4000, 0.06 * v, 'highpass', 0, null, 0, 0.08); break;
        case 'hammer': for (let i = 0; i < 3; i++) { this.noise(0.07, 1800, 0.35 * v, 'bandpass', 4, null, 0, i * 0.13); this.tone(420, 0.06, 0.12 * v, 'square', 200, null, i * 0.13); } break;
        case 'splash': this.noise(0.7, 1200, 0.35 * v, 'lowpass', 0, null, 0.3); this.noise(0.4, 3500, 0.12 * v, 'highpass', 0, null, 0, 0.05); break;
        case 'thunder': this.noise(2.5, 160, 0.7 * v, 'lowpass', 0, null, 0.8); this.noise(0.4, 1200, 0.3 * v, 'lowpass'); break;
        case 'roar': this.tone(95, 1.4, 0.35 * v, 'sawtooth', 45, null, 0, 0.1, 0.5); this.tone(140, 1.2, 0.2 * v, 'sawtooth', 60, null, 0.1, 0.1); this.noise(1.3, 500, 0.35 * v, 'lowpass', 0, null, 0.4); break;
        case 'err': this.tone(220, 0.12, 0.12 * v, 'square', 160); break;
        case 'ui': this.tone(880, 0.05, 0.06 * v, 'triangle'); break;
        case 'page': this.noise(0.18, 3000, 0.12 * v, 'bandpass', 0.7); break;
        case 'sword': this.noise(0.18, 2500, 0.25 * v, 'bandpass', 1.5); this.tone(1800, 0.15, 0.03 * v, 'sine', 900); break;
        case 'clash': this.tone(2400, 0.4, 0.08 * v, 'triangle', 0, null, 0, 0, 0.4); this.tone(3700, 0.3, 0.05 * v, 'sine', 0, null, 0, 0, 0.3); this.noise(0.08, 5000, 0.25 * v, 'highpass'); break;
        case 'step': this.noise(0.06, 900 + Math.random() * 500, 0.06 * v, 'bandpass', 1.2); break;
        case 'dig': this.noise(0.25, 700, 0.3 * v, 'bandpass', 1.5); this.noise(0.15, 2200, 0.12 * v, 'highpass', 0, null, 0, 0.12); break;
        case 'crab': this.tone(1200, 0.04, 0.08 * v, 'square'); this.tone(1000, 0.04, 0.08 * v, 'square', 0, null, 0.07); break;
        case 'hurt': this.tone(320, 0.2, 0.14 * v, 'sawtooth', 160); break;
        case 'bell': [0, 0.9].forEach(d => { this.tone(660, 1.6, 0.1 * v, 'sine', 0, null, d, 0.005, 0.5); this.tone(1650, 0.8, 0.04 * v, 'sine', 0, null, d); }); break;
        case 'creak': this.tone(140 + Math.random() * 60, 0.5, 0.05 * v, 'sawtooth', 110, null, 0, 0.15); break;
        case 'level': [523, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 0.12 * v, 'square', 0, null, i * 0.08, 0.01, 0.3)); break;
        case 'gull': this.tone(1500, 0.25, 0.04 * v, 'sine', 900, this.amb); this.tone(1700, 0.3, 0.035 * v, 'sine', 1000, this.amb, 0.3); break;
        case 'bubble': for (let i = 0; i < 5; i++) this.tone(300 + Math.random() * 500, 0.08, 0.06 * v, 'sine', 900, null, i * 0.08); break;
        case 'whoosh': this.noise(0.5, 800, 0.2 * v, 'bandpass', 0.8); break;
      }
    } catch (e) { }
  },
  // ---- ambiente: olas + viento ----
  startAmbience() {
    const c = this.ctx;
    const mk = (freq, type, gain) => {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.amb); src.start();
      return { f, g };
    };
    this.waves = mk(500, 'lowpass', 0.25);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.18; lfo.connect(lg); lg.connect(this.waves.g.gain); lfo.start();
    this.wind = mk(900, 'bandpass', 0.0); this.wind.f.Q.value = 0.6;
    this.applySettings();
  },
  setAmbience(storm, land) {
    if (!this.waves) return;
    const t = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(storm ? 0.35 : 0.03, t, 1);
    this.waves.f.frequency.setTargetAtTime(land ? 300 : (storm ? 900 : 500), t, 1);
  },
};

// ===== Música procedural: saloma pirata en Re menor (6/8) =====
const Music = {
  started: false, next: 0, step: 0, bar: 0, intensity: 0, targetInt: 0, mood: 'sea',
  // acordes (raíz MIDI) Dm C Bb A  / variante: Dm Gm C F
  progs: [[50, 48, 46, 45], [50, 55, 48, 53], [50, 46, 48, 45]],
  chordTypes: { 50: [0, 3, 7], 48: [0, 4, 7], 46: [0, 4, 7], 45: [0, 4, 7], 55: [0, 3, 7], 53: [0, 4, 7] },
  motifs: [
    [0, -1, 2, -1, 4, 2], [7, -1, 5, 4, 2, -1], [4, 5, 7, -1, 5, 4], [2, -1, 0, 2, 4, -1],
    [9, 7, 5, -1, 4, 2], [0, 2, 4, 5, 7, -1], [7, -1, -1, 5, 4, 5], [4, -1, 2, 0, -1, -1],
  ],
  scale: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17],
  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  start() { if (this.started || !Sfx.ready) return; this.started = true; this.next = Sfx.ctx.currentTime + 0.3; this.prog = this.progs[0]; this.timer = setInterval(() => this.schedule(), 60); },
  setIntensity(x) { this.targetInt = x; },
  schedule() {
    const c = Sfx.ctx; if (!c || c.state !== 'running') return;
    const tempo = 100 + this.intensity * 30;
    const eighth = 60 / tempo / 2;
    while (this.next < c.currentTime + 0.25) {
      this.intensity += (this.targetInt - this.intensity) * 0.05;
      const pos = this.step % 6;
      if (pos === 0 && this.step > 0 && this.step % 24 === 0) { this.bar++; if (this.bar % 4 === 0) this.prog = this.progs[Math.floor(Math.random() * this.progs.length)]; }
      const chordIdx = Math.floor(this.step / 6) % 4;
      const root = this.prog[chordIdx];
      const ct = this.chordTypes[root] || [0, 3, 7];
      const t = this.next;
      if (!this.motif || pos === 0) this.motif = this.motifs[Math.floor(Math.random() * this.motifs.length)];
      // bajo
      if (pos === 0 || pos === 3) this.note(this.mtof(root - 12 + (pos === 3 ? 7 : 0)), eighth * 2.5, 0.22, 'triangle', t, 0.005);
      // acordeón (acorde en 1 y 4)
      if (pos === 0 || pos === 3) for (const iv of ct) { this.note(this.mtof(root + iv), eighth * 2.6, 0.045, 'sawtooth', t, 0.03, 1400); this.note(this.mtof(root + iv) * 1.004, eighth * 2.6, 0.03, 'sawtooth', t, 0.03, 1400); }
      // melodía (silbato)
      const deg = this.motif[pos];
      if (deg >= 0 && (this.bar % 8 < 6 || this.intensity > 0.3)) {
        const m = 62 + this.scale[Math.min(this.scale.length - 1, deg)];
        this.note(this.mtof(m), eighth * 1.6, 0.07, 'triangle', t, 0.01, 0, true);
      }
      // percusión
      if (pos === 0) this.drum(t, 0.35 + this.intensity * 0.3);
      if (pos === 3) this.drum(t, 0.22 + this.intensity * 0.2);
      if (this.intensity > 0.4 && (pos === 2 || pos === 5)) this.drum(t, 0.15 * this.intensity, 220);
      this.shaker(t, pos % 3 === 0 ? 0.05 : 0.025);
      this.next += eighth; this.step++;
    }
  },
  note(freq, dur, vol, type, t, att, lp, vib) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    let node = o;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(Sfx.music); const v = c.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(Sfx.verb);
    o.start(t); o.stop(t + dur + 0.05);
  },
  drum(t, vol, f0) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f0 || 120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(Sfx.music); o.start(t); o.stop(t + 0.35);
  },
  shaker(t, vol) {
    const c = Sfx.ctx, s = c.createBufferSource(); s.buffer = Sfx.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f); f.connect(g); g.connect(Sfx.music); s.start(t, Math.random()); s.stop(t + 0.08);
  },
};

function vibrate(ms) { try { if (S && S.vibe !== false && navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }

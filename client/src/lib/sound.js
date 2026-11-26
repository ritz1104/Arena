import { storage } from './api.js';

/**
 * Centralised sound manager.
 * Built-in effects are synthesised live with the Web Audio API — no third-party
 * audio files, so they are royalty-free by construction. Custom uploaded files
 * can be assigned to any event from Settings.
 * Audio only starts after a user gesture (browser autoplay policy) via unlock().
 */

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI → Hz
const easeOutQuartInv = (y) => 1 - (1 - y) ** 0.25;

class SoundManager {
  ctx = null;
  master = null;
  unlocked = false;
  role = 'host';
  config = { enabled: true, volume: 0.8, playOnHost: false, playOnAudience: true, events: {} };
  muted = storage.get('arena_muted') === '1';
  listeners = new Set();
  cache = new Map();

  setRole(role) {
    this.role = role;
  }

  configure(cfg) {
    if (!cfg) return;
    this.config = { ...this.config, ...cfg };
    if (this.master) this.master.gain.value = this.config.volume;
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    this.listeners.forEach((fn) => fn());
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.config.volume;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.unlocked = true;
      this.emit();
    } catch {
      /* audio not available */
    }
  }

  setMuted(m) {
    this.muted = m;
    storage.set('arena_muted', m ? '1' : '0');
    this.emit();
  }

  get allowed() {
    if (!this.config.enabled || this.muted) return false;
    if (this.role === 'host' && !this.config.playOnHost) return false;
    if (this.role === 'audience' && !this.config.playOnAudience) return false;
    return true;
  }

  /** Play the sound configured for a competition event. */
  play(event, opts = {}) {
    if (!this.allowed) return;
    this.playRaw(this.config.events?.[event], event, opts);
  }

  /** Always plays (used by Settings preview), regardless of role. */
  preview(spec, event, opts = {}) {
    this.unlock();
    if (this.muted) this.setMuted(false);
    this.playRaw(spec, event, opts);
  }

  playRaw(spec, event, opts) {
    if (!this.ctx || !this.unlocked) return;
    const s = spec || { source: 'builtin', preset: event };
    if (s.source === 'custom' && s.url) {
      try {
        let base = this.cache.get(s.url);
        if (!base) {
          base = new Audio(s.url);
          base.preload = 'auto';
          this.cache.set(s.url, base);
        }
        const a = base.cloneNode();
        a.volume = Math.min(1, Math.max(0, this.config.volume));
        a.play().catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }
    const fn = PRESETS[s.preset];
    if (fn) {
      try {
        fn(this, opts);
      } catch {
        /* ignore */
      }
    }
  }

  /* ---------------- synthesis helpers ---------------- */
  tone({ freq, start = 0, dur = 0.2, type = 'sine', gain = 0.3, slide, attack = 0.005, release = 0.08, vibrato = 0, filter }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + release);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = 6;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.05);
  }

  noise({ start = 0, dur = 0.2, gain = 0.2, freq = 1200, type = 'bandpass', sweep }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const len = Math.ceil(ctx.sampleRate * (dur + 0.05));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }
}

const PRESETS = {
  none: () => {},
  roulette(s, { duration = 6.5, clicks = 60 } = {}) {
    const n = Math.min(160, Math.max(8, clicks));
    for (let k = 1; k <= n; k++) {
      const t = duration * easeOutQuartInv(k / n);
      s.tone({ freq: 2100, start: t, dur: 0.012, type: 'square', gain: 0.09, attack: 0.001, release: 0.02 });
    }
    s.noise({ dur: 0.6, gain: 0.08, freq: 400, sweep: 2400 });
  },
  stopHit(s) {
    s.tone({ freq: 150, dur: 0.35, type: 'sine', gain: 0.7, slide: 45 });
    s.noise({ dur: 0.25, gain: 0.25, freq: 900, type: 'lowpass' });
  },
  reveal(s) {
    [72, 76, 79, 84].forEach((n, i) => s.tone({ freq: NOTE(n), start: i * 0.09, dur: 0.18, type: 'triangle', gain: 0.25 }));
    s.tone({ freq: NOTE(84), start: 0.36, dur: 0.7, type: 'sine', gain: 0.18, vibrato: 4 });
    s.noise({ start: 0.3, dur: 0.6, gain: 0.05, freq: 7000, type: 'highpass' });
  },
  countdown(s) {
    [0, 0.55, 1.1].forEach((t) => s.tone({ freq: 523, start: t, dur: 0.16, type: 'square', gain: 0.18, filter: 2400 }));
    s.tone({ freq: 1046, start: 1.65, dur: 0.6, type: 'square', gain: 0.22, filter: 3000 });
    s.noise({ start: 1.65, dur: 0.5, gain: 0.12, freq: 3000 });
  },
  pop(s) {
    s.tone({ freq: 520, dur: 0.09, type: 'sine', gain: 0.35, slide: 1250 });
    s.tone({ freq: 1250, start: 0.08, dur: 0.12, type: 'triangle', gain: 0.15 });
  },
  buzzer(s) {
    s.tone({ freq: 98, dur: 0.55, type: 'sawtooth', gain: 0.32, filter: 1400, vibrato: 3 });
    s.tone({ freq: 147, dur: 0.55, type: 'square', gain: 0.18, filter: 1600 });
  },
  victory(s) {
    [[72, 0], [76, 0.1], [79, 0.2]].forEach(([n, t]) => s.tone({ freq: NOTE(n), start: t, dur: 0.12, type: 'square', gain: 0.16, filter: 3500 }));
    [72, 76, 79, 84].forEach((n) => s.tone({ freq: NOTE(n), start: 0.32, dur: 0.6, type: 'triangle', gain: 0.17, vibrato: 3 }));
    s.noise({ start: 0.32, dur: 0.5, gain: 0.06, freq: 8000, type: 'highpass' });
  },
  fail(s) {
    // the classic descending "wah-wah-wah-waaah"
    [[55, 0, 0.32], [54, 0.36, 0.32], [53, 0.72, 0.32], [52, 1.08, 0.9]].forEach(([n, t, d], i) =>
      s.tone({ freq: NOTE(n), start: t, dur: d, type: 'sawtooth', gain: 0.25, filter: 900, vibrato: i === 3 ? 7 : 2, slide: i === 3 ? NOTE(51) : undefined })
    );
  },
  mystery(s) {
    [76, 79, 83, 86, 83, 79].forEach((n, i) => s.tone({ freq: NOTE(n), start: i * 0.11, dur: 0.3, type: 'sine', gain: 0.14, vibrato: 5 }));
    s.tone({ freq: NOTE(64), dur: 1, type: 'triangle', gain: 0.1, vibrato: 2 });
  },
  timeUp(s) {
    [0, 0.22, 0.44].forEach((t, i) => s.tone({ freq: i % 2 ? 660 : 880, start: t, dur: 0.18, type: 'square', gain: 0.17, filter: 2500 }));
  },
  tick(s) {
    s.tone({ freq: 1320, dur: 0.04, type: 'square', gain: 0.12, filter: 3000, attack: 0.001, release: 0.03 });
  },
  elimination(s) {
    s.tone({ freq: 80, dur: 0.9, type: 'sine', gain: 0.7, slide: 35 });
    s.tone({ freq: 320, start: 0.05, dur: 1.2, type: 'sawtooth', gain: 0.18, slide: 55, filter: 1200 });
    s.noise({ dur: 1, gain: 0.2, freq: 600, type: 'lowpass', sweep: 80 });
  },
  notify(s) {
    s.tone({ freq: 880, dur: 0.12, type: 'sine', gain: 0.25 });
    s.tone({ freq: 1320, start: 0.12, dur: 0.22, type: 'sine', gain: 0.22 });
  },
  champion(s) {
    for (let i = 0; i < 14; i++) s.noise({ start: i * 0.06, dur: 0.05, gain: 0.08 + i * 0.01, freq: 300, type: 'lowpass' });
    const t0 = 0.9;
    [[67, 0], [72, 0.15], [76, 0.3], [79, 0.45]].forEach(([n, t]) => s.tone({ freq: NOTE(n), start: t0 + t, dur: 0.13, type: 'square', gain: 0.16, filter: 3200 }));
    [72, 76, 79, 84, 88].forEach((n) => s.tone({ freq: NOTE(n), start: t0 + 0.62, dur: 1.6, type: 'triangle', gain: 0.14, vibrato: 4 }));
    s.tone({ freq: NOTE(48), start: t0 + 0.62, dur: 1.6, type: 'sawtooth', gain: 0.12, filter: 600 });
    s.noise({ start: t0 + 0.62, dur: 1.4, gain: 0.08, freq: 9000, type: 'highpass' });
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
export const sound = new SoundManager();

/** Maps realtime fx events to sound events. */
export const FX_SOUND = {
  battleStart: 'battleStart',
  question: 'question',
  buzz: 'buzz',
  correct: 'correct',
  wrong: 'wrong',
  hint: 'hint',
  timeUp: 'timeUp',
  battleEnd: 'eliminated',
  leaderboardShow: 'leaderboard',
  roundComplete: 'leaderboard',
  champion: 'champion',
  wildcard: 'teamSelected',
  roundStart: 'teamSelected',
  tiebreaker: 'hint',
  noBuzz: 'timeUp',
  skipped: 'wrong',
  finalStart: 'battleStart',
  finalTimeUp: 'timeUp',
  finalReveal: 'champion',
};

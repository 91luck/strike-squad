/**
 * Procedural music: an Indian-flavoured score played live with WebAudio (no files, nothing to license).
 *
 * Layers, scheduled a little ahead of time on the audio clock:
 *   tanpura   a drone plucking Pa-Sa-Sa-Sa on the stage's root, every bar
 *   bass      root and fifth on the beat
 *   tabla     a low "dha" (a pitched thump) and a high "na" (a short ringing tap) in a 16-step pattern
 *   bansuri   a flute-like lead (triangle with vibrato) improvising phrases in the stage's raga
 *   battle    (boss fights) a fuller drum pattern, a growling lead an octave down, faster tempo
 *
 * Each saga stage has its own raga (scale), root and tempo, so stages sound different from one another. The menu
 * gets a calm alap (drone and slow flute, no drums). Everything goes through the shared sound-effects bus, so the
 * game's volume, its mute switch and the portal's mute all apply; the music has its own on/off setting too.
 */

/** Semitone steps of each raga used (one octave, from Sa). */
const RAGAS = {
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  yaman: [0, 2, 4, 6, 7, 9, 11],
  kafi: [0, 2, 3, 5, 7, 9, 10],
  bhairavi: [0, 1, 3, 5, 7, 8, 10],
  marwa: [0, 1, 4, 6, 7, 9, 11],
  durga: [0, 2, 5, 7, 9],
  malkauns: [0, 3, 5, 8, 10],
  todi: [0, 1, 3, 6, 7, 8, 11],
  desh: [0, 2, 5, 7, 9, 10, 11],
  bhupali: [0, 2, 4, 7, 9],
} as const;

type Raga = keyof typeof RAGAS;

/** Saga stage n (1..10): its raga, its Sa (Hz) and its tempo. Index 0 is the menu and ordinary missions. */
const THEMES: { raga: Raga; root: number; bpm: number }[] = [
  { raga: 'yaman', root: 146.83, bpm: 76 }, // menu / campaign
  { raga: 'bhairav', root: 146.83, bpm: 112 }, // 1 Agnivan
  { raga: 'durga', root: 164.81, bpm: 108 }, // 2 Sagar Setu
  { raga: 'bhupali', root: 174.61, bpm: 116 }, // 3 Vayu Shikhar
  { raga: 'malkauns', root: 138.59, bpm: 104 }, // 4 Naag Lok
  { raga: 'marwa', root: 155.56, bpm: 110 }, // 5 Maya Nagri
  { raga: 'todi', root: 130.81, bpm: 100 }, // 6 Bhasm Parvat
  { raga: 'kafi', root: 146.83, bpm: 120 }, // 7 Samarpan Maidan
  { raga: 'desh', root: 164.81, bpm: 118 }, // 8 Chakra Durg
  { raga: 'bhairavi', root: 155.56, bpm: 114 }, // 9 Dwand Bhoomi
  { raga: 'bhairav', root: 130.81, bpm: 124 }, // 10 Mahayuddh
];

export type Mood = 'off' | 'menu' | 'stage' | 'boss';

// 16 steps a bar: 2 = dha (low), 1 = na (high), 0 = rest.
const TABLA_STAGE = [2, 0, 1, 1, 2, 0, 1, 0, 2, 0, 1, 1, 0, 1, 2, 1];
const TABLA_BOSS = [2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1];

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private timer = 0;
  private nextStep = 0;
  private step = 0;
  private mood: Mood = 'off';
  private theme = THEMES[0] as (typeof THEMES)[number];
  private enabled = true;
  /** The melody's current scale degree (a random walk keeps phrases singable). */
  private degree = 0;
  private phrase: number[] = [];
  private seed = 1;

  constructor(private readonly audio: () => { ctx: AudioContext; out: AudioNode } | null) {}

  /** The music setting (separate from sound effects). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyGain();
  }

  /** What to play: `stage` 1..10 picks a saga stage's raga; 0 the menu / campaign theme. */
  play(mood: Mood, stage = 0): void {
    const theme = THEMES[Math.max(0, Math.min(THEMES.length - 1, stage))] as (typeof THEMES)[number];
    if (mood === this.mood && theme === this.theme) return;
    const restart = theme !== this.theme || this.mood === 'off';
    this.mood = mood;
    this.theme = theme;
    if (restart) {
      this.step = 0;
      this.phrase = [];
      this.seed = stage * 7919 + 17;
    }
    this.ensure();
    this.applyGain();
  }

  stop(): void {
    this.mood = 'off';
    this.applyGain();
  }

  /** A short rising flourish (stage cleared). */
  flourish(): void {
    const a = this.audio();
    if (!a || !this.enabled) return;
    this.ensure();
    const t = a.ctx.currentTime + 0.02;
    const notes = RAGAS[this.theme.raga];
    for (let i = 0; i < 6; i++) {
      const st = notes[i % notes.length] as number;
      this.flute(
        t + i * 0.09,
        this.theme.root * 2 * 2 ** ((st + 12 * Math.floor(i / notes.length)) / 12),
        0.35,
        0.16,
      );
    }
  }

  /** Starts the scheduler; the audio itself is attached once the browser allows sound (after a tap or key). */
  private ensure(): void {
    this.attach();
    if (!this.timer && typeof window !== 'undefined') this.timer = window.setInterval(() => this.tick(), 50);
  }

  private attach(): void {
    const a = this.audio();
    if (!a || this.ctx === a.ctx) return;
    this.ctx = a.ctx;
    this.bus = a.ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(a.out);
    this.nextStep = a.ctx.currentTime + 0.1;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.ctx || !this.bus) return;
    const target = !this.enabled || this.mood === 'off' ? 0 : this.mood === 'menu' ? 0.5 : 0.42;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(target, t, 0.4);
  }

  private rand(): number {
    // small deterministic generator: the same stage plays the same kind of tune
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** Schedules every step that falls in the next 0.25 s of audio time. */
  private tick(): void {
    if (!this.ctx) this.attach();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.mood === 'off' || !this.enabled) {
      this.nextStep = ctx.currentTime + 0.1;
      return;
    }
    const boss = this.mood === 'boss';
    const bpm = this.theme.bpm * (boss ? 1.18 : this.mood === 'menu' ? 0.85 : 1);
    const stepDur = 60 / bpm / 4;
    if (this.nextStep < ctx.currentTime - 0.5) this.nextStep = ctx.currentTime + 0.05; // after a stall
    while (this.nextStep < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextStep, stepDur, boss);
      this.nextStep += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, sd: number, boss: boolean): void {
    const root = this.theme.root;
    const s16 = step % 16;
    const menu = this.mood === 'menu';
    // tanpura: Pa . Sa . Sa . Sa (over the bar)
    if (s16 % 4 === 0) {
      const f = s16 === 0 ? (root * 3) / 4 : root;
      this.tanpura(t, f / 2, sd * 6);
    }
    if (!menu) {
      // bass on the beat
      if (s16 % 4 === 0) this.bass(t, s16 === 8 ? (root * 3) / 8 : root / 4, sd * 3, boss);
      const pat = boss ? TABLA_BOSS : TABLA_STAGE;
      const hit = pat[s16] ?? 0;
      if (hit === 2) this.dha(t);
      else if (hit === 1) this.na(t, s16 % 2 === 1 ? 0.06 : 0.1);
    }
    // melody: phrases of 8 notes, then 8 steps of rest; the menu plays half as often
    const every = menu ? 4 : 2;
    if (step % every === 0) {
      const inPhrase = step % 32 < 22;
      if (inPhrase && (this.rand() < (menu ? 0.7 : 0.82) || step % 8 === 0)) {
        const f = this.nextNote();
        const len = sd * every * (this.rand() < 0.25 ? 2 : 1);
        if (boss) this.growl(t, f / 2, len);
        this.flute(t, f, len, boss ? 0.1 : 0.13);
      }
    }
  }

  /** A random walk over the raga, two octaves, leaning back to Sa at phrase ends. */
  private nextNote(): number {
    const scale = RAGAS[this.theme.raga];
    const n = scale.length;
    const r = this.rand();
    this.degree += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
    this.degree = Math.max(0, Math.min(n * 2, this.degree));
    if (this.phrase.length >= 7) {
      this.phrase = [];
      this.degree = this.rand() < 0.5 ? n : 0;
    }
    this.phrase.push(this.degree);
    const oct = Math.floor(this.degree / n);
    const st = (scale[this.degree % n] as number) + 12 * oct;
    return this.theme.root * 2 * 2 ** (st / 12);
  }

  // ---------------------------------------------------------------- instruments

  private env(t: number, peak: number, attack: number, dur: number): GainNode {
    const ctx = this.ctx as AudioContext;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.bus as GainNode);
    return g;
  }

  private tanpura(t: number, f: number, dur: number): void {
    const ctx = this.ctx as AudioContext;
    const g = this.env(t, 0.06, 0.02, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    lp.connect(g);
    for (const d of [-3, 3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private bass(t: number, f: number, dur: number, boss: boolean): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = boss ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = boss ? 700 : 400;
    o.connect(lp).connect(this.env(t, boss ? 0.16 : 0.18, 0.01, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** dha: a pitched thump (the bayan) with a touch of noise. */
  private dha(t: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.25);
    o.connect(this.env(t, 0.34, 0.005, 0.32));
    o.start(t);
    o.stop(t + 0.35);
    this.noiseHit(t, 0.05, 0.05, 1800, 'lowpass');
  }

  /** na: the dayan's ringing tap. */
  private na(t: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = this.theme.root * 4;
    o.connect(this.env(t, gain * 1.4, 0.003, 0.14));
    o.start(t);
    o.stop(t + 0.16);
    this.noiseHit(t, 0.04, gain, 5000, 'highpass');
  }

  private noiseHit(t: number, dur: number, gain: number, freq: number, type: BiquadFilterType): void {
    const ctx = this.ctx as AudioContext;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(this.env(t, gain, 0.002, dur));
    src.start(t);
  }

  /** bansuri: triangle with breath and a slow vibrato, a little slide into the note. */
  private flute(t: number, f: number, dur: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.value = f * 0.008;
    vib.connect(vg).connect(o.frequency);
    const g = this.env(t, gain, 0.04, Math.max(0.15, dur * 1.3));
    o.connect(g);
    o.start(t);
    vib.start(t);
    o.stop(t + dur * 1.3 + 0.05);
    vib.stop(t + dur * 1.3 + 0.05);
  }

  /** The boss's growl: a filtered saw an octave below the flute. */
  private growl(t: number, f: number, dur: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + dur);
    o.connect(lp).connect(this.env(t, 0.07, 0.01, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

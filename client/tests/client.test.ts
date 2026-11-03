import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GAME_CONFIG,
  MISSION_1,
  NEUTRAL_INPUT,
  newMover,
  stepPlayerMovement,
  type PlayerSnapshot,
  type Snapshot,
  type World,
} from '@strikesquad/shared';
import { Predictor } from '../src/game/predict';
import { Timeline } from '../src/game/timeline';
import { stickToAxes } from '../src/input/input';
import { backoffMs } from '../src/net/connection';
import { ProgressStore } from '../src/progress';
import { SettingsStore, keyLabel, sanitizeSettings } from '../src/settings';
import { wsUrl } from '../src/env';

const G = 14 * GAME_CONFIG.tile;

const player = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: 'a',
  n: 'A',
  s: 0,
  hr: 0,
  x: 100,
  y: G,
  vx: 0,
  vy: 0,
  g: 1,
  f: 1,
  c: 0,
  ax: 1,
  ay: 0,
  hp: 100,
  st: 0,
  dl: 0,
  w: 0,
  iv: 0,
  fi: 0,
  k: 0,
  ul: 0,
  od: 0,
  cb: 0,
  rk: -1,
  ml: 0,
  co: 3,
  dr: 0,
  pj: 0,
  aj: 1,
  dsh: 0,
  sld: 0,
  dcd: 0,
  dd: 1,
  ad: 0,
  pd: 0,
  pw: -1,
  pn: 0,
  ...over,
});
const snap = (tick: number, players: PlayerSnapshot[]): Snapshot => ({
  tick,
  phase: 'playing',
  result: null,
  cd: 0,
  lives: 3,
  cp: 0,
  gates: 0,
  taken: 0,
  score: 0,
  lx: 7000,
  arena: null,
  boss: null,
  players,
  enemies: [],
  bullets: [],
  bm: -1,
  fx: [],
});
const WORLD = { gates: 0, limitX: 7000 };

describe('Timeline (snapshot interpolation)', () => {
  it('interpolates positions between two snapshots', () => {
    const t = new Timeline();
    t.push(1, snap(30, [player({ x: 100 })]));
    t.push(2, snap(60, [player({ x: 200 })]));
    expect(t.sample(1.5)!.players[0]!.x).toBeCloseTo(150);
  });
  it('ignores duplicate and out-of-order snapshots', () => {
    const t = new Timeline();
    expect(t.push(2, snap(60, []))).toBe(true);
    expect(t.push(2, snap(60, []))).toBe(false);
    expect(t.push(1, snap(30, []))).toBe(false);
    expect(t.size).toBe(1);
  });
  it('does not slide soldiers across the level on a respawn/revive teleport', () => {
    const t = new Timeline();
    t.push(1, snap(30, [player({ x: 100 })]));
    t.push(2, snap(60, [player({ x: 2000 })]));
    expect(t.sample(1.5)!.players[0]!.x).toBe(2000);
  });
  it('holds the last snapshot beyond the buffer and extends bullets along their path', () => {
    const t = new Timeline();
    const s = snap(30, [player()]);
    s.bullets = [{ id: 1, x: 0, y: 0, vx: 600, vy: 0, e: 0, w: 0, k: 0, p: 0 }];
    t.push(1, s);
    const f = t.sample(1.05)!;
    expect(f.players[0]!.x).toBe(100);
    expect(f.bullets[0]!.x).toBeCloseTo(30);
  });
});

describe('touch stick → 8-way controls', () => {
  it('ignores tiny movement (dead zone)', () => {
    expect(stickToAxes(0.1, -0.2)).toEqual({ mx: 0, my: 0 });
  });
  it('running right with the thumb slightly up does not aim at the sky', () => {
    expect(stickToAxes(0.9, -0.3)).toEqual({ mx: 1, my: 0 });
  });
  it('gives diagonals and straight up/down on a clear push', () => {
    expect(stickToAxes(0.7, -0.7)).toEqual({ mx: 1, my: -1 });
    expect(stickToAxes(0, 0.9)).toEqual({ mx: 0, my: 1 });
    expect(stickToAxes(-1, 0)).toEqual({ mx: -1, my: 0 });
  });
});

describe('Predictor', () => {
  const world: World = { level: MISSION_1, isGateOpen: () => false, limitX: 7000 };

  it('predicts exactly the movement of the shared physics', () => {
    const pr = new Predictor(30, MISSION_1);
    pr.reconcile(player({ x: 200 }), 0, WORLD);
    const ref = newMover(200, G, GAME_CONFIG.player.width, GAME_CONFIG.player.height);
    Object.assign(ref, { onGround: true, coyote: 3 });
    for (let i = 1; i <= 20; i++) {
      const inp = { ...NEUTRAL_INPUT, mx: 1, jump: i < 8 };
      pr.step(i, inp);
      stepPlayerMovement(world, ref, inp, 1 / 30);
    }
    expect(pr.pose().x).toBeCloseTo(ref.x);
    expect(pr.pose().y).toBeCloseTo(ref.y);
  });

  it('predicts double jump, dash and slide exactly like the server', () => {
    const pr = new Predictor(30, MISSION_1);
    pr.reconcile(player({ x: 200 }), 0, WORLD);
    const ref = newMover(200, G, GAME_CONFIG.player.width, GAME_CONFIG.player.height);
    Object.assign(ref, { onGround: true, coyote: 3 });
    const script = (i: number) => ({
      ...NEUTRAL_INPUT,
      mx: 1,
      jump: i < 6 || (i > 8 && i < 14),
      dash: i === 16 || i === 40,
      my: i >= 38 ? 1 : 0,
    });
    for (let i = 1; i <= 50; i++) {
      pr.step(i, script(i));
      stepPlayerMovement(world, ref, script(i), 1 / 30);
    }
    expect(pr.pose().x).toBeCloseTo(ref.x);
    expect(pr.pose().y).toBeCloseTo(ref.y);
    // ...and the server's dash/slide state is taken over on reconcile.
    pr.reconcile(player({ x: 300, dsh: 3, dd: -1, dcd: 10 }), 50, WORLD);
    pr.step(51, { ...NEUTRAL_INPUT });
    expect(pr.pose().x).toBeLessThan(300 - 15);
    expect(pr.pose().dsh).toBe(2);
  });

  it('reconciles to the server and replays unacknowledged inputs', () => {
    const pr = new Predictor(30, MISSION_1);
    pr.reconcile(player({ x: 200 }), 0, WORLD);
    for (let i = 1; i <= 10; i++) pr.step(i, { ...NEUTRAL_INPUT, mx: 1 });
    const step = GAME_CONFIG.player.runSpeed / 30;
    // Server has processed 6 inputs and agrees: we stay where we predicted.
    pr.reconcile(player({ x: 200 + 6 * step }), 6, WORLD);
    expect(pr.pendingCount).toBe(4);
    pr.smooth(10);
    expect(pr.pose().x).toBeCloseTo(200 + 10 * step);
  });

  it('smooths a small correction instead of teleporting, but snaps on a big one', () => {
    const pr = new Predictor(30, MISSION_1);
    pr.reconcile(player({ x: 200 }), 0, WORLD);
    pr.step(1, { ...NEUTRAL_INPUT });
    pr.reconcile(player({ x: 220 }), 1, WORLD);
    expect(pr.pose().x).toBeCloseTo(200); // drawn where it was, error decays
    pr.smooth(1);
    expect(pr.pose().x).toBeCloseTo(220, 0);
    pr.reconcile(player({ x: 1500 }), 1, WORLD);
    expect(pr.pose().x).toBe(1500);
  });

  it("does not predict while KO'd", () => {
    const pr = new Predictor(30, MISSION_1);
    pr.reconcile(player({ x: 200, st: 1 }), 0, WORLD);
    pr.step(1, { ...NEUTRAL_INPUT, mx: 1 });
    expect(pr.pose().x).toBe(200);
    expect(pr.isAlive).toBe(false);
  });
});

describe('settings', () => {
  it('falls back to defaults for corrupted storage', () => {
    const s = new SettingsStore({ getItem: () => '{not json', setItem: () => undefined });
    expect(s.value.volume).toBe(60);
  });
  it('clamps and validates untrusted values', () => {
    const v = sanitizeSettings({
      volume: 9999,
      touchSensitivity: -4,
      name: '<script>',
      keyFire: 'x y',
      muted: 'yes',
    });
    expect(v.volume).toBe(100);
    expect(v.touchSensitivity).toBe(50);
    expect(v.name).toBe('');
    expect(v.keyFire).toBe('KeyJ');
    expect(v.muted).toBe(false);
  });
  it('persists updates and survives a failing storage', () => {
    let saved = '';
    const s = new SettingsStore({ getItem: () => null, setItem: (_k, v) => void (saved = v) });
    s.update({ volume: 20, name: 'Ace_7' });
    expect(JSON.parse(saved)).toMatchObject({ volume: 20, name: 'Ace_7' });
    const broken = new SettingsStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => broken.update({ volume: 5 })).not.toThrow();
  });
  it('keeps the touch-control hand setting (right by default, only "left" flips it)', () => {
    expect(sanitizeSettings({}).hand).toBe('right');
    expect(sanitizeSettings({ hand: 'left' }).hand).toBe('left');
    expect(sanitizeSettings({ hand: 'up' }).hand).toBe('right');
  });
  it('formats key labels', () => {
    expect(keyLabel('KeyE')).toBe('E');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('Space')).toBe('Space');
  });
});

describe('env / net helpers', () => {
  it('derives a same-origin secure websocket URL in production-like builds', () => {
    const url = wsUrl({ protocol: 'https:', hostname: 'game.example.com', host: 'game.example.com' });
    expect(url.startsWith('wss://') || url.startsWith('ws://')).toBe(true);
    expect(url.endsWith('/ws') || url.includes(':8080')).toBe(true);
  });
  it('backs off exponentially with a cap', () => {
    expect(backoffMs(0)).toBeLessThan(900);
    expect(backoffMs(3)).toBeGreaterThan(3900);
    expect(backoffMs(50)).toBeLessThan(8400);
  });
});

describe('index.html wiring', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) files.push(p);
    }
  };
  walk(join(__dirname, '..', 'src'));

  it('every element the code looks up by id exists in index.html', () => {
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:\$|getElementById)\('([a-z0-9-]+)'\)/g)) {
        if (!ids.has(m[1])) missing.push(`${f.split('/src/')[1]}: #${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it('has no duplicate ids', () => {
    const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(all.length - new Set(all).size).toBe(0);
  });
  it('declares every required screen', () => {
    for (const s of ['menu', 'create', 'join', 'practice', 'lobby', 'game', 'results']) {
      expect(html).toContain(`data-screen="${s}"`);
    }
  });
});

describe('static asset config', () => {
  it('ships no catch-all _redirects rule (Cloudflare Workers rejects it as an infinite loop)', () => {
    const path = join(__dirname, '..', 'public', '_redirects');
    if (!existsSync(path)) return; // no file: fine
    const text = readFileSync(path, 'utf8');
    expect(text).not.toMatch(/^\s*\/\*\s+\/index\.html/m);
  });
});

describe('mission progress', () => {
  it('records the first win, the best time and the hardest difficulty', () => {
    let saved = '';
    const p = new ProgressStore({ getItem: () => null, setItem: (_k, v) => void (saved = v) });
    expect(p.won('mission-2', 400, 'normal')).toBe(true);
    expect(p.won('mission-2', 350, 'easy')).toBe(false);
    expect(p.get('mission-2')).toEqual({ best: 350, hardest: 'normal' });
    expect(new ProgressStore({ getItem: () => saved, setItem: () => undefined }).get('mission-2')?.best).toBe(
      350,
    );
  });
  it('ignores junk in storage', () => {
    const p = new ProgressStore({
      getItem: () => JSON.stringify({ 'mission-9': { best: 1, hardest: 'easy' }, 'mission-1': { best: -5 } }),
      setItem: () => undefined,
    });
    expect(p.get('mission-1')).toBeUndefined();
  });
});

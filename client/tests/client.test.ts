import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GAME_CONFIG,
  HEROES,
  MISSION_1,
  NEUTRAL_INPUT,
  newMover,
  SAGA,
  stepPlayerMovement,
  type BoardEntry,
  type PlayerSnapshot,
  type Snapshot,
  type World,
} from '@strikesquad/shared';
import { Predictor } from '../src/game/predict';
import { Timeline } from '../src/game/timeline';
import { stickToAxes } from '../src/input/input';
import { backoffMs } from '../src/net/connection';
import { CONTINUE_COST, ProgressStore, SECRET_SHARDS } from '../src/progress';
import {
  DAILY_MAX_SHARDS,
  HERO_UNLOCK_LEVEL,
  LEVEL_CAP,
  PROFILE_KEY,
  ProfileStore,
  TROPHIES,
  TROPHY_SHARDS,
  dayDiff,
  levelFor,
  runXp,
  xpToReach,
  type RunInput,
} from '../src/profile';
import { TAUNTS, teaserFor } from '../src/villains';
import {
  CHEST_SHARDS,
  WEEKLY_KEY,
  WEEKLY_SHARDS,
  WEEKLY_XP,
  WeeklyStore,
  daysToReset,
  isoWeek,
  weekGoals,
  type WeeklyRun,
} from '../src/weekly';
import { DAILY_SHARDS, DailyStore, dayBefore, describeTrial } from '../src/daily';
import { SAVE_KEYS, crazyPlatform, initPlatform, webPlatform, type CrazySdk } from '../src/platform/platform';
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
  rs: 0,
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
  it('music is on by default and only a real boolean turns it off', () => {
    expect(sanitizeSettings({}).music).toBe(true);
    expect(sanitizeSettings({ music: false }).music).toBe(false);
    expect(sanitizeSettings({ music: 'no' }).music).toBe(true);
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
      // Dev tools (src/tools/x.ts) have their own page, tools/x.html; everything else runs in index.html.
      const tool = /\/src\/tools\/([a-z0-9-]+)\.ts$/.exec(f);
      const own = tool
        ? new Set(
            [
              ...readFileSync(join(__dirname, '..', 'tools', `${tool[1]}.html`), 'utf8').matchAll(
                /\sid="([^"]+)"/g,
              ),
            ].map((m) => m[1]),
          )
        : ids;
      for (const m of src.matchAll(/(?:\$|getElementById)\('([a-z0-9-]+)'\)/g)) {
        if (!own.has(m[1])) missing.push(`${f.split('/src/')[1]}: #${m[1]}`);
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

describe('astra saga progress', () => {
  const mem = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it('opens stage 1 only, then each stage once the one before it is cleared', () => {
    const p = new ProgressStore(mem());
    expect(p.unlocked('astra-1')).toBe(true);
    expect(p.unlocked('astra-2')).toBe(false);
    expect(p.nextSagaStage()).toBe('astra-1');
    p.won('astra-1', 200, 'normal', 3);
    expect(p.unlocked('astra-2')).toBe(true);
    expect(p.unlocked('astra-3')).toBe(false);
    expect(p.nextSagaStage()).toBe('astra-2');
    expect(p.sagaStars()).toBe(3);
  });

  it('pays shards for stars and spends them on continues, never below zero; progress survives a reload', () => {
    const store = mem();
    const p = new ProgressStore(store);
    const start = p.shards;
    expect(start).toBe(CONTINUE_COST); // one free continue for a new player
    p.won('astra-1', 200, 'normal', 2);
    expect(p.shards).toBe(start + 2);
    p.won('mission-3', 200, 'normal', 3); // campaign wins pay no shards
    expect(p.shards).toBe(start + 2);
    expect(p.spendShards(CONTINUE_COST)).toBe(true);
    expect(p.spendShards(999)).toBe(false);
    const again = new ProgressStore(store);
    expect(again.shards).toBe(start + 2 - CONTINUE_COST);
    expect(again.unlocked('astra-2')).toBe(true);
  });

  it('remembers each hidden stash once, pays for it once, and ignores junk in storage', () => {
    const store = mem();
    const p = new ProgressStore(store);
    const start = p.shards;
    expect(p.hasSecret('astra-3')).toBe(false);
    expect(p.foundSecret('astra-3')).toBe(true);
    expect(p.foundSecret('astra-3')).toBe(false); // the same stash again: nothing new
    expect(p.shards).toBe(start + SECRET_SHARDS);
    const again = new ProgressStore(store);
    expect(again.hasSecret('astra-3')).toBe(true);
    expect(again.secretsFound()).toBe(1);
    const junk = mem();
    junk.setItem(
      'strikesquad.saga.v1',
      JSON.stringify({ shards: 5, secrets: ['astra-2', 'nope', 7, 'astra-2'] }),
    );
    const j = new ProgressStore(junk);
    expect(j.secretsFound()).toBe(1);
    expect(j.hasSecret('astra-2')).toBe(true);
  });
});

describe('mission progress', () => {
  it('records the first win, the best time, the hardest difficulty and the best stars', () => {
    const saved = new Map<string, string>();
    const store = {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
    };
    const p = new ProgressStore(store);
    expect(p.won('mission-2', 400, 'normal', 2)).toBe(true);
    expect(p.won('mission-2', 350, 'easy', 1)).toBe(false);
    expect(p.get('mission-2')).toEqual({ best: 350, hardest: 'normal', stars: 2 });
    expect(new ProgressStore(store).get('mission-2')?.best).toBe(350);
  });
  it('ignores junk in storage', () => {
    const p = new ProgressStore({
      getItem: () => JSON.stringify({ 'mission-9': { best: 1, hardest: 'easy' }, 'mission-1': { best: -5 } }),
      setItem: () => undefined,
    });
    expect(p.get('mission-1')).toBeUndefined();
  });
});

describe('platform adapter', () => {
  function fakeSdk(over: Partial<CrazySdk> = {}): {
    sdk: CrazySdk;
    calls: string[];
    data: Map<string, string>;
  } {
    const calls: string[] = [];
    const data = new Map<string, string>();
    const sdk: CrazySdk = {
      init: async () => void calls.push('init'),
      environment: 'crazygames',
      game: {
        gameplayStart: () => void calls.push('gameplayStart'),
        gameplayStop: () => void calls.push('gameplayStop'),
        loadingStart: () => void calls.push('loadingStart'),
        loadingStop: () => void calls.push('loadingStop'),
        happytime: () => void calls.push('happytime'),
        inviteLink: (p) => `https://www.crazygames.com/game/strike-squad?squad=${p.squad}`,
        showInviteButton: (p) => void calls.push(`invite:${p.squad}`) as unknown as string,
        hideInviteButton: () => void calls.push('hideInvite'),
        getInviteParam: (n) => (n === 'squad' ? 'ABC234' : null),
      },
      ad: {
        requestAd: (kind, cb) => {
          calls.push(`ad:${kind}`);
          cb.adStarted?.();
          cb.adFinished?.();
        },
      },
      user: { isUserAccountAvailable: true, getUser: async () => ({ username: 'Arjun_7' }) },
      data: {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => void data.set(k, v),
        removeItem: (k) => void data.delete(k),
      },
      ...over,
    };
    return { sdk, calls, data };
  }

  it('the web build has no ads: a rewarded ad never grants its reward', async () => {
    const p = webPlatform();
    expect(p.ads).toBe(false);
    expect(await p.rewardedAd({ start: () => undefined, end: () => undefined })).toBe(false);
    expect(p.ownsUrl).toBe(true);
  });

  it('only the crazygames build, on CrazyGames, with the SDK present, uses the SDK; anything else is web', async () => {
    const { sdk } = fakeSdk();
    expect((await initPlatform(undefined, { CrazyGames: { SDK: sdk } })).id).toBe('web');
    expect((await initPlatform('crazygames', {})).id).toBe('web'); // script blocked or missing
    const off = fakeSdk({ environment: 'disabled' }).sdk;
    expect((await initPlatform('crazygames', { CrazyGames: { SDK: off } })).id).toBe('web');
    const hang = fakeSdk({ init: () => new Promise(() => undefined) }).sdk;
    expect((await initPlatform('crazygames', { CrazyGames: { SDK: hang } }, 20)).id).toBe('web');
    expect((await initPlatform('crazygames', { CrazyGames: { SDK: sdk } })).id).toBe('crazygames');
  });

  it('takes the device type from the portal (touch controls by its word, not by touch APIs)', () => {
    const say = (type: unknown): CrazySdk =>
      fakeSdk({
        user: {
          isUserAccountAvailable: false,
          getUser: async () => null,
          systemInfo: { device: { type } },
        } as never,
      }).sdk;
    expect(crazyPlatform(say('desktop')).device).toBe('desktop');
    expect(crazyPlatform(say('mobile')).device).toBe('mobile');
    expect(crazyPlatform(say('tablet')).device).toBe('tablet');
    expect(crazyPlatform(say('smartwatch')).device).toBeNull();
    expect(crazyPlatform(fakeSdk().sdk).device).toBeNull(); // no system info: the game guesses for itself
    const broken = fakeSdk({
      user: {
        isUserAccountAvailable: false,
        getUser: async () => null,
        get systemInfo(): never {
          throw new Error('not ready');
        },
      } as never,
    }).sdk;
    expect(crazyPlatform(broken).device).toBeNull();
    expect(webPlatform().device).toBeNull();
  });

  it('reports gameplay start/stop once per change, never twice in a row', () => {
    const { sdk, calls } = fakeSdk();
    const p = crazyPlatform(sdk);
    p.gameplay(true);
    p.gameplay(true);
    p.gameplay(false);
    p.gameplay(false);
    p.gameplay(true);
    expect(calls).toEqual(['gameplayStart', 'gameplayStop', 'gameplayStart']);
  });

  it('pauses only once an ad starts, and grants a reward only when the ad finished', async () => {
    const { sdk, calls } = fakeSdk();
    const p = crazyPlatform(sdk);
    const seen: string[] = [];
    const hooks = { start: () => void seen.push('pause'), end: () => void seen.push('resume') };
    expect(await p.rewardedAd(hooks)).toBe(true);
    expect(seen).toEqual(['pause', 'resume']);
    expect(calls).toContain('ad:rewarded');
    // No ad available (Basic Launch, ad blocker): no reward, and the game was never paused.
    const empty = crazyPlatform(
      fakeSdk({ ad: { requestAd: (_k, cb) => cb.adError?.({ code: 'unfilled' }) } }).sdk,
    );
    seen.length = 0;
    expect(await empty.rewardedAd(hooks)).toBe(false);
    expect(seen).toEqual([]);
    // A throwing SDK is survived.
    const broken = crazyPlatform(
      fakeSdk({
        ad: {
          requestAd: () => {
            throw new Error('boom');
          },
        },
      }).sdk,
    );
    expect(await broken.rewardedAd(hooks)).toBe(false);
    await broken.midgameAd(hooks);
  });

  it('moves saves into the cloud save once, and reads invites and usernames', async () => {
    // The game's old saves sit in this browser's localStorage (a stand-in here: tests run without a DOM).
    const local = new Map<string, string>([
      [SAVE_KEYS[1] as string, '{"mission-1":{"best":90,"hardest":"easy"}}'],
    ]);
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = 'window' in g;
    const before = g.window;
    g.window = {
      localStorage: {
        getItem: (k: string) => local.get(k) ?? null,
        setItem: (k: string, v: string) => void local.set(k, v),
        removeItem: (k: string) => void local.delete(k),
      },
    };
    const { sdk, data } = fakeSdk();
    const p = crazyPlatform(sdk);
    if (hadWindow) g.window = before;
    else delete g.window;
    expect(data.get(SAVE_KEYS[1] as string)).toContain('mission-1');
    expect(p.storage?.getItem(SAVE_KEYS[1] as string)).toContain('mission-1');
    expect(p.invitedSquad()).toBe('ABC234');
    expect(p.inviteLink('XYZ789')).toContain('squad=XYZ789');
    expect(await p.username()).toBe('Arjun_7');
    expect(p.ownsUrl).toBe(false);
  });

  it('multiplayer: the squad is the portal room, invites land in it, play-with-friends and mute are followed', () => {
    let joinListener: ((room: unknown) => void) | null = null;
    let settingsListener: ((s: { muteAudio?: boolean }) => void) | null = null;
    const base = fakeSdk();
    const { sdk, calls } = fakeSdk({
      game: {
        ...base.sdk.game,
        updateRoom: (r) => void calls.push(`room:${r.roomId}:${r.isJoinable}:${r.inviteParams?.squad}`),
        leftRoom: () => void calls.push('leftRoom'),
        addJoinRoomListener: (l) => void (joinListener = l),
        inviteParams: { squad: 'QWE234' },
        isInstantMultiplayer: true,
        settings: { muteAudio: true },
        addSettingsChangeListener: (l) => void (settingsListener = l),
      },
    });
    const p = crazyPlatform(sdk);
    p.room('QWE234', true);
    p.room('QWE234', false);
    p.room(null, false);
    expect(calls.slice(-3)).toEqual(['room:QWE234:true:QWE234', 'room:QWE234:false:QWE234', 'leftRoom']);
    expect(calls.some((c) => c.startsWith('invite:'))).toBe(false); // the deprecated button is not used
    expect(p.invitedSquad()).toBe('QWE234'); // inviteParams win over the old query parameter
    expect(p.instantMultiplayer()).toBe(true);
    const joined: string[] = [];
    p.onJoinRoom((c) => joined.push(c));
    joinListener!({ inviteParams: { squad: 'ZZZ999' } });
    joinListener!({ squad: 'YYY888' });
    joinListener!({ nothing: true });
    expect(joined).toEqual(['ZZZ999', 'YYY888']);
    const muted: boolean[] = [];
    p.onMute((m) => muted.push(m));
    settingsListener!({ muteAudio: false });
    expect(muted).toEqual([true, false]);
  });

  it('an older SDK without room data falls back to the invite button', () => {
    const { sdk, calls } = fakeSdk();
    const p = crazyPlatform(sdk);
    p.room('ABC234', true);
    p.room('ABC234', false);
    expect(calls.slice(-2)).toEqual(['invite:ABC234', 'hideInvite']);
    expect(p.instantMultiplayer()).toBe(false);
    const muted: boolean[] = [];
    p.onMute((m) => muted.push(m));
    expect(muted).toEqual([false]);
  });
});

describe('profile: XP, levels and hero unlocks', () => {
  const mem = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };
  const row = (o: Partial<BoardEntry> = {}): BoardEntry => ({
    id: 'me',
    name: 'Me',
    slot: 0,
    hero: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    ults: 0,
    bossDamage: 0,
    bestCombo: 0,
    rank: -1,
    ...o,
  });
  const win = (o: Partial<RunInput> = {}): RunInput => ({
    won: true,
    stars: 1,
    first: false,
    me: row(),
    sagaCleared: 1,
    sagaTotal: 10,
    ...o,
  });

  it('has a level curve that rises and never goes backwards, capped at LEVEL_CAP', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(xpToReach(2) - 1)).toBe(1);
    expect(levelFor(xpToReach(2))).toBe(2);
    expect(levelFor(xpToReach(5))).toBe(5);
    expect(levelFor(1e9)).toBe(LEVEL_CAP);
    for (let l = 2; l <= LEVEL_CAP; l++) expect(xpToReach(l)).toBeGreaterThan(xpToReach(l - 1));
  });

  it('gives every hero an unlock level, three heroes are free, and the first unlock comes after one stage', () => {
    expect(HERO_UNLOCK_LEVEL).toHaveLength(HEROES.length);
    expect(HERO_UNLOCK_LEVEL.filter((l) => l === 1)).toHaveLength(3);
    // A first clear with 3 stars alone pays enough XP to open the first locked hero (the hook for new players).
    const first = runXp(win({ stars: 3, first: true }));
    expect(levelFor(first)).toBeGreaterThanOrEqual(Math.min(...HERO_UNLOCK_LEVEL.filter((l) => l > 1)));
  });

  it('pays more XP for a win than a loss, and style, kills and boss damage add on top (kills are capped)', () => {
    const lost = runXp(win({ won: false, stars: 0 }));
    const plain = runXp(win());
    expect(lost).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(lost);
    expect(runXp(win({ stars: 3 }))).toBeGreaterThan(plain);
    expect(runXp(win({ first: true }))).toBeGreaterThan(plain);
    expect(runXp(win({ me: row({ rank: 3 }) }))).toBeGreaterThan(plain);
    expect(runXp(win({ me: row({ bossDamage: 50 }) }))).toBeGreaterThan(plain);
    expect(runXp(win({ me: row({ kills: 60 }) }))).toBe(runXp(win({ me: row({ kills: 5000 }) })));
    expect(runXp(win({ me: undefined }))).toBeGreaterThan(0);
  });

  it('opens a hero exactly when the level is reached, reports it once, and survives a reload', () => {
    const store = mem();
    const p = new ProfileStore(store);
    expect(p.level).toBe(1);
    expect(p.heroOpen(3)).toBe(false);
    expect(p.nextHero()).toEqual({ hero: 3, level: 2 });
    const r = p.record(win({ stars: 3, first: true }));
    expect(r.levelAfter).toBeGreaterThan(r.levelBefore);
    expect(r.newHeroes).toContain(3);
    expect(p.heroOpen(3)).toBe(true);
    expect(r.xpGained).toBe(p.totalXp);
    const again = p.record(win());
    expect(again.newHeroes).not.toContain(3);
    const back = new ProfileStore(store);
    expect(back.totalXp).toBe(p.totalXp);
    expect(back.heroOpen(3)).toBe(true);
    expect(back.trophyEarned('first-clear')).toBe(true);
  });

  it('reports no next hero once the whole roster is open, and a full bar at the level cap', () => {
    const store = mem();
    store.setItem(PROFILE_KEY, JSON.stringify({ xp: xpToReach(LEVEL_CAP) }));
    const p = new ProfileStore(store);
    expect(p.nextHero()).toBeNull();
    expect(p.levelBar().frac).toBe(1);
    expect(HEROES.every((h) => p.heroOpen(h.id))).toBe(true);
  });

  it('pays the daily visit once per day, grows the streak, and starts over after a missed day', () => {
    const p = new ProfileStore(mem());
    const d1 = p.claimDaily('2026-11-05');
    expect(d1).toMatchObject({ claimed: true, streak: 1, shards: 1 });
    expect(p.claimDaily('2026-11-05')).toMatchObject({ claimed: false, shards: 0, streak: 1 });
    expect(p.claimDaily('2026-11-06')).toMatchObject({ claimed: true, streak: 2, shards: 2 });
    const d3 = p.claimDaily('2026-11-07');
    expect(d3.streak).toBe(3);
    expect(d3.newTrophies.map((t) => t.id)).toContain('streak-3');
    expect(d3.shards).toBe(3 + TROPHY_SHARDS);
    expect(p.claimDaily('2026-11-10')).toMatchObject({ claimed: true, streak: 1, shards: 1 }); // missed days
    for (let i = 11; i < 30; i++) p.claimDaily(`2026-11-${i}`);
    expect(p.claimDaily('2026-11-30').shards).toBe(DAILY_MAX_SHARDS);
  });

  it('counts days across month ends and leap years', () => {
    expect(dayDiff('2026-02-28', '2026-03-01')).toBe(1);
    expect(dayDiff('2028-02-28', '2028-03-01')).toBe(2);
    expect(dayDiff('2026-12-31', '2027-01-01')).toBe(1);
    expect(dayDiff('2026-11-05', '2026-11-05')).toBe(0);
  });

  it('awards each trophy once, only for what was done', () => {
    const p = new ProfileStore(mem());
    const lost = p.record(win({ won: false, stars: 0 }));
    expect(lost.newTrophies).toEqual([]);
    const flawless = p.record(win({ stars: 3, me: row({ rank: 3, ults: 3, bossDamage: 10 }) }));
    const ids = flawless.newTrophies.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(['first-clear', 'flawless', 'style', 'boss-slayer', 'super-star']),
    );
    expect(flawless.shards).toBe(flawless.newTrophies.length * TROPHY_SHARDS);
    expect(p.record(win({ stars: 3, me: row({ rank: 3, ults: 3, bossDamage: 10 }) })).newTrophies).toEqual(
      [],
    );
    expect(p.trophyEarned('saga-complete')).toBe(false);
    expect(p.record(win({ sagaCleared: 10 })).newTrophies.map((t) => t.id)).toEqual(
      expect.arrayContaining(['saga-half', 'saga-complete']),
    );
  });

  it('has unique trophy ids with a name, a goal and an icon', () => {
    const ids = TROPHIES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TROPHIES) expect(t.name && t.how && t.icon).toBeTruthy();
  });

  it('ignores junk in storage and never throws on a blocked one', () => {
    const junk = new ProfileStore({
      getItem: () =>
        JSON.stringify({ xp: 'lots', streak: -4, lastDay: 'yesterday', trophies: ['nope', 7], totals: 3 }),
      setItem: () => undefined,
    });
    expect(junk.totalXp).toBe(0);
    expect(junk.streak).toBe(0);
    expect(junk.trophyCount).toBe(0);
    const broken = new ProfileStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => broken.record(win())).not.toThrow();
    expect(new ProfileStore(null).claimDaily('2026-11-05').claimed).toBe(true);
  });

  it('is saved to the portal cloud save too', () => {
    expect(SAVE_KEYS).toContain(PROFILE_KEY);
  });
});

describe('villain tease and bonus shards', () => {
  it('names the bosses of every saga stage from the level itself, with a taunt', () => {
    for (const st of SAGA) {
      const t = teaserFor(st.id);
      expect(t, st.id).not.toBeNull();
      expect(t?.villains.length, st.id).toBeGreaterThan(0);
      expect(t?.taunt, st.id).toBe(TAUNTS[st.id]);
      expect(t?.astraName).toBe(st.astraName);
    }
    expect(teaserFor('astra-1')?.villains).toContain('AGNI-DAITYA');
  });

  it('grants bonus shards, ignoring junk amounts', () => {
    const m = new Map<string, string>();
    const p = new ProgressStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });
    const start = p.shards;
    p.grantShards(2);
    p.grantShards(-5);
    p.grantShards(Number.NaN);
    expect(p.shards).toBe(start + 2);
    p.grantShards(5000);
    expect(p.shards).toBe(999);
    expect(p.sagaCleared()).toBe(0);
    p.won('astra-1', 100, 'normal', 1);
    expect(p.sagaCleared()).toBe(1);
  });
});

describe('weekly challenges', () => {
  const mem = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };
  const me = (o: Partial<BoardEntry> = {}): BoardEntry => ({
    id: 'me',
    name: 'Me',
    slot: 0,
    hero: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    ults: 0,
    bossDamage: 0,
    bestCombo: 0,
    rank: -1,
    ...o,
  });
  const run = (o: Partial<WeeklyRun> = {}): WeeklyRun => ({
    won: true,
    stars: 3,
    saga: true,
    online: false,
    squad: 1,
    difficulty: 'normal',
    hero: 0,
    me: me(),
    ...o,
  });
  /** A Monday whose week has goal `id` (weeks are searched from early 2026). */
  const weekWith = (id: string): string => {
    for (let i = 0; i < 400; i++) {
      const d = new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10);
      if (weekGoals(isoWeek(d)).includes(id)) return d;
    }
    throw new Error(`no week with ${id}`);
  };

  it('numbers weeks the ISO way (Monday start, the Thursday decides the year)', () => {
    expect(isoWeek('2026-11-05')).toBe('2026-W45');
    expect(isoWeek('2026-11-09')).toBe('2026-W46');
    expect(isoWeek('2026-12-31')).toBe('2026-W53');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2027-01-04')).toBe('2027-W01');
    expect(isoWeek('2024-12-30')).toBe('2025-W01');
    expect(isoWeek('2021-01-03')).toBe('2020-W53');
    expect(daysToReset('2026-11-05')).toBe(4); // Thursday -> Monday
    expect(daysToReset('2026-11-09')).toBe(7); // Monday: a whole week left
    expect(daysToReset('2026-11-08')).toBe(1); // Sunday
  });

  it('picks three different goals per week, the same for everyone, the first always one a win moves', () => {
    const sets = new Set<string>();
    for (let i = 0; i < 52; i++) {
      const week = isoWeek(new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10));
      const goals = weekGoals(week);
      expect(goals).toHaveLength(3);
      expect(new Set(goals).size).toBe(3);
      expect(['clears', 'stars']).toContain(goals[0]);
      expect(weekGoals(week)).toEqual(goals); // stable
      sets.add(goals.join(','));
    }
    expect(sets.size).toBeGreaterThan(10); // the weeks really vary
  });

  it('moves goals with each run, pays each finished goal once, opens the chest once, and resets next week', () => {
    let day = weekWith('flawless');
    const store = mem();
    const w = new WeeklyStore(store, () => day);
    const goals = w.goals();
    expect(goals.every((g) => g.progress === 0 && !g.done)).toBe(true);
    const lost = w.record(run({ won: false, stars: 0 }));
    expect(lost.shards).toBe(0);
    // Win until every goal of this week that wins and flawless runs can finish is done.
    let shards = 0;
    let xp = 0;
    let chests = 0;
    for (let i = 0; i < 40; i++) {
      const r = w.record(
        run({
          hero: i % 8,
          online: true,
          squad: 2,
          difficulty: 'hard',
          me: me({ kills: 20, ults: 2, bestCombo: 25, rank: 3, bossDamage: 50 }),
        }),
      );
      shards += r.shards;
      xp += r.xp;
      if (r.chest) chests++;
    }
    expect(w.goals().every((g) => g.done)).toBe(true);
    expect(w.chestOpened).toBe(true);
    expect(chests).toBe(1);
    expect(shards).toBe(3 * WEEKLY_SHARDS + CHEST_SHARDS);
    expect(xp).toBe(3 * WEEKLY_XP);
    // Saved, and a reload keeps it.
    expect(store.getItem(WEEKLY_KEY)).toContain(isoWeek(day));
    expect(new WeeklyStore(store, () => day).finishedCount).toBe(3);
    // A new week: fresh goals at zero.
    day = new Date(Date.parse(`${day}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const next = new WeeklyStore(store, () => day);
    expect(next.finishedCount).toBe(0);
    expect(next.chestOpened).toBe(false);
    expect(next.goals().every((g) => g.progress === 0)).toBe(true);
  });

  it('counts different heroes once each, and keeps the best combo instead of adding them up', () => {
    const heroes = new WeeklyStore(mem(), () => weekWith('heroes'));
    heroes.record(run({ hero: 1 }));
    heroes.record(run({ hero: 1 }));
    heroes.record(run({ hero: 2, won: false }));
    expect(heroes.goals().find((g) => g.id === 'heroes')?.progress).toBe(1);
    heroes.record(run({ hero: 2 }));
    expect(heroes.goals().find((g) => g.id === 'heroes')?.progress).toBe(2);

    const combo = new WeeklyStore(mem(), () => weekWith('combo'));
    combo.record(run({ me: me({ bestCombo: 12 }) }));
    combo.record(run({ me: me({ bestCombo: 9 }) }));
    expect(combo.goals().find((g) => g.id === 'combo')?.progress).toBe(12);
  });

  it('only counts online clears with a real squad for the co-op goal', () => {
    const w = new WeeklyStore(mem(), () => weekWith('squad'));
    w.record(run({ online: false, squad: 2 }));
    w.record(run({ online: true, squad: 1 }));
    expect(w.goals().find((g) => g.id === 'squad')?.progress).toBe(0);
    w.record(run({ online: true, squad: 3 }));
    expect(w.goals().find((g) => g.id === 'squad')?.progress).toBe(1);
  });

  it('ignores junk in storage and survives blocked storage', () => {
    const day = '2026-11-05';
    const junk = new WeeklyStore(
      {
        getItem: () =>
          JSON.stringify({
            week: isoWeek(day),
            progress: { clears: -3, nope: 5, stars: 'x' },
            done: ['nope'],
          }),
        setItem: () => undefined,
      },
      () => day,
    );
    expect(junk.goals().every((g) => g.progress === 0 && !g.done)).toBe(true);
    const blocked = new WeeklyStore(
      {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      () => day,
    );
    expect(() => blocked.record(run())).not.toThrow();
    expect(new WeeklyStore(null, () => day).goals()).toHaveLength(3);
  });

  it('is saved to the portal cloud save, and weekly XP adds onto a run', () => {
    expect(SAVE_KEYS).toContain(WEEKLY_KEY);
    const p = new ProfileStore(null);
    const r = p.record(
      { won: true, stars: 1, first: false, me: undefined, sagaCleared: 1, sagaTotal: 10 },
      WEEKLY_XP,
    );
    expect(r.xpGained).toBe(
      runXp({ won: true, stars: 1, first: false, me: undefined, sagaCleared: 1, sagaTotal: 10 }) + WEEKLY_XP,
    );
  });
});

describe('the daily trial record', () => {
  const mem = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it('pays the first win of a day once, keeps the best score, and starts again the next day', () => {
    const st = mem();
    let today = '2026-11-10';
    const d = new DailyStore(st, () => today);
    expect(d.wonToday).toBe(false);
    expect(d.record(today, false, 900)).toEqual({ firstWin: false, best: false, shards: 0 });
    expect(d.bestToday).toBe(0);
    expect(d.record(today, true, 1200)).toEqual({ firstWin: true, best: true, shards: DAILY_SHARDS });
    expect(d.record(today, true, 1000)).toEqual({ firstWin: false, best: false, shards: 0 });
    expect(d.record(today, true, 1500)).toEqual({ firstWin: false, best: true, shards: 0 });
    expect(d.bestToday).toBe(1500);
    expect(d.winStreak).toBe(1);
    // a reload on the same day remembers it
    const again = new DailyStore(st, () => today);
    expect(again.wonToday).toBe(true);
    expect(again.bestToday).toBe(1500);
    today = '2026-11-11';
    expect(again.wonToday).toBe(false);
    expect(again.bestToday).toBe(0);
    expect(again.winStreak).toBe(1); // yesterday's win keeps the run alive through today
    expect(again.record(today, true, 700).firstWin).toBe(true);
    expect(again.winStreak).toBe(2);
    expect(again.totalWins).toBe(2);
    today = '2026-11-13'; // a day missed
    expect(again.winStreak).toBe(0);
    expect(again.record(today, true, 10).firstWin).toBe(true);
    expect(again.winStreak).toBe(1);
  });

  it('a run started yesterday and finished after midnight counts for nothing; bad saves are ignored', () => {
    const st = mem();
    const d = new DailyStore(st, () => '2026-11-11');
    expect(d.record('2026-11-10', true, 999)).toEqual({ firstWin: false, best: false, shards: 0 });
    expect(d.wonToday).toBe(false);
    st.setItem('strikesquad.daily.v1', '{"day":"2026-11-11","best":-5,"won":"yes","wins":"x","streak":null}');
    const bad = new DailyStore(st, () => '2026-11-11');
    expect([bad.bestToday, bad.wonToday, bad.totalWins, bad.winStreak]).toEqual([0, false, 0, 0]);
    st.setItem('strikesquad.daily.v1', 'not json');
    expect(new DailyStore(st, () => '2026-11-11').wonToday).toBe(false);
  });

  it('knows the day before across months and years, and describes a trial in three lines', () => {
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    const d = new DailyStore(null, () => '2026-11-10');
    const text = describeTrial(d.trial);
    expect(text.lines).toHaveLength(3);
    expect(text.place).toMatch(/ — /);
    expect(text.lines[0]).toMatch(/^Astras of the day: \w+ and \w+$/);
  });
});

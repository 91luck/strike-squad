import { describe, expect, it } from 'vitest';
import {
  Builder,
  GAME_CONFIG,
  NEUTRAL_INPUT,
  Sim,
  getMission,
  newMover,
  stepPlayerMovement,
  type LevelDef,
  type Player,
  type PowerKind,
  type World,
} from '../src';

const T = GAME_CONFIG.tile;
const G = 14;
const PW = GAME_CONFIG.powers;

/** A flat test level (60 columns), optionally with fields, a fire wall and an altar, plus a final arena far away. */
function level(setup: (b: Builder) => void = () => undefined, brahma = false): LevelDef {
  const b = new Builder(120, 18);
  b.ground(0, 119, G);
  setup(b);
  b.arena('END', { trigger: 110, left: 100, right: 115, floor: G, gate: -1 }, []);
  return b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T }, brahma });
}

function playing(L: LevelDef): { sim: Sim; p: Player } {
  const sim = new Sim({ seed: 4, level: L });
  const p = sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
  while (sim.phase === 'countdown') sim.step();
  return { sim, p };
}

function give(p: Player, kind: PowerKind, n = 1): void {
  p.power = kind;
  p.powerN = n;
}

function press(sim: Sim, input: Partial<typeof NEUTRAL_INPUT> = {}): void {
  sim.setInput('a', { ...NEUTRAL_INPUT, ...input, astra: true });
  sim.step();
  sim.setInput('a', { ...NEUTRAL_INPUT, ...input });
  sim.step();
}

function soldierAt(sim: Sim, col: number): ReturnType<Sim['enemies']['get']> & object {
  const s = sim as unknown as {
    spawnEnemy(id: number, k: string, x: number, y: number): unknown;
    wake(e: unknown): void;
  };
  const e = s.spawnEnemy(5000 + col, 'soldier', col * T + T / 2, G * T) as NonNullable<
    ReturnType<Sim['enemies']['get']>
  >;
  s.wake(e);
  e.nextFire = 1e9; // keep it from shooting during the test
  return e;
}

describe('power pickups', () => {
  it('a power pickup fills the slot; the same kind stacks up to the cap', () => {
    const L = level((b) => {
      b.pickup('agni', 5, G);
      b.pickup('agni', 7, G);
      b.pickup('agni', 9, G);
    });
    const { sim, p } = playing(L);
    for (let i = 0; i < 90 && p.x < 10 * T; i++) {
      sim.setInput('a', { ...NEUTRAL_INPUT, mx: 1 });
      sim.step();
    }
    expect(p.power).toBe('agni');
    expect(p.powerN).toBe(PW.maxCharges);
    // A full slot leaves the third pickup on the ground.
    expect(sim.taken.filter(Boolean).length).toBe(2);
  });

  it('an altar comes back after a few seconds', () => {
    const L = level((b) => b.pickup('varuna', 5, G, true));
    const { sim, p } = playing(L);
    p.x = 5 * T + T / 2;
    sim.step();
    expect(sim.taken[0]).toBe(true);
    p.x = 20 * T;
    for (let i = 0; i < sim.ticks(GAME_CONFIG.pickups.respawnSec) + 2; i++) sim.step();
    expect(sim.taken[0]).toBe(false);
  });
});

describe('astras', () => {
  it('agni throws a wave of fire and leaves the ground burning; enemies standing in it burn', () => {
    const { sim, p } = playing(level());
    give(p, 'agni', 2);
    const e = soldierAt(sim, 12);
    const hp0 = e.hp;
    press(sim);
    expect(p.powerN).toBe(1);
    expect(sim.burns).toHaveLength(1);
    expect(sim.bullets.some((b) => b.kind === 'flame')).toBe(true);
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.enemies.has(e.id) ? e.hp : 0).toBeLessThan(hp0);
  });

  it('only varuna puts out a wall of fire, and only one within its reach', () => {
    const L = level((b) => {
      b.gate(12, G - 1, true);
      b.gate(60, G - 1, true);
    });
    const { sim, p } = playing(L);
    give(p, 'agni');
    press(sim);
    expect(sim.gateOpen).toEqual([false, false]);
    give(p, 'varuna');
    press(sim);
    expect(sim.gateOpen).toEqual([true, false]);
    expect(p.power).toBeNull();
  });

  it('vayu raises a whirlwind that walks ahead, carries troopers up (riot shields torn off) and sweeps up shots', () => {
    const { sim, p } = playing(level());
    give(p, 'vayu');
    const e = soldierAt(sim, 9);
    e.hp = e.maxHp = 500; // tough enough to ride it out and be measured
    e.shield = 6;
    const y0 = e.body.y;
    press(sim);
    expect(sim.twisters).toHaveLength(1);
    const t = sim.twisters[0]!;
    const tx0 = t.x;
    for (let i = 0; i < sim.ticks(1.6); i++) sim.step();
    expect(t.x).toBeGreaterThan(tx0 + 100); // it walks
    expect(t.held.has(e.id)).toBe(true);
    expect(e.shield).toBe(0);
    expect(y0 - e.body.y).toBeGreaterThan(40); // lifted off the ground
    expect(Math.abs(e.body.x - t.x)).toBeLessThan(PW.vayu.reach); // and carried along with it
    expect(sim.snapshot().enemies.find((x) => x.id === e.id)!.fl & 2).toBe(2);
    expect(sim.snapshot().fx.some((f) => f.k === 3)).toBe(true);
    // an enemy shot flying into the column is swept up
    sim.bullets.push({
      id: 999,
      enemy: true,
      owner: '',
      kind: 'shot',
      x: t.x + 20,
      y: t.y - 40,
      vx: -200,
      vy: 0,
      dmg: 9,
      pierce: false,
      expires: sim.tick + 100,
      born: sim.tick,
      lag: 0,
      weapon: null,
      power: false,
      hit: null,
      grav: 0,
      blast: 0,
      size: 3,
      turn: 0,
      hitsLeft: 0,
      ret: false,
      src: -1,
    });
    sim.step();
    expect(sim.bullets.some((b) => b.id === 999)).toBe(false);
  });

  it('when the whirlwind blows out it hurls what it carried, and they come back down', () => {
    const { sim, p } = playing(level());
    give(p, 'vayu');
    const e = soldierAt(sim, 8);
    e.hp = e.maxHp = 500;
    press(sim);
    const t = sim.twisters[0]!;
    for (let i = 0; i < sim.ticks(PW.vayu.sec) - 3; i++) sim.step();
    expect(sim.twisters).toHaveLength(1);
    const hp0 = e.hp;
    const x0 = e.body.x;
    for (let i = 0; i < 6; i++) sim.step();
    expect(sim.twisters).toHaveLength(0);
    expect(hp0 - e.hp).toBeGreaterThanOrEqual(PW.vayu.flingDamage);
    for (let i = 0; i < sim.ticks(0.5); i++) sim.step();
    expect(Math.abs(e.body.x - x0)).toBeGreaterThan(100); // thrown well clear
    for (let i = 0; i < sim.ticks(3); i++) sim.step();
    expect(e.body.onGround).toBe(true);
    expect(t.held.size).toBeGreaterThan(0);
  });

  it('a whirlwind leaves bosses and turrets standing, and carries no more than its limit', () => {
    const { sim, p } = playing(level());
    give(p, 'vayu');
    const many = Array.from({ length: PW.vayu.carry + 3 }, (_, i) => {
      const e = soldierAt(sim, 7 + (i % 4));
      (e as { id: number }).id = 6000 + i;
      sim.enemies.delete(5000 + 7 + (i % 4));
      sim.enemies.set(e.id, e);
      e.hp = e.maxHp = 500;
      return e;
    });
    press(sim);
    for (let i = 0; i < sim.ticks(1.2); i++) sim.step();
    expect(sim.twisters[0]!.held.size).toBe(PW.vayu.carry);
    expect(many.filter((e) => e.liftUntil > sim.tick)).toHaveLength(PW.vayu.carry);
  });

  it('wind feeds fire: a whirlwind crossing burning ground catches light and sets what it carries alight', () => {
    const { sim, p } = playing(level());
    give(p, 'agni');
    press(sim);
    give(p, 'vayu');
    const e = soldierAt(sim, 14);
    e.hp = e.maxHp = 5000;
    // out of the burning ground's own reach: only the whirl can light it
    e.body.y = G * T;
    press(sim);
    for (let i = 0; i < sim.ticks(1); i++) sim.step();
    expect(sim.twisters[0]!.fire).toBe(true);
    expect(sim.snapshot().fx.some((f) => f.k === 4)).toBe(true);
  });

  it('agni sets troopers alight: they burn on after leaving the fire and pass it to those they touch', () => {
    const { sim, p } = playing(level());
    give(p, 'agni');
    const a = soldierAt(sim, 6);
    a.hp = a.maxHp = 5000;
    press(sim);
    for (let i = 0; i < 12; i++) sim.step();
    expect(a.burnUntil).toBeGreaterThan(sim.tick);
    expect(sim.snapshot().enemies.find((x) => x.id === a.id)!.fl & 1).toBe(1);
    // carry it far from the burning ground, next to a fresh trooper
    a.body.x = 40 * T;
    const b = soldierAt(sim, 40);
    b.hp = b.maxHp = 5000;
    b.body.x = a.body.x + 12;
    a.burnUntil = sim.tick + sim.ticks(1);
    const hp0 = a.hp;
    for (let i = 0; i < sim.ticks(0.5); i++) sim.step();
    expect(a.hp).toBeLessThan(hp0);
    expect(b.burnUntil).toBeGreaterThan(sim.tick);
    // and it goes out by itself
    for (let i = 0; i < sim.ticks(PW.agni.alightSec + 1.5); i++) sim.step();
    expect(sim.snapshot().enemies.find((x) => x.id === b.id)!.fl & 1).toBe(0);
  });

  it('a black hole pulls troopers in, swallows enemy shots and then collapses', () => {
    const { sim, p } = playing(level());
    give(p, 'singularity');
    const e = soldierAt(sim, 16);
    e.hp = e.maxHp = 500; // survive long enough to measure the pull
    press(sim);
    expect(sim.holes).toHaveLength(1);
    const hole = sim.holes[0]!;
    const d0 = Math.abs(e.body.x - hole.x);
    sim.bullets.push({
      id: 998,
      enemy: true,
      owner: '',
      kind: 'shot',
      x: hole.x + 100,
      y: hole.y,
      vx: -220,
      vy: 0,
      dmg: 9,
      pierce: false,
      expires: sim.tick + 200,
      born: sim.tick,
      lag: 0,
      weapon: null,
      power: false,
      hit: null,
      grav: 0,
      blast: 0,
      size: 3,
      turn: 0,
      hitsLeft: 0,
      ret: false,
      src: -1,
    });
    for (let i = 0; i < 20; i++) sim.step();
    expect(Math.abs(e.body.x - hole.x)).toBeLessThan(d0);
    expect(sim.bullets.some((b) => b.id === 998)).toBe(false);
    for (let i = 0; i < sim.ticks(PW.singularity.sec) + 2; i++) sim.step();
    expect(sim.holes).toHaveLength(0);
  });
});

describe('team brahmastra', () => {
  it('does not exist outside its mission', () => {
    const { sim } = playing(level());
    expect(sim.brahma).toBe(-1);
    expect(sim.snapshot().bm).toBe(-1);
  });

  it('charges from the squad’s kills, then strikes everything nearby after a wind-up, shielding the squad', () => {
    const { sim, p } = playing(level(() => undefined, true));
    expect(sim.brahma).toBe(0);
    sim.brahma = PW.brahma.max - 0.5;
    const e = soldierAt(sim, 20);
    const sim2 = sim as unknown as {
      damageEnemy(e: unknown, d: number, by: string, x: number, y: number, src: string): void;
    };
    sim2.damageEnemy(e, 100, 'a', 0, 0, 'gun'); // a kill tops the meter up
    expect(sim.brahma).toBe(PW.brahma.max);
    const far = soldierAt(sim, 30);
    press(sim);
    expect(sim.brahma).toBe(0);
    expect(sim.enemies.has(far.id)).toBe(true); // wind-up first
    expect(p.invulnUntil).toBeGreaterThan(sim.tick);
    for (let i = 0; i < sim.ticks(PW.brahma.windupSec) + 1; i++) sim.step();
    expect(sim.enemies.has(far.id)).toBe(false);
  });
});

describe('fields (shared physics: server and client prediction agree)', () => {
  const world = (L: LevelDef): World => ({ level: L, isGateOpen: () => false, limitX: L.cols * T });
  const peak = (L: LevelDef, x: number): number => {
    const w = world(L);
    const b = newMover(x, G * T, 26, 46);
    b.onGround = true;
    let top = b.y;
    for (let i = 0; i < 120; i++) {
      stepPlayerMovement(w, b, { ...NEUTRAL_INPUT, jump: i < 40 }, 1 / 30);
      top = Math.min(top, b.y);
    }
    return G * T - top;
  };

  it('low gravity: a jump goes much higher', () => {
    const L = level((b) => b.field('lowg', 20, 40, 0, 17, 0.45));
    expect(peak(L, 30 * T)).toBeGreaterThan(peak(L, 5 * T) * 1.8);
  });

  it('an anti-gravity lift carries you up to its top and holds you there', () => {
    const L = level((b) => b.field('lift', 20, 22, 4, 17, 0.55));
    const w = world(L);
    const b = newMover(21 * T + T / 2, G * T, 26, 46);
    b.onGround = true;
    for (let i = 0; i < 150; i++) stepPlayerMovement(w, b, { ...NEUTRAL_INPUT }, 1 / 30);
    expect(b.y).toBeLessThan(7 * T); // hovering near the top of the beam (rows 4-6), from the floor at row 14
    expect(b.y).toBeGreaterThan(2 * T);
  });

  it('a gravity well drags you toward its centre, but you can run out of it', () => {
    const L = level((b) => b.field('well', 20, 29, 6, 17, 90));
    const w = world(L);
    const still = newMover(21 * T, G * T, 26, 46);
    still.onGround = true;
    for (let i = 0; i < 30; i++) stepPlayerMovement(w, still, { ...NEUTRAL_INPUT }, 1 / 30);
    expect(still.x).toBeGreaterThan(21 * T + 20);
    const runner = newMover(23 * T, G * T, 26, 46);
    runner.onGround = true;
    for (let i = 0; i < 60; i++) stepPlayerMovement(w, runner, { ...NEUTRAL_INPUT, mx: -1 }, 1 / 30);
    expect(runner.x).toBeLessThan(20 * T);
  });

  it('a magnetic storm bends shots', () => {
    const L = level((b) => b.field('magnet', 10, 40, 0, 17, 1.2));
    const { sim, p } = playing(L);
    p.x = 12 * T;
    sim.setInput('a', { ...NEUTRAL_INPUT, fire: true });
    sim.step();
    const shot = sim.bullets.find((b) => !b.enemy)!;
    for (let i = 0; i < 6; i++) sim.step();
    expect(Math.abs(shot.vy)).toBeGreaterThan(50);
  });
});

describe('advanced missions', () => {
  it('mission 5 is the demon army with astras, walls of fire and a brahmastra; mission 6 is deep space', () => {
    const m5 = getMission('mission-5');
    expect(m5.faction).toBe('demon');
    expect(m5.brahma).toBe(true);
    expect(m5.gates.filter((g) => g.fire).length).toBeGreaterThanOrEqual(3);
    for (const k of ['agni', 'varuna', 'vayu'] as const)
      expect(m5.pickups.some((p) => p.kind === k)).toBe(true);
    const m6 = getMission('mission-6');
    expect(m6.faction).toBe('void');
    for (const k of ['lowg', 'lift', 'well', 'magnet'] as const)
      expect(m6.fields.some((f) => f.kind === k)).toBe(true);
    expect(m6.pickups.some((p) => p.kind === 'singularity')).toBe(true);
  });
});

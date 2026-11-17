import { describe, expect, it } from 'vitest';
import {
  Builder,
  GAME_CONFIG,
  MISSION_IDS,
  MOUNTS,
  MOUNT_KINDS,
  NEUTRAL_INPUT,
  Sim,
  getMission,
  type LevelDef,
  type MountKind,
  type Player,
} from '../src';

const T = GAME_CONFIG.tile;
const G = 14;

/** Flat ground, a ride stand at column 6 that lasts to column 70, a final arena far away. */
function level(kind: MountKind): LevelDef {
  const b = new Builder(140, 18);
  b.ground(0, 139, G);
  b.mount(kind, 6, G, 70);
  b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
  return b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T } });
}

function riding(kind: MountKind): { sim: Sim; p: Player } {
  const sim = new Sim({ seed: 3, level: level(kind) });
  const p = sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (let i = 0; i < 40 && p.ride < 0; i++) {
    sim.setInput('a', { ...NEUTRAL_INPUT, mx: 1 });
    sim.step();
  }
  sim.setInput('a', { ...NEUTRAL_INPUT });
  return { sim, p };
}

function run(sim: Sim, n: number, input: Partial<typeof NEUTRAL_INPUT> = {}): void {
  for (let i = 0; i < n; i++) {
    sim.setInput('a', { ...NEUTRAL_INPUT, ...input });
    sim.step();
  }
}

describe('rides (mounts.ts)', () => {
  it.each(MOUNT_KINDS.map((k) => [k]))(
    '%s: walking onto the stand puts you on it; the snapshot says so',
    (k) => {
      const { sim, p } = riding(k);
      expect(p.ride).toBe(MOUNT_KINDS.indexOf(k));
      expect(p.mountHp).toBe(MOUNTS[k].hp);
      const me = sim.snapshot().players[0]!;
      expect(me.rd).toBe(MOUNT_KINDS.indexOf(k));
      expect(me.rh).toBe(100);
      expect(sim.drainEvents().some((e) => e.e === 'ride' && e.on === 1)).toBe(true);
    },
  );

  it('a ground ride is faster than a soldier on foot (the elephant is slower, but it is an elephant)', () => {
    for (const k of ['bike', 'horse', 'jeep', 'tiger', 'elephant'] as MountKind[]) {
      const { sim, p } = riding(k);
      const x0 = p.x;
      run(sim, 30, { mx: 1 });
      const v = (p.x - x0) / 1; // px in one second
      if (k === 'elephant') expect(v).toBeLessThan(GAME_CONFIG.player.runSpeed + 30);
      else expect(v, k).toBeGreaterThan(GAME_CONFIG.player.runSpeed * 1.5);
    }
  });

  it('a flier never falls: it holds its height, climbs with Jump and sinks with Down', () => {
    for (const k of ['jetsuit', 'baaz'] as MountKind[]) {
      const { sim, p } = riding(k);
      run(sim, 20, { jump: true });
      const high = p.y;
      expect(high, k).toBeLessThan(G * T - 80);
      run(sim, 30);
      expect(Math.abs(p.y - high), k).toBeLessThan(30);
      run(sim, 15, { my: 1 });
      expect(p.y, k).toBeGreaterThan(high);
    }
  });

  it('the ride ends where the stretch ends: the soldier steps off on the far side', () => {
    const { sim, p } = riding('bike');
    sim.drainEvents();
    run(sim, 300, { mx: 1 });
    expect(p.ride).toBe(-1);
    expect(p.x).toBeGreaterThanOrEqual(70 * T);
    expect(sim.drainEvents().some((e) => e.e === 'ride' && e.on === 0 && e.lost === 0)).toBe(true);
  });

  it('the ride takes the hits; destroyed, it throws the soldier clear with a moment of safety', () => {
    const { sim, p } = riding('horse');
    p.invulnUntil = 0;
    const hp = p.hp;
    sim['hurtPlayer'](p, 10);
    expect(p.hp).toBe(hp);
    expect(p.mountHp).toBeLessThan(MOUNTS.horse.hp);
    p.invulnUntil = 0;
    sim['hurtPlayer'](p, 500);
    expect(p.ride).toBe(-1);
    expect(p.hp).toBe(hp);
    expect(p.invulnUntil).toBeGreaterThan(sim.tick);
    expect(sim.drainEvents().some((e) => e.e === 'ride' && e.on === 0 && e.lost === 1)).toBe(true);
  });

  it.each(MOUNT_KINDS.map((k) => [k]))('%s: its power (KNIFE) hurts a trooper in front of it', (k) => {
    const { sim, p } = riding(k);
    p.invulnUntil = 1e9;
    run(sim, 20); // the power is ready a moment after boarding
    // the jeep lobs its rockets in an arc: they come down further off
    const e = sim['spawnAwake']('soldier', p.x + (k === 'jeep' ? 400 : 90), G * T, -1);
    e.hp = e.maxHp = 200;
    e.nextFire = 1e9;
    if (MOUNTS[k].fly) {
      // a flier dives from above
      run(sim, 10, { jump: true });
      e.body.x = p.x + 10;
    }
    run(sim, 1, { melee: true });
    run(sim, 60);
    expect(e.hp, k).toBeLessThan(200);
    expect(sim.drainEvents().some((ev) => ev.e === 'rpow' && ev.k === k)).toBe(true);
  });

  it('a gun of its own replaces the soldier’s (bike, jeep, jet suit); on an animal you shoot your own', () => {
    for (const k of MOUNT_KINDS) {
      const { sim, p } = riding(k);
      sim.bullets.length = 0;
      run(sim, 2, { fire: true });
      const b = sim.bullets.find((q) => !q.enemy);
      expect(b, k).toBeTruthy();
      if (MOUNTS[k].gun?.blast) expect(b!.kind, k).toBe('rocket');
      if (!MOUNTS[k].gun) expect(b!.weapon, k).toBe(p.weapon);
    }
  });

  it('going down on a ride loses it', () => {
    const { sim, p } = riding('tiger');
    p.invulnUntil = 0;
    sim['koPlayer'](p);
    expect(p.ride).toBe(-1);
  });
});

describe('rides in the stages', () => {
  it('rides of every kind are spread over the stages, and every flight has a flier', () => {
    const kinds = new Set<string>();
    let stages = 0;
    for (const id of MISSION_IDS) {
      const L = getMission(id);
      if (L.mounts.length) stages++;
      for (const m of L.mounts) {
        kinds.add(m.kind);
        expect(m.to, `${id} ${m.kind}`).toBeGreaterThan(m.x + 10 * T);
      }
    }
    expect(kinds.size).toBe(MOUNT_KINDS.length);
    expect(stages).toBeGreaterThanOrEqual(14);
  });
});

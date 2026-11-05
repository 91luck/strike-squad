import { describe, expect, it } from 'vitest';
import {
  Autopilot,
  Builder,
  GAME_CONFIG,
  MISSIONS,
  NEUTRAL_INPUT,
  SAGA,
  SAGA_COURSES,
  SAGA_IDS,
  Sim,
  getMission,
  isBoss,
  missionInfo,
  tileAt,
  Tile,
  type BossRule,
  type Enemy,
  type LevelDef,
  type Player,
  type PowerKind,
  type SagaId,
} from '../src';

const T = GAME_CONFIG.tile;
const G = 14;
const PW = GAME_CONFIG.powers;
const BA = GAME_CONFIG.bossAstra;

// ---------------------------------------------------------------- helpers

/** A flat test level: open ground, an optional boss arena with rules from column 40, a final arena far away. */
function level(o: { rules?: BossRule[]; boss?: 'walker' | 'gunship'; brahma?: boolean } = {}): LevelDef {
  const b = new Builder(140, 18);
  b.ground(0, 139, G);
  if (o.rules) {
    const g = b.gate(78, G - 1);
    const id = b.arena(
      'TEST BOSS',
      { trigger: 44, left: 40, right: 77, floor: G, gate: g },
      [],
      o.boss ?? 'walker',
      o.rules,
    );
    if ((o.boss ?? 'walker') === 'gunship') b.boss('gunship', 68, GAME_CONFIG.enemies.gunship.hoverY, id);
    else b.boss('walker', 70, G * T, id);
  }
  b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
  return b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T }, brahma: o.brahma });
}

function playing(L: LevelDef, seed = 4): { sim: Sim; p: Player } {
  const sim = new Sim({ seed, level: L });
  const p = sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
  while (sim.phase === 'countdown') sim.step();
  return { sim, p };
}

function give(p: Player, kind: PowerKind, n = 1): void {
  p.power = kind;
  p.powerN = n;
}

/** Press ASTRA for one tick, then release. */
function astra(sim: Sim, id = 'a'): void {
  sim.setInput(id, { ...NEUTRAL_INPUT, astra: true });
  sim.step();
  sim.setInput(id, { ...NEUTRAL_INPUT });
  sim.step();
}

function run(sim: Sim, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    each?.();
    sim.step();
  }
}

type Internals = {
  spawnEnemy(id: number, k: string, x: number, y: number): Enemy;
  wake(e: Enemy): void;
  pashupata(p: Player, form: number): void;
};
const inner = (sim: Sim): Internals => sim as unknown as Internals;

/** An awake trooper standing at a column (it does not shoot unless asked). */
function foeAt(sim: Sim, col: number, kind = 'soldier', y = G * T, hp = 50): Enemy {
  const e = inner(sim).spawnEnemy(5000 + col * 10 + sim.enemies.size, kind, col * T + T / 2, y);
  inner(sim).wake(e);
  e.hp = e.maxHp = hp;
  e.nextFire = 1e9;
  return e;
}

/** Walk the soldier into the test boss arena and wake its boss. */
function enterArena(sim: Sim, p: Player): Enemy {
  p.x = 46 * T;
  p.y = G * T;
  sim.step();
  const boss = [...sim.enemies.values()].find((e) => isBoss(e.kind) && e.awake);
  expect(boss).toBeDefined();
  return boss as Enemy;
}

// ---------------------------------------------------------------- registry

describe('astra saga registry', () => {
  it('lists the ten stages in order with rising toughness, one astra each', () => {
    expect(SAGA.map((s) => s.id)).toEqual([...SAGA_IDS]);
    for (let i = 1; i < SAGA.length; i++) expect(SAGA[i]!.stars).toBeGreaterThanOrEqual(SAGA[i - 1]!.stars);
    expect(new Set(SAGA.map((s) => s.astra)).size).toBe(SAGA.length);
  });

  it('gives saga stages menu info, and keeps them out of the campaign list', () => {
    expect(missionInfo('astra-7').name).toBe('Samarpan Maidan');
    expect(missionInfo('astra-7').advanced).toBe(true);
    expect(MISSIONS.some((m) => m.id.startsWith('astra-'))).toBe(false);
  });

  it.each(
    SAGA.filter((s) => !['brahma', 'narayana', 'brahmashirsha'].includes(s.astra)).map((s) => [
      s.id,
      s.astra,
    ]),
  )('%s hands out its astra (%s) within the first two screens', (id, astraKind) => {
    const L = getMission(id as SagaId);
    const first = L.pickups.find((p) => p.kind === astraKind);
    expect(first, `${id} has no ${astraKind}`).toBeDefined();
    expect(first!.x).toBeLessThan(45 * T);
  });

  it('puts each boss astra where its stage says, with a way to answer it', () => {
    const rulesOf = (id: SagaId): BossRule[] => getMission(id).arenas.flatMap((a) => a.rules);
    expect(rulesOf('astra-4')).toContain('naga');
    expect(rulesOf('astra-7')).toContain('narayana');
    expect(rulesOf('astra-9')).toContain('vaishnava');
    expect(rulesOf('astra-10')).toContain('brahmashirsha');
    // Every vaishnava boss has a vaishnava altar inside its arena.
    for (const id of SAGA_IDS) {
      const L = getMission(id);
      for (const a of L.arenas.filter((x) => x.rules.includes('vaishnava'))) {
        const altar = L.pickups.find(
          (p) => p.kind === 'vaishnava' && p.respawn && p.x > a.left && p.x < a.right,
        );
        expect(altar, `${id} ${a.name}`).toBeDefined();
      }
      // A brahmashirsha needs the squad brahmastra to answer it.
      if (L.arenas.some((a) => a.rules.includes('brahmashirsha'))) expect(L.brahma).toBe(true);
    }
  });

  it('gives every stage its own look: art style and enemy colours', () => {
    const arts = SAGA_IDS.map((id) => getMission(id).art[0]!.style);
    expect(new Set(arts).size).toBe(SAGA_IDS.length);
    const tints = SAGA_IDS.map((id) => getMission(id).tint);
    expect(new Set(tints).size).toBe(SAGA_IDS.length);
  });
});

// ---------------------------------------------------------------- every stage has a shape of its own

describe('stage layouts', () => {
  const NEW_LANDS = ['ascent', 'chasm', 'tunnel', 'trench', 'rampart', 'pillars'];
  const courses = SAGA_IDS.map((id) => SAGA_COURSES[id]);
  const walks = (c: (typeof courses)[number]) => c.sections.filter((s) => !s.arena);
  const arenas = (c: (typeof courses)[number]) => c.sections.flatMap((s) => (s.arena ? [s.arena] : []));

  it('no two stages run the same order of terrain', () => {
    const orders = courses.map((c) =>
      walks(c)
        .map((s) => s.land ?? 'flat')
        .join(' > '),
    );
    expect(new Set(orders).size).toBe(courses.length);
  });

  it('every stage leans on at least two of the new terrain shapes', () => {
    for (const c of courses) {
      const used = new Set(
        walks(c)
          .map((s) => s.land)
          .filter((l) => NEW_LANDS.includes(l as string)),
      );
      expect(used.size, c.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('no enemy list or arena wave set is copied from one place to another', () => {
    const foes = courses.flatMap((c) => walks(c).map((s) => s.foes ?? '')).filter(Boolean);
    expect(new Set(foes).size).toBe(foes.length);
    const waves = courses.flatMap((c) => arenas(c).map((a) => (a.waves ?? []).join(' / ')));
    expect(new Set(waves).size).toBe(waves.length);
  });

  it('every stage mixes arena shapes', () => {
    for (const c of courses)
      expect(new Set(arenas(c).map((a) => a.room ?? 'classic')).size, c.id).toBeGreaterThan(1);
  });

  it('every stage hides a stash: loot on a perch well above the path', () => {
    for (const id of SAGA_IDS) {
      const c = SAGA_COURSES[id];
      const L = getMission(id);
      let x = 0;
      let found = 0;
      for (const s of c.sections) {
        if (s.stash !== undefined) {
          const col = x + s.stash;
          const loot = L.pickups.find((p) => Math.floor(p.x / T) === col);
          expect(loot, `${id} stash at ${col} has no loot`).toBeDefined();
          // The ground under the perch, found from below (a cave roof doesn't count).
          let ground = L.rows - 1;
          while (ground > 0 && tileAt(L, col, ground - 1) !== Tile.Empty) ground--;
          while (
            ground > 0 &&
            tileAt(L, col, ground - 1) === Tile.Empty &&
            tileAt(L, col, ground) !== Tile.Solid
          )
            ground++;
          const row = Math.round((loot!.y + 22) / T);
          expect(row, `${id} stash perch`).toBeLessThanOrEqual(ground - 4);
          found++;
        }
        x += s.len;
      }
      expect(found, id).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------- the hero's astras

describe('hero astras', () => {
  it('nagastra serpents never miss: they turn round to hit a foe behind the caster', () => {
    const { sim, p } = playing(level());
    give(p, 'naga');
    p.x = 30 * T;
    p.facing = 1;
    const e = foeAt(sim, 24); // six tiles behind
    const hp0 = e.hp;
    astra(sim);
    expect(sim.bullets.filter((b) => b.kind === 'serpent' && !b.enemy)).toHaveLength(PW.naga.serpents);
    run(sim, sim.ticks(PW.naga.lifeSec));
    expect(hp0 - e.hp).toBeGreaterThanOrEqual(PW.naga.damage * 2);
  });

  it('garudastra wipes enemy serpents and shots, but not a vaishnava orb or narayana arrows', () => {
    const { sim, p } = playing(level());
    give(p, 'garuda');
    const mk = (kind: 'serpent' | 'shot' | 'orb' | 'arrow', dx: number) => {
      const b = (
        sim as unknown as { shoot(x: number, y: number, a: number, d: number, o: object): { kind: string } }
      ).shoot(p.x + dx, p.y - 200, Math.PI / 2, 5, { kind, life: 9 });
      return b;
    };
    mk('serpent', 300);
    mk('shot', -300);
    mk('orb', 400);
    mk('arrow', 200);
    const drone = foeAt(sim, 12, 'drone', 8 * T, 60);
    const hp0 = drone.hp;
    astra(sim);
    const kinds = sim.bullets
      .filter((b) => b.enemy)
      .map((b) => b.kind)
      .sort();
    expect(kinds).toEqual(['arrow', 'orb']);
    expect(hp0 - drone.hp).toBeGreaterThanOrEqual(PW.garuda.flyerDamage - 1);
    expect(p.invulnUntil).toBeGreaterThan(sim.tick);
  });

  it('sudarshana hits each foe once, up to six, then comes back to the hand that threw it', () => {
    const { sim, p } = playing(level());
    give(p, 'sudarshana');
    const foes = [6, 8, 10, 12, 14, 16, 18, 20].map((c) => foeAt(sim, c));
    astra(sim);
    const chakra = sim.bullets.find((b) => b.kind === 'chakra')!;
    expect(chakra).toBeDefined();
    let returned = false;
    run(sim, sim.ticks(PW.sudarshana.maxSec), () => {
      if (!sim.bullets.includes(chakra)) returned = true;
    });
    const hit = foes.filter((e) => e.hp < e.maxHp);
    expect(hit.length).toBe(PW.sudarshana.hits); // six different foes, never one twice
    for (const e of hit) expect(e.maxHp - e.hp).toBeCloseTo(PW.sudarshana.damage, 5);
    expect(returned).toBe(true);
  });

  it('pashupata takes one of three forms, chosen by the seeded dice', () => {
    const forms = new Set<number>();
    for (let seed = 1; seed < 40 && forms.size < 3; seed++) {
      const { sim, p } = playing(level(), seed);
      give(p, 'pashupata');
      sim.setInput('a', { ...NEUTRAL_INPUT, astra: true });
      sim.step();
      const ev = sim.drainEvents().find((e) => e.e === 'astra');
      forms.add((ev as { v: number }).v);
    }
    expect([...forms].sort()).toEqual([0, 1, 2]);
  });

  it('pashupata: the trident strikes the nearest four, the spirit fights on, the fire rain falls', () => {
    const { sim, p } = playing(level());
    const foes = [6, 9, 12, 15, 18].map((c) => foeAt(sim, c));
    inner(sim).pashupata(p, 0);
    expect(foes.filter((e) => e.hp < e.maxHp)).toHaveLength(PW.pashupata.strike.targets);
    expect(foes[4]!.hp).toBe(foes[4]!.maxHp); // the farthest is spared

    inner(sim).pashupata(p, 1);
    expect(sim.spirits).toHaveLength(1);
    const before = foes[4]!.hp;
    run(sim, sim.ticks(2));
    expect(sim.snapshot().fx.some((f) => f.k === 2)).toBe(true);
    expect(foes.some((e) => e.hp < e.maxHp - 32 + 0.01) || foes[4]!.hp < before).toBe(true);
    run(sim, sim.ticks(PW.pashupata.spirit.sec));
    expect(sim.spirits).toHaveLength(0); // it leaves after its time

    inner(sim).pashupata(p, 2);
    expect(sim.bullets.filter((b) => b.kind === 'meteor')).toHaveLength(PW.pashupata.rain.bolts);
  });

  it('vaishnavastra fires a golden bolt; near a boss orb it turns the orb back on the boss', () => {
    const { sim, p } = playing(level({ rules: ['vaishnava'] }));
    const boss = enterArena(sim, p);
    boss.nextAtk = 1e9; // only its astra
    boss.rule!.nextOrb = sim.tick;
    run(sim, sim.ticks(BA.vaishnava.windupSec) + 2);
    const orb = sim.bullets.find((b) => b.kind === 'orb' && b.enemy)!;
    expect(orb).toBeDefined();
    // Nothing else stops it: a gust, a parry or a nova leave it alone.
    give(p, 'vayu');
    p.facing = 1;
    astra(sim);
    expect(sim.bullets.includes(orb)).toBe(true);
    // Let it come close, then answer with a vaishnava.
    let guard = 0;
    while (Math.hypot(orb.x - p.x, orb.y - p.y) > PW.vaishnava.reflectRange * 0.7 && guard++ < 300)
      sim.step();
    p.invulnUntil = sim.tick + 1000;
    give(p, 'vaishnava');
    const hp0 = boss.hp;
    astra(sim);
    expect(orb.enemy).toBe(false);
    run(sim, sim.ticks(4));
    expect(hp0 - boss.hp).toBeGreaterThanOrEqual(boss.maxHp * PW.vaishnava.reflectShare * 0.99);
  });
});

// ---------------------------------------------------------------- the bosses' astras

describe('boss astras', () => {
  it('a naga boss calls hunting serpents after a clear wind-up; they can be shot down', () => {
    const { sim, p } = playing(level({ rules: ['naga'] }));
    const boss = enterArena(sim, p);
    boss.nextAtk = 1e9;
    boss.rule!.nextNaga = sim.tick;
    sim.step();
    expect(boss.rule!.kind).toBe('naga');
    expect(sim.bullets.some((b) => b.kind === 'serpent')).toBe(false); // the wind-up first
    run(sim, sim.ticks(BA.naga.windupSec) + 1);
    const serpents = sim.bullets.filter((b) => b.kind === 'serpent' && b.enemy);
    expect(serpents).toHaveLength(BA.naga.serpents);
    // A shot knocks a serpent out of the air: put one straight in the line of fire.
    p.invulnUntil = sim.tick + 10_000;
    p.facing = 1;
    const s = serpents[0]!;
    Object.assign(s, { x: p.x + 90, y: p.y - 22, vx: -60, vy: 0, turn: 0 });
    run(sim, sim.ticks(0.6), () => sim.setInput('a', { ...NEUTRAL_INPUT, fire: true }));
    expect(sim.bullets.includes(s)).toBe(false);
  });

  it('narayanastra spares a soldier who does not fight it, and the boss cannot be hurt during the storm', () => {
    const { sim, p } = playing(level({ rules: ['narayana'] }));
    const boss = enterArena(sim, p);
    boss.nextAtk = 1e9;
    boss.rule!.nextNar = sim.tick;
    sim.step();
    expect(boss.rule!.kind).toBe('narayana');
    run(sim, sim.ticks(BA.narayana.windupSec) + 1);
    expect(boss.rule!.storm).toBe(true);
    const hp0 = boss.hp;
    (sim as unknown as { damageEnemy(...a: unknown[]): void }).damageEnemy(boss, 50, 'a', 0, 0, 'gun');
    expect(boss.hp).toBe(hp0); // untouchable
    const hpBefore = p.hp;
    run(sim, sim.ticks(BA.narayana.stormSec) + 2, () => sim.setInput('a', { ...NEUTRAL_INPUT }));
    expect(sim.bullets.filter((b) => b.kind === 'arrow')).toHaveLength(0);
    expect(p.hp).toBe(hpBefore);
    expect(boss.rule!.storm).toBe(false);
    expect(boss.rule!.narPerfect).toBe(true);
    // Spent: stunned, and hits land harder.
    expect(sim.snapshot().enemies.find((e) => e.id === boss.id)!.sn).toBe(1);
    const h1 = boss.hp;
    (sim as unknown as { damageEnemy(...a: unknown[]): void }).damageEnemy(boss, 10, 'a', 0, 0, 'gun');
    expect(h1 - boss.hp).toBeCloseTo(10 * BA.narayana.spentDamage, 5);
  });

  it('narayanastra grows with resistance: the more you fight, the more arrows fall on you', () => {
    const { sim, p } = playing(level({ rules: ['narayana'] }));
    const boss = enterArena(sim, p);
    boss.nextAtk = 1e9;
    boss.rule!.nextNar = sim.tick;
    run(sim, sim.ticks(BA.narayana.windupSec) + 2);
    expect(boss.rule!.storm).toBe(true);
    p.invulnUntil = sim.tick + 10_000; // measure the arrows, not the damage
    const counts: number[] = [];
    run(sim, sim.ticks(BA.narayana.stormSec) - 4, () => {
      sim.setInput('a', { ...NEUTRAL_INPUT, fire: true });
      counts.push(sim.arrowsFor(p));
    });
    expect(counts[counts.length - 1]).toBeGreaterThan(counts.find((c) => c > 0)!);
    expect(Math.max(...counts)).toBe(BA.narayana.maxArrows);
    expect(sim.bullets.some((b) => b.kind === 'arrow')).toBe(true);
  });

  it('a second narayanastra after a storm nobody fought rebounds on the boss; after a fought one it does not', () => {
    const second = (fight: boolean): { rebound: boolean; lost: number } => {
      const { sim, p } = playing(level({ rules: ['narayana'] }));
      const boss = enterArena(sim, p);
      boss.nextAtk = 1e9;
      boss.rule!.nextNar = sim.tick;
      p.invulnUntil = sim.tick + 100_000;
      run(sim, sim.ticks(BA.narayana.windupSec + BA.narayana.stormSec + BA.narayana.spentSec) + 4, () =>
        sim.setInput('a', { ...NEUTRAL_INPUT, fire: fight && boss.rule!.storm }),
      );
      // Bring it below half health for the second call.
      boss.hp = boss.maxHp * (BA.narayana.secondBelow - 0.05);
      const hp0 = boss.hp;
      sim.drainEvents();
      run(sim, sim.ticks(BA.narayana.windupSec) + 3, () => sim.setInput('a', { ...NEUTRAL_INPUT }));
      const rebound = sim.drainEvents().some((e) => e.e === 'bossAstra' && e.phase === 3);
      return { rebound, lost: hp0 - boss.hp };
    };
    const calm = second(false);
    expect(calm.rebound).toBe(true);
    expect(calm.lost).toBeGreaterThan(0);
    const fought = second(true);
    expect(fought.rebound).toBe(false);
  });

  it('brahmashirsha lands on whoever is not dodging, and scorches its caller', () => {
    const { sim, p } = playing(level({ rules: ['brahmashirsha'], brahma: true }));
    const boss = enterArena(sim, p);
    boss.nextAtk = 1e9;
    boss.hp = boss.maxHp * 0.5;
    sim.step();
    expect(boss.rule!.kind).toBe('brahmashirsha');
    const hp0 = boss.hp;
    p.invulnUntil = 0;
    run(sim, sim.ticks(BA.brahmashirsha.windupSec) + 1, () => sim.setInput('a', { ...NEUTRAL_INPUT }));
    expect(boss.rule!.kind).toBe(null);
    expect(p.hp).toBeLessThan(GAME_CONFIG.player.maxHp);
    expect(hp0 - boss.hp).toBeCloseTo(boss.maxHp * BA.brahmashirsha.backfireShare, 3);
  });

  it('the squad brahmastra answers a brahmashirsha: cancelled, boss stunned, and ASTRA calls it even with an astra held', () => {
    const { sim, p } = playing(level({ rules: ['brahmashirsha'], brahma: true }));
    const boss = enterArena(sim, p);
    boss.nextAtk = 1e9;
    boss.hp = boss.maxHp * 0.5;
    sim.step();
    expect(boss.rule!.kind).toBe('brahmashirsha');
    sim.brahma = PW.brahma.max;
    give(p, 'agni', 2);
    const hp0 = boss.hp;
    astra(sim);
    expect(p.powerN).toBe(2); // the held agni was not used
    expect(boss.rule!.kind).toBe(null);
    expect(sim.snapshot().enemies.find((e) => e.id === boss.id)!.sn).toBe(1);
    expect(hp0 - boss.hp).toBeGreaterThanOrEqual(boss.maxHp * BA.brahmashirsha.counterShare * 0.99);
  });
});

describe('continue after defeat (solo)', () => {
  it('revive undoes a defeat by lives and brings everyone back; anything else is refused', () => {
    const { sim, p } = playing(level());
    expect(sim.revive(3)).toBe(false); // nothing to continue
    sim.lives = 0;
    p.hp = 1;
    (sim as unknown as { koPlayer(p: Player): void }).koPlayer(p);
    run(sim, 3);
    expect(sim.decided).toBe('failed');
    expect(sim.revive(3)).toBe(true);
    expect(sim.phase).toBe('playing');
    expect(sim.decided).toBe(null);
    run(sim, 3);
    expect(p.state).toBe('alive');
    expect(sim.lives).toBe(3);
  });
});

// ---------------------------------------------------------------- every stage can be finished

describe('every saga stage can be finished', () => {
  // Bots of every squad size, over several seeds: a stage may beat a squad (lives run out) but must never trap one
  // (a run that hits the time cap means the level has a spot the squad cannot get past).
  it.each(SAGA_IDS.map((id) => [id]))(
    '%s: never traps a squad, and good bots win most runs alone or as four',
    (mission) => {
      let wins = 0;
      let runs = 0;
      for (const n of [1, 4])
        for (let seed = 1; seed <= 4; seed++) {
          const sim = new Sim({
            seed: seed * 104729,
            settings: { difficulty: 'normal', mission: mission as SagaId },
          });
          const bots = new Autopilot(1);
          for (let i = 0; i < n; i++)
            sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: (i + seed) % 8 });
          const cap = sim.ticks(15 * 60);
          while (sim.phase !== 'ended' && sim.tick < cap) {
            for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
            sim.step();
            sim.drainEvents();
          }
          expect(sim.result, `${mission} squad of ${n}, seed ${seed}: stuck`).not.toBeNull();
          runs++;
          if (sim.result === 'won') wins++;
        }
      expect(wins / runs).toBeGreaterThanOrEqual(0.75);
    },
    120_000,
  );

  it.each(SAGA_IDS.map((id) => [id]))(
    '%s: a 4-soldier computer squad wins on normal',
    (mission) => {
      const sim = new Sim({ seed: 31681, settings: { difficulty: 'normal', mission: mission as SagaId } });
      const bots = new Autopilot(1);
      for (let i = 0; i < 4; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i });
      const cap = sim.ticks(15 * 60);
      while (sim.phase !== 'ended' && sim.tick < cap) {
        for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
        sim.step();
        sim.drainEvents();
      }
      expect(sim.result).toBe('won');
    },
    120_000,
  );
});

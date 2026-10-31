import { describe, expect, it } from 'vitest';
import {
  ATTACK,
  ATTACK_WINDUP,
  BEAM_SEC,
  GAME_CONFIG,
  isBoss,
  rankOf,
  type Bullet,
  type Enemy,
  MISSION_1,
  NEUTRAL_INPUT,
  Sim,
  Tile,
  newMover,
  sanitizeInput,
  stepPlayerMovement,
  tileAt,
  toAscii,
  type LevelDef,
  type Player,
  type PlayerInput,
  type World,
} from '../src';

const T = GAME_CONFIG.tile;
const G = 14 * T; // ground surface y in mission 1
const P = GAME_CONFIG.player;

/** A sim with `n` players, past the countdown, with all regular enemies removed (tests add what they need). */
function mk(n = 1, opts: { keepEnemies?: boolean; seed?: number } = {}): { sim: Sim; ps: Player[] } {
  const sim = new Sim({ seed: opts.seed ?? 7 });
  const ps: Player[] = [];
  for (let i = 0; i < n; i++) ps.push(sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i }));
  if (!opts.keepEnemies)
    for (const e of [...sim.enemies.values()]) if (!isBoss(e.kind)) sim.enemies.delete(e.id);
  while (sim.phase === 'countdown') sim.step();
  return { sim, ps };
}

function place(p: Player, col: number, y = G): void {
  p.x = col * T + T / 2;
  p.y = y;
  p.vx = p.vy = 0;
  p.onGround = true;
  p.lastSafeX = p.x;
  p.lastSafeY = p.y;
}

function run(sim: Sim, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    each?.();
    sim.step();
  }
}

const input = (i: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, ...i });

/** An enemy bullet (or other projectile) aimed at a point, for damage tests. */
function bullet(sim: Sim, o: Partial<Bullet> & { x: number; y: number }): Bullet {
  const b: Bullet = {
    id: 90_000 + sim.bullets.length + sim.tick * 10,
    enemy: true,
    owner: '',
    kind: 'shot',
    vx: -600,
    vy: 0,
    dmg: 10,
    pierce: false,
    expires: sim.tick + 30,
    born: sim.tick,
    lag: 0,
    weapon: null,
    power: false,
    hit: null,
    grav: 0,
    blast: 0,
    size: 2,
    ...o,
  };
  sim.bullets.push(b);
  return b;
}

/** A regular enemy, awake, at a column on the ground. */
function foe(sim: Sim, id: number, kind: Enemy['kind'], col: number, y = G): Enemy {
  const e = sim['spawnEnemy'](id, kind, col * T + T / 2, y) as Enemy;
  e.awake = true;
  e.nextFire = sim.tick + 10_000;
  return e;
}

/** Fully charge a hero's super move and fire it. */
function unleash(sim: Sim, p: Player): void {
  p.ult = GAME_CONFIG.ult.max;
  p.prevUlt = false;
  sim.setInput(p.id, { ult: true });
  sim.step();
  sim.setInput(p.id, {});
}

/** Wake a boss and make it start a given attack right now. */
function bossAttack(sim: Sim, kind: Enemy['kind'], atk: number, param = 1): Enemy {
  const e = [...sim.enemies.values()].find((x) => x.kind === kind) as Enemy;
  if (!e.awake) sim['wake'](e);
  e.atk = atk as Enemy['atk'];
  e.atkStart = sim.tick;
  e.atkParam = param;
  e.nextAtk = sim.tick + 10_000;
  return e;
}

/** Tiny test level: flat ground with a 3-row platform, a 4-row platform, a wall and a gate. */
function testWorld(): { world: World; level: LevelDef; open: boolean[] } {
  const cols = 40;
  const rows = 18;
  const tiles = new Uint8Array(cols * rows);
  const gateOf = new Int16Array(cols * rows).fill(-1);
  const set = (c: number, r: number, t: Tile): void => {
    tiles[r * cols + c] = t;
  };
  for (let c = 0; c < cols; c++) for (let r = 14; r < rows; r++) set(c, r, Tile.Solid);
  for (let c = 5; c <= 8; c++) set(c, 11, Tile.OneWay); // 3 rows up: reachable
  for (let c = 12; c <= 15; c++) set(c, 10, Tile.OneWay); // 4 rows up: too high
  for (let r = 10; r < 14; r++) set(20, r, Tile.Solid); // wall
  for (let r = 0; r < 14; r++) {
    set(30, r, Tile.Gate);
    gateOf[r * cols + 30] = 0;
  }
  const level: LevelDef = {
    ...MISSION_1,
    cols,
    rows,
    tiles,
    gateOf,
  };
  const open = [false];
  return { world: { level, isGateOpen: (id) => open[id] === true, limitX: cols * T }, level, open };
}

describe('level', () => {
  it('is one screen tall, with an ambush arena and three boss arenas behind lock gates', () => {
    const L = MISSION_1;
    expect(L.rows).toBe(18);
    expect(toAscii(L)).toHaveLength(18);
    expect(L.checkpoints.length).toBeGreaterThanOrEqual(4);
    expect(L.bosses.map((b) => b.kind)).toEqual(['walker', 'gunship', 'boss']);
    for (const b of L.bosses) expect(L.arenas[b.arena]?.boss).toBe(b.kind);
    for (const a of L.arenas) {
      if (!a.boss) expect(a.waves.length).toBeGreaterThanOrEqual(2);
      expect(a.trigger).toBeGreaterThan(a.left);
      expect(a.trigger).toBeLessThan(a.right);
    }
    // Every gate belongs to exactly one arena (it opens when that arena is cleared).
    for (const g of L.gates) expect(L.arenas.filter((a) => a.gate === g.id)).toHaveLength(1);
  });

  it('can reach every checkpoint, pick-up, arena and boss by walking and jumping', () => {
    // Graph over standable surface tiles: from a surface you can step/jump to another within 4 columns that is at
    // most 3 rows higher (a single jump is ~3.8 tiles), or drop to any lower one within 6 columns. Gates count as
    // open (they open when their arena is cleared). The double jump is not needed anywhere.
    const L = MISSION_1;
    const standable = (c: number, r: number): boolean => {
      const t = tileAt(L, c, r);
      const above = tileAt(L, c, r - 1);
      return (t === Tile.Solid || t === Tile.OneWay) && above !== Tile.Solid;
    };
    const key = (c: number, r: number): number => r * L.cols + c;
    const seen = new Set<number>();
    const startC = Math.floor(L.start.x / T);
    const queue: [number, number][] = [[startC, L.start.y / T]];
    seen.add(key(startC, L.start.y / T));
    while (queue.length) {
      const [c, r] = queue.shift() as [number, number];
      for (let dc = -6; dc <= 6; dc++)
        for (let nr = Math.max(1, r - 3); nr < L.rows; nr++) {
          const nc = c + dc;
          if (nc < 0 || nc >= L.cols || seen.has(key(nc, nr)) || !standable(nc, nr)) continue;
          if (nr < r && Math.abs(dc) > 4) continue;
          seen.add(key(nc, nr));
          queue.push([nc, nr]);
        }
    }
    const reach = (x: number, y: number): boolean => seen.has(key(Math.floor(x / T), Math.round(y / T)));
    for (const c of L.checkpoints) expect(reach(c.x, c.y), `checkpoint ${c.id}`).toBe(true);
    for (const pk of L.pickups) expect(reach(pk.x, pk.y + 22), `pickup ${pk.id} ${pk.kind}`).toBe(true);
    for (const a of L.arenas) expect(reach(a.trigger, a.floor), `arena ${a.name}`).toBe(true);
    const fortress = L.bosses.find((b) => b.kind === 'boss') as (typeof L.bosses)[0];
    expect(reach(fortress.x - 4 * T, fortress.y)).toBe(true);
  });
});

describe('platformer physics and moves', () => {
  it('falls onto the ground and stands still', () => {
    const { world } = testWorld();
    const b = newMover(100, 200, P.width, P.height);
    for (let i = 0; i < 60; i++) stepPlayerMovement(world, b, NEUTRAL_INPUT, 1 / 30);
    expect(b.y).toBe(G);
    expect(b.onGround).toBe(true);
  });

  it('a single jump reaches a platform 3 tiles up but not one 4 tiles up', () => {
    const { world } = testWorld();
    const tryJump = (col: number): number => {
      const b = newMover(col * T + T / 2, G, P.width, P.height);
      b.onGround = true;
      for (let i = 0; i < 60; i++) stepPlayerMovement(world, b, input({ jump: i < 25 }), 1 / 30);
      return b.y;
    };
    expect(tryJump(6)).toBe(11 * T);
    expect(tryJump(13)).toBe(G);
  });

  it('double jump: press Jump again in the air to reach the 4-tile platform (once per jump)', () => {
    const { world } = testWorld();
    const b = newMover(13 * T + T / 2, G, P.width, P.height);
    b.onGround = true;
    let peak = G;
    for (let i = 0; i < 70; i++) {
      // hold, release, press again near the top of the first jump, then spam (no third jump)
      const jump = i < 14 || (i >= 16 && i < 30) || (i >= 32 && i < 46 && i % 2 === 0);
      stepPlayerMovement(world, b, input({ jump }), 1 / 30);
      peak = Math.min(peak, b.y);
    }
    expect(b.y).toBe(10 * T);
    expect(G - peak).toBeLessThan(7.5 * T);
  });

  it('jumps up through one-way platforms and drops through with Down + Jump', () => {
    const { world } = testWorld();
    const b = newMover(6 * T + 16, 11 * T, P.width, P.height);
    b.onGround = true;
    stepPlayerMovement(world, b, NEUTRAL_INPUT, 1 / 30);
    expect(b.y).toBe(11 * T);
    stepPlayerMovement(world, b, input({ my: 1, jump: true }), 1 / 30);
    for (let i = 0; i < 30; i++) stepPlayerMovement(world, b, input({ my: 1 }), 1 / 30);
    expect(b.y).toBe(G);
  });

  it('a short tap gives a lower jump than holding Jump', () => {
    const { world } = testWorld();
    const peak = (hold: number): number => {
      const b = newMover(25 * T, G, P.width, P.height);
      b.onGround = true;
      let best = G;
      for (let i = 0; i < 40; i++) {
        stepPlayerMovement(world, b, input({ jump: i < hold }), 1 / 30);
        best = Math.min(best, b.y);
      }
      return G - best;
    };
    expect(peak(2)).toBeLessThan(peak(30) * 0.6);
    expect(peak(30)).toBeGreaterThan(3 * T);
    expect(peak(30)).toBeLessThan(4 * T);
  });

  it('walls and closed gates block; open gates do not', () => {
    const { world, open } = testWorld();
    const b = newMover(17 * T, G, P.width, P.height);
    b.onGround = true;
    for (let i = 0; i < 40; i++) stepPlayerMovement(world, b, input({ mx: 1 }), 1 / 30);
    expect(b.x).toBeLessThanOrEqual(20 * T - P.width / 2);
    const g = newMover(27 * T, G, P.width, P.height);
    g.onGround = true;
    for (let i = 0; i < 40; i++) stepPlayerMovement(world, g, input({ mx: 1, dash: i % 2 === 0 }), 1 / 30);
    expect(g.x).toBeLessThanOrEqual(30 * T - P.width / 2);
    open[0] = true;
    for (let i = 0; i < 40; i++) stepPlayerMovement(world, g, input({ mx: 1 }), 1 / 30);
    expect(g.x).toBeGreaterThan(31 * T);
  });

  it('dash: a fast burst (~3 tiles), no gravity while dashing, then a cooldown', () => {
    const { world } = testWorld();
    const b = newMover(22 * T, G, P.width, P.height);
    b.onGround = true;
    stepPlayerMovement(world, b, input({ dash: true }), 1 / 30);
    expect(b.dashTicks).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) stepPlayerMovement(world, b, input({ dash: true }), 1 / 30);
    const dist = b.x - 22 * T;
    expect(dist).toBeGreaterThan(2.5 * T);
    expect(dist).toBeLessThan(4.5 * T);
    // Held Dash does not repeat; a new press during the cooldown does nothing.
    const x = b.x;
    stepPlayerMovement(world, b, input({}), 1 / 30);
    stepPlayerMovement(world, b, input({ dash: true }), 1 / 30);
    expect(b.dashTicks).toBe(0);
    expect(b.x).toBe(x);
  });

  it('air dash: once per jump, flat (no falling) while it lasts', () => {
    const { world } = testWorld();
    const b = newMover(22 * T, G, P.width, P.height);
    b.onGround = true;
    for (let i = 0; i < 8; i++) stepPlayerMovement(world, b, input({ jump: true }), 1 / 30);
    stepPlayerMovement(world, b, input({ dash: true, mx: 1 }), 1 / 30);
    const y = b.y;
    for (let i = 0; i < 3; i++) stepPlayerMovement(world, b, input({ dash: true, mx: 1 }), 1 / 30);
    expect(b.y).toBe(y);
    expect(b.vx).toBeGreaterThan(0);
    expect(b.airDashed).toBe(true);
    for (let i = 0; i < 20; i++) stepPlayerMovement(world, b, input({ dash: i % 2 === 0 }), 1 / 30);
    expect(b.dashTicks).toBe(0);
  });

  it('slide: Down + Dash on the ground keeps you low and moving; Jump cancels it', () => {
    const { world } = testWorld();
    const b = newMover(22 * T, G, P.width, P.height);
    b.onGround = true;
    stepPlayerMovement(world, b, input({ my: 1, dash: true }), 1 / 30);
    expect(b.slideTicks).toBeGreaterThan(0);
    expect(b.crouch).toBe(true);
    for (let i = 0; i < 4; i++) stepPlayerMovement(world, b, input({ my: 1 }), 1 / 30);
    expect(b.x).toBeGreaterThan(22 * T + 40);
    stepPlayerMovement(world, b, input({ jump: true }), 1 / 30);
    expect(b.slideTicks).toBe(0);
    expect(b.vy).toBeLessThan(0);
  });

  it('cleans untrusted input', () => {
    expect(
      sanitizeInput({ mx: 99, my: -0.2, jump: 'yes' as unknown as boolean, fire: true, ult: true }),
    ).toEqual({
      mx: 1,
      my: 0,
      jump: false,
      fire: true,
      dash: false,
      melee: false,
      ult: true,
    });
    expect(sanitizeInput({ mx: NaN, my: -Infinity })).toEqual(NEUTRAL_INPUT);
  });
});

describe('mission flow', () => {
  it('holds everyone still during the countdown, then starts', () => {
    const sim = new Sim();
    const p = sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
    sim.setInput('a', { mx: 1 });
    run(sim, 10);
    expect(sim.phase).toBe('countdown');
    const x = p.x;
    run(sim, sim.ticks(GAME_CONFIG.mission.countdownSec));
    expect(sim.phase).toBe('playing');
    expect(sim.drainEvents().some((e) => e.e === 'start')).toBe(true);
    run(sim, 10);
    expect(p.x).toBeGreaterThan(x);
  });

  it('team lives = difficulty base + one per player', () => {
    const { sim } = mk(3);
    expect(sim.lives).toBe(GAME_CONFIG.mission.livesBase.normal + 3);
    const easy = new Sim({ settings: { difficulty: 'easy' } });
    easy.addPlayer({ id: 'a', name: 'A', slot: 0 });
    expect(easy.lives).toBe(GAME_CONFIG.mission.livesBase.easy + 1);
  });

  it('each hero brings its own super move', () => {
    const sim = new Sim();
    const kinds = [0, 1, 2, 3].map(
      (h) => sim.addPlayer({ id: `h${h}`, name: 'H', slot: h, hero: h }).ultKind,
    );
    expect(new Set(kinds).size).toBe(4);
  });

  it('is deterministic for the same seed and inputs', () => {
    const play = (): string => {
      const { sim } = mk(2, { keepEnemies: true, seed: 42 });
      run(sim, 600, () => {
        sim.setInput('p0', { mx: 1, fire: true, jump: sim.tick % 20 < 8, dash: sim.tick % 45 === 0 });
        sim.setInput('p1', { mx: 1, fire: sim.tick % 3 === 0, melee: sim.tick % 10 === 0, ult: true });
      });
      return JSON.stringify(sim.snapshot());
    };
    expect(play()).toBe(play());
  });
});

describe('combat', () => {
  it('shoots and kills a soldier, scoring for the shooter', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    foe(sim, 500, 'soldier', 12);
    run(sim, 90, () => sim.setInput('p0', { fire: true }));
    expect(sim.enemies.has(500)).toBe(false);
    expect(p.stats.kills).toBe(1);
    expect(sim.score).toBe(GAME_CONFIG.enemies.soldier.score);
  });

  it('weapons: spread fires a 5-shell fan, aim up fires straight up', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.weapon = 'spread';
    run(sim, 1, () => sim.setInput('p0', { fire: true }));
    expect(sim.bullets.filter((b) => b.owner === 'p0')).toHaveLength(5);
    sim.bullets = [];
    p.weapon = 'blaster';
    p.nextFireTick = 0;
    run(sim, 1, () => sim.setInput('p0', { fire: true, my: -1 }));
    const b = sim.bullets[0];
    expect(b?.vx).toBeCloseTo(0);
    expect(b?.vy).toBeLessThan(0);
  });

  it('a 100 HP bar: a soldier bullet takes about a tenth, with a short flinch window', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.invulnUntil = 0;
    bullet(sim, { x: p.x + 30, y: p.y - 20, dmg: GAME_CONFIG.enemies.soldier.dmg });
    run(sim, 3);
    expect(p.hp).toBe(P.maxHp - GAME_CONFIG.enemies.soldier.dmg);
    bullet(sim, { x: p.x + 30, y: p.y - 20 });
    run(sim, 3);
    expect(p.hp).toBe(P.maxHp - GAME_CONFIG.enemies.soldier.dmg); // flinch invulnerability
    // It takes many hits to go down.
    let hits = 1;
    while (p.state === 'alive' && hits < 50) {
      p.invulnUntil = 0;
      bullet(sim, { x: p.x + 30, y: p.y - 20, dmg: GAME_CONFIG.enemies.soldier.dmg });
      run(sim, 3);
      hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(10);
    expect(p.state).toBe('dead');
  });

  it('health refills when out of fire for a few seconds', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.invulnUntil = 0;
    bullet(sim, { x: p.x + 30, y: p.y - 20, dmg: 40 });
    run(sim, 3);
    expect(p.hp).toBe(60);
    run(sim, sim.ticks(P.regenDelaySec) - 5);
    expect(p.hp).toBe(60);
    run(sim, sim.ticks(4));
    expect(p.hp).toBe(P.maxHp);
  });

  it('dashing: bullets pass straight through you', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.invulnUntil = 0;
    sim.setInput('p0', { dash: true, mx: 1 });
    sim.step();
    bullet(sim, { x: p.x + 60, y: p.y - 20, vx: -900 });
    run(sim, 3);
    expect(p.hp).toBe(P.maxHp);
  });

  it('melee: the knife hits much harder than a shot, and firing up close swings it automatically', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    const e = foe(sim, 501, 'turret', 6);
    e.hp = e.maxHp = 50;
    sim.setInput('p0', { melee: true });
    sim.step();
    expect(e.hp).toBe(50 - P.melee.damage);
    expect(sim.snapshot().players[0]?.ml).toBeGreaterThan(0);
    // Holding Fire with the enemy in reach keeps knifing (no bullets wasted).
    sim.bullets = [];
    run(sim, sim.ticks(1), () => sim.setInput('p0', { fire: true }));
    expect(e.hp).toBeLessThan(50 - 3 * P.melee.damage);
    expect(sim.bullets.filter((b) => b.owner === 'p0')).toHaveLength(0);
  });

  it('parry: a knife swing knocks an enemy bullet out of the air', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.invulnUntil = 0;
    bullet(sim, { x: p.x + 30, y: p.y - 20, vx: -60 });
    sim.setInput('p0', { melee: true });
    sim.step();
    expect(sim.bullets.filter((b) => b.enemy)).toHaveLength(0);
    expect(sim.drainEvents().some((e) => e.e === 'style' && e.t === 'parry')).toBe(true);
    run(sim, 5);
    expect(p.hp).toBe(P.maxHp);
  });

  it('shield trooper: shots from the front bounce off, from behind they hit, a knife breaks the shield', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    const e = foe(sim, 502, 'shield', 10);
    e.body.facing = -1;
    e.burst = sim.tick + 10_000; // keep facing left
    const hp = e.hp;
    place(p, 5);
    p.facing = 1;
    run(sim, 30, () => sim.setInput('p0', { fire: true }));
    expect(e.hp).toBe(hp);
    expect(e.shield).toBeGreaterThan(0);
    // From behind.
    sim.setInput('p0', {});
    place(p, 15);
    p.facing = -1;
    p.nextFireTick = 0;
    run(sim, 10, () => sim.setInput('p0', { fire: true }));
    expect(e.hp).toBeLessThan(hp);
    // Knife from the front.
    sim.setInput('p0', {});
    place(p, 9);
    p.facing = 1;
    p.x = e.body.x - 30;
    let n = 0;
    while (e.shield > 0 && n < 10) {
      p.nextMelee = 0;
      p.prevMelee = false;
      sim.setInput('p0', { melee: true });
      sim.step();
      n++;
    }
    expect(e.shield).toBe(0);
    expect(n).toBeLessThanOrEqual(2);
  });

  it('slide: knocks troopers over (damage, no touch damage to you)', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.invulnUntil = 0;
    const e = foe(sim, 503, 'soldier', 7);
    e.hp = 20;
    sim.setInput('p0', { my: 1, dash: true, mx: 1 });
    run(sim, 8, () => sim.setInput('p0', { my: 1, mx: 1, dash: true }));
    expect(e.hp).toBe(20 - P.slide.damage);
    expect(p.hp).toBe(P.maxHp);
  });

  it('grenades burst with area damage on landing', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.invulnUntil = 0;
    sim['lob'](p.x + 200, G - 40, p.x + 20, G - 2, 0.6, 20, 'grenade', 58);
    run(sim, 40);
    expect(p.hp).toBe(P.maxHp - 20);
    expect(sim.drainEvents().some((e) => e.e === 'boom')).toBe(true);
  });

  it('lag compensation: a shot is judged against where the enemy was on the shooter screen', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    const e = sim['spawnEnemy'](600, 'drone', 9 * T, G - 22) as Enemy;
    e.awake = true;
    e.hp = 100;
    run(sim, 6);
    e.body.x = 9 * T;
    e.body.y = G - 22 + 9;
    run(sim, 1);
    const recorded = sim.tick;
    e.body.y = G - 200;
    run(sim, 1);
    sim.setViewLag('p0', sim.tick - recorded);
    const before = e.hp;
    bullet(sim, {
      enemy: false,
      owner: 'p0',
      x: 8 * T,
      y: G - 22,
      vx: 600,
      dmg: 1,
      lag: p.viewLag,
      weapon: 'blaster',
      size: 0,
    });
    sim['stepBullets']();
    expect(e.hp).toBeLessThan(before);
  });

  it('view lag is clamped so a client cannot claim a huge rewind', () => {
    const { sim, ps } = mk(1);
    sim.setViewLag('p0', 9999);
    expect((ps[0] as Player).viewLag).toBe(sim.ticks(GAME_CONFIG.limits.maxRewindSec));
    sim.setViewLag('p0', -50);
    expect((ps[0] as Player).viewLag).toBe(0);
  });
});

describe('super moves and combo', () => {
  it('the meter fills from fighting; the move only fires when it is full', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    for (let i = 0; i < 4; i++) foe(sim, 510 + i, 'soldier', 9 + i);
    run(sim, 150, () => sim.setInput('p0', { fire: true }));
    expect(p.ult).toBeGreaterThan(20);
    p.ult = 50;
    p.prevUlt = false;
    sim.setInput('p0', { ult: true });
    sim.step();
    expect(p.stats.ults).toBe(0);
  });

  it('Supernova (nova): blasts every enemy around and wipes nearby enemy fire', () => {
    const { sim, ps } = mk(1);
    const p = sim.players.get('p0') as Player;
    void ps;
    p.ultKind = 'nova';
    place(p, 50);
    const near = foe(sim, 520, 'soldier', 55);
    const far = foe(sim, 521, 'soldier', 70);
    bullet(sim, { x: p.x + 200, y: p.y - 40, vx: -100 });
    unleash(sim, p);
    expect(sim.enemies.has(near.id)).toBe(false);
    expect(sim.enemies.has(far.id)).toBe(true);
    expect(sim.bullets.filter((b) => b.enemy)).toHaveLength(0);
    expect(p.stats.ults).toBe(1);
    expect(p.invulnUntil).toBeGreaterThan(sim.tick);
  });

  it('Overdrive: faster, piercing shots for a few seconds', () => {
    const { sim } = mk(1);
    const p = sim.players.get('p0') as Player;
    p.ultKind = 'overdrive';
    place(p, 50);
    const count = (): number => {
      sim.bullets = [];
      p.nextFireTick = 0;
      let n = 0;
      for (let i = 0; i < 30; i++) {
        sim.setInput('p0', { fire: true });
        sim.step();
        n += sim.bullets.filter((b) => b.owner === 'p0' && b.born === sim.tick).length;
      }
      return n;
    };
    const normal = count();
    unleash(sim, p);
    const od = count();
    expect(od).toBeGreaterThan(normal * 1.8);
    expect(sim.bullets.find((b) => b.owner === 'p0')?.pierce).toBe(true);
    run(sim, sim.ticks(GAME_CONFIG.ult.overdrive.sec));
    expect(sim.snapshot().players[0]?.od).toBe(0);
  });

  it('Airstrike: rockets rain down ahead and blow up what they land on', () => {
    const { sim } = mk(1);
    const p = sim.players.get('p0') as Player;
    p.ultKind = 'airstrike';
    place(p, 50);
    p.facing = 1;
    const a = foe(sim, 530, 'soldier', 55);
    const b = foe(sim, 531, 'soldier', 62);
    unleash(sim, p);
    expect(sim.bullets.filter((x) => x.kind === 'rocket')).toHaveLength(GAME_CONFIG.ult.airstrike.rockets);
    run(sim, sim.ticks(2));
    expect(sim.enemies.has(a.id) && sim.enemies.has(b.id)).toBe(false);
  });

  it('Phantom strike: slashes the nearest enemies, wherever they are', () => {
    const { sim } = mk(1);
    const p = sim.players.get('p0') as Player;
    p.ultKind = 'phantom';
    place(p, 50);
    for (let i = 0; i < 9; i++) foe(sim, 540 + i, 'soldier', 46 + i);
    unleash(sim, p);
    const ev = sim.drainEvents().find((e) => e.e === 'ult');
    expect(ev && ev.e === 'ult' ? (ev.hits?.length ?? 0) / 2 : 0).toBe(GAME_CONFIG.ult.phantom.targets);
    expect(p.stats.kills).toBe(GAME_CONFIG.ult.phantom.targets);
  });

  it('bosses take reduced super-move damage', () => {
    const { sim } = mk(1);
    const p = sim.players.get('p0') as Player;
    p.ultKind = 'nova';
    const boss = bossAttack(sim, 'walker', ATTACK.none);
    boss.nextAtk = sim.tick + 10_000;
    place(p, Math.floor(boss.body.x / T) - 4);
    const hp = boss.hp;
    unleash(sim, p);
    expect(hp - boss.hp).toBeCloseTo(GAME_CONFIG.ult.nova.damage * GAME_CONFIG.ult.bossFactor, 3);
  });

  it('SYNC: two friends unleashing together hit harder', () => {
    const { sim } = mk(2);
    const a = sim.players.get('p0') as Player;
    const b = sim.players.get('p1') as Player;
    a.ultKind = b.ultKind = 'nova';
    place(a, 50);
    place(b, 52);
    const e = foe(sim, 550, 'soldier', 53);
    e.hp = e.maxHp = 500;
    unleash(sim, a);
    unleash(sim, b);
    expect(500 - e.hp).toBeCloseTo(GAME_CONFIG.ult.nova.damage * (2 + GAME_CONFIG.ult.syncBonus), 3);
    expect(sim.drainEvents().some((x) => x.e === 'ult' && x.sync)).toBe(true);
  });

  it('combo: hits chain into a style rank, the chain expires, and getting hit breaks it', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.invulnUntil = 0;
    const e = foe(sim, 560, 'soldier', 9);
    e.hp = e.maxHp = 500;
    run(sim, 60, () => sim.setInput('p0', { fire: true }));
    expect(p.combo).toBeGreaterThanOrEqual(8);
    expect(rankOf(p.combo)).toBeGreaterThanOrEqual(0);
    expect(sim.snapshot().players[0]?.rk).toBe(rankOf(p.combo));
    expect(p.stats.bestCombo).toBe(p.combo);
    bullet(sim, { x: p.x + 30, y: p.y - 20 });
    run(sim, 3, () => sim.setInput('p0', {}));
    expect(p.combo).toBe(0);
    expect(p.stats.bestCombo).toBeGreaterThanOrEqual(8);
    expect(rankOf(110)).toBe(5);
    expect(rankOf(3)).toBe(-1);
  });

  it('a big combo multiplies the score of a kill', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 5);
    p.combo = 40;
    p.comboUntil = sim.tick + 100;
    const e = foe(sim, 570, 'soldier', 7);
    e.hp = 1;
    run(sim, 20, () => sim.setInput('p0', { fire: true }));
    expect(p.stats.score).toBe(Math.round(GAME_CONFIG.enemies.soldier.score * 1.4));
  });
});

describe('lives and respawn', () => {
  it("KO'd: back beside the squad a few seconds later, using a team life", () => {
    const { sim, ps } = mk(2);
    const [a, b] = ps as [Player, Player];
    place(a, 5);
    place(b, 50);
    const lives = sim.lives;
    sim['koPlayer'](a);
    expect(sim.snapshot().players[0]?.dl).toBe(P.respawnSec);
    run(sim, sim.ticks(P.respawnSec) - 2);
    expect(a.state).toBe('dead');
    run(sim, 3);
    expect(a.state).toBe('alive');
    expect(a.hp).toBe(P.maxHp);
    expect(sim.lives).toBe(lives - 1);
    expect(Math.abs(a.x - b.x)).toBeLessThan(T);
  });

  it('out of lives and everyone down: the mission fails', () => {
    const { sim, ps } = mk(2);
    sim.lives = 0;
    for (const p of ps) sim['koPlayer'](p);
    run(sim, sim.ticks(3));
    expect(sim.phase).toBe('ended');
    expect(sim.result).toBe('failed');
    expect(sim.failReason).toBe('lives');
  });

  it('out of lives with a friend standing: you wait, and a boss kill brings you back', () => {
    const { sim, ps } = mk(2);
    const [a, b] = ps as [Player, Player];
    sim.lives = 0;
    place(a, 140);
    place(b, 142);
    sim['koPlayer'](a);
    run(sim, sim.ticks(P.respawnSec) + 5);
    expect(a.state).toBe('dead');
    expect(sim.snapshot().players[0]?.dl).toBe(-1);
    expect(sim.phase).toBe('playing');
    const walker = [...sim.enemies.values()].find((e) => e.kind === 'walker') as Enemy;
    expect(walker.awake).toBe(true);
    b.invulnUntil = sim.tick + 10_000;
    sim['damageEnemy'](walker, 1e6, 'p1', walker.body.x, walker.body.y, 'gun');
    run(sim, 3);
    expect(a.state).toBe('alive');
  });

  it('falling into a pit costs health and puts you back on safe ground', () => {
    const { sim, ps } = mk(2);
    const [a, b] = ps as [Player, Player];
    place(b, 2);
    place(a, 29);
    let n = 0;
    while (a.hp === P.maxHp && n++ < 60) {
      sim.setInput('p0', { mx: 1 }); // runs into the pit at columns 31-33
      sim.step();
    }
    expect(a.state).toBe('alive');
    expect(a.hp).toBeLessThanOrEqual(P.maxHp - P.pitDamage + 1);
    expect(a.y).toBe(G);
    expect(a.x).toBeLessThan(31 * T);
  });

  it('a med-kit heals whoever grabs it and friends close by', () => {
    const { sim, ps } = mk(3);
    const [a, b, c] = ps as [Player, Player, Player];
    const kit = MISSION_1.pickups.find((p) => p.kind === 'medkit') as (typeof MISSION_1.pickups)[0];
    for (const p of ps) {
      p.hp = 10;
      p.lastHurt = sim.tick;
    }
    a.x = kit.x;
    a.y = kit.y + 22;
    b.x = kit.x + 60;
    b.y = kit.y + 22;
    place(c, 2);
    run(sim, 2);
    expect(Math.round(a.hp)).toBe(10 + GAME_CONFIG.pickups.medkitHeal);
    expect(Math.round(b.hp)).toBe(10 + GAME_CONFIG.pickups.medkitHeal);
    expect(c.hp).toBe(10);
    expect(sim.taken[kit.id]).toBe(true);
  });

  it('checkpoints advance and become the respawn point when nobody is standing', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    const cp = MISSION_1.checkpoints[0] as (typeof MISSION_1.checkpoints)[0];
    p.x = cp.x + 10;
    p.y = cp.y;
    run(sim, 2);
    expect(sim.checkpoint).toBe(1);
    p.lastSafeX = cp.x + 10;
    sim['koPlayer'](p);
    run(sim, sim.ticks(P.respawnSec) + 2);
    expect(p.state).toBe('alive');
    expect(Math.abs(p.x - cp.x)).toBeLessThan(T * 2);
  });

  it('a friend joining mid-mission drops in next to the squad and adds a team life', () => {
    const { sim, ps } = mk(1);
    const a = ps[0] as Player;
    place(a, 60);
    run(sim, 2);
    const lives = sim.lives;
    const b = sim.addPlayer({ id: 'late', name: 'Late', slot: 1 });
    expect(Math.abs(b.x - a.x)).toBeLessThan(T);
    expect(sim.lives).toBe(lives + 1);
    expect(b.invulnUntil).toBeGreaterThan(sim.tick);
  });
});

describe('arenas', () => {
  it('ambush: the way locks, waves come from both sides, and clearing them opens the gate and heals', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    const a = MISSION_1.arenas[0] as (typeof MISSION_1.arenas)[0];
    place(p, Math.floor(a.trigger / T) + 1);
    p.invulnUntil = sim.tick + 1_000_000;
    run(sim, 2);
    expect(sim.activeArena()).toBe(0);
    const wave1 = [...sim.enemies.values()].filter((e) => e.arena === 0);
    expect(wave1.length).toBe(a.waves[0]?.length);
    expect(wave1.some((e) => e.body.x < p.x) && wave1.some((e) => e.body.x > p.x)).toBe(true);
    expect(sim.snapshot().arena).toMatchObject({ id: 0, w: 1, n: a.waves.length });
    // Gate stays shut while fighting.
    run(sim, 60, () => sim.setInput('p0', { mx: 1 }));
    expect(p.x).toBeLessThan(MISSION_1.gates[a.gate]!.col * T);
    p.hp = 20;
    p.lastHurt = sim.tick;
    for (let w = 0; w < a.waves.length; w++) {
      for (const e of [...sim.enemies.values()])
        if (e.arena === 0) sim['damageEnemy'](e, 999, 'p0', 0, 0, 'gun');
      run(sim, sim.ticks(1.5));
    }
    expect(sim.gateOpen[a.gate]).toBe(true);
    expect(sim.arenaState[0]).toBe(2);
    expect(p.hp).toBeGreaterThanOrEqual(20 + GAME_CONFIG.mission.arenaClearHeal);
    const evs = sim.drainEvents();
    expect(evs.filter((e) => e.e === 'arena' && e.id === 0)).toHaveLength(a.waves.length);
    expect(evs.some((e) => e.e === 'clear' && e.id === 0)).toBe(true);
  });

  it('a boss sleeps until its arena locks; its health scales with the squad', () => {
    const { sim, ps } = mk(3);
    const walker = [...sim.enemies.values()].find((e) => e.kind === 'walker') as Enemy;
    for (const [i, p] of ps.entries()) place(p, 120 + i);
    run(sim, 30);
    expect(walker.awake).toBe(false);
    place(ps[0] as Player, 135);
    run(sim, 1);
    expect(walker.awake).toBe(true);
    const c = GAME_CONFIG.enemies.walker;
    expect(walker.maxHp).toBe(c.baseHp + c.hpPerPlayer * 3);
    expect(sim.snapshot().boss).toMatchObject({ k: 'walker', ph: 1 });
  });

  it('a boss down opens its gate and gives the squad a life back', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 135);
    run(sim, 1);
    const walker = [...sim.enemies.values()].find((e) => e.kind === 'walker') as Enemy;
    const lives = sim.lives;
    sim['damageEnemy'](walker, 1e6, 'p0', 0, 0, 'gun');
    run(sim, 2);
    const gate = MISSION_1.arenas[walker.arena]!.gate;
    expect(sim.gateOpen[gate]).toBe(true);
    expect(sim.lives).toBe(lives + 1);
    const evs = sim.drainEvents();
    expect(evs.some((e) => e.e === 'bossDown' && e.kind === 'walker')).toBe(true);
    expect(sim.phase).toBe('playing'); // only the final boss ends the mission
  });
});

describe('bosses', () => {
  function inArena(n: number, col: number): { sim: Sim; ps: Player[] } {
    const r = mk(n);
    for (const [i, p] of r.ps.entries()) place(p, col + i);
    run(r.sim, 1);
    for (const p of r.ps) p.invulnUntil = 0;
    return r;
  }

  it('WARHOUND charge: a tell first, then a rush; the touch hurts, a dash through it does not', () => {
    const { sim, ps } = inArena(1, 140);
    const p = ps[0] as Player;
    const w = bossAttack(sim, 'walker', ATTACK.charge);
    w.body.x = 150 * T;
    w.body.facing = -1;
    const x0 = w.body.x;
    run(sim, sim.ticks(ATTACK_WINDUP[ATTACK.charge] as number) - 1);
    expect(w.body.x).toBe(x0); // the tell: it revs up in place
    run(sim, 20);
    expect(w.body.x).toBeLessThan(x0 - 100);
    expect(p.hp).toBeLessThan(P.maxHp);

    // Same again, but dash through it at the right moment.
    const r2 = inArena(1, 140);
    const q = r2.ps[0] as Player;
    const w2 = bossAttack(r2.sim, 'walker', ATTACK.charge);
    w2.body.x = 150 * T;
    w2.body.facing = -1;
    let dashed = false;
    for (let i = 0; i < 60; i++) {
      const gap = w2.body.x - w2.body.w / 2 - (q.x + q.w / 2);
      const go = !dashed && r2.sim.tick - w2.atkStart >= r2.sim.ticks(0.85) && gap < 60;
      if (go) dashed = true;
      r2.sim.setInput('p0', { dash: go, mx: go ? 1 : 0 });
      r2.sim.step();
    }
    expect(dashed).toBe(true);
    expect(q.hp).toBe(P.maxHp);
    expect(q.x).toBeGreaterThan(w2.body.x);
  });

  it('WARHOUND stomp: shockwaves roll along the floor; jumping them avoids the damage', () => {
    const hit = (jump: boolean): number => {
      const { sim, ps } = inArena(1, 140);
      const p = ps[0] as Player;
      const w = bossAttack(sim, 'walker', ATTACK.stomp, 1);
      w.body.x = 150 * T;
      for (let i = 0; i < 90; i++) {
        const wave = sim.bullets.find((b) => b.kind === 'wave' && b.vx < 0);
        const close = !!wave && wave.x - p.x < 70 && wave.x > p.x;
        sim.setInput('p0', { jump: jump && close && p.onGround });
        sim.step();
        if (jump && !p.onGround) sim.setInput('p0', { jump: true });
      }
      expect(sim.drainEvents().some((e) => e.e === 'boom')).toBe(true);
      return P.maxHp - p.hp;
    };
    expect(hit(false)).toBeGreaterThan(0);
    expect(hit(true)).toBe(0);
  });

  it('VULTURE: a bombing run and missiles; shots knock missiles out of the sky', () => {
    const { sim, ps } = inArena(1, 205);
    const p = ps[0] as Player;
    bossAttack(sim, 'gunship', ATTACK.bombs, 1);
    run(sim, sim.ticks(1.5));
    expect(sim.bullets.some((b) => b.kind === 'bomb')).toBe(true);
    sim.bullets = [];
    bossAttack(sim, 'gunship', ATTACK.missiles);
    run(sim, sim.ticks(0.75));
    const m = sim.bullets.find((b) => b.kind === 'missile') as Bullet;
    expect(m).toBeTruthy();
    bullet(sim, {
      enemy: false,
      owner: 'p0',
      x: m.x - 4,
      y: m.y,
      vx: 600,
      vy: 0,
      dmg: 1,
      weapon: 'blaster',
      size: 0,
    });
    sim['stepBullets']();
    expect(sim.bullets.includes(m)).toBe(false);
    void p;
  });

  it('IRON FORTRESS beams: jump the low one, duck the high one', () => {
    const outcome = (atk: number, pose: 'stand' | 'jump' | 'crouch'): number => {
      const { sim, ps } = inArena(1, 245);
      const p = ps[0] as Player;
      bossAttack(sim, 'boss', atk, 1);
      const wind = sim.ticks(ATTACK_WINDUP[atk] as number);
      for (let i = 0; i < wind + sim.ticks(BEAM_SEC); i++) {
        const t = sim.tick - (sim.boss as Enemy).atkStart;
        sim.setInput('p0', {
          jump: pose === 'jump' && t >= wind - 3,
          my: pose === 'crouch' ? 1 : 0,
        });

        sim.step();
      }
      return P.maxHp - p.hp;
    };
    expect(outcome(ATTACK.beamLow, 'stand')).toBeGreaterThan(0);
    expect(outcome(ATTACK.beamLow, 'jump')).toBe(0);
    expect(outcome(ATTACK.beamHigh, 'stand')).toBeGreaterThan(0);
    expect(outcome(ATTACK.beamHigh, 'crouch')).toBe(0);
  });

  it('IRON FORTRESS: blocks the way, calls drones in phase 2, and its fall wins the mission', () => {
    const { sim, ps } = inArena(3, 256);
    const boss = sim.boss as Enemy;
    expect(boss.awake).toBe(true);
    const bc = GAME_CONFIG.enemies.boss;
    expect(boss.maxHp).toBe(bc.baseHp + bc.hpPerPlayer * 3);
    run(sim, 60, () => sim.setInput('p0', { mx: 1 }));
    expect((ps[0] as Player).x).toBeLessThanOrEqual(boss.body.x - boss.body.w / 2);
    for (const p of ps) p.invulnUntil = sim.tick + 100_000;
    boss.hp = boss.maxHp * 0.5;
    run(sim, sim.ticks(bc.droneEvery) + 2);
    expect(boss.phase).toBe(2);
    expect([...sim.enemies.values()].some((e) => e.fromBoss)).toBe(true);
    boss.hp = 1;
    run(sim, 30, () => sim.setInput('p1', { fire: true }));
    expect(sim.decided).toBe('won');
    run(sim, sim.ticks(3));
    expect(sim.phase).toBe('ended');
    expect(sim.result).toBe('won');
  });
});

describe('enemies', () => {
  it('enemies sleep until a player comes close, and far ones are not sent', () => {
    const { sim } = mk(1, { keepEnemies: true });
    const far = [...sim.enemies.values()].filter((e) => e.body.x > 3000);
    expect(far.length).toBeGreaterThan(0);
    run(sim, 30);
    expect(far.every((e) => !e.awake)).toBe(true);
    const sent = new Set(sim.snapshot().enemies.map((e) => e.id));
    expect(far.some((e) => sent.has(e.id))).toBe(false);
  });

  it('soldiers do not walk off ledges', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 36); // across the pit at 31-33
    const s = sim['spawnEnemy'](700, 'soldier', 30 * T + 16, G) as Enemy;
    run(sim, 120);
    expect(s.body.y).toBe(G);
    expect(sim.enemies.has(700)).toBe(true);
  });

  it('jetpack troopers fire in bursts of three', () => {
    const { sim, ps } = mk(1);
    const p = ps[0] as Player;
    place(p, 50);
    p.invulnUntil = sim.tick + 100_000;
    const j = foe(sim, 710, 'jetpack', 52, G - 160);
    j.nextFire = sim.tick + 1;
    const seen = new Set<number>();
    run(sim, 20, () => sim.bullets.forEach((b) => b.enemy && seen.add(b.id)));
    run(sim, 1, () => sim.bullets.forEach((b) => b.enemy && seen.add(b.id)));
    expect(seen.size).toBe(3);
  });
});

describe('snapshot', () => {
  it('stays small with a full squad', () => {
    const { sim } = mk(8, { keepEnemies: true });
    run(sim, 60, () => {
      for (let i = 0; i < 8; i++) sim.setInput(`p${i}`, { mx: 1, fire: true });
    });
    const bytes = JSON.stringify(sim.snapshot()).length;
    expect(bytes).toBeLessThan(14_000);
  });
});

describe('the mission is beatable', () => {
  it('a squad of two computer players finishes mission 1 on normal (deterministic seed)', async () => {
    const { Autopilot } = await import('../src');
    const sim = new Sim({ seed: 2 * 7919 + 2 });
    const bots = new Autopilot(0.6);
    sim.addPlayer({ id: 'p0', name: 'A', slot: 0 });
    sim.addPlayer({ id: 'p1', name: 'B', slot: 1 });
    const bossesDown = new Set<string>();
    while (sim.phase !== 'ended' && sim.tick < sim.ticks(600)) {
      for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
      sim.step();
      for (const e of sim.drainEvents()) if (e.e === 'bossDown') bossesDown.add(e.kind);
    }
    expect(sim.result).toBe('won');
    expect(sim.gateOpen.every(Boolean)).toBe(true);
    expect([...bossesDown].sort()).toEqual(['boss', 'gunship', 'walker']);
  });
});

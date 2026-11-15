import { ATTACK, GAME_CONFIG, isBoss, isFixedBoss } from './config';
import { Tile, fieldAt, levelWidth, tileAt } from './level';
import { NEUTRAL_INPUT, footingBelow, onPlatform, solidAtPoint, type PlayerInput } from './physics';
import { ATTACK_WINDUP, type Enemy, type Player, type Sim } from './sim';

/**
 * A computer player that plays the mission like a decent human would: pushes right, fights arena waves from a
 * sensible distance, turns to face enemies behind, closes in on shield troopers to knife them, reads boss tells
 * (jumps the low beam and shockwaves, ducks the high beam, double-jumps over a charge), dodges incoming fire and
 * fires its super move when it counts.
 *
 * Used by `npm run playtest` to measure whether the mission is beatable and how hard it is for 1..8 players, by
 * tests as an end-to-end "can a squad finish the level" check, and as solo-mode buddies. It plays through the same
 * `setInput` path as a human, so it cannot do anything a human could not.
 */

const T = GAME_CONFIG.tile;
const P = GAME_CONFIG.player;

interface Memory {
  jumping: boolean;
  /** Where we are climbing to; chosen on the ground and kept while in the air (no mid-air change of mind). */
  plan: { x: number; y: number } | null;
  stuckX: number;
  stuckTicks: number;
  backoff: number;
  ultHeld: boolean;
  dashHeld: boolean;
  /** The foe we are fighting: kept unless another is clearly closer (no flip-flopping between two). */
  foeId: number;
  astraHeld: boolean;
  /** Reached its spot: stays put (and keeps facing the fight) until the spot moves away by more than 2 tiles. */
  settled: boolean;
  /** The stage-goal target being shot at (its x), since when, and the ones given up on. */
  goalAim: number;
  goalSince: number;
  goalSkip: Set<number>;
}

interface Foe {
  e: Enemy;
  x: number;
  y: number;
  d: number;
}

export class Autopilot {
  private mem = new Map<string, Memory>();

  /** Skill 0..1: how often the bot reacts to a threat in time (1 = always). */
  constructor(private readonly skill = 1) {}

  decide(sim: Sim, p: Player): PlayerInput {
    if (p.state !== 'alive' || sim.phase !== 'playing') return { ...NEUTRAL_INPUT };
    let m = this.mem.get(p.id);
    if (!m) {
      m = {
        jumping: false,
        plan: null,
        stuckX: p.x,
        stuckTicks: 0,
        backoff: 0,
        ultHeld: false,
        dashHeld: false,
        foeId: -1,
        astraHeld: false,
        settled: false,
        goalAim: -1,
        goalSince: 0,
        goalSkip: new Set<number>(),
      };
      this.mem.set(p.id, m);
    }
    const foe = this.nearestFoe(sim, p, m.foeId);
    m.foeId = foe ? foe.e.id : -1;
    const target = this.target(sim, p, foe);
    const dx = target.x - p.x;
    // Dead band wider than one step, with hysteresis: once on its spot the bot holds it instead of stepping back
    // and forth across the edge (which flips its facing every tick and wastes half its shots).
    let mx = Math.abs(dx) > (m.settled ? 2 * T : 16) ? Math.sign(dx) : 0;
    m.settled = mx === 0;
    let my = 0;
    let wantJump = false;
    let wantAirJump = false;
    let wantDash = false;

    // ---- navigation: climb toward higher targets, jump walls and pits, get unstuck
    if (p.onGround) m.plan = target.y < p.y - 8 ? this.stepUp(sim, p, target) : null;
    if (m.plan) {
      const sdx = m.plan.x - p.x;
      mx = Math.abs(sdx) > 10 ? Math.sign(sdx) : 0;
      if (Math.abs(sdx) < 2 * T && p.onGround) wantJump = true;
    }
    if (mx !== 0 && p.onGround) {
      const ahead = p.x + mx * (p.w / 2 + 6);
      const wall = solidAtPoint(sim.world, ahead, p.y - 10) || solidAtPoint(sim.world, ahead, p.y - 40);
      // A drop with ground a few rows below (off a ledge, into a trench) is just a step down; a real pit
      // (nothing to land on within six rows) or a gap with ground at our height beyond it is worth a jump.
      const ax = p.x + mx * (p.w / 2 + 10);
      const pit =
        !footingBelow(sim.world, ax, p.y) &&
        (this.groundDepth(sim, ax, p.y) > 6 * T || this.landingAhead(sim, p.x, p.y, mx));
      if (wall || pit) wantJump = true;
      // Over a wide pit: keep going with a double jump at the top of the arc.
    }
    // In low gravity one jump already carries far: a double jump would overshoot the landing.
    const floaty = fieldAt(sim.level, p.x, p.y - 20)?.kind === 'lowg';
    if (
      !floaty &&
      !p.onGround &&
      mx !== 0 &&
      p.vy > -60 &&
      !footingBelow(sim.world, p.x + mx * 40, p.y + 40)
    ) {
      const below = this.groundDepth(sim, p.x + mx * 30, p.y);
      if (below > 6 * T) wantAirJump = true; // lower ground ahead (a pillar, a ledge) is a landing, not a pit
    }
    // Against a wall too tall for one jump: double-jump at the top of the first, as a player would.
    if (!floaty && !p.onGround && mx !== 0 && p.vy > -60) {
      const ahead = p.x + mx * (p.w / 2 + 6);
      if (solidAtPoint(sim.world, ahead, p.y - 10) || solidAtPoint(sim.world, ahead, p.y - 30))
        wantAirJump = true;
    }
    // Aboard a boat under way: stay on deck (the boat carries us) and fight from it.
    if (p.onGround && sim.aboard(p)) {
      mx = 0;
      wantJump = false;
    }
    // Coming down over a small footing (a floating stone) with a drop just ahead: stop and land on it.
    if (sim.plats.length && !p.onGround && p.vy > 0 && mx !== 0) {
      const here = this.groundDepth(sim, p.x, p.y) < 3 * T;
      const ahead = this.groundDepth(sim, p.x + mx * T, p.y) < 3 * T;
      if (here && !ahead) {
        mx = 0;
        wantAirJump = false;
      }
    }
    if (Math.abs(p.x - m.stuckX) < 1 && mx !== 0) m.stuckTicks++;
    else {
      m.stuckTicks = 0;
      m.stuckX = p.x;
    }
    if (m.stuckTicks > 45) {
      m.backoff = 12;
      m.stuckTicks = 0;
    }
    if (m.backoff > 0) {
      m.backoff--;
      mx = -mx || -1;
      if (m.backoff < 4) wantJump = true;
    }

    // ---- read the danger
    const react = this.skill >= 1 || ((sim.tick * 7 + p.slot * 13) % 100) / 100 < this.skill;
    let crouch = false;
    const cast = sim.bossCast();
    // Pralay about to land and nobody answered it: dash through it at the last moment.
    if (cast?.kind === 'pralay') {
      const left = sim.ticks(GAME_CONFIG.bossAstra.pralay.windupSec) - cast.t;
      if (left <= 3 && left >= 1 && p.dashCd === 0 && p.onGround) wantDash = true;
    }
    if (react) {
      for (const e of sim.enemies.values()) {
        if (!e.awake || !isBoss(e.kind) || e.atk === ATTACK.none) continue;
        const t = sim.tick - e.atkStart;
        const wind = sim.ticks(ATTACK_WINDUP[e.atk] as number);
        const near = Math.abs(e.body.x - p.x) < 900;
        if (!near) continue;
        if (e.atk === ATTACK.beamLow && t >= wind - 5 && t < wind + sim.ticks(0.7)) {
          wantJump = true;
          if (!p.onGround && p.vy > -40) wantAirJump = true;
        }
        if (e.atk === ATTACK.beamHigh && t >= wind - 6 && t < wind + sim.ticks(0.7) && p.onGround)
          crouch = true;
        if (e.atk === ATTACK.charge && t >= wind - 3) {
          const toward = Math.sign(p.x - e.body.x) === e.body.facing;
          const gap = Math.abs(p.x - e.body.x) - e.body.w / 2;
          if (toward && gap < 170) {
            wantJump = true;
            if (!p.onGround && p.vy > -120) wantAirJump = true;
          }
        }
      }
      for (const b of sim.bullets) {
        if (!b.enemy) continue;
        const bdx = b.x - p.x;
        if (Math.abs(bdx) > 260 || Math.abs(b.y - p.y) > 220) continue;
        if (b.kind === 'orb' && Math.hypot(bdx, b.y - p.y) < 90 && p.dashCd === 0) {
          wantDash = true; // a tej orb on top of us and nothing to turn it with: dash through
          if (mx === 0) mx = Math.sign(bdx) || 1;
          continue;
        }
        if (b.kind === 'wave') {
          if (Math.sign(b.vx) === -Math.sign(bdx) && Math.abs(bdx) < 105) wantJump = true;
          continue;
        }
        // Will it pass through us within 0.3 s?
        for (let k = 1; k <= 9; k++) {
          const tt = k / 30;
          const fx = b.x + b.vx * tt;
          const fy = b.y + b.vy * tt + 0.5 * b.grav * tt * tt;
          if (
            Math.abs(fx - p.x) < 16 + b.blast * 0.6 &&
            fy > p.y - P.height - 4 - b.blast * 0.4 &&
            fy < p.y + 4
          ) {
            if (b.blast > 0) mx = Math.sign(p.x - b.x) || 1;
            else if (p.dashCd === 0 && k <= 4) wantDash = true;
            else wantJump = true;
            break;
          }
        }
      }
    }

    // ---- fight: face the nearest foe, aim up at things above, close in on raised shields
    let fire = false;
    if (foe) {
      const fdx = foe.x - p.x;
      const fdy = foe.y - (p.y - 22);
      fire = true;
      if (fdy < -60 && Math.abs(fdx) < Math.abs(fdy) * 2.4) {
        my = -1;
        if (Math.abs(fdx) < 50) mx = 0;
        else if (mx === 0) mx = Math.sign(fdx);
      } else if (!p.onGround && fdy > 60 && Math.abs(fdx) < fdy * 1.2) {
        my = 1; // in the air over it: shoot down
      } else if (mx === 0 && Math.abs(fdx) > 8 && Math.sign(fdx) !== p.facing) mx = Math.sign(fdx); // turn round
    } else {
      // Nothing to fight: shoot down the stage goal's targets in reach (a totem, a true mirror, a lock).
      const gt = sim
        .goalTargets()
        .find(
          (t) =>
            Math.abs(t.x - p.x) < 420 && Math.abs(t.y - (p.y - 22)) < 140 && !m.goalSkip.has(Math.round(t.x)),
        );
      // one it cannot hit (behind rock, out of line) is given up after a few seconds
      if (gt && m.goalAim !== Math.round(gt.x)) {
        m.goalAim = Math.round(gt.x);
        m.goalSince = sim.tick;
      }
      if (gt && sim.tick - m.goalSince > sim.ticks(5)) m.goalSkip.add(Math.round(gt.x));
      else if (gt) {
        const fdx = gt.x - p.x;
        fire = true;
        mx = Math.sign(fdx) !== p.facing ? Math.sign(fdx) : Math.abs(fdx) > 260 ? Math.sign(fdx) : 0;
        if (gt.y - (p.y - 22) < -30 && Math.abs(fdx) < 120) my = -1;
      }
    }
    // Mid-jump over a drop: never stop to aim (a player keeps the stick held until they land).
    if (!p.onGround && mx === 0 && Math.abs(dx) > 16 && this.groundDepth(sim, p.x, p.y) > 3 * T)
      mx = Math.sign(dx);
    // Fighting from a platform over the enemies' heads: drop down to their level.
    if (
      p.onGround &&
      target.y > p.y + 16 &&
      onPlatform(sim.world, p) // standing on a one-way platform (even by one foot)
    ) {
      my = 1;
      wantJump = true;
      m.jumping = false;
    }
    if (crouch) {
      mx = 0;
      my = 1;
      wantJump = false;
      wantAirJump = false;
    }
    // Samarpanastra being called or raging: lay down your weapons (samarpan). Moving and dodging are fine.
    const surrender = cast?.kind === 'samarpan';
    if (surrender) fire = false;
    // Nartaki's dance: hold the pose Raakhasur shows.
    if (foe?.e.kind === 'raakhasur') {
      const pose = sim.dancePose(foe.e);
      if (pose !== null) {
        mx = pose === 2 ? -1 : pose === 3 ? 1 : 0;
        my = pose === 0 ? -1 : pose === 1 ? 1 : 0;
        wantJump = false;
      }
    }
    // Nidrasur asleep nearby: hold fire, or the noise wakes him.
    for (const e of sim.enemies.values())
      if (
        e.kind === 'nidrasur' &&
        e.burst !== 1 &&
        Math.abs(e.body.x - p.x) < GAME_CONFIG.enemies.nidrasur.hears + 140
      )
        fire = false;
    // Meghbaan's mark under us: step off it before the arrows come down.
    if (sim.meghAt > sim.tick && p.onGround && Math.abs(p.x - sim.meghX) < GAME_CONFIG.megh.spread + 30) {
      mx = p.x >= sim.meghX ? 1 : -1;
    }
    // A shining mirror turns every shot back: hold fire until it goes dull.
    if (foe?.e.kind === 'darpan' && foe.e.mx <= sim.tick) fire = false;

    // On the near bank of a crossing whose boat, chariot or vimana has gone across: wait for it to come back.
    // (Over the sea a soldier can wade across instead.)
    if (p.onGround && !sim.aboard(p) && !sim.level.tide)
      sim.level.plats.forEach((d, i) => {
        if (d.kind !== 'boat' && d.kind !== 'chariot' && d.kind !== 'vimana') return;
        const pl = sim.plats[i];
        if (!pl || pl.x0 <= d.x0 + 4) return;
        if (p.x > d.x0 - 6 * T && p.x < d.x0 + 2 && mx > 0) {
          mx = 0;
          wantJump = false;
          wantAirJump = false;
        }
      });
    // Carried to the far side: step off onto the bank, so it can go back for anyone behind.
    if (p.onGround)
      sim.level.plats.forEach((d, i) => {
        if (d.kind !== 'boat' && d.kind !== 'chariot' && d.kind !== 'vimana') return;
        const pl = sim.plats[i];
        if (pl && pl.x0 >= d.to && p.x > pl.x0 - 2 && p.x < pl.x1 + 2 && Math.abs(p.y - pl.y) < 4) mx = 1;
      });
    // Aboard something under way (a boat, a chariot, Hansvimaan): stay on deck, whatever else we wanted.
    if (p.onGround && sim.aboard(p)) {
      mx = 0;
      wantJump = false;
      wantAirJump = false;
      wantDash = false;
    }
    // ---- jump: press once on the ground, hold while rising; release then press again for the double jump
    let jump = false;
    if (p.onGround) {
      m.jumping = false;
      if (wantJump && !p.prevJump) {
        jump = true;
        m.jumping = true;
      }
    } else {
      if (m.jumping && p.vy < 0) jump = true;
      if (wantAirJump && p.airJumps > 0) jump = !p.prevJump;
    }

    // ---- dash (edge-triggered) and super move
    let dash = false;
    if (wantDash && !m.dashHeld && p.onGround) {
      dash = true;
      if (mx === 0) mx = p.facing;
    }
    m.dashHeld = dash;
    let ult = false;
    if (p.ult >= GAME_CONFIG.ult.max && !m.ultHeld && !surrender) {
      let crowd = 0;
      let bossNear = false;
      for (const e of sim.enemies.values()) {
        if (!e.awake) continue;
        const d = Math.abs(e.body.x - p.x);
        if (isBoss(e.kind) && d < 700) bossNear = true;
        else if (d < 420) crowd++;
      }
      if (bossNear || crowd >= 3) ult = true;
    }
    m.ultHeld = ult;
    // ---- powers: rain on a fire wall ahead; fire, wind and black holes on a crowd or a boss; the paramastra
    let astra = false;
    if (!m.astraHeld && !surrender) {
      const wall = this.fireWallAhead(sim, p);
      const paramReady = sim.param >= GAME_CONFIG.powers.param.max;
      if (cast?.kind === 'pralay' && paramReady)
        astra = true; // answer it with the paramastra
      // Rain falls mostly ahead: face the wall first (an altar fetched from the far side leaves us facing back).
      else if (p.power === 'jal') astra = wall !== null && wall - p.x < 9 * T && p.facing > 0;
      else if (p.power === 'tej') {
        // Saved for a boss's orb: turn it back once it is close enough.
        const R = GAME_CONFIG.powers.tej.reflectRange * 0.8;
        astra = sim.bullets.some((b) => b.enemy && b.kind === 'orb' && Math.hypot(b.x - p.x, b.y - p.y) < R);
      } else if (p.power === 'shyen') {
        let threats = 0;
        for (const b of sim.bullets)
          if (b.enemy && b.kind !== 'orb' && b.kind !== 'arrow' && Math.abs(b.x - p.x) < 600)
            threats += b.kind === 'serpent' ? 3 : 1;
        for (const e of sim.enemies.values())
          if (e.awake && (e.kind === 'drone' || e.kind === 'jetpack') && Math.abs(e.body.x - p.x) < 600)
            threats += 2;
        astra = threats >= 6;
      } else {
        let crowd = 0;
        let bossNear = false;
        for (const e of sim.enemies.values()) {
          if (!e.awake) continue;
          const dx = (e.body.x - p.x) * p.facing;
          if (isBoss(e.kind) && Math.abs(e.body.x - p.x) < 700) bossNear = true;
          else if (dx > -30 && dx < 380 && Math.abs(e.body.y - p.y) < 160) crowd++;
        }
        const homing = p.power === 'naga' || p.power === 'chakram' || p.power === 'vidyut';
        if (p.power && p.powerN > 0)
          // a real crowd, not the first pair of troopers: a teammate's astra going off in the opening seconds
          // looks chaotic and wastes it
          astra = crowd >= 3 || (bossNear && p.power !== 'vayu') || (homing && crowd >= 2);
        else if (paramReady) {
          // Keep it for a pralay when one may come.
          const shirsha = [...sim.enemies.values()].some((e) => e.rule?.rules.includes('pralay'));
          astra = !shirsha && (bossNear || crowd >= 4);
        }
      }
    }
    m.astraHeld = astra;
    return { mx, my, jump, fire, dash, melee: false, ult, astra };
  }

  /** Ground at about our height a few tiles ahead (the far side of a gap, the top of the next tower)? */
  private landingAhead(sim: Sim, x: number, y: number, dir: number): boolean {
    for (let k = 2; k <= 5; k++)
      for (const dy of [-2 * T, -T, 0, T]) if (footingBelow(sim.world, x + dir * k * T, y + dy)) return true;
    return false;
  }

  /** Is the straight line between two points free of rock (and closed gates)? Sampled every 12 px. */
  private clearShot(sim: Sim, x0: number, y0: number, x1: number, y1: number): boolean {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 12);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (solidAtPoint(sim.world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  private groundDepth(sim: Sim, x: number, y: number): number {
    for (let d = 0; d < 8 * T; d += T / 2) if (footingBelow(sim.world, x, y + d)) return d;
    return 99 * T;
  }

  /** x of the nearest closed wall of fire ahead (within 14 tiles), if any. */
  private fireWallAhead(sim: Sim, p: Player): number | null {
    for (const g of sim.level.gates) {
      if (!g.fire || sim.gateOpen[g.id]) continue;
      const x = g.col * T;
      if (x > p.x && x - p.x < 14 * T) return x;
    }
    return null;
  }

  private nearestFoe(sim: Sim, p: Player, keepId = -1): Foe | null {
    let best: Foe | null = null;
    // Locked in an arena: fight what is inside it (a straggler left outside can't be reached from in here).
    const ai = sim.activeArena();
    const arena = ai >= 0 ? sim.level.arenas[ai] : undefined;
    const inside = arena && p.x >= arena.left - 2 * T;
    for (const e of sim.enemies.values()) {
      if (!e.awake) continue;
      if (e.kind === 'jodasur' && e.burst === 1) continue; // split: only his halves are there
      if (e.kind === 'nidrasur') continue; // no weapon hurts the sleeper: let him sleep
      if (e.kind === 'mayavi' && sim.tick >= e.mx) continue; // unseen: nothing to aim at
      // (One of the arena's own waves that wandered past its edge still counts: the arena won't open without it.)
      if (
        inside &&
        !isBoss(e.kind) &&
        e.arena !== ai &&
        (e.body.x < arena.left - T || e.body.x > arena.right + 2 * T)
      )
        continue;
      const fixed = isFixedBoss(e.kind);
      const x = fixed ? e.body.x - e.body.w / 2 : e.body.x;
      const y = fixed ? e.body.y - 110 : e.body.y - e.body.h / 2;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d > (isBoss(e.kind) ? 900 : 540)) continue;
      // Out in the level, a trooper behind rock (on top of a wall we are walking under, past a cave roof) is
      // not worth stopping for: like a player, walk on and deal with it once it is in sight.
      if (!inside && !isBoss(e.kind) && !this.clearShot(sim, p.x, p.y - 22, x, y)) continue;
      // Prefer bosses a little: they are what ends the fight.
      let score = isBoss(e.kind) ? d * 0.8 : d;
      if (e.id === keepId) score *= 0.75;
      if (!best || score < best.d) best = { e, x, y, d: score };
    }
    return best;
  }

  private target(sim: Sim, p: Player, foe: Foe | null): { x: number; y: number } {
    const ai = sim.activeArena();
    const arena = ai >= 0 ? sim.level.arenas[ai] : undefined;
    if (arena && p.x >= arena.left - 2 * T) {
      const lo = arena.left + T;
      const hi = arena.right - T;
      const clamp = (x: number): number => Math.max(lo, Math.min(hi, x));
      const y = arena.floor;
      // A tej orb is out and nobody can turn it back: fetch the altar.
      if (p.power !== 'tej' && sim.bullets.some((b) => b.enemy && b.kind === 'orb')) {
        let holder = false;
        for (const q of sim.players.values()) if (q.state === 'alive' && q.power === 'tej') holder = true;
        if (!holder)
          for (const pk of sim.level.pickups)
            if (pk.kind === 'tej' && !sim.taken[pk.id] && pk.x >= arena.left && pk.x <= arena.right)
              return { x: pk.x, y: pk.y + 22 };
      }
      // Jodasur split in two: stand between the halves and shoot each outward (shots push them apart).
      const halves = [...sim.enemies.values()].filter((e) => e.kind === 'ardh');
      if (halves.length === 2) {
        const [h1, h2] = halves as [(typeof halves)[0], (typeof halves)[0]];
        return { x: clamp((h1.body.x + h2.body.x) / 2), y };
      }
      if (foe && isBoss(foe.e.kind)) {
        const b = foe.e.body;
        if (foe.e.kind === 'gunship') return { x: clamp(b.x - 40), y };
        if (foe.e.kind === 'boss') return { x: clamp(b.x - b.w / 2 - 7 * T), y };
        // The banyan: stand off while its bark is soft; once it hardens, climb its boughs to its heart.
        // Vishdhar: dance from head to head (his scales turn shots).
        if (foe.e.kind === 'vishdhar') {
          const h = sim.nextHead(p);
          if (h) return { x: (h.x0 + h.x1) / 2, y: h.y - 4 };
        }
        // Chhaya: keep off her shadow-mark while her hand is coming; otherwise stand a few tiles off.
        if (foe.e.kind === 'chhaya') {
          if (foe.e.atk === ATTACK.grab) {
            const away = p.x < foe.e.atkParam ? -4 * T : 4 * T;
            return { x: clamp(foe.e.atkParam + away), y };
          }
          return { x: clamp(b.x - b.w / 2 - 6 * T), y };
        }
        if (foe.e.kind === 'vriksha')
          return foe.e.phase >= 2
            ? { x: clamp(b.x - b.w / 2 - 3 * T), y: b.y - 9 * T }
            : { x: clamp(b.x - b.w / 2 - 8 * T), y };
        // WARHOUND: keep ~9 tiles away, on whichever side has more room.
        const side = p.x < b.x ? -1 : 1;
        const room = side < 0 ? b.x - lo : hi - b.x;
        const s = room > 9 * T + b.w ? side : -side;
        return { x: clamp(b.x + s * (9 * T)), y };
      }
      if (foe) {
        if (foe.e.shield > 0) return { x: clamp(foe.x), y }; // knife the shield
        const keep = foe.e.kind === 'grenadier' ? 3 * T : 6 * T;
        return { x: clamp(foe.x - Math.sign(foe.x - p.x || 1) * keep), y };
      }
      // Nothing in range: hunt down whoever of this arena is left (it won't open until they're gone).
      let hunt: number | null = null;
      for (const e of sim.enemies.values())
        if (e.awake && e.arena === ai && (hunt === null || Math.abs(e.body.x - p.x) < Math.abs(hunt - p.x)))
          hunt = e.body.x;
      return { x: clamp(hunt ?? (arena.left + arena.right) / 2), y };
    }
    // Shield trooper on the way: go and knife it.
    if (foe && foe.e.shield > 0 && Math.abs(foe.x - p.x) < 8 * T) return { x: foe.x, y: foe.e.body.y };
    // Don't run off alone: wait for the friend furthest behind to catch up.
    let rear = p.x;
    for (const q of sim.players.values()) if (q.state === 'alive') rear = Math.min(rear, q.x);
    if (p.x - rear > 12 * T) return { x: p.x, y: p.y };
    // A wall of fire ahead and no rain to put it out: fetch it from the altar (unless a friend carries it).
    const wall = this.fireWallAhead(sim, p);
    if (wall !== null && p.power !== 'jal') {
      let friendHasRain = false;
      for (const q of sim.players.values())
        if (q !== p && q.state === 'alive' && q.power === 'jal') friendHasRain = true;
      if (!friendHasRain) {
        let altar: { x: number; y: number } | null = null;
        for (const pk of sim.level.pickups)
          if (pk.kind === 'jal' && !sim.taken[pk.id] && pk.x < wall && wall - pk.x < 16 * T)
            if (altar === null || Math.abs(pk.x - p.x) < Math.abs(altar.x - p.x))
              altar = { x: pk.x, y: pk.y + 22 };
        if (altar) return altar; // its surface y: drops off a platform above it
      }
    }
    const gate = sim.level.gates.find((g) => !sim.gateOpen[g.id] && g.col * T + T > p.x);
    const stop = gate ? gate.col * T - 3 * T : levelWidth(sim.level) - T;
    return { x: Math.min(stop, sim.world.limitX - 6 * T), y: p.y };
  }

  /** A standable surface at most 3 rows above us, between us and a higher target. */
  private stepUp(sim: Sim, p: Player, target: { x: number; y: number }): { x: number; y: number } | null {
    const L = sim.level;
    const myRow = Math.round(p.y / T);
    const targetRow = Math.round(target.y / T);
    const col = Math.floor(p.x / T);
    const tcol = Math.floor(target.x / T);
    if (myRow - targetRow <= 3) return target;
    let best: { x: number; y: number; score: number } | null = null;
    for (let r = Math.max(targetRow + 1, myRow - 3); r < myRow; r++)
      for (let c = col - 8; c <= col + 8; c++) {
        const t = tileAt(L, c, r);
        if (t !== Tile.OneWay && t !== Tile.Solid) continue;
        if (tileAt(L, c, r - 1) === Tile.Solid) continue;
        const score = Math.abs(c - tcol) + Math.abs(c - col) * 0.5;
        if (!best || score < best.score) best = { x: c * T + T / 2, y: r * T, score };
      }
    return best;
  }
}

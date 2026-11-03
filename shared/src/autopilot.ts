import { ATTACK, GAME_CONFIG, isBoss } from './config';
import { Tile, fieldAt, levelWidth, tileAt } from './level';
import { NEUTRAL_INPUT, groundBelow, onPlatform, solidAtPoint, type PlayerInput } from './physics';
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
      };
      this.mem.set(p.id, m);
    }
    const foe = this.nearestFoe(sim, p, m.foeId);
    m.foeId = foe ? foe.e.id : -1;
    const target = this.target(sim, p, foe);
    const dx = target.x - p.x;
    let mx = Math.abs(dx) > 16 ? Math.sign(dx) : 0; // dead band wider than one step: no jitter
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
      const pit = !groundBelow(sim.world, p.x + mx * (p.w / 2 + 10), p.y);
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
      !groundBelow(sim.world, p.x + mx * 40, p.y + 40)
    ) {
      const below = this.groundDepth(sim, p.x + mx * 30, p.y);
      if (below > 3 * T) wantAirJump = true;
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
    }
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
    if (p.ult >= GAME_CONFIG.ult.max && !m.ultHeld) {
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
    // ---- powers: rain on a fire wall ahead; fire, wind and black holes on a crowd or a boss; the brahmastra
    let astra = false;
    if (!m.astraHeld) {
      const wall = this.fireWallAhead(sim, p);
      if (p.power === 'varuna') astra = wall !== null && wall - p.x < 9 * T;
      else {
        let crowd = 0;
        let bossNear = false;
        for (const e of sim.enemies.values()) {
          if (!e.awake) continue;
          const dx = (e.body.x - p.x) * p.facing;
          if (isBoss(e.kind) && Math.abs(e.body.x - p.x) < 700) bossNear = true;
          else if (dx > -30 && dx < 380 && Math.abs(e.body.y - p.y) < 160) crowd++;
        }
        if (p.power && p.powerN > 0) astra = crowd >= 2 || (bossNear && p.power !== 'vayu');
        else if (sim.brahma >= GAME_CONFIG.powers.brahma.max) astra = bossNear || crowd >= 4;
      }
    }
    m.astraHeld = astra;
    return { mx, my, jump, fire, dash, melee: false, ult, astra };
  }

  private groundDepth(sim: Sim, x: number, y: number): number {
    for (let d = 0; d < 8 * T; d += T / 2) if (groundBelow(sim.world, x, y + d)) return d;
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
      if (inside && !isBoss(e.kind) && (e.body.x < arena.left - T || e.body.x > arena.right + 2 * T))
        continue;
      const x = e.kind === 'boss' ? e.body.x - e.body.w / 2 : e.body.x;
      const y = e.kind === 'boss' ? e.body.y - 110 : e.body.y - e.body.h / 2;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d > (isBoss(e.kind) ? 900 : 540)) continue;
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
      if (foe && isBoss(foe.e.kind)) {
        const b = foe.e.body;
        if (foe.e.kind === 'gunship') return { x: clamp(b.x - 40), y };
        if (foe.e.kind === 'boss') return { x: clamp(b.x - b.w / 2 - 7 * T), y };
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
    if (wall !== null && p.power !== 'varuna') {
      let friendHasRain = false;
      for (const q of sim.players.values())
        if (q !== p && q.state === 'alive' && q.power === 'varuna') friendHasRain = true;
      if (!friendHasRain) {
        let altar: { x: number; y: number } | null = null;
        for (const pk of sim.level.pickups)
          if (pk.kind === 'varuna' && !sim.taken[pk.id] && pk.x < wall && wall - pk.x < 16 * T)
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

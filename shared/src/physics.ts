import { GAME_CONFIG } from './config';
import { Tile, gateIdAt, tileAt, type LevelDef } from './level';

/**
 * Platformer movement, shared by the server simulation and the client's prediction of its own soldier, so both
 * agree to the pixel. Bodies use (x = centre, y = feet).
 */

export interface PlayerInput {
  /** -1 left, 0, 1 right. */
  mx: number;
  /** -1 up (aim up), 0, 1 down (crouch / aim down / drop through platforms with Jump). */
  my: number;
  jump: boolean;
  fire: boolean;
  /** Dash (Down + Dash on the ground: slide). */
  dash: boolean;
  /** Knife / kick. */
  melee: boolean;
  /** Hero super move, when the meter is full. */
  ult: boolean;
}

export const NEUTRAL_INPUT: PlayerInput = Object.freeze({
  mx: 0,
  my: 0,
  jump: false,
  fire: false,
  dash: false,
  melee: false,
  ult: false,
});

export interface Mover {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  /** Ticks left during which a jump still works after leaving the ground. */
  coyote: number;
  /** Ticks left during which one-way platforms are ignored (dropping through). */
  dropTicks: number;
  facing: 1 | -1;
  crouch: boolean;
  prevJump: boolean;
  /** Extra jumps left before landing (double jump). */
  airJumps: number;
  /** Ticks left of a dash / slide (0 when not dashing / sliding). */
  dashTicks: number;
  slideTicks: number;
  /** Ticks until the next dash or slide. */
  dashCd: number;
  dashDir: 1 | -1;
  /** One air dash per jump. */
  airDashed: boolean;
  prevDash: boolean;
}

export interface World {
  level: LevelDef;
  isGateOpen(id: number): boolean;
  /** Bodies may not move right of this x (the boss's front while it lives). */
  limitX: number;
}

const T = GAME_CONFIG.tile;
const P = GAME_CONFIG.player;

/** Clean an untrusted input into the allowed set (the server calls this on every packet). */
export function sanitizeInput(i: Partial<PlayerInput>): PlayerInput {
  const axis = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? (v > 0.35 ? 1 : v < -0.35 ? -1 : 0) : 0;
  return {
    mx: axis(i.mx),
    my: axis(i.my),
    jump: i.jump === true,
    fire: i.fire === true,
    dash: i.dash === true,
    melee: i.melee === true,
    ult: i.ult === true,
  };
}

function blocks(world: World, c: number, r: number): boolean {
  const t = tileAt(world.level, c, r);
  if (t === Tile.Solid) return true;
  if (t === Tile.Gate) return !world.isGateOpen(gateIdAt(world.level, c, r));
  return false;
}

/** Is there something to stand on directly under (x, y)? Used by enemies to avoid walking off ledges. */
export function groundBelow(world: World, x: number, y: number): boolean {
  const c = Math.floor(x / T);
  const r = Math.floor((y + 1) / T);
  const t = tileAt(world.level, c, r);
  return (
    t === Tile.Solid ||
    t === Tile.OneWay ||
    (t === Tile.Gate && !world.isGateOpen(gateIdAt(world.level, c, r)))
  );
}

export function solidAtPoint(world: World, x: number, y: number): boolean {
  return blocks(world, Math.floor(x / T), Math.floor(y / T));
}

/** Move a body by its velocity for `dt` seconds, resolving collisions axis by axis. */
export function moveBody(world: World, b: Mover, dt: number): void {
  const half = b.w / 2;
  // ---- horizontal
  if (b.vx !== 0) {
    let nx = b.x + b.vx * dt;
    const top = Math.floor((b.y - b.h + 1) / T);
    const bottom = Math.floor((b.y - 1) / T);
    if (b.vx > 0) {
      const c = Math.floor((nx + half - 0.001) / T);
      for (let r = top; r <= bottom; r++)
        if (blocks(world, c, r)) {
          nx = c * T - half;
          b.vx = 0;
          break;
        }
    } else {
      const c = Math.floor((nx - half) / T);
      for (let r = top; r <= bottom; r++)
        if (blocks(world, c, r)) {
          nx = (c + 1) * T + half;
          b.vx = 0;
          break;
        }
    }
    b.x = nx;
  }
  if (b.x > world.limitX - half) b.x = world.limitX - half;
  if (b.x < half) b.x = half;

  // ---- vertical
  const ny = b.y + b.vy * dt;
  const c0 = Math.floor((b.x - half + 0.5) / T);
  const c1 = Math.floor((b.x + half - 0.5) / T);
  b.onGround = false;
  if (b.vy >= 0) {
    const fromRow = Math.floor(b.y / T); // the row whose top the feet may already rest on
    const toRow = Math.floor(ny / T);
    let landed = false;
    for (let r = fromRow; r <= toRow && !landed; r++) {
      const surface = r * T;
      if (surface < b.y - 0.001 || surface > ny + 0.001) continue;
      for (let c = c0; c <= c1; c++) {
        const t = tileAt(world.level, c, r);
        const oneWay = t === Tile.OneWay && b.dropTicks <= 0;
        if (blocks(world, c, r) || oneWay) {
          b.y = surface;
          b.vy = 0;
          b.onGround = true;
          landed = true;
          break;
        }
      }
    }
    if (!landed) b.y = ny;
  } else {
    const headRow = Math.floor((ny - b.h) / T);
    let hit = false;
    for (let c = c0; c <= c1; c++)
      if (blocks(world, c, headRow)) {
        hit = true;
        break;
      }
    if (hit) {
      b.y = (headRow + 1) * T + b.h;
      b.vy = 0;
    } else b.y = ny;
  }
}

/** Is the body standing on a one-way platform (so Down + Jump drops through)? */
function onPlatform(world: World, b: Mover): boolean {
  if (!b.onGround) return false;
  const r = Math.floor((b.y + 1) / T);
  const half = b.w / 2;
  let platform = false;
  for (const x of [b.x - half + 0.5, b.x + half - 0.5]) {
    const c = Math.floor(x / T);
    const t = tileAt(world.level, c, r);
    if (t === Tile.OneWay) platform = true;
    else if (blocks(world, c, r)) return false;
  }
  return platform;
}

const ticksOf = (sec: number, dt: number): number => Math.max(1, Math.round(sec / dt));

/**
 * One tick of player control + physics. Identical on server and client.
 *
 * Moves: run, jump (hold for height), double jump, dash (bullets pass through, one in the air), Down + Dash slide
 * (low profile), Down + Jump drop through platforms. Jump cancels a dash or a slide.
 */
export function stepPlayerMovement(world: World, b: Mover, input: PlayerInput, dt: number): void {
  const jumpPressed = input.jump && !b.prevJump;
  b.prevJump = input.jump;
  const dashPressed = input.dash && !b.prevDash;
  b.prevDash = input.dash;
  if (b.dashCd > 0) b.dashCd--;
  if (input.mx !== 0 && b.dashTicks === 0 && b.slideTicks === 0) b.facing = input.mx > 0 ? 1 : -1;

  // ---- start a dash or a slide
  if (dashPressed && b.dashCd === 0 && b.dashTicks === 0 && b.slideTicks === 0) {
    const dir: 1 | -1 = input.mx !== 0 ? (input.mx > 0 ? 1 : -1) : b.facing;
    if (b.onGround && input.my > 0) {
      b.slideTicks = ticksOf(P.slide.sec, dt);
      b.dashDir = dir;
      b.facing = dir;
      b.dashCd = ticksOf(P.dash.cooldownSec, dt);
    } else if (b.onGround || !b.airDashed) {
      b.dashTicks = ticksOf(P.dash.sec, dt);
      b.dashDir = dir;
      b.facing = dir;
      b.dashCd = ticksOf(P.dash.cooldownSec, dt);
      if (!b.onGround) b.airDashed = true;
    }
  }
  // Jump cancels a dash or slide (dash-jump / slide-jump keep you moving).
  if (jumpPressed && (b.dashTicks > 0 || b.slideTicks > 0)) {
    b.dashTicks = 0;
    b.slideTicks = 0;
  }

  if (b.dashTicks > 0) {
    // Dash: straight line, no gravity.
    b.dashTicks--;
    b.crouch = false;
    b.vx = b.dashDir * P.dash.speed;
    b.vy = 0;
    const wasGround = b.onGround;
    moveBody(world, b, dt);
    // Dashing off a ledge keeps you in the air for the rest of the dash, then you fall.
    if (wasGround && !b.onGround) b.coyote = ticksOf(P.coyoteSec, dt);
    if (b.vx === 0) b.dashTicks = 0; // hit a wall
    if (b.onGround) {
      b.airJumps = P.airJumps;
      b.airDashed = false;
    }
    return;
  }

  if (b.slideTicks > 0) {
    b.slideTicks--;
    b.crouch = true;
    // Fast at first, easing off toward the end.
    const k = 0.55 + 0.45 * (b.slideTicks / ticksOf(P.slide.sec, dt));
    b.vx = b.dashDir * P.slide.speed * k;
  } else {
    b.crouch = b.onGround && input.my > 0 && input.mx === 0;
    b.vx = b.crouch ? 0 : input.mx * P.runSpeed;
  }

  if (jumpPressed) {
    if (input.my > 0 && b.slideTicks === 0 && onPlatform(world, b)) {
      b.dropTicks = 8;
      b.onGround = false;
      b.y += 1;
    } else if (b.onGround || b.coyote > 0) {
      b.vy = -P.jumpSpeed;
      b.onGround = false;
      b.coyote = 0;
      b.crouch = false;
    } else if (b.airJumps > 0) {
      b.vy = -P.doubleJumpSpeed;
      b.airJumps--;
      b.crouch = false;
    }
  }
  // Let go of Jump early for a short hop.
  if (!input.jump && b.vy < -P.jumpSpeed * 0.45) b.vy = -P.jumpSpeed * 0.45;

  b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * dt);
  moveBody(world, b, dt);
  if (b.dropTicks > 0) b.dropTicks--;
  if (b.onGround) {
    b.coyote = ticksOf(P.coyoteSec, dt);
    b.airJumps = P.airJumps;
    b.airDashed = false;
  } else {
    b.coyote = Math.max(0, b.coyote - 1);
    if (b.slideTicks > 0) b.slideTicks = 0; // slid off a ledge
  }
}

/** Aim direction (unit-ish grid vector) for a body given its input. */
export function aimOf(b: Mover, input: PlayerInput): { ax: number; ay: number } {
  if (input.my < 0) return { ax: input.mx, ay: -1 };
  if (input.my > 0 && !b.onGround) return { ax: input.mx, ay: 1 };
  return { ax: b.facing, ay: 0 };
}

export function newMover(x: number, y: number, w: number, h: number): Mover {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    w,
    h,
    onGround: false,
    coyote: 0,
    dropTicks: 0,
    facing: 1,
    crouch: false,
    prevJump: false,
    airJumps: P.airJumps,
    dashTicks: 0,
    slideTicks: 0,
    dashCd: 0,
    dashDir: 1,
    airDashed: false,
    prevDash: false,
  };
}

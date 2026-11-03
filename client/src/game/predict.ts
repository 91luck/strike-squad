import {
  GAME_CONFIG,
  levelWidth,
  newMover,
  stepPlayerMovement,
  type Mover,
  type PlayerInput,
  type PlayerSnapshot,
  type LevelDef,
  type World,
} from '@strikesquad/shared';

/** Predicted pose of the local soldier. */
export interface Pose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: boolean;
  f: 1 | -1;
  c: boolean;
  dsh: number;
  sld: number;
  aj: number;
}

interface Pending {
  seq: number;
  input: PlayerInput;
}

/**
 * Client-side prediction for the local soldier's *movement only* (running, jumping, double jump, dash, slide,
 * dropping through platforms).
 *
 * Shooting, knife, super moves, damage and pick-ups always come from the server. Movement uses the exact same
 * `stepPlayerMovement` as the server, so on open ground prediction and server agree to the pixel. When they disagree
 * (a gate the client had not heard about yet, lost packets) the error folds into a visual offset that decays smoothly.
 */
export class Predictor {
  private readonly body: Mover;
  private readonly world: World;
  private gates = 0;
  private pending: Pending[] = [];
  private errX = 0;
  private errY = 0;
  private synced = false;
  private alive = false;
  private readonly dt: number;

  constructor(tickRate: number, level: LevelDef) {
    this.dt = 1 / tickRate;
    this.body = newMover(0, 0, GAME_CONFIG.player.width, GAME_CONFIG.player.height);
    this.world = {
      level,
      isGateOpen: (id) => (this.gates & (1 << id)) !== 0,
      limitX: levelWidth(level),
    };
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Called once per client tick, right when the input is sent to the server. */
  step(seq: number, input: PlayerInput): void {
    if (!this.synced || !this.alive) return;
    this.pending.push({ seq, input: { ...input } });
    if (this.pending.length > 90) this.pending.shift(); // 3 s of unacked input is already a dead connection
    stepPlayerMovement(this.world, this.body, input, this.dt);
  }

  /** Apply the server's view of our soldier plus the highest input seq it has processed. */
  reconcile(server: PlayerSnapshot, ack: number, world: { gates: number; limitX: number }): void {
    const before = this.pose();
    this.gates = world.gates;
    this.world.limitX = world.limitX;
    this.alive = server.st === 0;
    const b = this.body;
    b.x = server.x;
    b.y = server.y;
    b.vx = server.vx;
    b.vy = server.vy;
    b.onGround = server.g === 1;
    b.facing = server.f;
    b.crouch = server.c === 1;
    b.coyote = server.co;
    b.dropTicks = server.dr;
    b.prevJump = server.pj === 1;
    b.airJumps = server.aj;
    b.dashTicks = server.dsh;
    b.slideTicks = server.sld;
    b.dashCd = server.dcd;
    b.dashDir = server.dd;
    b.airDashed = server.ad === 1;
    b.prevDash = server.pd === 1;
    this.pending = this.pending.filter((p) => p.seq > ack);
    if (!this.synced || !this.alive) {
      this.synced = true;
      this.pending = [];
      this.errX = this.errY = 0;
      return;
    }
    for (const p of this.pending) stepPlayerMovement(this.world, b, p.input, this.dt);
    const after = this.pose();
    const dx = before.x - after.x;
    const dy = before.y - after.y;
    // Big divergence (respawn, revive, pit): snap instead of smoothing across the level.
    if (Math.hypot(dx, dy) > 80) this.errX = this.errY = 0;
    else {
      this.errX += dx;
      this.errY += dy;
    }
  }

  /** Decay the visual error. Call once per rendered frame. */
  smooth(dtSec: number): void {
    const k = Math.pow(0.0005, dtSec); // ~90% gone in 0.3 s
    this.errX *= k;
    this.errY *= k;
    if (Math.abs(this.errX) < 0.01) this.errX = 0;
    if (Math.abs(this.errY) < 0.01) this.errY = 0;
  }

  /** Where our soldier should be drawn (null when there is nothing to predict). */
  pose(): Pose {
    const b = this.body;
    return {
      x: b.x + this.errX,
      y: b.y + this.errY,
      vx: b.vx,
      vy: b.vy,
      g: b.onGround,
      f: b.facing,
      c: b.crouch,
      dsh: b.dashTicks,
      sld: b.slideTicks,
      aj: b.airJumps,
    };
  }

  get isAlive(): boolean {
    return this.synced && this.alive;
  }
}

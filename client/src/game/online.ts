import { NEUTRAL_INPUT, getMission, type PlayerInput, type ServerMessage } from '@strikesquad/shared';
import type { InputController } from '../input/input';
import type { Connection } from '../net/connection';
import { Predictor } from './predict';
import { Timeline } from './timeline';
import type { MatchView } from './view';

type MatchStart = Extract<ServerMessage, { t: 'matchStart' }>;
type Snap = Extract<ServerMessage, { t: 'snap' }>;

/**
 * One online mission on the client: sends input intents at the sim tick rate, buffers snapshots for interpolation,
 * predicts the local soldier's movement and renders every animation frame. The server stays the only authority.
 */
export class OnlineMatch {
  private readonly timeline = new Timeline();
  private readonly predictor: Predictor;
  private readonly tickMs: number;
  private readonly interpDelay: number;
  private raf = 0;
  private seq = 0;
  private acc = 0;
  private lastFrame = 0;
  private clockOffset: number | null = null;
  private running = false;
  private lastSent: PlayerInput = { ...NEUTRAL_INPUT };
  private firing = false;

  constructor(
    private readonly start: MatchStart,
    private readonly view: MatchView,
    private readonly conn: Connection,
    private readonly input: InputController,
  ) {
    const level = getMission(start.levelId);
    this.predictor = new Predictor(start.tickRate, level);
    this.tickMs = 1000 / start.tickRate;
    // Render two snapshot intervals in the past so we nearly always have two snapshots to blend.
    this.interpDelay = (2 * start.snapshotEvery) / start.tickRate;
    view.begin(start.you, start.snap, level);
    this.ingest(start.snap, 0);
  }

  get meId(): string {
    return this.start.you;
  }

  /** Latest mission phase from the server (debug/test hook). */
  phase(): string | null {
    return this.timeline.latest()?.phase ?? null;
  }

  /** Server-confirmed state of the local soldier (debug/test hook; carries no authority). */
  self(): { x: number; y: number; alive: boolean; hp: number; weapon: number } | null {
    const p = this.timeline.latest()?.players.find((k) => k.id === this.start.you);
    return p ? { x: p.x, y: p.y, alive: p.st === 0, hp: p.hp, weapon: p.w } : null;
  }

  latest(): Snap['s'] | null {
    return this.timeline.latest();
  }

  run(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Release held controls on the server immediately (tab hidden, pause menu, etc.). */
  sendNeutral(): void {
    this.conn.send({ t: 'input', seq: ++this.seq, ...NEUTRAL_INPUT });
    this.lastSent = { ...NEUTRAL_INPUT };
  }

  onSnap(m: Snap): void {
    this.ingest(m.s, m.ack);
    this.view.onEvents(m.ev);
  }

  private ingest(s: Snap['s'], ack: number): void {
    const serverTime = s.tick / this.start.tickRate;
    const now = performance.now() / 1000;
    const target = now - serverTime;
    // Packets that arrive "early" define the clock; jittery late ones only nudge it.
    if (this.clockOffset === null || target < this.clockOffset) this.clockOffset = target;
    else this.clockOffset += (target - this.clockOffset) * 0.02;
    this.timeline.push(serverTime, s);
    const mine = s.players.find((p) => p.id === this.start.you);
    if (mine) this.predictor.reconcile(mine, ack, { gates: s.gates, limitX: s.lx });
  }

  private frame(nowMs: number): void {
    if (!this.running) return;
    const dtMs = Math.min(250, nowMs - this.lastFrame);
    this.lastFrame = nowMs;
    // Fixed-rate input sampling, decoupled from the display refresh rate.
    this.acc += dtMs;
    let n = 0;
    while (this.acc >= this.tickMs && n < 5) {
      this.acc -= this.tickMs;
      n++;
      this.sendInput();
    }
    if (n === 5) this.acc = 0;

    this.predictor.smooth(dtMs / 1000);
    const latest = this.timeline.latest();
    if (latest) {
      const renderT = nowMs / 1000 - (this.clockOffset ?? 0) - this.interpDelay;
      const frame = this.timeline.sample(renderT) ?? latest;
      const playing = latest.phase === 'playing';
      this.view.draw(
        frame,
        latest,
        {
          nowMs,
          reduceMotion: false,
          mine: this.predictor.isAlive && playing ? this.predictor.pose() : null,
        },
        { rtt: this.conn.rttMs },
        this.firing,
      );
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private sendInput(): void {
    const input = this.input.read();
    this.firing = input.fire;
    const idleOf = (i: PlayerInput): boolean =>
      !i.mx && !i.my && !i.jump && !i.fire && !i.dash && !i.melee && !i.ult && !i.astra;
    const idle = idleOf(input);
    const wasIdle = idleOf(this.lastSent);
    const playing = this.timeline.latest()?.phase === 'playing';
    // The server keeps the last input, so a still player needn't spam packets; send one neutral then a keep-alive.
    const keepAlive = this.seq % 15 === 0;
    this.seq++;
    if (!(idle && wasIdle && !keepAlive)) {
      this.lastSent = input;
      const vt = this.viewTick();
      this.conn.send(
        vt === null ? { t: 'input', seq: this.seq, ...input } : { t: 'input', seq: this.seq, ...input, vt },
      );
    }
    if (playing) this.predictor.step(this.seq, input);
  }

  /** The server tick currently on screen (interpolated world), sent for lag compensation. */
  private viewTick(): number | null {
    if (this.clockOffset === null) return null;
    const renderT = performance.now() / 1000 - this.clockOffset - this.interpDelay;
    return Math.max(0, Math.floor(renderT * this.start.tickRate));
  }
}

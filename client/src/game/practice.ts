import {
  Autopilot,
  GAME_CONFIG,
  Sim,
  type BoardEntry,
  type Difficulty,
  type MissionEnd,
  type MissionId,
} from '@strikesquad/shared';
import type { InputController } from '../input/input';
import { Timeline } from './timeline';
import type { MatchView } from './view';

export interface SoloOptions {
  name: string;
  difficulty: Difficulty;
  /** Computer squad-mates (clearly labelled as bots) that run, shoot, dodge and use their super moves. */
  buddies: number;
  mission: MissionId;
  hero: number;
}

const BUDDY_NAMES = ['Bolt', 'Nova', 'Tusk'];

/**
 * Offline solo mission: the very same `Sim` as the server runs in the browser. Works without a network once the
 * page has loaded - handy to learn the controls before playing with friends.
 */
export class SoloMatch {
  readonly sim: Sim;
  readonly meId = 'me';
  paused = false;
  private readonly timeline = new Timeline();
  private raf = 0;
  private running = false;
  private acc = 0;
  private last = 0;
  private finished = false;
  private firing = false;
  /** Buddies react well but not perfectly: they should help, not carry. */
  private readonly autopilot = new Autopilot(0.7);

  constructor(
    readonly opts: SoloOptions,
    private readonly view: MatchView,
    private readonly input: InputController,
    private readonly onEnd: (r: MissionEnd) => void,
    seed = (Math.random() * 2 ** 31) | 0 || 1,
  ) {
    this.sim = new Sim({
      seed,
      tickRate: GAME_CONFIG.tickRate,
      settings: { difficulty: opts.difficulty, mission: opts.mission },
    });
    this.sim.addPlayer({ id: this.meId, name: opts.name, slot: 0, hero: opts.hero });
    for (let i = 0; i < Math.min(3, opts.buddies); i++)
      this.sim.addPlayer({
        id: `bot-${i}`,
        name: `${BUDDY_NAMES[i] as string} (bot)`,
        slot: i + 1,
        hero: (opts.hero + 1 + i * 2) % 8,
      });
    this.record();
    view.begin(this.meId, this.sim.snapshot(), this.sim.level);
  }

  phase(): string {
    return this.sim.phase;
  }

  self(): { x: number; y: number; alive: boolean; hp: number; weapon: number } | null {
    const p = this.sim.snapshot().players.find((x) => x.id === this.meId);
    return p ? { x: p.x, y: p.y, alive: p.st === 0, hp: p.hp, weapon: p.w } : null;
  }

  latest(): ReturnType<Sim['snapshot']> | null {
    return this.timeline.latest();
  }

  run(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.last = performance.now();
  }

  private record(): void {
    this.timeline.push(this.sim.tick * this.sim.dt, this.sim.snapshot());
  }

  private frame(nowMs: number): void {
    if (!this.running) return;
    const dtMs = Math.min(250, nowMs - this.last);
    this.last = nowMs;
    if (!this.paused && !this.finished) {
      this.acc += dtMs / 1000;
      let n = 0;
      while (this.acc >= this.sim.dt && n < 5) {
        this.acc -= this.sim.dt;
        n++;
        this.tickOnce();
        if (this.finished) break;
      }
      if (n === 5) this.acc = 0;
    }
    const latest = this.timeline.latest();
    if (latest) {
      // Render one tick behind real sim time so there is always a "next" snapshot to blend toward.
      const t = this.sim.tick * this.sim.dt - this.sim.dt + (this.paused ? 0 : this.acc);
      this.view.draw(
        this.timeline.sample(t) ?? latest,
        latest,
        { nowMs, reduceMotion: false, mine: null },
        null,
        this.firing && !this.paused,
      );
    }
    if (this.running) this.raf = requestAnimationFrame((x) => this.frame(x));
  }

  private tickOnce(): void {
    const input = this.input.read();
    this.firing = input.fire;
    this.sim.setInput(this.meId, input);
    for (const p of this.sim.players.values())
      if (p.id !== this.meId) this.sim.setInput(p.id, this.autopilot.decide(this.sim, p));
    this.sim.step();
    this.view.onEvents(this.sim.drainEvents());
    this.record();
    if (this.sim.phase === 'ended' && !this.finished) {
      this.finished = true;
      const board: BoardEntry[] = this.sim.board();
      this.onEnd({
        t: 'matchEnd',
        result: this.sim.result ?? 'failed',
        ...(this.sim.failReason ? { reason: this.sim.failReason } : {}),
        timeSec: Math.round(this.sim.tick / this.sim.tickRate),
        score: this.sim.score,
        livesLeft: this.sim.lives,
        board,
      });
    }
  }
}

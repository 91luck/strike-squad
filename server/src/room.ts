import {
  GAME_CONFIG,
  NEUTRAL_INPUT,
  Sim,
  defaultMissionSettings,
  type BoardEntry,
  type SettingsPatch,
  type ErrorCode,
  type MissionEnd,
  type MissionSettings,
  type PlayerInfo,
  type RoomInfo,
  type RoomPhase,
  type ServerMessage,
} from '@strikesquad/shared';
import { secureRandomInt } from './security';

export type Result = { ok: true } | { ok: false; code: ErrorCode; message: string };
const OK: Result = { ok: true };
const fail = (code: ErrorCode, message: string): Result => ({ ok: false, code, message });

export interface RoomPlayer {
  id: string;
  name: string;
  /** Seat 0..7. Seats are reused when someone leaves. */
  slot: number;
  hero: number;
  connected: boolean;
}

export interface RoomDeps {
  /** Deliver a message (object or pre-serialised JSON string) to one player. */
  send(playerId: string, payload: ServerMessage | string): void;
  now(): number;
  tickRate: number;
  snapshotEvery: number;
}

/**
 * One squad: lobby -> mission -> results -> (play again | lobby).
 * Pure game logic; knows nothing about sockets, so it can be unit-tested directly.
 */
export class Room {
  phase: RoomPhase = 'lobby';
  hostId: string;
  settings: MissionSettings = defaultMissionSettings();
  readonly players = new Map<string, RoomPlayer>();
  sim: Sim | null = null;
  lastActivity: number;
  private lastSeq = new Map<string, number>();
  private lastInputAt = new Map<string, number>();
  private lastEnd: MissionEnd | null = null;

  constructor(
    readonly code: string,
    hostId: string,
    hostName: string,
    private readonly deps: RoomDeps,
    readonly quick = false,
  ) {
    this.hostId = hostId;
    this.lastActivity = deps.now();
    this.players.set(hostId, { id: hostId, name: hostName, slot: 0, hero: 0, connected: true });
  }

  // ------------------------------------------------------------ membership

  info(): RoomInfo {
    const players: PlayerInfo[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      hero: p.hero,
      connected: p.connected,
    }));
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: { ...this.settings },
      maxPlayers: GAME_CONFIG.mission.maxPlayers,
      quick: this.quick,
      players,
    };
  }

  private freeSlot(): number {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    for (let i = 0; i < GAME_CONFIG.mission.maxPlayers; i++) if (!used.has(i)) return i;
    return -1;
  }

  /**
   * Join in any phase. In the lobby/results the newcomer takes a seat; during a running mission they drop straight
   * in next to the squad (with a moment of protection) and the team gains a life.
   */
  addPlayer(id: string, name: string): Result {
    if (this.players.has(id)) return fail('bad_state', 'Already in this squad.');
    const slot = this.freeSlot();
    if (slot < 0) return fail('room_full', 'This squad is full (8 players).');
    if (this.phase === 'match' && (!this.sim || this.sim.phase === 'ended' || this.sim.decided))
      return fail('match_in_progress', 'This mission is just finishing. Try again in a moment.');
    this.players.set(id, { id, name, slot, hero: slot, connected: true });
    if (this.phase === 'match' && this.sim) this.sim.addPlayer({ id, name, slot, hero: slot });
    this.touch();
    this.broadcastRoom();
    if (this.phase === 'match' && this.sim) this.sendMatchStart(id);
    if (this.phase === 'results' && this.lastEnd) this.deps.send(id, this.lastEnd);
    return OK;
  }

  removePlayer(id: string): void {
    if (!this.players.delete(id)) return;
    this.lastSeq.delete(id);
    this.lastInputAt.delete(id);
    this.touch();
    if (this.hostId === id) this.transferHost();
    if (this.phase === 'match' && this.sim) {
      this.sim.removePlayer(id);
      if (this.sim.phase === 'ended') this.finishMatch();
    }
    this.broadcastRoom();
  }

  private transferHost(): void {
    const all = [...this.players.values()];
    const next = all.find((p) => p.connected) ?? all[0];
    if (next) this.hostId = next.id;
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    this.touch();
    if (!connected) {
      this.sim?.setInput(id, NEUTRAL_INPUT); // a dropped connection stops moving/shooting immediately
      if (this.hostId === id) this.transferHost();
    } else {
      this.lastSeq.delete(id);
    }
    this.broadcastRoom();
  }

  /** Re-send whatever state a resuming player needs. */
  resync(id: string): void {
    this.deps.send(id, { t: 'room', room: this.info() });
    if (this.phase === 'match' && this.sim) this.sendMatchStart(id);
    else if (this.phase === 'results' && this.lastEnd) this.deps.send(id, this.lastEnd);
  }

  humanCount(): number {
    return this.players.size;
  }

  hasConnectedPlayers(): boolean {
    for (const p of this.players.values()) if (p.connected) return true;
    return false;
  }

  /** A public mission that a "Play now" player can drop into: running, has a seat, and somebody is connected. */
  acceptsDropIn(): boolean {
    if (this.phase !== 'match' || !this.sim || this.sim.phase === 'ended' || this.sim.decided) return false;
    return this.freeSlot() >= 0 && this.hasConnectedPlayers();
  }

  // ------------------------------------------------------------ lobby actions

  setSettings(id: string, patch: SettingsPatch): Result {
    if (!this.players.has(id)) return fail('not_in_room', 'You are not in this squad.');
    if (id !== this.hostId) return fail('not_host', 'Only the host can change mission options.');
    if (this.phase !== 'lobby') return fail('bad_state', 'Options can only be changed in the lobby.');
    if (patch.difficulty !== undefined) this.settings.difficulty = patch.difficulty;
    if (patch.mission !== undefined) this.settings.mission = patch.mission;
    this.touch();
    this.broadcastRoom();
    return OK;
  }

  /** Choose a hero. Allowed between missions (lobby or results); takes effect at the next start. */
  setHero(id: string, hero: number): Result {
    const p = this.players.get(id);
    if (!p) return fail('not_in_room', 'You are not in this squad.');
    if (this.phase === 'match') return fail('bad_state', 'Pick your hero before the mission starts.');
    p.hero = hero;
    this.touch();
    this.broadcastRoom();
    return OK;
  }

  toLobby(id: string): Result {
    if (!this.players.has(id)) return fail('not_in_room', 'You are not in this squad.');
    if (id !== this.hostId) return fail('not_host', 'Only the host can return the squad to the lobby.');
    if (this.phase !== 'results') return fail('bad_state', 'The squad is not showing results.');
    this.phase = 'lobby';
    this.lastEnd = null;
    this.touch();
    this.broadcastRoom();
    return OK;
  }

  // ------------------------------------------------------------ mission lifecycle

  /** Start (from lobby) or play again (from results). Host only. */
  start(id: string): Result {
    if (!this.players.has(id)) return fail('not_in_room', 'You are not in this squad.');
    if (id !== this.hostId) return fail('not_host', 'Only the host can start the mission.');
    if (this.phase === 'match') return fail('bad_state', 'A mission is already running.');
    return this.begin();
  }

  /** Used by "Play now", which has no host to press Start. */
  begin(): Result {
    if (this.players.size < GAME_CONFIG.mission.minPlayers) return fail('bad_state', 'Nobody is here.');
    const sim = new Sim({
      seed: 1 + secureRandomInt(2 ** 31 - 2),
      settings: { ...this.settings },
      tickRate: this.deps.tickRate,
    });
    for (const p of this.players.values())
      sim.addPlayer({ id: p.id, name: p.name, slot: p.slot, hero: p.hero });
    this.sim = sim;
    this.lastSeq.clear();
    this.lastInputAt.clear();
    this.lastEnd = null;
    this.phase = 'match';
    this.touch();
    this.broadcastRoom();
    for (const p of this.players.values()) if (p.connected) this.sendMatchStart(p.id);
    return OK;
  }

  private sendMatchStart(id: string): void {
    if (!this.sim) return;
    this.deps.send(id, {
      t: 'matchStart',
      levelId: this.sim.level.id,
      tickRate: this.deps.tickRate,
      snapshotEvery: this.deps.snapshotEvery,
      you: id,
      snap: this.sim.snapshot(),
    });
  }

  /**
   * Accepts a *movement/fire intention* only. Stale or duplicated packets (seq not increasing) are dropped,
   * and everything is cleaned again inside Sim.setInput.
   */
  handleInput(
    id: string,
    seq: number,
    input: {
      mx: number;
      my: number;
      jump: boolean;
      fire: boolean;
      dash?: boolean;
      melee?: boolean;
      ult?: boolean;
      astra?: boolean;
      vt?: number;
    },
  ): void {
    if (this.phase !== 'match' || !this.sim) return;
    const p = this.players.get(id);
    if (!p || !p.connected) return;
    const last = this.lastSeq.get(id) ?? -1;
    if (seq <= last) return;
    this.lastSeq.set(id, seq);
    this.lastInputAt.set(id, this.sim.tick);
    this.sim.setInput(id, input);
    // Lag compensation: the input is applied on the next tick; the player was looking at tick `vt`.
    // Sim clamps this to [0, maxRewind], so an absurd or future `vt` cannot widen the rewind.
    if (input.vt !== undefined) this.sim.setViewLag(id, this.sim.tick + 1 - input.vt);
  }

  tick(): void {
    if (this.phase !== 'match' || !this.sim) return;
    this.dropStaleInputs(this.sim);
    this.sim.step();
    if (this.sim.phase === 'ended') {
      this.finishMatch();
      return;
    }
    if (this.sim.tick % this.deps.snapshotEvery === 0) this.sendSnapshot();
  }

  /** A client that stops sending (frozen/backgrounded tab) must not keep running and shooting. */
  private dropStaleInputs(sim: Sim): void {
    const maxAge = this.deps.tickRate; // 1 second
    for (const [id, tick] of this.lastInputAt) {
      if (sim.tick - tick > maxAge) {
        sim.setInput(id, NEUTRAL_INPUT);
        this.lastInputAt.delete(id);
      }
    }
  }

  private sendSnapshot(): void {
    const sim = this.sim;
    if (!sim) return;
    const snapJson = JSON.stringify(sim.snapshot());
    const evJson = JSON.stringify(sim.drainEvents());
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      const ack = this.lastSeq.get(p.id) ?? 0;
      this.deps.send(p.id, `{"t":"snap","ack":${ack},"s":${snapJson},"ev":${evJson}}`);
    }
  }

  private finishMatch(): void {
    const sim = this.sim;
    if (!sim) return;
    this.sendSnapshot(); // the final state and the 'end' event
    const board: BoardEntry[] = sim.board();
    const end: MissionEnd = {
      t: 'matchEnd',
      result: sim.result ?? 'failed',
      ...(sim.failReason ? { reason: sim.failReason } : {}),
      timeSec: Math.round(sim.tick / sim.tickRate),
      score: sim.score,
      livesLeft: sim.lives,
      board,
    };
    this.lastEnd = end;
    this.sim = null;
    this.phase = 'results';
    this.touch();
    for (const p of this.players.values()) if (p.connected) this.deps.send(p.id, end);
    this.broadcastRoom();
  }

  // ------------------------------------------------------------ housekeeping

  touch(): void {
    this.lastActivity = this.deps.now();
  }

  isExpired(now: number, lobbyMs: number, resultsMs: number): boolean {
    if (this.phase === 'lobby') return now - this.lastActivity > lobbyMs;
    if (this.phase === 'results') return now - this.lastActivity > resultsMs;
    return false; // missions end on their own (victory, defeat or the time cap)
  }

  broadcastRoom(): void {
    const msg: ServerMessage = { t: 'room', room: this.info() };
    for (const p of this.players.values()) if (p.connected) this.deps.send(p.id, msg);
  }

  broadcast(msg: ServerMessage): void {
    for (const p of this.players.values()) if (p.connected) this.deps.send(p.id, msg);
  }
}

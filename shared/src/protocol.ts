import type { Difficulty, MissionId, MissionSettings } from './config';
import type { FailReason, MissionResult, SimEvent, Snapshot } from './sim';

/**
 * Bumped whenever the wire protocol changes incompatibly, or the missions change shape (the server and the page
 * build the same level from shared code, so an old server and a new page must not play together).
 * 6: the Astra Saga stages were rebuilt.
 * 7: saga boss styles and moves, portal / ground / elite waves, secret pickups (new events and snapshot fields).
 */
export const PROTOCOL_VERSION = 7;

/** Unambiguous alphabet (no I, L, O, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_REGEX = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const NAME_REGEX = /^[\p{L}\p{N} _.-]+$/u;

// ---------------------------------------------------------------- client -> server

/** Mission options the host can change in the lobby. */
export interface SettingsPatch {
  difficulty?: Difficulty;
  mission?: MissionId;
}

export type ClientMessage =
  | { t: 'hello'; v: typeof PROTOCOL_VERSION; name: string; resume?: string }
  /** `open`: a public squad that "Play now" players can drop into. */
  | { t: 'createRoom'; settings?: SettingsPatch; open?: boolean }
  | { t: 'joinRoom'; code: string }
  | { t: 'leaveRoom' }
  | { t: 'setSettings'; settings: SettingsPatch }
  /** Pick a hero (look + colour). Lobby or results screen. */
  | { t: 'setHero'; hero: number }
  | { t: 'startMatch' }
  | {
      t: 'input';
      seq: number;
      /** -1, 0 or 1 */
      mx: number;
      my: number;
      jump: boolean;
      fire: boolean;
      /** Dash (Down + Dash: slide), knife, hero super move. Optional (false when missing). */
      dash?: boolean;
      melee?: boolean;
      ult?: boolean;
      /** Fire the held power (astra) or the team brahmastra. Optional. */
      astra?: boolean;
      /** Server tick the client is displaying when it sampled this input (lag compensation). Optional. */
      vt?: number;
    }
  | { t: 'rematch' }
  | { t: 'toLobby' }
  /** Join a public mission already in progress, or start a new public one right away. */
  | { t: 'quickMatch' }
  | { t: 'ping'; ts: number };

export type ClientMessageType = ClientMessage['t'];

// ---------------------------------------------------------------- server -> client

export type ErrorCode =
  | 'bad_message'
  | 'bad_version'
  | 'rate_limited'
  | 'not_ready'
  | 'room_not_found'
  | 'room_expired'
  | 'already_in_room'
  | 'room_full'
  | 'match_in_progress'
  | 'not_host'
  | 'not_in_room'
  | 'bad_state'
  | 'too_many_connections'
  | 'server_busy'
  | 'session_expired'
  | 'internal';

export type RoomPhase = 'lobby' | 'match' | 'results';

export interface PlayerInfo {
  id: string;
  name: string;
  /** Seat 0..7. */
  slot: number;
  /** Hero 0..7 (look + colour). */
  hero: number;
  connected: boolean;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  phase: RoomPhase;
  settings: MissionSettings;
  maxPlayers: number;
  quick: boolean;
  players: PlayerInfo[];
}

export interface BoardEntry {
  id: string;
  name: string;
  slot: number;
  hero: number;
  kills: number;
  deaths: number;
  bestCombo: number;
  /** Best style rank reached (-1 none, 0 = C … 5 = SSS). */
  rank: number;
  /** Super moves unleashed. */
  ults: number;
  bossDamage: number;
  score: number;
}

export interface MissionEnd {
  t: 'matchEnd';
  result: MissionResult;
  reason?: FailReason;
  /** Mission time in seconds. */
  timeSec: number;
  score: number;
  livesLeft: number;
  board: BoardEntry[];
}

export type ServerMessage =
  | { t: 'welcome'; v: number; id: string; token: string; name: string; resumed: boolean }
  | { t: 'room'; room: RoomInfo }
  | { t: 'left' }
  | {
      t: 'matchStart';
      levelId: string;
      tickRate: number;
      snapshotEvery: number;
      you: string;
      snap: Snapshot;
    }
  | { t: 'snap'; s: Snapshot; ev: SimEvent[]; ack: number }
  | MissionEnd
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: ErrorCode; message: string };

export type ServerMessageType = ServerMessage['t'];

/** Cheap structural guard used by the client for incoming server messages. */
export function isServerMessage(v: unknown): v is ServerMessage {
  return typeof v === 'object' && v !== null && typeof (v as { t?: unknown }).t === 'string';
}

export function buildJoinPath(code: string): string {
  return `/join/${encodeURIComponent(code)}`;
}

/** Extract a room code from `/join/CODE` (or a bare code) – returns null when it isn't a valid code. */
export function parseJoinPath(pathOrCode: string): string | null {
  const m = /^\/?(?:join\/)?([A-Za-z0-9]{6})\/?$/.exec(pathOrCode.trim());
  const code = m?.[1]?.toUpperCase();
  return code && ROOM_CODE_REGEX.test(code) ? code : null;
}

import { isMissionId, type Difficulty, type MissionId } from '@strikesquad/shared';

/**
 * Which missions this player has completed (best time, hardest difficulty), kept on this device only. It is a
 * convenience for the mission menus, so a blocked or wiped storage simply shows no ticks.
 */
export interface MissionRecord {
  /** Best winning time in seconds. */
  best: number;
  hardest: Difficulty;
}

const KEY = 'strikesquad.progress.v1';
const RANK: Record<Difficulty, number> = { easy: 0, normal: 1, hard: 2 };

export class ProgressStore {
  private data: Partial<Record<MissionId, MissionRecord>>;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    this.data = sanitize(read(storage));
  }

  get(id: MissionId): MissionRecord | undefined {
    return this.data[id];
  }

  /** Record a win; returns true when it is the first time this mission was completed. */
  won(id: MissionId, timeSec: number, difficulty: Difficulty): boolean {
    const prev = this.data[id];
    this.data[id] = {
      best: prev ? Math.min(prev.best, timeSec) : timeSec,
      hardest: prev && RANK[prev.hardest] > RANK[difficulty] ? prev.hardest : difficulty,
    };
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked: progress just won't persist */
    }
    return !prev;
  }
}

function sanitize(raw: unknown): Partial<Record<MissionId, MissionRecord>> {
  const out: Partial<Record<MissionId, MissionRecord>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isMissionId(k) || typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    const best = typeof r.best === 'number' && Number.isFinite(r.best) && r.best > 0 ? r.best : null;
    const hardest = r.hardest === 'easy' || r.hardest === 'normal' || r.hardest === 'hard' ? r.hardest : null;
    if (best !== null && hardest) out[k] = { best, hardest };
  }
  return out;
}

function read(storage: Pick<Storage, 'getItem'> | null): unknown {
  try {
    const text = storage?.getItem(KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

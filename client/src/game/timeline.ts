import type { BulletSnapshot, EnemySnapshot, PlayerSnapshot, Snapshot } from '@strikesquad/shared';

interface Entry {
  t: number;
  s: Snapshot;
}

/** Jumps larger than this between two snapshots are teleports (respawn, drop-in) and are not slid across. */
const TELEPORT = 120;

function lerpById<T extends { id: string | number; x: number; y: number }>(
  a: readonly T[],
  b: readonly T[],
  f: number,
): T[] {
  const prev = new Map<string | number, T>();
  for (const x of a) prev.set(x.id, x);
  return b.map((xb) => {
    const xa = prev.get(xb.id);
    if (!xa || Math.abs(xb.x - xa.x) + Math.abs(xb.y - xa.y) > TELEPORT) return xb;
    return { ...xb, x: xa.x + (xb.x - xa.x) * f, y: xa.y + (xb.y - xa.y) * f };
  });
}

/**
 * Buffers snapshots on a server-time axis (seconds) and produces an interpolated frame for any render time.
 * Other players and enemies are drawn slightly in the past so there are always two snapshots to blend.
 */
export class Timeline {
  private entries: Entry[] = [];

  clear(): void {
    this.entries = [];
  }

  get size(): number {
    return this.entries.length;
  }

  latest(): Snapshot | null {
    return this.entries.at(-1)?.s ?? null;
  }

  /** Out-of-order or duplicate snapshots (older than the newest we have) are ignored. */
  push(t: number, s: Snapshot): boolean {
    const last = this.entries.at(-1);
    if (last && t <= last.t) return false;
    this.entries.push({ t, s });
    if (this.entries.length > 40) this.entries.splice(0, this.entries.length - 40);
    return true;
  }

  /** Interpolated frame at server time `t`. Holds the first/last snapshot outside the buffered range. */
  sample(t: number): Snapshot | null {
    const n = this.entries.length;
    if (n === 0) return null;
    const first = this.entries[0] as Entry;
    const last = this.entries[n - 1] as Entry;
    if (n === 1 || t >= last.t) return extrapolateBullets(last.s, Math.min(0.1, Math.max(0, t - last.t)));
    if (t <= first.t) return first.s;
    let i = n - 2;
    while (i > 0 && (this.entries[i] as Entry).t > t) i--;
    const a = this.entries[i] as Entry;
    const b = this.entries[i + 1] as Entry;
    const f = (t - a.t) / (b.t - a.t);
    return {
      ...b.s,
      players: lerpById<PlayerSnapshot>(a.s.players, b.s.players, f),
      enemies: lerpById<EnemySnapshot>(a.s.enemies, b.s.enemies, f),
      bullets: lerpById<BulletSnapshot>(a.s.bullets, b.s.bullets, f),
    };
  }
}

/** Bullets fly straight, so running slightly past the newest snapshot can extend them cosmetically. */
function extrapolateBullets(s: Snapshot, dt: number): Snapshot {
  if (dt <= 0 || s.bullets.length === 0) return s;
  return { ...s, bullets: s.bullets.map((b) => ({ ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt })) };
}

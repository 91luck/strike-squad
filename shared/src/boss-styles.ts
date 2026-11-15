import { type AttackId, type BossKind, type TrooperKind } from './config';

/**
 * Boss styles (Astra Saga): every saga boss fights its own way.
 *
 * A boss body (walker, gunship, fortress) decides how it moves and where its guns sit; its style decides which
 * attacks it uses and in what order, phase by phase. Each style mixes the body's classic attacks with the shared
 * saga moves (`ATTACK.rain` … `ATTACK.summon`), so no two saga bosses repeat the same fight. The client draws each
 * style with its own body (see client/src/game/asura-art.ts); the simulation only reads `cycles` and `summon`.
 *
 * Rules of thumb used for the tables below (they keep fights fair):
 * - phase 1 teaches two or three moves, later phases add one new threat at a time;
 * - a wide move (rain, ring, spiral) is followed by a plain one, never by another wide one;
 * - the stage-1 bosses stay gentle; every later boss gets at least one move no earlier boss used in that body.
 */
export interface BossStyle {
  id: string;
  /** The body this style was written for (checked by tests: walkers leap, gunships and fortresses do not). */
  body: BossKind;
  /** Attack order for phase 1, 2 and (fortress only) 3; a missing phase reuses the last one. */
  cycles: AttackId[][];
  /** What `ATTACK.summon` calls in (default soldiers). */
  summon?: TrooperKind;
  /** How reinforcements arrive: rising out of the ground or through a portal (default portal). */
  entry?: 'U' | 'P';
}

const list: BossStyle[] = [
  // ---- 1 Agnivan fights its own boss (the Vriksh-asur, `vriksha`): no style here
  // ---- 2 Sagar Setu fights its own boss (Chhaya, `chhaya`): no style here
  // ---- 3 Vayu Shikhar fights its own boss (Aandhi, `aandhi`): no style here
  // ---- 4 Naag Lok fights its own boss (Vishdhar, `vishdhar`): no style here
  // ---- 5 Maya Nagri fights its own boss (Darpan-asur, `darpan`): no style here
  // ---- 6 Bhasm Parvat fights its own boss (Raakhasur, `raakhasur`): no style here
  // ---- 7 Samarpan Maidan fights its own boss (Maniyodha, `maniyodha`): no style here
  // ---- 8 Chakra Durg fights its own boss (Suryakavach, `suryakavach`): no style here
  // ---- 9 Dwand Bhoomi fights its own boss (Jodasur, `jodasur`): no style here
  // ---- 10 Suvarna fights its own boss (Saptashir, `saptashir`): no style here
];

export const BOSS_STYLES: Readonly<Record<string, BossStyle>> = Object.fromEntries(
  list.map((s) => [s.id, s]),
);
export const BOSS_STYLE_IDS: readonly string[] = list.map((s) => s.id);

/** The style id an arena name gives its bosses ("MAHA-ASUR KAAL" → "maha-asur-kaal"), or null if none. */
export function styleOf(arenaName: string): BossStyle | null {
  return BOSS_STYLES[arenaName.toLowerCase().replace(/[^a-z0-9]+/g, '-')] ?? null;
}

/** The attack a style uses next: `cycle` counts attacks so far, `phase` is 1..3. */
export function nextStyleAttack(s: BossStyle, phase: number, cycle: number): AttackId {
  const c = s.cycles[Math.min(phase, s.cycles.length) - 1] as AttackId[];
  return c[cycle % c.length] as AttackId;
}

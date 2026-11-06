import { ATTACK, type AttackId, type BossKind, type TrooperKind } from './config';

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

const {
  cannon,
  mg,
  charge,
  stomp,
  bombs,
  missiles,
  troops,
  strafe,
  volley,
  beamLow,
  beamHigh,
  slam,
  rain,
  ring,
  spiral,
  leap,
  blink,
  summon,
} = ATTACK;

const list: BossStyle[] = [
  // ---- 1 Agnivan: fire
  {
    id: 'jwala-asur',
    body: 'walker',
    cycles: [
      [cannon, charge, rain],
      [rain, charge, stomp, cannon],
    ],
  },
  {
    id: 'agni-daitya',
    body: 'boss',
    cycles: [
      [volley, rain, beamLow],
      [rain, volley, slam, beamHigh],
      [rain, beamLow, slam, rain, volley],
    ],
  },
  // ---- 2 Sagar Setu: water
  {
    id: 'makara',
    body: 'gunship',
    cycles: [
      [strafe, ring, bombs],
      [ring, missiles, bombs, ring, strafe],
    ],
  },
  {
    id: 'samudra-rakshas',
    body: 'boss',
    cycles: [
      [ring, beamLow, volley],
      [slam, ring, beamHigh, slam],
      [ring, slam, beamLow, ring, beamHigh],
    ],
  },
  // ---- 3 Vayu Shikhar: wind and thunder
  {
    id: 'garjan-rakshas',
    body: 'gunship',
    cycles: [
      [strafe, rain, missiles],
      [rain, strafe, summon, rain, missiles],
    ],
    summon: 'jetpack',
    entry: 'P',
  },
  {
    id: 'vayu-daitya',
    body: 'boss',
    cycles: [
      [spiral, beamHigh, volley],
      [spiral, rain, beamLow, volley],
      [rain, spiral, beamHigh, slam],
    ],
  },
  // ---- 4 Naag Lok: serpents
  {
    id: 'vish-naag',
    body: 'walker',
    cycles: [
      [mg, leap, charge],
      [leap, spiral, leap, charge],
    ],
  },
  {
    id: 'visharaj',
    body: 'boss',
    cycles: [
      [volley, summon, beamLow],
      [spiral, beamLow, summon, slam],
      [spiral, beamHigh, ring, summon],
    ],
    summon: 'soldier',
    entry: 'U',
  },
  // ---- 5 Maya Nagri: illusions
  {
    id: 'chhaya-asur',
    body: 'gunship',
    cycles: [
      [blink, strafe, blink, missiles],
      [blink, spiral, blink, bombs, troops],
    ],
  },
  {
    id: 'maya-senapati',
    body: 'boss',
    cycles: [
      [ring, beamHigh, volley, beamLow],
      [ring, summon, spiral, beamLow],
      [spiral, ring, beamHigh, beamLow],
    ],
    summon: 'shield',
    entry: 'P',
  },
  // ---- 6 Bhasm Parvat: ash and ghosts
  {
    id: 'bhasma-pret',
    body: 'walker',
    cycles: [
      [blink, mg, blink, cannon],
      [blink, ring, blink, stomp, mg],
    ],
  },
  {
    id: 'kaal-pret',
    body: 'boss',
    cycles: [
      [rain, beamLow, ring],
      [summon, rain, beamHigh, ring],
      [rain, ring, slam, beamLow, summon],
    ],
    summon: 'soldier',
    entry: 'U',
  },
  // ---- 7 Samarpan Maidan: the war field
  {
    id: 'ran-bhairav',
    body: 'walker',
    cycles: [
      [charge, stomp, charge, cannon],
      [leap, charge, summon, stomp, charge],
    ],
    summon: 'shield',
    entry: 'P',
  },
  {
    id: 'ran-guru',
    body: 'boss',
    cycles: [
      [volley, summon, beamLow, beamHigh],
      [rain, volley, slam, summon],
      [rain, ring, beamLow, slam, volley],
    ],
    summon: 'grenadier',
    entry: 'P',
  },
  // ---- 8 Chakra Durg: wheels and blades
  {
    id: 'chakravyuh',
    body: 'walker',
    cycles: [
      [spiral, charge, cannon],
      [spiral, leap, charge, mg],
    ],
  },
  {
    id: 'chakra-vimana',
    body: 'gunship',
    cycles: [
      [spiral, bombs, strafe],
      [spiral, missiles, troops, spiral, bombs],
    ],
  },
  {
    id: 'vyuh-senani',
    body: 'boss',
    cycles: [
      [spiral, volley, beamLow],
      [spiral, summon, slam, beamHigh],
      [spiral, ring, beamLow, spiral, slam],
    ],
    summon: 'shield',
    entry: 'P',
  },
  // ---- 9 Dwand Bhoomi: duels
  {
    id: 'dwand-yodha',
    body: 'walker',
    cycles: [
      [charge, mg, leap, cannon],
      [blink, charge, leap, ring, mg],
    ],
  },
  {
    id: 'dwand-raj',
    body: 'boss',
    cycles: [
      [volley, ring, beamHigh],
      [ring, rain, slam, beamLow],
      [spiral, ring, rain, beamHigh, slam],
    ],
  },
  // ---- 10 Mahayuddh: everything at once
  {
    id: 'shesh-daitya',
    body: 'walker',
    cycles: [
      [spiral, leap, mg],
      [spiral, rain, leap, ring, charge],
    ],
  },
  {
    id: 'vajra-vimana',
    body: 'gunship',
    cycles: [
      [rain, strafe, missiles, troops],
      [rain, ring, bombs, rain, missiles],
    ],
  },
  {
    id: 'maha-asur-kaal',
    body: 'boss',
    cycles: [
      [rain, volley, spiral, beamLow],
      [ring, rain, summon, beamHigh, slam],
      [rain, spiral, ring, beamLow, slam, summon],
    ],
    summon: 'soldier',
    entry: 'U',
  },
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

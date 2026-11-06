import {
  ATTACK,
  BEAM,
  GAME_CONFIG,
  type AttackId,
  type BossStyle,
  type EnemySnapshot,
} from '@strikesquad/shared';
import { drawEyes, ell, limb, lit, poly, prog, type AtkInfo, type BossKit } from './boss-art';
import { tone } from './sprites';

/**
 * Astra Saga bosses: one body per boss style (shared/src/boss-styles.ts), built from parts so every saga boss has
 * its own silhouette, colours and aura instead of a recoloured copy of the same demon.
 *
 *   walker  forms: beast (four legs), serpent (coils and hoods), warrior (a striding giant), wraith (floating)
 *   gunship forms: makara (flying sea beast), cloud (storm rider), shadow (mask and cloak), vimana (sky chariot)
 *   fortress: a seated asura king on a stage throne, with 1, 3 or 5 heads and 2, 4 or 6 arms
 *
 * Anchor points match the simulation's guns (see Sim.stepWarhound / stepVulture / stepFortress / castPoint), so
 * every shot leaves the part that is drawn firing it, and every move has a tell before it lands.
 */

type Ctx = CanvasRenderingContext2D;
const INK = '#120f17';

type Head = 'horns' | 'naga' | 'tusks' | 'beak' | 'skull' | 'crown' | 'mane' | 'mask' | 'makara' | 'jata';
type Weapon = 'mace' | 'trishul' | 'sword' | 'bow' | 'chakra' | 'axe' | 'conch' | 'noose' | 'vajra';
type Aura = 'fire' | 'water' | 'wind' | 'poison' | 'ash' | 'maya' | 'storm' | 'gold' | 'blood' | 'cosmos';

export interface AsuraLook {
  /** Skin, its shade, cloth/armour, ornaments, and the glow of eyes, core and tells. */
  skin: string;
  shade: string;
  cloth: string;
  metal: string;
  glow: string;
  head: Head;
  heads?: 1 | 3 | 5;
  arms?: 2 | 4 | 6;
  weapon: Weapon;
  aura: Aura;
  walker?: 'beast' | 'serpent' | 'warrior' | 'wraith';
  flyer?: 'makara' | 'cloud' | 'shadow' | 'vimana';
  throne?: 'lava' | 'coral' | 'cloud' | 'coils' | 'palace' | 'bones' | 'chariot' | 'fort' | 'gold' | 'cosmos';
}

/** One look per boss style id. */
export const ASURA_LOOKS: Record<string, AsuraLook> = {
  // 1 Agnivan
  'jwala-asur': {
    skin: '#c2410c',
    shade: '#7c2d12',
    cloth: '#451a03',
    metal: '#fbbf24',
    glow: '#fde047',
    head: 'mane',
    weapon: 'trishul',
    aura: 'fire',
    walker: 'beast',
  },
  'agni-daitya': {
    skin: '#b91c1c',
    shade: '#7f1d1d',
    cloth: '#1c1917',
    metal: '#f59e0b',
    glow: '#fb923c',
    head: 'horns',
    arms: 4,
    weapon: 'trishul',
    aura: 'fire',
    throne: 'lava',
  },
  // 2 Sagar Setu
  makara: {
    skin: '#0f766e',
    shade: '#134e4a',
    cloth: '#164e63',
    metal: '#e0f2fe',
    glow: '#67e8f9',
    head: 'makara',
    weapon: 'conch',
    aura: 'water',
    flyer: 'makara',
  },
  'samudra-rakshas': {
    skin: '#1d4ed8',
    shade: '#1e3a8a',
    cloth: '#0e7490',
    metal: '#f0abfc',
    glow: '#a5f3fc',
    head: 'jata',
    arms: 4,
    weapon: 'noose',
    aura: 'water',
    throne: 'coral',
  },
  // 3 Vayu Shikhar
  'garjan-rakshas': {
    skin: '#475569',
    shade: '#1e293b',
    cloth: '#334155',
    metal: '#facc15',
    glow: '#93c5fd',
    head: 'jata',
    weapon: 'vajra',
    aura: 'storm',
    flyer: 'cloud',
  },
  'vayu-daitya': {
    skin: '#94a3b8',
    shade: '#475569',
    cloth: '#e2e8f0',
    metal: '#38bdf8',
    glow: '#e0f2fe',
    head: 'beak',
    arms: 4,
    weapon: 'chakra',
    aura: 'wind',
    throne: 'cloud',
  },
  // 4 Naag Lok
  'vish-naag': {
    skin: '#15803d',
    shade: '#14532d',
    cloth: '#facc15',
    metal: '#fde047',
    glow: '#bef264',
    head: 'naga',
    weapon: 'noose',
    aura: 'poison',
    walker: 'serpent',
  },
  visharaj: {
    skin: '#166534',
    shade: '#052e16',
    cloth: '#4d7c0f',
    metal: '#facc15',
    glow: '#a3e635',
    head: 'naga',
    heads: 5,
    arms: 4,
    weapon: 'trishul',
    aura: 'poison',
    throne: 'coils',
  },
  // 5 Maya Nagri
  'chhaya-asur': {
    skin: '#e9d5ff',
    shade: '#6b21a8',
    cloth: '#3b0764',
    metal: '#f0abfc',
    glow: '#e879f9',
    head: 'mask',
    weapon: 'sword',
    aura: 'maya',
    flyer: 'shadow',
  },
  'maya-senapati': {
    skin: '#7e22ce',
    shade: '#4c1d95',
    cloth: '#1e1b4b',
    metal: '#f9a8d4',
    glow: '#f0abfc',
    head: 'mask',
    heads: 3,
    arms: 6,
    weapon: 'sword',
    aura: 'maya',
    throne: 'palace',
  },
  // 6 Bhasm Parvat
  'bhasma-pret': {
    skin: '#d6d3d1',
    shade: '#57534e',
    cloth: '#292524',
    metal: '#a8a29e',
    glow: '#5eead4',
    head: 'skull',
    weapon: 'axe',
    aura: 'ash',
    walker: 'wraith',
  },
  'kaal-pret': {
    skin: '#e7e5e4',
    shade: '#44403c',
    cloth: '#0c0a09',
    metal: '#78716c',
    glow: '#2dd4bf',
    head: 'skull',
    heads: 3,
    arms: 4,
    weapon: 'noose',
    aura: 'ash',
    throne: 'bones',
  },
  // 7 Samarpan Maidan
  'ran-bhairav': {
    skin: '#78350f',
    shade: '#451a03',
    cloth: '#b91c1c',
    metal: '#fbbf24',
    glow: '#fca5a5',
    head: 'tusks',
    arms: 4,
    weapon: 'mace',
    aura: 'blood',
    walker: 'warrior',
  },
  'ran-guru': {
    skin: '#a16207',
    shade: '#713f12',
    cloth: '#f8fafc',
    metal: '#fde047',
    glow: '#fef3c7',
    head: 'crown',
    arms: 4,
    weapon: 'bow',
    aura: 'gold',
    throne: 'chariot',
  },
  // 8 Chakra Durg
  chakravyuh: {
    skin: '#9a3412',
    shade: '#431407',
    cloth: '#1f2937',
    metal: '#e5e7eb',
    glow: '#fdba74',
    head: 'horns',
    arms: 4,
    weapon: 'chakra',
    aura: 'blood',
    walker: 'warrior',
  },
  'chakra-vimana': {
    skin: '#57534e',
    shade: '#292524',
    cloth: '#b45309',
    metal: '#e5e7eb',
    glow: '#fb923c',
    head: 'horns',
    weapon: 'chakra',
    aura: 'fire',
    flyer: 'vimana',
  },
  'vyuh-senani': {
    skin: '#334155',
    shade: '#0f172a',
    cloth: '#991b1b',
    metal: '#cbd5e1',
    glow: '#f87171',
    head: 'crown',
    arms: 6,
    weapon: 'chakra',
    aura: 'blood',
    throne: 'fort',
  },
  // 9 Dwand Bhoomi
  'dwand-yodha': {
    skin: '#b45309',
    shade: '#78350f',
    cloth: '#1d4ed8',
    metal: '#fde68a',
    glow: '#fde047',
    head: 'jata',
    weapon: 'sword',
    aura: 'gold',
    walker: 'warrior',
  },
  'dwand-raj': {
    skin: '#ca8a04',
    shade: '#854d0e',
    cloth: '#7f1d1d',
    metal: '#fef9c3',
    glow: '#fde047',
    head: 'crown',
    heads: 3,
    arms: 4,
    weapon: 'mace',
    aura: 'gold',
    throne: 'gold',
  },
  // 10 Mahayuddh
  'shesh-daitya': {
    skin: '#1e3a8a',
    shade: '#172554',
    cloth: '#fbbf24',
    metal: '#fde68a',
    glow: '#c4b5fd',
    head: 'naga',
    heads: 5,
    weapon: 'trishul',
    aura: 'cosmos',
    walker: 'serpent',
  },
  'vajra-vimana': {
    skin: '#1e3a8a',
    shade: '#0f172a',
    cloth: '#facc15',
    metal: '#fef08a',
    glow: '#93c5fd',
    head: 'crown',
    weapon: 'vajra',
    aura: 'storm',
    flyer: 'vimana',
  },
  'maha-asur-kaal': {
    skin: '#1c1917',
    shade: '#0c0a09',
    cloth: '#7f1d1d',
    metal: '#fbbf24',
    glow: '#ef4444',
    head: 'crown',
    heads: 5,
    arms: 6,
    weapon: 'trishul',
    aura: 'cosmos',
    throne: 'cosmos',
  },
};

/** The line under each boss's name on its WARNING card. */
export const BOSS_TITLES: Record<string, string> = {
  'jwala-asur': 'The fire lion of the burning forest',
  'agni-daitya': 'Lord of the flames, four arms of fire',
  makara: 'The sea beast that flies over the waves',
  'samudra-rakshas': 'King of the deep, ruler of the tides',
  'garjan-rakshas': 'The thunder rider in the storm cloud',
  'vayu-daitya': 'Bird-faced lord of the howling wind',
  'vish-naag': 'The venom serpent of the underworld',
  visharaj: 'Five-hooded king of the nagas',
  'chhaya-asur': 'The shadow that is never where it seems',
  'maya-senapati': 'Six-armed general of illusions',
  'bhasma-pret': 'The ash ghost: here, then gone',
  'kaal-pret': 'The three-skulled lord of the dead',
  'ran-bhairav': 'The tusked war giant of the battlefield',
  'ran-guru': 'The archer king on his golden chariot',
  chakravyuh: 'The blade-wheel warriors of the fort',
  'chakra-vimana': 'The sky chariot of spinning wheels',
  'vyuh-senani': 'Six-armed keeper of the chakra fort',
  'dwand-yodha': 'The champion who has never lost a duel',
  'dwand-raj': 'Three-faced king of the duelling ground',
  'shesh-daitya': 'The thousand-hooded serpent of the end',
  'vajra-vimana': 'The thunderbolt chariot of the last war',
  'maha-asur-kaal': 'Five heads, six arms: the end of all things',
};

const MOVE_TIP: Partial<Record<AttackId, string>> = {
  [ATTACK.rain]: 'FIRE RAIN: step off the red rings',
  [ATTACK.ring]: 'RING OF SHOTS: slip through a gap',
  [ATTACK.spiral]: 'SPINNING STREAM: circle round it',
  [ATTACK.leap]: 'LEAP: jump the shockwave',
  [ATTACK.blink]: 'VANISHES: turn around fast',
  [ATTACK.summon]: 'CALLS WARRIORS: watch the portals',
};

/** Short tips for the saga moves a style uses, in the order it first uses them. */
export function sagaMoveTips(s: BossStyle): string[] {
  const seen: string[] = [];
  for (const cycle of s.cycles)
    for (const a of cycle) {
      const tip = MOVE_TIP[a];
      if (tip && !seen.includes(tip)) seen.push(tip);
    }
  return seen.slice(0, 3);
}

// ------------------------------------------------------------------ shared parts

const AURA_FX: Record<
  Aura,
  { color: string; add: boolean; vy: number; vx: number; size: number; grow: number }
> = {
  fire: { color: 'rgba(251,146,60,0.85)', add: true, vy: -70, vx: 0, size: 5, grow: -5 },
  water: { color: 'rgba(103,232,249,0.7)', add: true, vy: -30, vx: 0, size: 4, grow: 2 },
  wind: { color: 'rgba(226,232,240,0.6)', add: false, vy: -10, vx: -90, size: 3, grow: 6 },
  poison: { color: 'rgba(163,230,53,0.7)', add: true, vy: -40, vx: 0, size: 5, grow: 3 },
  ash: { color: 'rgba(168,162,158,0.7)', add: false, vy: 35, vx: 10, size: 4, grow: 2 },
  maya: { color: 'rgba(240,171,252,0.85)', add: true, vy: -20, vx: 0, size: 3, grow: -2 },
  storm: { color: 'rgba(147,197,253,0.9)', add: true, vy: -10, vx: 0, size: 3, grow: -2 },
  gold: { color: 'rgba(253,224,71,0.85)', add: true, vy: -40, vx: 0, size: 3, grow: -2 },
  blood: { color: 'rgba(239,68,68,0.75)', add: true, vy: -50, vx: 0, size: 4, grow: -3 },
  cosmos: { color: 'rgba(196,181,253,0.85)', add: true, vy: -30, vx: 0, size: 3, grow: -1 },
};

/** Aura particles around a box (world coords). `chance` per frame. */
function aura(k: BossKit, L: AsuraLook, x: number, y: number, w: number, h: number, chance: number): void {
  if (k.reduce || Math.random() > chance) return;
  const a = AURA_FX[L.aura];
  k.add({
    x: x + (Math.random() - 0.5) * w,
    y: y - Math.random() * h,
    vx: a.vx * (0.5 + Math.random()) + (Math.random() - 0.5) * 20,
    vy: a.vy * (0.6 + Math.random() * 0.8),
    life: 0.6 + Math.random() * 0.6,
    size: a.size,
    color: a.color,
    add: a.add,
    grow: a.grow,
  });
}

/** A head facing +x centred at (x, y), `s` its scale. Returns where the eyes are (for the glow). */
function head(k: BossKit, L: AsuraLook, x: number, y: number, s: number, flash: boolean, ph: number): void {
  const ctx = k.ctx;
  const S = lit(flash);
  const skin = S(L.skin);
  switch (L.head) {
    case 'horns':
      limb(ctx, [x - 8 * s, y - 12 * s, x - 22 * s, y - 30 * s, x - 14 * s, y - 44 * s], 6 * s, L.metal);
      limb(ctx, [x + 8 * s, y - 12 * s, x + 20 * s, y - 32 * s, x + 30 * s, y - 40 * s], 6 * s, L.metal);
      ell(ctx, x, y, 17 * s, 16 * s, skin);
      poly(ctx, [x + 4 * s, y + 8 * s, x + 18 * s, y + 6 * s, x + 12 * s, y + 18 * s], tone(L.skin, -0.3));
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 6 * s, y + 10 * s, 3 * s, 5 * s); // fang
      break;
    case 'mane':
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 1.5;
        poly(
          ctx,
          [
            x + Math.cos(a - 0.2) * 16 * s,
            y + Math.sin(a - 0.2) * 16 * s,
            x + Math.cos(a) * 34 * s,
            y + Math.sin(a) * 34 * s,
            x + Math.cos(a + 0.2) * 16 * s,
            y + Math.sin(a + 0.2) * 16 * s,
          ],
          S(i % 2 ? L.metal : tone(L.metal, -0.25)),
          false,
        );
      }
      ell(ctx, x + 4 * s, y, 18 * s, 16 * s, skin);
      ell(ctx, x + 18 * s, y + 6 * s, 10 * s, 8 * s, tone(L.skin, 0.15)); // muzzle
      ctx.fillStyle = INK;
      ctx.fillRect(x + 22 * s, y + 2 * s, 5 * s, 3 * s);
      break;
    case 'naga': {
      // A cobra hood: flared, with a spectacle mark; the head at the top front.
      ell(ctx, x - 4 * s, y + 6 * s, 20 * s, 26 * s, skin);
      ell(ctx, x - 4 * s, y + 10 * s, 12 * s, 18 * s, S(L.cloth), false);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x - 9 * s, y + 4 * s, 4 * s, 0, Math.PI * 2);
      ctx.arc(x + 1 * s, y + 4 * s, 4 * s, 0, Math.PI * 2);
      ctx.stroke();
      ell(ctx, x + 10 * s, y - 16 * s, 13 * s, 9 * s, skin);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 22 * s, y - 14 * s);
      ctx.lineTo(x + 30 * s, y - 12 * s);
      ctx.lineTo(x + 34 * s, y - 16 * s);
      ctx.moveTo(x + 30 * s, y - 12 * s);
      ctx.lineTo(x + 34 * s, y - 9 * s);
      ctx.stroke();
      drawEyes(k, [x + 12 * s, y - 18 * s], L.glow, false, 0, ph, true);
      return;
    }
    case 'tusks':
      // Ears, a trunk curling forward, two long tusks.
      ell(ctx, x - 14 * s, y, 16 * s, 20 * s, tone(L.skin, -0.15));
      ell(ctx, x + 4 * s, y - 2 * s, 18 * s, 17 * s, skin);
      limb(
        ctx,
        [x + 18 * s, y + 4 * s, x + 26 * s, y + 20 * s, x + 22 * s, y + 32 * s, x + 30 * s, y + 36 * s],
        7 * s,
        skin,
      );
      limb(ctx, [x + 14 * s, y + 10 * s, x + 30 * s, y + 18 * s, x + 40 * s, y + 10 * s], 4 * s, '#f5f5f4');
      ctx.fillStyle = L.metal;
      ctx.fillRect(x - 8 * s, y - 22 * s, 24 * s, 5 * s); // brow plate
      break;
    case 'beak':
      // A bird-faced sky lord: swept crest, a hooked beak.
      for (let i = 0; i < 4; i++)
        limb(
          ctx,
          [x - 6 * s, y - 8 * s, x - 22 * s - i * 6 * s, y - 26 * s + i * 8 * s],
          5 * s,
          S(i % 2 ? L.metal : L.cloth),
        );
      ell(ctx, x, y, 16 * s, 16 * s, skin);
      poly(ctx, [x + 12 * s, y - 6 * s, x + 34 * s, y + 2 * s, x + 14 * s, y + 10 * s], S(L.metal));
      break;
    case 'skull':
      ell(ctx, x, y - 2 * s, 17 * s, 16 * s, skin);
      poly(
        ctx,
        [x - 8 * s, y + 8 * s, x + 14 * s, y + 8 * s, x + 12 * s, y + 20 * s, x - 6 * s, y + 20 * s],
        skin,
      );
      ctx.fillStyle = INK;
      ell(ctx, x + 7 * s, y - 2 * s, 5 * s, 5 * s, INK, false);
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 4 * s + i * 4 * s, y + 12 * s, 2 * s, 6 * s);
      drawEyes(k, [x + 7 * s, y - 2 * s], L.glow, false, 0, ph, true);
      return;
    case 'crown':
      ell(ctx, x, y, 16 * s, 17 * s, skin);
      poly(
        ctx,
        [
          x - 16 * s,
          y - 12 * s,
          x - 14 * s,
          y - 34 * s,
          x - 6 * s,
          y - 22 * s,
          x,
          y - 40 * s,
          x + 6 * s,
          y - 22 * s,
          x + 14 * s,
          y - 34 * s,
          x + 16 * s,
          y - 12 * s,
        ],
        S(L.metal),
      );
      ctx.fillStyle = L.glow;
      ctx.fillRect(x - 2 * s, y - 30 * s, 4 * s, 4 * s); // jewel
      limb(ctx, [x + 6 * s, y + 8 * s, x + 18 * s, y + 6 * s, x + 22 * s, y + 12 * s], 3 * s, INK); // moustache
      break;
    case 'mask':
      // A smooth mask with a third eye, a hood behind it.
      poly(
        ctx,
        [x - 20 * s, y - 24 * s, x + 4 * s, y - 30 * s, x + 2 * s, y + 26 * s, x - 22 * s, y + 18 * s],
        S(L.cloth),
      );
      ell(ctx, x + 6 * s, y, 15 * s, 19 * s, skin);
      ctx.fillStyle = L.metal;
      ctx.fillRect(x + 4 * s, y + 10 * s, 12 * s, 2 * s); // painted smile
      ell(ctx, x + 8 * s, y - 12 * s, 3 * s, 5 * s, L.glow, false);
      break;
    case 'makara':
      // A crocodile-fish jaw, a crest of fins.
      for (let i = 0; i < 3; i++)
        poly(
          ctx,
          [
            x - 10 * s + i * 8 * s,
            y - 12 * s,
            x - 18 * s + i * 8 * s,
            y - 30 * s,
            x - 2 * s + i * 8 * s,
            y - 14 * s,
          ],
          S(L.metal),
        );
      poly(
        ctx,
        [x - 14 * s, y - 12 * s, x + 44 * s, y - 4 * s, x + 44 * s, y + 4 * s, x - 14 * s, y + 10 * s],
        skin,
      );
      poly(
        ctx,
        [x - 10 * s, y + 8 * s, x + 40 * s, y + 8 * s, x + 36 * s, y + 16 * s, x - 10 * s, y + 18 * s],
        tone(L.skin, -0.2),
      );
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 6; i++) ctx.fillRect(x + i * 7 * s, y + 4 * s, 2 * s, 5 * s);
      break;
    case 'jata':
      // Matted locks flying back, fangs.
      for (let i = 0; i < 5; i++)
        limb(
          ctx,
          [
            x - 6 * s,
            y - 10 * s + i * 4 * s,
            x - 26 * s,
            y - 24 * s + i * 10 * s,
            x - 36 * s,
            y - 14 * s + i * 12 * s,
          ],
          5 * s,
          S(L.shade),
        );
      ell(ctx, x, y, 16 * s, 16 * s, skin);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 6 * s, y + 9 * s, 3 * s, 6 * s);
      ctx.fillRect(x + 12 * s, y + 9 * s, 3 * s, 6 * s);
      break;
  }
  drawEyes(k, [x + 4 * s, y - 4 * s], L.glow, false, 0, ph, true);
}

/** A weapon held at (x, y), pointing along angle `a` (radians), `s` scale; `spin` animates a chakra. */
function weapon(ctx: Ctx, L: AsuraLook, x: number, y: number, a: number, s: number, spin: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const m = L.metal;
  switch (L.weapon) {
    case 'trishul':
      limb(ctx, [-20 * s, 0, 40 * s, 0], 3 * s, '#78350f');
      limb(ctx, [36 * s, -10 * s, 40 * s, 0, 36 * s, 10 * s], 3 * s, m);
      limb(ctx, [40 * s, 0, 56 * s, 0], 3 * s, m);
      limb(ctx, [36 * s, -10 * s, 48 * s, -12 * s], 3 * s, m);
      limb(ctx, [36 * s, 10 * s, 48 * s, 12 * s], 3 * s, m);
      break;
    case 'mace':
      limb(ctx, [-6 * s, 0, 30 * s, 0], 4 * s, '#78350f');
      ell(ctx, 38 * s, 0, 12 * s, 12 * s, m);
      ctx.fillStyle = INK;
      for (let i = 0; i < 4; i++) ctx.fillRect(34 * s, -8 * s + i * 5 * s, 8 * s, 2 * s);
      break;
    case 'sword':
      limb(ctx, [-6 * s, 0, 4 * s, 0], 4 * s, '#78350f');
      poly(ctx, [4 * s, -4 * s, 46 * s, -6 * s, 54 * s, 0, 46 * s, 6 * s, 4 * s, 4 * s], m);
      limb(ctx, [4 * s, -9 * s, 4 * s, 9 * s], 3 * s, L.glow);
      break;
    case 'axe':
      limb(ctx, [-8 * s, 0, 40 * s, 0], 3 * s, '#57534e');
      poly(ctx, [28 * s, -2 * s, 36 * s, -22 * s, 48 * s, -18 * s, 44 * s, 0], m);
      break;
    case 'bow':
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6 * s;
      ctx.beginPath();
      ctx.arc(0, 0, 30 * s, -1.2, 1.2);
      ctx.stroke();
      ctx.strokeStyle = m;
      ctx.lineWidth = 3 * s;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(-1.2) * 30 * s, Math.sin(-1.2) * 30 * s);
      ctx.lineTo(-6 * s, 0);
      ctx.lineTo(Math.cos(1.2) * 30 * s, Math.sin(1.2) * 30 * s);
      ctx.stroke();
      limb(ctx, [-6 * s, 0, 40 * s, 0], 2 * s, L.glow); // arrow
      break;
    case 'chakra': {
      ctx.translate(16 * s, 0);
      ctx.rotate(spin);
      ell(ctx, 0, 0, 16 * s, 16 * s, m);
      ell(ctx, 0, 0, 7 * s, 7 * s, L.glow, false);
      ctx.fillStyle = INK;
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(14 * s, -2 * s, 6 * s, 4 * s);
      }
      break;
    }
    case 'conch':
      ell(ctx, 14 * s, 0, 16 * s, 10 * s, '#f5f5f4');
      limb(ctx, [2 * s, -4 * s, 24 * s, 2 * s], 2 * s, '#d6d3d1');
      ell(ctx, 30 * s, 0, 5 * s, 7 * s, L.glow, false);
      break;
    case 'noose':
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.ellipse(24 * s, 0, 14 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = L.glow;
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
      limb(ctx, [0, 0, 10 * s, 0], 2 * s, L.glow);
      break;
    case 'vajra':
      limb(ctx, [0, 0, 36 * s, 0], 4 * s, m);
      for (const xx of [4, 32]) {
        limb(ctx, [xx * s, 0, (xx - 6) * s, -8 * s], 3 * s, m);
        limb(ctx, [xx * s, 0, (xx - 6) * s, 8 * s], 3 * s, m);
      }
      break;
  }
  ctx.restore();
}

/** Tells shared by every saga move (world coords): a warning before rain and summons, a halo before a ring. */
function sagaTells(
  k: BossKit,
  L: AsuraLook,
  e: EnemySnapshot,
  a: AtkInfo,
  cx: number,
  cy: number,
  top: number,
  nowMs: number,
): void {
  if (!a.telegraph) return;
  const p = prog(a);
  const ctx = k.ctx;
  switch (e.at) {
    case ATTACK.rain:
    case ATTACK.summon:
      k.warnIcon(cx, top - 40, nowMs);
      k.glow(cx, cy, 10 + p * 26, L.glow);
      break;
    case ATTACK.ring: {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = L.glow;
      ctx.globalAlpha = 0.35 + p * 0.5;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 70 - p * 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      k.glow(cx, cy, 8 + p * 16, L.glow);
      break;
    }
    case ATTACK.spiral: {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = L.glow;
      ctx.globalAlpha = 0.4 + p * 0.5;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 2; i++)
        ctx.arc(cx, cy, 26 + i * 12, nowMs / 120 + i * 3, nowMs / 120 + i * 3 + 2.2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case ATTACK.leap:
      k.warnIcon(e.x, top - 40, nowMs);
      break;
    case ATTACK.blink:
      k.glow(cx, cy, 30 * (1 - p) + 6, L.glow);
      break;
  }
}

/** World point of a local point (bodies drawn facing +x, mirrored by the boss's facing). */
const W = (e: EnemySnapshot, lx: number, ly: number): [number, number] => [e.x + e.f * lx, e.y + ly];

// ------------------------------------------------------------------ walkers

/** Walker body (132 x 96, feet at e.y): lobbed shots leave near (54, -92), bursts near (60, -60). */
export function drawAsuraWalker(k: BossKit, L: AsuraLook, e: EnemySnapshot, nowMs: number, a: AtkInfo): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.walker;
  const flash = e.h === 1;
  const S = lit(flash);
  const skin = S(L.skin);
  const shade = S(L.shade);
  const charge = e.at === ATTACK.charge;
  const crouch = (e.at === ATTACK.stomp || e.at === ATTACK.leap) && a.telegraph ? 10 : 0;
  const walk = Math.sin(e.x / 16);
  const blinking = e.at === ATTACK.blink && a.telegraph;
  const spin = nowMs / (e.at === ATTACK.spiral ? 40 : 160);
  ctx.save();
  if (blinking) ctx.globalAlpha = Math.max(0.15, 1 - prog(a));
  ctx.translate(Math.round(e.x), Math.round(e.y));
  if (charge && a.telegraph && !k.reduce) ctx.translate((Math.random() - 0.5) * 3, 0);
  ctx.scale(e.f, 1);
  const form = L.walker ?? 'warrior';
  if (form !== 'wraith') k.shadowAt(0, 0, c.width * 0.55);
  let headAt: [number, number];
  let hand: [number, number];
  if (form === 'beast') {
    // Four legs, a long back, a tail of flame; the head low and forward.
    for (const [lx, back] of [
      [-40, 1],
      [-24, 0],
      [26, 1],
      [42, 0],
    ] as const) {
      const sw = walk * (back ? 6 : -6);
      limb(ctx, [lx, -40 + crouch, lx + sw, -20, lx + sw * 1.4, 0], back ? 11 : 13, back ? shade : skin);
    }
    limb(ctx, [-50, -48 + crouch, -78, -66, -92, -54 + Math.sin(nowMs / 140) * 8], 9, S(L.metal));
    ell(ctx, -2, -50 + crouch, 56, 26, skin);
    ctx.fillStyle = shade;
    for (let i = 0; i < 5; i++) ctx.fillRect(-40 + i * 18, -66 + crouch, 10, 6); // stripes
    headAt = [54, -64 + crouch];
    hand = [60, -60];
    head(k, L, headAt[0], headAt[1], 1.2, flash, e.ph);
  } else if (form === 'serpent') {
    // Coils on the ground, a neck rising, one or many hoods.
    ell(ctx, -6, -14, 64, 15, shade);
    ell(ctx, -12, -34 + crouch, 50, 13, skin);
    ell(ctx, -4, -52 + crouch, 36, 11, shade);
    ctx.fillStyle = S(L.cloth);
    for (let i = 0; i < 6; i++) ctx.fillRect(-50 + i * 16, -20, 8, 4);
    const sway = Math.sin(nowMs / 300) * 4;
    limb(ctx, [10, -56 + crouch, 24, -78 + crouch, 34 + sway, -96 + crouch], 18, skin);
    const n = L.heads ?? 1;
    if (n === 1) head(k, L, 34 + sway, -104 + crouch, 1.1, flash, e.ph);
    else
      // Many heads fan out from the top of the neck, each on its own short neck.
      for (let i = 0; i < n; i++) {
        const ang = -1 + (2 * i) / (n - 1);
        const hx = 26 + sway + Math.sin(ang) * 40;
        const hy = -104 + crouch - Math.cos(ang) * 26;
        limb(ctx, [30 + sway, -94 + crouch, hx, hy + 10], 9, i % 2 ? shade : skin);
        head(k, L, hx, hy, 0.72, flash, e.ph);
      }
    headAt = [42 + sway, -112 + crouch];
    hand = [50, -94];
  } else {
    // Warrior / wraith: a giant on two legs (or a robe of smoke), arms, a weapon in front.
    const wraith = form === 'wraith';
    const bob = wraith ? Math.sin(nowMs / 260) * 6 - 12 : 0;
    ctx.translate(0, bob);
    if (wraith) {
      poly(ctx, [-30, -60, 30, -60, 40, -6, 20, 6, 4, -4, -14, 8, -34, -4], S(L.cloth));
    } else {
      limb(ctx, [-14, -46 + crouch, -20 + walk * 8, -22, -24 + walk * 10, 0], 16, shade);
      limb(ctx, [12, -46 + crouch, 18 - walk * 8, -22, 22 - walk * 10, 0], 18, skin);
      poly(ctx, [-30, -50 + crouch, 30, -50 + crouch, 24, -36 + crouch, -24, -36 + crouch], S(L.cloth)); // dhoti
    }
    // extra arms behind
    const arms = L.arms ?? 2;
    for (let i = 1; i < arms / 2; i++)
      limb(
        ctx,
        [-6, -78 + crouch, -34 - i * 6, -96 - i * 10 + crouch, -42 - i * 4, -112 - i * 8 + crouch],
        9,
        shade,
      );
    poly(ctx, [-26, -50 + crouch, 28, -50 + crouch, 34, -92 + crouch, -22, -96 + crouch], skin); // torso
    ctx.fillStyle = S(L.metal);
    ctx.fillRect(-26, -56 + crouch, 56, 6); // belt
    ell(ctx, 4, -80 + crouch, 10, 6, S(L.metal), false); // chest ornament
    limb(ctx, [-20, -88 + crouch, -36, -66 + crouch, -30, -48 + crouch], 11, shade); // back arm
    headAt = [12, -110 + crouch];
    head(k, L, headAt[0], headAt[1], 1.15, flash, e.ph);
    // front arm and weapon toward the target
    const aim =
      e.at === ATTACK.mg || e.at === ATTACK.cannon ? -0.3 : charge ? 0 : -0.15 + Math.sin(nowMs / 400) * 0.1;
    limb(ctx, [24, -88 + crouch, 44, -76 + crouch, 54, -66 + crouch], 12, skin);
    weapon(ctx, L, 54, -66 + crouch, aim, 1.1, spin);
    hand = [54, -66 + crouch];
    headAt = [headAt[0], headAt[1] + bob];
    hand = [hand[0], hand[1] + bob];
  }
  if (form === 'beast' || form === 'serpent') weapon(ctx, L, hand[0] - 30, hand[1] - 34, -0.6, 0.8, spin);
  ctx.restore();
  // tells (world coords)
  const [hx, hy] = W(e, hand[0], hand[1]);
  const [cx, cy] = W(e, headAt[0], headAt[1]);
  if (a.telegraph) {
    const p = prog(a);
    if (e.at === ATTACK.cannon) k.glow(e.x + e.f * 54, e.y - 92, 6 + 14 * p, L.glow);
    if (e.at === ATTACK.mg) k.sightLine(e.x + e.f * 60, e.y - 60, e.a / 100, 420, p);
    if (e.at === ATTACK.stomp) k.warnIcon(e.x, e.y - c.height - 40, nowMs);
    if (charge) {
      k.warnIcon(e.x, e.y - c.height - 40, nowMs);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const len = 520;
      const g = ctx.createLinearGradient(e.x, 0, e.x + e.f * len, 0);
      g.addColorStop(0, `rgba(255,40,40,${0.25 + p * 0.35})`);
      g.addColorStop(1, 'rgba(255,40,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(e.f > 0 ? e.x : e.x - len, e.y - c.height + 10, len, c.height - 12);
      ctx.restore();
    }
  }
  sagaTells(k, L, e, a, cx, cy, e.y - c.height - 20, nowMs);
  void hx;
  void hy;
  aura(k, L, e.x, e.y, c.width, c.height + 20, e.ph >= 2 ? 0.7 : 0.4);
}

// ------------------------------------------------------------------ gunships

const FLYER = 0.85;

/** Gunship body (a flyer around (e.x, e.y - 32)): bursts leave near (70, +12), bombs from the belly. */
export function drawAsuraFlyer(k: BossKit, L: AsuraLook, e: EnemySnapshot, nowMs: number, a: AtkInfo): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.gunship;
  const flash = e.h === 1;
  const S = lit(flash);
  const skin = S(L.skin);
  const shade = S(L.shade);
  const cy = e.y - c.height / 2;
  const blinking = e.at === ATTACK.blink && a.telegraph;
  const spin = nowMs / (e.at === ATTACK.spiral ? 40 : 160);
  k.shadowAt(e.x, 14 * GAME_CONFIG.tile, 70, 0.18);
  ctx.save();
  if (blinking) ctx.globalAlpha = Math.max(0.15, 1 - prog(a));
  ctx.translate(Math.round(e.x), Math.round(cy) + 6);
  ctx.scale(e.f * FLYER, FLYER);
  const form = L.flyer ?? 'cloud';
  const flap = Math.sin(nowMs / 160);
  let core: [number, number];
  if (form === 'makara') {
    // A flying sea beast: fish tail behind, fins as wings, a crocodile jaw in front.
    poly(ctx, [-60, 0, -104, -26 + flap * 8, -96, 0, -104, 26 - flap * 8], shade);
    ell(ctx, -6, 0, 62, 22, skin);
    ctx.fillStyle = S(L.cloth);
    for (let i = 0; i < 6; i++) ell(ctx, -44 + i * 14, 4 + (i % 2) * 4, 5, 4, S(L.cloth), false);
    poly(ctx, [-10, -16, -40, -58 - flap * 10, -2, -22], S(L.metal));
    poly(ctx, [-10, 16, -30, 44 + flap * 8, 6, 20], shade);
    head(k, L, 56, -4, 1, flash, e.ph);
    weapon(ctx, L, -6, 22, 0.4, 0.9, spin);
    core = [70, -4];
  } else if (form === 'cloud') {
    // A storm rakshasa riding a thundercloud, weapon raised.
    for (const [x, y, r] of [
      [-60, 18, 24],
      [-24, 24, 30],
      [16, 22, 30],
      [54, 16, 22],
      [-6, 8, 26],
    ] as const)
      ell(ctx, x, y, r, r * 0.6, S(tone(L.shade, 0.1)), false);
    poly(ctx, [-14, -54, 20, -54, 24, 6, -18, 6], skin);
    ctx.fillStyle = S(L.metal);
    ctx.fillRect(-18, -12, 44, 5);
    head(k, L, 6, -70, 1, flash, e.ph);
    limb(ctx, [18, -44, 40, -36, 56, -18], 9, skin);
    weapon(ctx, L, 56, -18, 0.2, 1, spin);
    if (!k.reduce && Math.random() < 0.08)
      k.add({
        x: e.x + (Math.random() - 0.5) * 120,
        y: cy + 30,
        vy: 260,
        life: 0.15,
        size: 3,
        color: L.glow,
        add: true,
      });
    core = [62, -16];
  } else if (form === 'shadow') {
    // A floating mask in a tattered cloak; mirror shards orbit it.
    poly(
      ctx,
      [-40, -40, 30, -46, 44, 20, 10, 40 + flap * 6, -16, 26, -40, 44 - flap * 6, -56, 10],
      S(L.cloth),
    );
    head(k, L, 20, -20, 1.4, flash, e.ph);
    for (let i = 0; i < 4; i++) {
      const t = nowMs / 500 + (i * Math.PI) / 2;
      poly(
        ctx,
        [
          Math.cos(t) * 70,
          Math.sin(t) * 26 - 6,
          Math.cos(t) * 70 + 8,
          Math.sin(t) * 26,
          Math.cos(t) * 70,
          Math.sin(t) * 26 + 10,
        ],
        S(L.metal),
      );
    }
    weapon(ctx, L, 36, 14, 0.15, 1, spin);
    core = [40, -24];
  } else {
    // A vimana: a sky chariot with a canopy, wheels or vajra spikes, and its asura pilot.
    poly(ctx, [-80, 0, 70, 0, 92, -12, 70, 22, -70, 22, -92, 10], S(L.cloth));
    ctx.fillStyle = S(L.metal);
    for (let i = 0; i < 7; i++) ctx.fillRect(-64 + i * 20, 6, 10, 4);
    poly(ctx, [-50, 0, -40, -46, 20, -46, 30, 0], S(tone(L.cloth, -0.25)));
    poly(ctx, [-56, -46, -10, -70, 36, -46], S(L.metal)); // canopy roof
    head(k, L, -6, -22, 0.9, flash, e.ph);
    for (const x of [-56, 52]) {
      ctx.save();
      ctx.translate(x, 22);
      ctx.rotate(spin);
      ell(ctx, 0, 0, 14, 14, S(L.metal));
      ctx.fillStyle = INK;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-14, -1.5, 28, 3);
      }
      ctx.restore();
    }
    weapon(ctx, L, 70, 8, 0, 0.9, spin);
    core = [90, 0];
  }
  ctx.restore();
  // tells
  const p = a.telegraph ? prog(a) : 0;
  const gx = e.x + e.f * core[0] * FLYER;
  const gy = cy + 6 + core[1] * FLYER;
  if (a.telegraph) {
    if (e.at === ATTACK.strafe) k.sightLine(e.x + e.f * 70, e.y + 12, e.a / 100, 460, p);
    if (e.at === ATTACK.bombs || e.at === ATTACK.troops) k.warnIcon(e.x, cy - 70, nowMs);
    if (e.at === ATTACK.missiles) k.glow(e.x, cy + 24, 6 + p * 10, L.glow);
  }
  sagaTells(k, L, e, a, gx, gy, cy - 50, nowMs);
  aura(k, L, e.x, cy + 30, 160, 70, e.ph >= 2 ? 0.6 : 0.35);
}

// ------------------------------------------------------------------ fortress (final boss)

/**
 * The final boss: a seated asura king (120 x 220, feet at e.y), facing left. Volley guns at its two left mounts
 * (y - 170 and y - 70), beams from its base, astras cast from its head (castPoint: left - 10, y - 170).
 */
export function drawAsuraKing(
  k: BossKit,
  L: AsuraLook,
  e: EnemySnapshot,
  dead: boolean,
  nowMs: number,
  a: AtkInfo,
  beamY: number,
): void {
  const ctx = k.ctx;
  const bc = GAME_CONFIG.enemies.boss;
  const S = dead ? (c: string) => tone(c, -0.55) : lit(e.h === 1);
  const Wd = bc.width;
  const H = bc.height;
  const left = e.x - Wd / 2;
  const top = e.y - H;
  const ph = e.ph;
  const spin = nowMs / (e.at === ATTACK.spiral ? 40 : 200);
  ctx.save();
  // Throne / pedestal first.
  throne(k, L, e, S, nowMs);
  // Mirror so the king faces left (toward the squad): local x grows to the left.
  ctx.translate(Math.round(e.x), Math.round(e.y));
  ctx.scale(-1, 1);
  const skin = S(L.skin);
  const shade = S(L.shade);
  // legs (seated) and lap cloth
  limb(ctx, [-20, -60, 20, -64, 30, -26, 26, -4], 18, shade);
  limb(ctx, [-30, -58, 6, -70, 14, -30, 10, -4], 20, skin);
  poly(ctx, [-44, -50, 40, -54, 48, -78, -40, -86], S(L.cloth));
  // extra arms (back)
  const arms = L.arms ?? 2;
  for (let i = 1; i < arms / 2; i++) {
    const sw = Math.sin(nowMs / 400 + i) * 0.15;
    limb(ctx, [-6, -150, -40 - i * 8, -170 - i * 12, -54 - i * 6, -196 - i * 10], 10, shade);
    limb(ctx, [26, -150, 56 + i * 8, -168 - i * 12, 70 + i * 4, -194 - i * 10], 10, shade);
    weapon(ctx, L, 70 + i * 4, -194 - i * 10, -1.3 + sw, 0.9, spin + i);
    weapon(ctx, L, -54 - i * 6, -196 - i * 10, -1.9 - sw, 0.9, -spin - i);
  }
  // torso
  poly(ctx, [-34, -80, 38, -84, 46, -156, -30, -160], skin);
  ctx.fillStyle = S(L.metal);
  ctx.fillRect(-34, -92, 80, 7); // belt
  poly(ctx, [-26, -146, 38, -148, 30, -132, -18, -130], S(L.metal)); // necklace
  for (let i = 0; i < 4; i++) ell(ctx, -14 + i * 14, -136, 4, 4, L.glow, false);
  // shoulders and the two main arms; the front one holds the weapon toward the squad
  ell(ctx, -30, -150, 16, 14, skin);
  ell(ctx, 42, -152, 16, 14, skin);
  limb(ctx, [-30, -146, -52, -120, -50, -96], 14, skin);
  limb(ctx, [42, -146, 62, -126, 66, -100], 14, shade);
  const raise = (e.at === ATTACK.rain || e.at === ATTACK.summon) && a.telegraph ? -40 : 0;
  weapon(ctx, L, -50, -96 + raise, raise ? -1.2 : -0.2, 1.3, spin);
  // heads
  const n = L.heads ?? 1;
  for (let i = n - 1; i >= 0; i--) {
    const off = (i - (n - 1) / 2) * 30;
    const side = Math.abs(off) > 0;
    head(
      k,
      L,
      4 + off,
      -182 - (side ? 0 : 6) + Math.abs(off) * 0.25,
      side ? 1.1 : 1.45,
      e.h === 1 && !dead,
      ph,
    );
  }
  ctx.restore();
  if (dead) {
    k.label('DEFEATED', e.x, top + 40, '#a8a29e', 14);
    return;
  }
  // gun mounts: the hands/jewels the volleys leave from
  for (const y of [e.y - 170, e.y - 70]) {
    ell(ctx, left - 30, y, 9, 9, S(L.metal));
    ell(ctx, left - 30, y, 4, 4, L.glow, false);
  }
  const p = a.telegraph ? prog(a) : 0;
  if (e.at === ATTACK.volley && a.telegraph)
    for (const y of [e.y - 170, e.y - 70]) k.glow(left - 30, y, 5 + p * 9, L.glow);
  const beam = e.at === ATTACK.beamLow || e.at === ATTACK.beamHigh;
  if (beam) k.glow(left - 12, e.y - beamY, a.telegraph ? 6 + p * 14 : 20, L.glow);
  if (e.at === ATTACK.slam && a.telegraph) {
    k.warnIcon(left - 30, e.y - 120, nowMs);
    k.glow(left - 6, e.y - 10, 8 + p * 14, L.glow);
  }
  sagaTells(k, L, e, a, left - 10, e.y - 170, top - 20, nowMs);
  // the core in its chest pulses faster as it weakens
  const pulse = 0.6 + 0.4 * Math.sin(nowMs / (ph === 3 ? 80 : 200));
  k.glow(e.x - 4, e.y - 118, 26 * pulse, L.glow);
  aura(k, L, e.x, e.y, Wd + 40, H + 30, ph >= 2 ? 0.9 : 0.5);
  void BEAM;
}

/** Each king's seat: it sets the stage's mood under the boss. */
function throne(k: BossKit, L: AsuraLook, e: EnemySnapshot, S: (c: string) => string, nowMs: number): void {
  const ctx = k.ctx;
  const x0 = e.x - 74;
  const x1 = e.x + 74;
  const y = e.y;
  const t = L.throne ?? 'gold';
  switch (t) {
    case 'lava':
      poly(ctx, [x0, y, x1, y, x1 - 10, y - 46, x0 + 14, y - 40], S('#292524'));
      ctx.fillStyle = `rgba(251,146,60,${0.6 + 0.3 * Math.sin(nowMs / 200)})`;
      for (let i = 0; i < 5; i++) ctx.fillRect(x0 + 16 + i * 26, y - 30 + (i % 2) * 10, 14, 3);
      break;
    case 'coral':
      for (let i = 0; i < 5; i++)
        limb(
          ctx,
          [x0 + 10 + i * 30, y, x0 + 4 + i * 30, y - 40 - (i % 2) * 20, x0 + 16 + i * 30, y - 56],
          8,
          S(i % 2 ? '#f472b6' : '#fb7185'),
        );
      poly(ctx, [x0, y, x1, y, x1, y - 24, x0, y - 24], S('#155e75'));
      break;
    case 'cloud':
      for (const [dx, dy, r] of [
        [-50, -14, 30],
        [0, -20, 36],
        [50, -14, 30],
        [-20, -36, 24],
        [26, -40, 26],
      ] as const)
        ell(ctx, e.x + dx, y + dy, r, r * 0.6, S('#e2e8f0'), false);
      break;
    case 'coils':
      for (let i = 0; i < 3; i++)
        ell(ctx, e.x, y - 12 - i * 18, 78 - i * 10, 14, S(i % 2 ? L.shade : L.skin));
      break;
    case 'palace':
      poly(ctx, [x0 - 8, y, x1 + 8, y, x1 + 8, y - 30, x0 - 8, y - 30], S('#312e81'));
      for (let i = 0; i < 4; i++) ctx.fillRect(x0 + 6 + i * 40, y - 60, 10, 30);
      ctx.fillStyle = `rgba(240,171,252,${0.3 + 0.2 * Math.sin(nowMs / 300)})`;
      ctx.fillRect(x0 - 8, y - 32, x1 - x0 + 16, 3);
      break;
    case 'bones':
      for (let i = 0; i < 7; i++) ell(ctx, x0 + 10 + i * 22, y - 10 - (i % 3) * 8, 12, 10, S('#d6d3d1'));
      for (let i = 0; i < 4; i++)
        limb(ctx, [x0 + 20 + i * 34, y - 6, x0 + 40 + i * 34, y - 26], 4, S('#a8a29e'));
      break;
    case 'chariot':
      poly(ctx, [x0, y - 20, x1, y - 20, x1 + 10, y - 56, x0 - 6, y - 50], S('#92400e'));
      for (const wx of [x0 + 18, x1 - 18]) {
        ctx.save();
        ctx.translate(wx, y - 18);
        ctx.rotate(nowMs / 500);
        ell(ctx, 0, 0, 18, 18, S('#fbbf24'));
        ctx.fillStyle = INK;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-18, -1.5, 36, 3);
        }
        ctx.restore();
      }
      break;
    case 'fort':
      poly(ctx, [x0 - 6, y, x1 + 6, y, x1 + 6, y - 44, x0 - 6, y - 44], S('#57534e'));
      ctx.fillStyle = S('#44403c');
      for (let i = 0; i < 6; i++) ctx.fillRect(x0 - 6 + i * 28, y - 56, 16, 12);
      break;
    case 'gold':
      poly(ctx, [x0, y, x1, y, x1 - 6, y - 36, x0 + 6, y - 36], S('#ca8a04'));
      poly(
        ctx,
        [x0 + 30, y - 36, x1 - 10, y - 36, x1, y - 200, x1 - 30, y - 220, x0 + 60, y - 120],
        S('#a16207'),
      );
      break;
    case 'cosmos': {
      // A dark lotus over a slow galaxy.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++)
        k.glow(
          e.x + Math.cos(nowMs / 900 + i * 2) * 60,
          y - 30 + Math.sin(nowMs / 900 + i * 2) * 10,
          30,
          'rgba(124,58,237,0.35)',
        );
      ctx.restore();
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        poly(
          ctx,
          [
            e.x,
            y - 20,
            e.x + Math.cos(a - 0.2) * 80,
            y - 20 + Math.sin(a - 0.2) * 40,
            e.x + Math.cos(a) * 96,
            y - 20 + Math.sin(a) * 50,
            e.x + Math.cos(a + 0.2) * 80,
            y - 20 + Math.sin(a + 0.2) * 40,
          ],
          S(i % 2 ? '#3b0764' : '#581c87'),
        );
      }
      break;
    }
  }
}

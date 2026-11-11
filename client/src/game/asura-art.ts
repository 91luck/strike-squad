import {
  ATTACK,
  BEAM,
  GAME_CONFIG,
  type AttackId,
  type BossStyle,
  type EnemySnapshot,
} from '@strikesquad/shared';
import { drawEyes, lit, prog, type AtkInfo, type BossKit } from './boss-art';
import { ell, limb, poly, setLight } from './asura-shade';
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

// ------------------------------------------------------------------ anatomy details

/**
 * Muscle definition on a bare torso centred on x = cx between `top` and `bottom`, `w` wide: two pectorals and
 * three rows of abdominals, each a dark crease with a lit edge above it (works on any skin colour).
 */
function muscles(ctx: Ctx, cx: number, top: number, bottom: number, w: number): void {
  const h = bottom - top;
  ctx.save();
  ctx.lineCap = 'round';
  const crease = (draw: () => void) => {
    ctx.strokeStyle = 'rgba(20,8,12,0.42)';
    ctx.lineWidth = 2.4;
    draw();
    ctx.stroke();
    ctx.translate(0, -2);
    ctx.strokeStyle = 'rgba(255,240,220,0.28)';
    ctx.lineWidth = 1.6;
    draw();
    ctx.stroke();
    ctx.translate(0, 2);
  };
  // pectorals
  for (const side of [-1, 1]) {
    crease(() => {
      ctx.beginPath();
      ctx.moveTo(cx + side * 2, top + h * 0.18);
      ctx.quadraticCurveTo(cx + side * w * 0.26, top + h * 0.5, cx + side * w * 0.42, top + h * 0.3);
    });
  }
  // centre line and abdominals
  crease(() => {
    ctx.beginPath();
    ctx.moveTo(cx, top + h * 0.45);
    ctx.lineTo(cx, bottom - h * 0.06);
  });
  for (let r = 0; r < 3; r++) {
    const y = top + h * (0.58 + r * 0.13);
    crease(() => {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.16, y);
      ctx.quadraticCurveTo(cx, y + 3, cx + w * 0.16, y);
    });
  }
  ctx.restore();
}

/** A gold armlet or anklet round a limb at (x, y), with a gem in the boss's glow colour. */
function band(ctx: Ctx, L: AsuraLook, S: (c: string) => string, x: number, y: number, r: number): void {
  ell(ctx, x, y, r, r * 0.55, S(L.metal));
  ell(ctx, x + r * 0.2, y, Math.max(1.5, r * 0.28), Math.max(1.5, r * 0.28), L.glow, false);
}

/** A shoulder guard: a rounded plate with a rim and a spike. */
function pauldron(ctx: Ctx, L: AsuraLook, S: (c: string) => string, x: number, y: number, r: number): void {
  poly(ctx, [x - r * 0.3, y - r * 1.55, x + r * 0.15, y - r * 0.8, x - r * 0.75, y - r * 0.8], S(L.metal));
  ell(ctx, x, y - r * 0.2, r, r * 0.8, S(L.metal));
  ell(ctx, x, y + r * 0.38, r * 0.92, r * 0.22, S(tone(L.metal, -0.3)), false);
}

// ------------------------------------------------------------------ motion

/**
 * How far and how fast each boss has moved, tracked per enemy id from frame to frame (the snapshot carries no
 * velocity). `d` is the distance travelled along the way it faces, so a gait driven by it plants its feet: a foot
 * in stance slides back in local space exactly as far as the body moves forward. `move` (0..1) blends between
 * standing and walking poses, so a boss that stops settles its feet instead of freezing mid-stride.
 */
interface Track {
  x: number;
  t: number;
  v: number;
  move: number;
}
const tracks = new Map<number, Track>();

function track(e: EnemySnapshot, nowMs: number): { d: number; move: number } {
  let tr = tracks.get(e.id);
  if (!tr || nowMs - tr.t > 600 || nowMs < tr.t) {
    if (tracks.size > 48) tracks.clear();
    tr = { x: e.x, t: nowMs, v: 0, move: 0 };
    tracks.set(e.id, tr);
  } else if (nowMs > tr.t) {
    const dt = nowMs - tr.t;
    const inst = (Math.abs(e.x - tr.x) / dt) * 1000;
    tr.v += (inst - tr.v) * Math.min(1, dt / 110);
    tr.x = e.x;
    tr.t = nowMs;
    tr.move = Math.min(1, tr.v / 35);
  }
  return { d: e.x * e.f, move: tr.move };
}

/** Two-bone IK: the middle joint for a limb from (hx, hy) to (fx, fy); bend -1 puts it forward (+x), +1 back. */
function joint(
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  a: number,
  b: number,
  bend: number,
): [number, number] {
  const dx = fx - hx;
  const dy = fy - hy;
  const d = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, Math.hypot(dx, dy)));
  const off = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = Math.atan2(dy, dx) + bend * off;
  return [hx + Math.cos(ang) * a, hy + Math.sin(ang) * a];
}

/**
 * A foot's place in its step cycle `u` (0..1): the first half on the ground, sliding back by exactly the distance
 * the body moves (stride / 2); the second half swinging forward through the air, `lift` high at the top.
 */
function stepFoot(u: number, stride: number, lift: number, move: number): [number, number] {
  const w = ((u % 1) + 1) % 1;
  const reach = stride / 2;
  if (w < 0.5) return [reach * (0.5 - 2 * w) * move, 0];
  const s = (w - 0.5) * 2;
  const ease = s * s * (3 - 2 * s);
  return [(-reach / 2 + reach * ease) * move, -lift * Math.sin(Math.PI * s) * move];
}

/** A chain of points that trails behind (tails, capes, flames): each link swings a little later than the last. */
function chain(
  x: number,
  y: number,
  n: number,
  len: number,
  dir: number,
  rise: number,
  amp: number,
  t: number,
  lag: number,
): number[] {
  const pts = [x, y];
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    pts.push(x + dir * len * s, y - rise * s + Math.sin(t - i * lag) * amp * s);
  }
  return pts;
}

// ------------------------------------------------------------------ walkers

/** Walker body (132 x 96, feet at e.y): lobbed shots leave near (54, -92), bursts near (60, -60). */
export function drawAsuraWalker(k: BossKit, L: AsuraLook, e: EnemySnapshot, nowMs: number, a: AtkInfo): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.walker;
  const flash = e.h === 1;
  const S = lit(flash);
  setLight(1); // the body is drawn in local space, mirrored to face e.f: its front is local +x
  const skin = S(L.skin);
  const shade = S(L.shade);
  const charge = e.at === ATTACK.charge;
  const windUp = (e.at === ATTACK.stomp || e.at === ATTACK.leap) && a.telegraph;
  const crouch = windUp ? 6 + prog(a) * 8 : 0;
  const blinking = e.at === ATTACK.blink && a.telegraph;
  const summoning = e.at === ATTACK.summon && a.telegraph;
  const spin = nowMs / (e.at === ATTACK.spiral ? 40 : 160);
  const { d, move } = track(e, nowMs);
  const breathe = Math.sin(nowMs / 520);
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
    // A big cat on four legs in a trot (diagonal pairs together), feet planted by the distance walked; the body
    // bobs twice a cycle, the head nods against it, the tail and the mane of flame trail behind.
    const STRIDE = 118;
    const u = d / STRIDE;
    const bob = -move * 3 * Math.abs(Math.sin(u * Math.PI * 2)) + breathe * (1 - move) * 1.2;
    // a charge winds up low at the front, rump raised; a leap or stomp sinks the whole body
    const lunge = charge && a.telegraph ? prog(a) : 0;
    const bodyY = crouch + bob;
    // tail: a chain that lifts with speed and lashes before a charge
    const tailT = nowMs / (lunge ? 70 : 170);
    const tail = chain(-52, -50 + bodyY, 5, 52, -1, 8 + move * 14 + lunge * 10, 6 + lunge * 6, tailT, 0.8);
    limb(ctx, tail, 9, S(L.metal));
    const tx = tail[tail.length - 2] as number;
    const ty = tail[tail.length - 1] as number;
    const tfl = Math.sin(nowMs / 90) * 3;
    poly(
      ctx,
      [tx + 2, ty - 6, tx - 12 - tfl, ty - 18, tx - 6, ty - 2, tx - 16 + tfl, ty + 4, tx, ty + 6],
      S(L.glow),
      false,
    );
    const leg = (hx: number, phase: number, far: boolean, front: boolean) => {
      const col = far ? shade : skin;
      const w = far ? 11 : 13;
      const hipY = -40 + bodyY + (front ? lunge * 6 : -lunge * 4);
      const [fx, fy] = stepFoot(u + phase, STRIDE, 10, move);
      const footX = hx + fx + (front ? lunge * 6 : 0);
      const footY = -3 + fy;
      const [kx, ky] = joint(hx, hipY, footX, footY, 21, 22, front ? 1 : 1);
      ell(ctx, hx + 2, hipY - 2, w * 0.95, w * 1.25, col);
      limb(ctx, [hx, hipY, kx, ky, footX, footY], w, col);
      ell(ctx, footX + 3, footY, w * 0.72, 4.5, col);
      ctx.fillStyle = S('#f5ecd7');
      for (let cl = 0; cl < 3; cl++) ctx.fillRect(footX + 3 + cl * 3.5, footY + 1, 2, 3);
    };
    // far legs behind the body
    leg(-40, 0.5, true, false);
    leg(26, 0, true, true);
    ctx.save();
    ctx.translate(0, bodyY);
    // body: haunch, deep chest, a paler belly; the chest dips lower in a charge wind-up
    ell(ctx, -24, -52 - lunge * 4, 36, 23, skin);
    ell(ctx, 18, -54 + lunge * 6, 40, 27, skin);
    ell(ctx, -2, -36 + lunge * 2, 40, 8, S(tone(L.skin, 0.28)), false);
    for (let i = 0; i < 5; i++) {
      const sx = -42 + i * 18;
      const dip = lunge * (i - 2) * 2;
      poly(ctx, [sx, -76 + dip, sx + 8, -76 + dip, sx + 4, -56 + dip, sx - 2, -50 + dip], shade, false);
    }
    // the mane of flame streams back with speed and flickers
    const stream = move * 5 + lunge * 6;
    for (let i = 0; i < 7; i++) {
      const mx = -36 + i * 12;
      const fl = Math.sin(nowMs / 110 + i * 1.7) * 3;
      const ht = 12 + (i % 2) * 6 + fl;
      const my = -74 + lunge * (i - 3) * 2;
      poly(ctx, [mx - 6, my, mx + 1 - stream, my - ht, mx + 6, my], S(L.metal), false);
      poly(ctx, [mx - 3, my, mx + 1 - stream * 0.6, my - ht * 0.55, mx + 3, my], S(L.glow), false);
    }
    ctx.restore();
    // near legs in front
    leg(-24, 0, false, false);
    leg(42, 0.5, false, true);
    const nod = move * 1.6 * Math.sin(u * Math.PI * 4 + 1) + lunge * 8;
    headAt = [54 + lunge * 6, -64 + bodyY + nod];
    hand = [60, -60];
    head(k, L, headAt[0], headAt[1], 1.2, flash, e.ph);
  } else if (form === 'serpent') {
    // Coils on the ground that slither: a wave runs back along each coil as it moves (and slowly at rest); the
    // neck sways over them, the heads weave.
    const w = d / 34 + nowMs / 520;
    const rows: [number, number, number, number, string][] = [
      [-6, 60, -14, 30, shade],
      [-12, 48, -34 + crouch, 26, skin],
      [-4, 34, -52 + crouch, 22, shade],
    ];
    rows.forEach(([cx0, half, y0, thick, col], r) => {
      const pts: number[] = [];
      for (let i = 0; i <= 10; i++) {
        const x = cx0 - half + (i * half * 2) / 10;
        pts.push(x, y0 + Math.sin(i * 0.85 - w * 2.2 + r * 1.3) * (r === 0 ? 2 : 4));
      }
      limb(ctx, pts, thick, col);
      if (r < 2) {
        // pale belly plates riding the wave, each with a dark seam
        const n = r === 0 ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const x = cx0 - half + 6 + (i * (half * 2 - 12)) / (n - 1);
          const yy =
            y0 +
            8 +
            Math.sin(((x - (cx0 - half)) / (half * 2)) * 10 * 0.85 - w * 2.2 + r * 1.3) * (r === 0 ? 2 : 4);
          ell(ctx, x, yy - (r === 0 ? 0 : 6), 5.5, 3.2, S(L.cloth), false);
          ctx.fillStyle = S(tone(L.cloth, -0.35));
          ctx.fillRect(x + 4, yy - (r === 0 ? 2 : 8), 1.5, 4);
        }
      }
      if (r === 1) {
        ctx.fillStyle = S(tone(L.skin, -0.3));
        for (let i = 0; i < 9; i++)
          ctx.fillRect(-46 + i * 10, y0 - 6 + (i % 2) * 3 + Math.sin(i * 0.85 - w * 2.2 + 1.3) * 4, 4, 2);
      }
    });
    // the neck rises and sways; it rears back before a lunge
    const rear = windUp ? prog(a) * 10 : 0;
    const sway = Math.sin(nowMs / 300) * 4 + Math.sin(w * 2.2) * 2 * move - rear;
    const lift = breathe * 2;
    limb(
      ctx,
      [10, -56 + crouch, 22 - rear * 0.4, -78 + crouch + lift, 34 + sway, -96 + crouch + lift],
      18,
      skin,
    );
    limb(
      ctx,
      [16, -58 + crouch, 27 - rear * 0.4, -78 + crouch + lift, 38 + sway, -94 + crouch + lift],
      6,
      S(L.cloth),
    );
    const n = L.heads ?? 1;
    if (n === 1) head(k, L, 34 + sway, -104 + crouch + lift, 1.1, flash, e.ph);
    else
      for (let i = 0; i < n; i++) {
        // many heads fan out from the top of the neck and weave out of step with each other
        const ang = -1 + (2 * i) / (n - 1);
        const weave = Math.sin(nowMs / 260 + i * 1.9) * 3;
        const hx = 26 + sway + Math.sin(ang) * 40 + weave;
        const hy = -104 + crouch + lift - Math.cos(ang) * 26 + Math.cos(nowMs / 300 + i) * 2;
        limb(ctx, [30 + sway, -94 + crouch + lift, hx, hy + 10], 9, i % 2 ? shade : skin);
        head(k, L, hx, hy, 0.72, flash, e.ph);
      }
    headAt = [42 + sway, -112 + crouch + lift];
    hand = [50, -94];
  } else {
    // Warrior / wraith: a giant on two legs (or a robe of smoke), arms, a weapon in front.
    const wraith = form === 'wraith';
    const STRIDE = 96;
    const u = d / STRIDE;
    const step = Math.sin(u * Math.PI * 2);
    const bob = wraith
      ? Math.sin(nowMs / 260) * 6 - 12
      : -move * 3.5 * Math.abs(step) + breathe * (1 - move) * 1.2;
    const lean = charge && a.telegraph ? prog(a) * 6 : move * 2;
    const hipY = -46 + crouch;
    if (wraith) {
      ctx.save();
      ctx.translate(0, bob);
      // a robe of smoke with a hem that ripples and trails back
      const hem: number[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = 40 - i * 10 - move * i * 1.5;
        hem.push(x, -4 + Math.sin(nowMs / 150 + i * 0.9) * 5 + (i % 2) * 6);
      }
      poly(ctx, [-30, -60, 30, -60, ...hem], S(L.cloth));
      ctx.restore();
    } else {
      // legs: thigh and shin by IK to a planted (or swinging) foot; the far leg half a step behind
      const legs: [number, number, string, number][] = [
        [-14, 0.5, shade, 16],
        [12, 0, skin, 18],
      ];
      for (const [hx, phase, col, wd] of legs) {
        const [fx, fy] = stepFoot(u + phase, STRIDE, 12, move);
        const footX = hx * 0.6 + fx;
        const footY = -2 + fy;
        const hy = hipY + bob;
        const [kx, ky] = joint(hx, hy, footX, footY, 25, 25, -1);
        limb(ctx, [hx, hy, kx, ky, footX, footY], wd, col);
        ell(ctx, footX + 4, footY, wd * 0.7, 4, col);
        band(ctx, L, S, (kx + footX) / 2, (ky + footY) / 2 + 4, wd * 0.5);
      }
    }
    ctx.save();
    ctx.translate(lean, wraith ? bob : bob);
    // dhoti: its hem flaps with the stride
    if (!wraith) {
      const fl = step * move * 4;
      poly(
        ctx,
        [-30, -50 + crouch, 30, -50 + crouch, 26 + fl, -34 + crouch, 0, -38 + crouch, -26 - fl, -34 + crouch],
        S(L.cloth),
      );
    }
    // extra arms behind, waving slowly out of step
    const arms = L.arms ?? 2;
    for (let i = 1; i < arms / 2; i++) {
      const wv = Math.sin(nowMs / 380 + i * 1.4) * 4;
      limb(
        ctx,
        [
          -6,
          -78 + crouch,
          -34 - i * 6,
          -96 - i * 10 + crouch + wv,
          -42 - i * 4,
          -112 - i * 8 + crouch + wv * 1.6,
        ],
        9,
        shade,
      );
    }
    // torso: rises a pixel with each breath
    const chest = breathe * (1 - move) * 1;
    poly(
      ctx,
      [-26, -50 + crouch, 28, -50 + crouch, 34, -92 + crouch - chest, -22, -96 + crouch - chest],
      skin,
    );
    if (!wraith) muscles(ctx, 4, -94 + crouch, -54 + crouch, 54);
    ctx.fillStyle = S(L.metal);
    ctx.fillRect(-26, -56 + crouch, 56, 6);
    ctx.fillStyle = S(tone(L.metal, 0.35));
    ctx.fillRect(-26, -56 + crouch, 56, 2);
    ell(ctx, 4, -80 + crouch, 10, 6, S(L.metal), false);
    ell(ctx, 4, -80 + crouch, 3.5, 3.5, L.glow, false);
    // back arm swings against the near leg; raised to call reinforcements
    const swing = -step * move * 0.5;
    const bsx = -20;
    const bsy = -88 + crouch;
    const bHand: [number, number] = summoning
      ? [-26, -128 + crouch]
      : [bsx - 6 + Math.sin(swing) * 26, bsy + 40 - Math.abs(Math.sin(swing)) * 6];
    const [bex, bey] = joint(bsx, bsy, bHand[0], bHand[1], 22, 22, 1);
    limb(ctx, [bsx, bsy, bex, bey, bHand[0], bHand[1]], 11, shade);
    band(ctx, L, S, (bex + bHand[0]) / 2, (bey + bHand[1]) / 2, 7);
    if (summoning) k.glow(e.x + e.f * (bHand[0] + lean), e.y + bHand[1] + bob, 6 + prog(a) * 10, L.glow);
    // head: a little sway with the walk
    headAt = [12 + step * move * 1.2, -110 + crouch - chest];
    head(k, L, headAt[0], headAt[1], 1.15, flash, e.ph);
    // front arm and weapon toward the target; the weapon bobs a little with each step
    const aim =
      e.at === ATTACK.mg || e.at === ATTACK.cannon ? -0.3 : charge ? 0 : -0.15 + Math.sin(nowMs / 400) * 0.1;
    const hy = -66 + crouch + step * move * 2;
    limb(ctx, [24, -88 + crouch, 44, -76 + crouch + step * move, 54, hy], 12, skin);
    band(ctx, L, S, 46, -74 + crouch, 7);
    pauldron(ctx, L, S, 26, -88 + crouch, 11);
    weapon(ctx, L, 54, hy, aim, 1.1, spin);
    ctx.restore();
    hand = [54 + lean, hy + bob];
    headAt = [headAt[0] + lean, headAt[1] + bob];
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

/** How a flyer is moving, smoothed per boss, so its body can bank, pitch and pump harder at speed. */
interface FlyMotion {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
  bank: number;
  seen: number;
}
const flyMotion = new Map<number, FlyMotion>();

function flyerMotion(e: EnemySnapshot, nowMs: number): FlyMotion {
  let m = flyMotion.get(e.id);
  if (!m || nowMs - m.seen > 600 || nowMs < m.t) {
    m = { x: e.x, y: e.y, t: nowMs, vx: 0, vy: 0, bank: 0, seen: nowMs };
    flyMotion.set(e.id, m);
  }
  m.seen = nowMs;
  const dt = (nowMs - m.t) / 1000;
  if (dt > 0.008) {
    const k = Math.min(1, dt * 8);
    m.vx += ((e.x - m.x) / dt - m.vx) * k;
    m.vy += ((e.y - m.y) / dt - m.vy) * k;
    m.x = e.x;
    m.y = e.y;
    m.t = nowMs;
    // nose down when diving or surging forward, up when climbing or braking (local space: + is nose down)
    const fwd = m.vx * e.f;
    const target = Math.max(-0.2, Math.min(0.2, m.vy / 700)) + Math.max(-0.1, Math.min(0.1, fwd / 1600));
    m.bank += (target - m.bank) * Math.min(1, dt * 6);
  }
  if (flyMotion.size > 12) for (const [id, o] of flyMotion) if (nowMs - o.seen > 3000) flyMotion.delete(id);
  return m;
}

/** Makara: a crocodile-headed sea dragon swimming through the air, its whole spine rippling. */
function drawMakara(
  k: BossKit,
  L: AsuraLook,
  S: (c: string) => string,
  t: number,
  speed: number,
  a: AtkInfo,
  e: EnemySnapshot,
  spin: number,
): [number, number] {
  const ctx = k.ctx;
  const skin = S(L.skin);
  const shade = S(L.shade);
  const rate = 4.5 + Math.min(5, speed / 70);
  const N = 11;
  const sp: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const amp = 2 + u * u * 16;
    sp.push({
      x: 52 - u * 156,
      y: Math.sin(t * rate - u * 5.2) * amp,
      r: 4 + 19 * Math.sin(Math.PI * Math.min(1, 0.22 + u * 0.9)),
    });
  }
  const at = (u: number) => sp[Math.round(u * (N - 1))] as { x: number; y: number; r: number };
  const fin = Math.sin(t * rate * 0.5);
  // far pectoral fin and far tail lobe, in shadow
  const pf = at(0.3);
  poly(
    ctx,
    [pf.x + 4, pf.y + pf.r * 0.3, pf.x - 30, pf.y + pf.r + 14 - fin * 10, pf.x - 8, pf.y + pf.r * 0.6],
    shade,
  );
  const tail = sp[N - 1] as { x: number; y: number; r: number };
  const pre = sp[N - 2] as { x: number; y: number; r: number };
  const ta = Math.atan2(tail.y - pre.y, tail.x - pre.x);
  const lobe = (dir: number, col: string) => {
    const c = Math.cos(ta + dir * 0.6);
    const s = Math.sin(ta + dir * 0.6);
    poly(
      ctx,
      [tail.x, tail.y, tail.x + c * 30 - s * 6, tail.y + s * 30 + c * 6, tail.x + c * 22, tail.y + s * 22],
      col,
    );
  };
  lobe(-1, shade);
  // dorsal sail spines, raked back, shrinking to the tail
  for (let i = 1; i < N - 2; i++) {
    const p = sp[i] as { x: number; y: number; r: number };
    const h = 16 * (1 - i / N) + 4;
    poly(
      ctx,
      [p.x + 5, p.y - p.r + 3, p.x - 6, p.y - p.r - h, p.x - 7, p.y - p.r + 4],
      S(L.metal),
      i % 2 === 0,
    );
  }
  // the body: one outline along the spine, belly plates underneath, scale rows on the flank
  const top: number[] = [];
  const bot: number[] = [];
  for (const p of sp) top.push(p.x, p.y - p.r);
  for (let i = N - 1; i >= 0; i--) {
    const p = sp[i] as { x: number; y: number; r: number };
    bot.push(p.x, p.y + p.r * 0.92);
  }
  poly(ctx, [...top, ...bot], skin);
  const belly: number[] = [];
  for (const p of sp) belly.push(p.x, p.y + p.r * 0.38);
  for (let i = N - 1; i >= 0; i--) {
    const p = sp[i] as { x: number; y: number; r: number };
    belly.push(p.x, p.y + p.r * 0.9);
  }
  poly(ctx, belly, S(L.cloth), false);
  ctx.fillStyle = tone(L.cloth, -0.35);
  for (let i = 1; i < N - 1; i++) {
    const p = sp[i] as { x: number; y: number; r: number };
    ctx.fillRect(Math.round(p.x), Math.round(p.y + p.r * 0.4), 1.5, Math.max(1, p.r * 0.48));
  }
  ctx.fillStyle = tone(L.skin, -0.28);
  for (let i = 1; i < N - 2; i++) {
    const p = sp[i] as { x: number; y: number; r: number };
    for (let j = 0; j < 2; j++) {
      const sx = p.x - 4 + j * 7;
      const sy = p.y - p.r * 0.35 + j * 4;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.5, p.r * 0.16), 0, Math.PI);
      ctx.fill();
    }
  }
  lobe(1, S(L.metal));
  // near pectoral fin, sweeping like an oar
  poly(
    ctx,
    [pf.x + 6, pf.y + pf.r * 0.4, pf.x - 24, pf.y + pf.r + 24 + fin * 12, pf.x - 2, pf.y + pf.r * 0.8],
    S(L.metal),
  );
  // the conch it carries in the near fin's grip
  weapon(ctx, L, pf.x - 8, pf.y + pf.r + 6, 0.4 + fin * 0.1, 0.8, spin);
  // the head: crocodile snout, a jaw that gapes on a tell, crest fins and swaying barbels
  const h = sp[0] as { x: number; y: number; r: number };
  const hx = h.x + 4;
  const hy = h.y - 2;
  const gape =
    0.1 + Math.sin(t * 3) * 0.04 + (a.telegraph ? prog(a) * 0.5 : 0) + (e.at === ATTACK.strafe ? 0.15 : 0);
  for (let i = 0; i < 3; i++)
    poly(
      ctx,
      [hx - 8 + i * 7, hy - 10, hx - 16 + i * 7, hy - 26 - (i === 1 ? 4 : 0), hx - 1 + i * 7, hy - 12],
      S(L.metal),
    );
  // lower jaw (behind the skull)
  ctx.save();
  ctx.translate(hx + 4, hy + 4);
  ctx.rotate(gape);
  poly(ctx, [0, -2, 44, 0, 42, 6, 0, 10], tone(L.skin, -0.18));
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) ctx.fillRect(6 + i * 6.5, -4, 2, 4);
  ctx.restore();
  // mouth glow when it gapes
  if (gape > 0.2) ell(ctx, hx + 30, hy + 8, 10 * gape * 2, 4 * gape * 2, L.glow, false);
  ell(ctx, hx, hy, 17, 13, skin);
  poly(ctx, [hx + 2, hy - 10, hx + 54, hy - 2, hx + 54, hy + 4, hx + 2, hy + 6], skin);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) ctx.fillRect(hx + 10 + i * 7, hy + 4, 2, 4);
  ell(ctx, hx + 52, hy - 1, 3, 2.5, tone(L.skin, -0.3), false); // nostril bump
  ell(ctx, hx + 10, hy - 6, 4.5, 3.5, L.glow);
  ctx.fillStyle = INK;
  ctx.fillRect(hx + 11, hy - 7, 2, 3);
  const sway = Math.sin(t * 2.4);
  limb(ctx, [hx + 50, hy + 3, hx + 58, hy + 12 + sway * 3, hx + 52, hy + 22 + sway * 5], 2, S(L.metal));
  return [hx + 46, hy + 4];
}

/** Garjan-rakshas: a storm giant riding a rolling thunderhead that crackles with lightning. */
function drawStormCloud(
  k: BossKit,
  L: AsuraLook,
  S: (c: string) => string,
  e: EnemySnapshot,
  t: number,
  speed: number,
  flash: boolean,
  spin: number,
  cy: number,
): [number, number] {
  const ctx = k.ctx;
  const skin = S(L.skin);
  const roll = t * (0.7 + Math.min(1.2, speed / 260));
  const puffs: { x: number; y: number; r: number; d: number }[] = [];
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11) * Math.PI * 2 + roll;
    puffs.push({
      x: Math.cos(ang) * 62,
      y: 18 + Math.sin(ang) * 9,
      r: 15 + 7 * Math.sin(t * 1.3 + i * 1.7),
      d: Math.sin(ang),
    });
  }
  const cloudDark = S(tone(L.shade, -0.05));
  const cloudMid = S(tone(L.shade, 0.18));
  const cloudLight = S(tone(L.shade, 0.4));
  // the anvil's dark underside, then the back half of the rolling puffs
  ell(ctx, -4, 30, 74, 14, cloudDark, false);
  for (const p of puffs) if (p.d < 0) ell(ctx, p.x, p.y, p.r, p.r * 0.72, cloudMid, false);
  // the rider: a scarf streaming behind, a leaning torso, the vajra raised
  const lean = Math.min(0.25, speed / 900);
  const scarf: number[] = [-8, -46];
  for (let i = 1; i <= 6; i++)
    scarf.push(-8 - i * 12, -44 + i * 3 + Math.sin(t * 7 - i * 0.9) * (3 + i * 1.5));
  for (let i = 6; i >= 1; i--)
    scarf.push(-8 - i * 12, -38 + i * 3 + Math.sin(t * 7 - i * 0.9) * (3 + i * 1.5));
  poly(ctx, scarf, S(L.metal));
  ctx.save();
  ctx.rotate(lean);
  poly(ctx, [-16, -54, 22, -54, 26, 6, -20, 6], skin);
  muscles(ctx, 3, -50, 2, 18);
  ctx.fillStyle = S(L.metal);
  ctx.fillRect(-20, -12, 46, 5);
  ell(ctx, 4, -10, 4, 3, L.glow, false);
  head(k, L, 6, -70, 1, flash, e.ph);
  const raise = Math.sin(t * 2) * 4;
  limb(ctx, [18, -44, 40, -40 - raise, 56, -22 - raise], 9, skin);
  band(ctx, L, S, 40, -40 - raise, 5);
  weapon(ctx, L, 56, -20 - raise, 0.2, 1, spin);
  ctx.restore();
  // front puffs, lit on top
  for (const p of puffs)
    if (p.d >= 0) {
      ell(ctx, p.x, p.y + 2, p.r, p.r * 0.72, cloudMid, false);
      ell(ctx, p.x - p.r * 0.15, p.y - p.r * 0.25, p.r * 0.62, p.r * 0.4, cloudLight, false);
    }
  // lightning: a jagged bolt from the cloud's belly every so often, and flickers inside it
  const flick = Math.floor(t * 11);
  if (!k.reduce && (flick % 13 === 0 || flick % 29 === 5)) {
    ctx.strokeStyle = L.glow;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let x = ((flick * 37) % 100) - 50;
    let y = 30;
    ctx.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      x += ((flick * (i + 3) * 17) % 24) - 12;
      y += 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    k.glow(e.x + e.f * x * FLYER, cy + 6 + 30 * FLYER, 26, 'rgba(147,197,253,0.45)');
  }
  if (!k.reduce && Math.random() < 0.08)
    k.add({
      x: e.x + (Math.random() - 0.5) * 120,
      y: cy + 34,
      vy: 260,
      life: 0.15,
      size: 3,
      color: L.glow,
      add: true,
    });
  return [62, -22];
}

/** Chhaya-asur: a mask in a tattered cloak, shadow wisps streaming behind it, mirror shards circling. */
function drawShade(
  k: BossKit,
  L: AsuraLook,
  S: (c: string) => string,
  e: EnemySnapshot,
  t: number,
  speed: number,
  flash: boolean,
  spin: number,
): [number, number] {
  const ctx = k.ctx;
  const drag = Math.min(1, speed / 300);
  // wisps: ribbons of shadow trailing back, rippling, fading at the tips
  for (let w = 0; w < 5; w++) {
    const pts: number[] = [];
    const y0 = -24 + w * 14;
    for (let i = 0; i <= 6; i++)
      pts.push(-30 - i * (12 + drag * 8), y0 + Math.sin(t * 5 - i * 0.8 + w * 1.3) * (2 + i * 2));
    ctx.save();
    ctx.globalAlpha *= 0.55;
    limb(ctx, pts, 7 - w * 0.6, S(tone(L.cloth, -0.1)));
    ctx.restore();
  }
  // shards behind the body
  const shard = (i: number, front: boolean) => {
    const ang = t * 2 + (i * Math.PI) / 2;
    if (Math.sin(ang) >= 0 !== front) return;
    const sc = 0.75 + Math.sin(ang) * 0.25;
    const x = Math.cos(ang) * 72;
    const y = Math.sin(ang) * 18 - 6;
    poly(
      ctx,
      [x, y - 8 * sc, x + 7 * sc, y, x, y + 10 * sc, x - 5 * sc, y],
      S(front ? L.metal : tone(L.metal, -0.3)),
    );
  };
  for (let i = 0; i < 4; i++) shard(i, false);
  // the cloak: its hem tears into tatters that flutter and drag back with speed
  const hem: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const x = 40 - i * 15 - drag * i * 4;
    hem.push(x, 26 + (i % 2 ? 18 : 6) + Math.sin(t * 6 + i * 1.1) * 5);
  }
  poly(ctx, [-44, -40, 30, -46, 46, 16, ...hem, -60, 12], S(L.cloth));
  poly(ctx, [-30, -36, 24, -40, 32, 6, -20, 10], S(tone(L.cloth, 0.12)), false);
  ell(ctx, 20, -2, 6, 5, L.glow, false); // a heart-light under the cloak
  head(k, L, 20, -20, 1.4, flash, e.ph);
  weapon(ctx, L, 36, 14, 0.15 + Math.sin(t * 1.5) * 0.1, 1, spin);
  for (let i = 0; i < 4; i++) shard(i, true);
  return [40, -24];
}

/** A vimana: a carved sky chariot, its prow lotus, pennants, spinning wheels and thrusters. */
function drawVimana(
  k: BossKit,
  L: AsuraLook,
  S: (c: string) => string,
  e: EnemySnapshot,
  t: number,
  speed: number,
  flash: boolean,
  spin: number,
  cy: number,
): [number, number] {
  const ctx = k.ctx;
  const hull = S(L.cloth);
  const gold = S(L.metal);
  // thrusters: flames that lengthen with speed, flickering
  const flame = 18 + Math.min(26, speed / 10) + Math.sin(t * 40) * 4;
  for (const y of [2, 16]) {
    poly(ctx, [-88, y - 5, -88 - flame, y, -88, y + 5], L.glow, false);
    poly(ctx, [-88, y - 2.5, -88 - flame * 0.55, y, -88, y + 2.5], '#ffffff', false);
  }
  if (!k.reduce && Math.random() < 0.3)
    k.add({
      x: e.x - e.f * 96 * FLYER,
      y: cy + 14,
      vx: -e.f * 90,
      life: 0.25,
      size: 5,
      color: L.glow,
      add: true,
      grow: -12,
    });
  // hull: a keel, rows of gold trim, carved panels
  poly(ctx, [-84, 0, 72, 0, 98, -14, 76, 24, -72, 24, -94, 10], hull);
  poly(ctx, [-84, 12, 76, 12, 76, 24, -72, 24], S(tone(L.cloth, -0.22)), false);
  ctx.fillStyle = gold;
  ctx.fillRect(-84, 2, 160, 3);
  for (let i = 0; i < 7; i++) ell(ctx, -64 + i * 21, 15, 4, 3, gold, false);
  // the canopy: pillars, a stepped shikhara roof with a finial, pennants flying back
  poly(ctx, [-50, 0, -40, -44, 22, -44, 32, 0], S(tone(L.cloth, -0.3)));
  ctx.fillStyle = gold;
  ctx.fillRect(-44, -44, 4, 44);
  ctx.fillRect(22, -44, 4, 44);
  poly(ctx, [-58, -44, -8, -56, 40, -44], gold);
  poly(ctx, [-44, -56, -8, -70, 26, -56], S(tone(L.metal, -0.15)));
  poly(ctx, [-26, -70, -8, -84, 10, -70], gold);
  ell(ctx, -8, -88, 4, 4, L.glow, false);
  for (const [px, py, len] of [
    [-8, -84, 26],
    [-56, -46, 18],
  ] as const) {
    ctx.fillStyle = INK;
    ctx.fillRect(px - 1, py - 16, 2, 16);
    const pts: number[] = [px, py - 16];
    for (let i = 1; i <= 4; i++) pts.push(px - (i * len) / 4, py - 16 + Math.sin(t * 9 - i) * (1 + i));
    for (let i = 4; i >= 1; i--) pts.push(px - (i * len) / 4, py - 9 + Math.sin(t * 9 - i) * (1 + i) - i);
    poly(ctx, pts, L.glow, false);
  }
  head(k, L, -6, -22, 0.9, flash, e.ph);
  // prow: a golden lotus
  for (let i = 0; i < 3; i++) poly(ctx, [86, -10, 100 + i * 4, -26 + i * 9, 96, -6], gold);
  // wheels with spokes
  for (const x of [-56, 52]) {
    ctx.save();
    ctx.translate(x, 24);
    ctx.rotate(spin * (1 + speed / 200));
    ell(ctx, 0, 0, 15, 15, gold);
    ell(ctx, 0, 0, 9, 9, S(tone(L.cloth, -0.3)), false);
    ctx.fillStyle = INK;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-14, -1.5, 28, 3);
    }
    ell(ctx, 0, 0, 3, 3, L.glow, false);
    ctx.restore();
  }
  weapon(ctx, L, 70, 8, 0, 0.9, spin);
  return [90, 0];
}

/** Gunship body (a flyer around (e.x, e.y - 32)): bursts leave near (70, +12), bombs from the belly. */
export function drawAsuraFlyer(k: BossKit, L: AsuraLook, e: EnemySnapshot, nowMs: number, a: AtkInfo): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.gunship;
  const flash = e.h === 1;
  const S = lit(flash);
  setLight(1); // drawn in local space mirrored to face e.f
  const cy = e.y - c.height / 2;
  const blinking = e.at === ATTACK.blink && a.telegraph;
  const spin = nowMs / (e.at === ATTACK.spiral ? 40 : 160);
  const m = flyerMotion(e, nowMs);
  const speed = Math.hypot(m.vx, m.vy);
  const t = nowMs / 1000;
  // a slow hover bob, and the bank/pitch of its flight
  const bob = Math.sin(t * 2.2 + e.id) * 3;
  k.shadowAt(e.x, 14 * GAME_CONFIG.tile, 70, 0.18);
  ctx.save();
  if (blinking) ctx.globalAlpha = Math.max(0.15, 1 - prog(a));
  ctx.translate(Math.round(e.x), Math.round(cy + bob) + 6);
  ctx.scale(e.f * FLYER, FLYER);
  ctx.rotate(m.bank);
  const form = L.flyer ?? 'cloud';
  let core: [number, number];
  if (form === 'makara') core = drawMakara(k, L, S, t, speed, a, e, spin);
  else if (form === 'cloud') core = drawStormCloud(k, L, S, e, t, speed, flash, spin, cy);
  else if (form === 'shadow') core = drawShade(k, L, S, e, t, speed, flash, spin);
  else core = drawVimana(k, L, S, e, t, speed, flash, spin, cy);
  ctx.restore();
  // tells
  const p = a.telegraph ? prog(a) : 0;
  const gx = e.x + e.f * core[0] * FLYER;
  const gy = cy + bob + 6 + core[1] * FLYER;
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
  // Throne / pedestal first (world space: the king faces left, so the light comes from the left).
  setLight(-1);
  throne(k, L, e, S, nowMs);
  // Mirror so the king faces left (toward the squad): local x grows to the left.
  ctx.translate(Math.round(e.x), Math.round(e.y));
  ctx.scale(-1, 1);
  setLight(1);
  const skin = S(L.skin);
  const shade = S(L.shade);
  const live = !dead;
  const breathe = live ? Math.sin(nowMs / 640) : 0;
  // a cape behind the king: its hem ripples, slower in calm, faster as he weakens
  const capeT = nowMs / (ph >= 3 ? 150 : 260);
  const hem: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const x = 58 - i * 15;
    hem.push(x, -30 + (live ? Math.sin(capeT + i * 0.8) * (3 + i * 0.6) : 0));
  }
  poly(ctx, [-36, -150, 50, -152, ...hem], S(tone(L.cloth, -0.3)));
  // legs (seated) and lap cloth
  limb(ctx, [-20, -60, 20, -64, 30, -26, 26, -4], 18, shade);
  limb(ctx, [-30, -58, 6, -70, 14, -30, 10, -4], 20, skin);
  poly(ctx, [-44, -50, 40, -54, 48, -78, -40, -86], S(L.cloth));
  // everything above the lap rises and falls with his breath
  ctx.save();
  ctx.translate(0, -breathe * 1.5);
  // extra arms (back), each pair waving out of step with the next
  const arms = L.arms ?? 2;
  for (let i = 1; i < arms / 2; i++) {
    const sw = live ? Math.sin(nowMs / 400 + i) * 0.15 : 0;
    const wv = live ? Math.sin(nowMs / 420 + i * 1.3) * 5 : 0;
    limb(ctx, [-6, -150, -40 - i * 8, -170 - i * 12 + wv, -54 - i * 6, -196 - i * 10 + wv * 1.5], 10, shade);
    limb(ctx, [26, -150, 56 + i * 8, -168 - i * 12 - wv, 70 + i * 4, -194 - i * 10 - wv * 1.5], 10, shade);
    weapon(ctx, L, 70 + i * 4, -194 - i * 10 - wv * 1.5, -1.3 + sw, 0.9, spin + i);
    weapon(ctx, L, -54 - i * 6, -196 - i * 10 + wv * 1.5, -1.9 - sw, 0.9, -spin - i);
  }
  // torso
  poly(ctx, [-34, -80, 38, -84, 46, -156, -30, -160], skin);
  if (!dead) muscles(ctx, 6, -158, -94, 72);
  ctx.fillStyle = S(L.metal);
  ctx.fillRect(-34, -92, 80, 7); // belt
  ctx.fillStyle = S(tone(L.metal, 0.35));
  ctx.fillRect(-34, -92, 80, 2);
  ell(ctx, 6, -88, 8, 6, S(L.metal)); // buckle
  ell(ctx, 6, -88, 3, 3, L.glow, false);
  poly(ctx, [-26, -146, 38, -148, 30, -132, -18, -130], S(L.metal)); // necklace
  for (let i = 0; i < 4; i++) ell(ctx, -14 + i * 14, -136, 4, 4, L.glow, false);
  // shoulders and the two main arms; the front one holds the weapon toward the squad
  ell(ctx, -30, -150, 16, 14, skin);
  ell(ctx, 42, -152, 16, 14, skin);
  // The weapon hand gestures with the attack (local -x is towards the squad): raised to call rain or
  // reinforcements, thrust out for a volley, lifted high then brought down for a slam, lowered for a beam.
  const t = a.telegraph ? prog(a) : 1;
  let hand: [number, number] = [-50, -96 + (live ? Math.sin(nowMs / 700) * 3 : 0)];
  let wAng = -0.2;
  if (live && (e.at === ATTACK.rain || e.at === ATTACK.summon) && a.telegraph) {
    hand = [-44, -96 - 40 * Math.min(1, t * 1.5)];
    wAng = -1.2;
  } else if (live && e.at === ATTACK.volley && a.telegraph) {
    hand = [-50 - 22 * t, -112 + 6 * t];
    wAng = -0.05;
  } else if (live && e.at === ATTACK.slam) {
    hand = a.telegraph ? [-40, -150 - 30 * t] : [-58, -60];
    wAng = a.telegraph ? -1.4 : 0.6;
  } else if (live && (e.at === ATTACK.beamLow || e.at === ATTACK.beamHigh)) {
    hand = [-62, e.at === ATTACK.beamLow ? -82 : -118];
    wAng = e.at === ATTACK.beamLow ? 0.35 : -0.25;
  }
  const [ex, ey] = joint(-30, -146, hand[0], hand[1], 28, 28, 1);
  limb(ctx, [-30, -146, ex, ey, hand[0], hand[1]], 14, skin);
  // the other arm rests on the throne, fingers drumming
  const rest = live ? Math.sin(nowMs / 900) * 2 : 0;
  limb(ctx, [42, -146, 62, -126 + rest, 66, -100 + rest], 14, shade);
  band(ctx, L, S, (ex + hand[0]) / 2 + 2, (ey + hand[1]) / 2, 9);
  band(ctx, L, S, 61, -122 + rest, 9);
  pauldron(ctx, L, S, -30, -152, 15);
  pauldron(ctx, L, S, 42, -154, 14);
  weapon(ctx, L, hand[0], hand[1], wAng, 1.3, spin);
  // heads: each turns a little on its own
  const n = L.heads ?? 1;
  for (let i = n - 1; i >= 0; i--) {
    const off = (i - (n - 1) / 2) * 30;
    const side = Math.abs(off) > 0;
    const look = live ? Math.sin(nowMs / 800 + i * 2.1) * (side ? 2 : 1) : 0;
    head(
      k,
      L,
      4 + off + look,
      -182 - (side ? 0 : 6) + Math.abs(off) * 0.25,
      side ? 1.1 : 1.45,
      e.h === 1 && !dead,
      ph,
    );
  }
  ctx.restore();
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

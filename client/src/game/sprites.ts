import { heroOf, type Faction, type HeroDef } from '@strikesquad/shared';

/**
 * Pixel-art sprite factory. Every sprite is *drawn by code* onto a small offscreen canvas (one canvas pixel = one
 * world pixel), shaded with a light-from-top-left palette, then given a 1 px dark outline automatically - the
 * finishing touch that makes pixel art read cleanly at any zoom. Sprites are built lazily and cached, so the per-frame
 * cost is a single `drawImage`.
 *
 * All characters are original designs.
 */

export type Pose = 'idle' | 'run' | 'jump' | 'fall' | 'crouch' | 'down' | 'slide' | 'dash' | 'melee' | 'flip';
export type Aim = 'f' | 'uf' | 'u' | 'df' | 'd';

export const SPRITE_W = 48;
export const SPRITE_H = 50;
/** Feet line and centre inside a character sprite canvas. */
export const FEET_Y = 48;
export const CENTER_X = 20;
export const RUN_FRAMES = 8;

const OUTLINE = '#120f17';

export interface Look {
  color: string;
  shade: string;
  skin: string;
  hair: string;
  pants: string;
  accent: string;
  headgear:
    | HeroDef['headgear']
    | 'gasmask'
    | 'horns'
    | 'dome'
    | 'wraps'
    | 'jackal'
    | 'nemes'
    | 'viking'
    | 'crest'
    | 'alien';
  beard?: boolean;
  vest: string;
  /** What the hands hold (default: a rifle). Themed enemies carry staffs, spears or ray guns. */
  weapon?: 'gun' | 'staff' | 'spear' | 'raygun';
  /** Torso detail (default: a tactical vest). */
  torso?: 'vest' | 'wraps' | 'ribs' | 'plain' | 'fur';
  /** Enemy colouring for the weapon (darker metal, no hero stripe). */
  enemy?: boolean;
}

export const ENEMY_LOOK: Look = {
  color: '#6b7280',
  shade: '#454b55',
  skin: '#c7a17a',
  hair: '#222',
  pants: '#2f333a',
  accent: '#ff2d2d',
  headgear: 'gasmask',
  vest: '#34383f',
};

/** Enemy variants: same trooper, different kit colours so each type reads at a glance. */
export const SHIELD_LOOK: Look = {
  ...ENEMY_LOOK,
  color: '#3f4b5c',
  shade: '#2a3340',
  vest: '#1f2731',
  accent: '#38bdf8',
};
export const JET_LOOK: Look = {
  ...ENEMY_LOOK,
  color: '#7c4a2d',
  shade: '#5a3420',
  vest: '#3b2a1e',
  accent: '#ffb02e',
};
export const GRENADIER_LOOK: Look = {
  ...ENEMY_LOOK,
  color: '#556b2f',
  shade: '#3d4d22',
  vest: '#2f3a1c',
  accent: '#a3e635',
};

/** Demon army (advanced mission): red-black skin, horns, glowing eyes in the accent colour. */
const DEMON_BASE: Look = {
  color: '#3b0d14',
  shade: '#260709',
  skin: '#9f2a2a',
  hair: '#120507',
  pants: '#1c0a0c',
  accent: '#ffb703',
  headgear: 'horns',
  vest: '#2a0a0e',
  weapon: 'staff',
  torso: 'plain',
  enemy: true,
};
/** Aliens from deep space: grey-green skin, huge heads and black eyes, silver suits, ray guns. */
const ALIEN_BASE: Look = {
  color: '#3f4a5c',
  shade: '#2a3240',
  skin: '#8fbf7a',
  hair: '#1b1630',
  pants: '#2a3240',
  accent: '#67e8f9',
  headgear: 'alien',
  vest: '#566275',
  weapon: 'raygun',
  torso: 'plain',
  enemy: true,
};
/** The pharaoh's tomb guard: bandaged mummies, jackal-headed guards, priests in striped headdresses. */
const MUMMY_BASE: Look = {
  color: '#cbbd98',
  shade: '#a39470',
  skin: '#bfae86',
  hair: '#2b2418',
  pants: '#b3a37c',
  accent: '#7cfc9a',
  headgear: 'wraps',
  vest: '#d8cba8',
  weapon: 'staff',
  torso: 'wraps',
  enemy: true,
};
/** Undead viking warriors (draugr): frost-blue skin, iron helms, beards and furs. */
const DRAUGR_BASE: Look = {
  color: '#4a5a6a',
  shade: '#334150',
  skin: '#9fbfd0',
  hair: '#d7e3ea',
  pants: '#3a3f44',
  accent: '#7dd3fc',
  headgear: 'viking',
  beard: true,
  vest: '#6b5844',
  weapon: 'spear',
  torso: 'fur',
  enemy: true,
};
/** Skeleton hoplites: bone bodies, bronze crested helmets, red cloaks. */
const HOPLITE_BASE: Look = {
  color: '#9a2f2a',
  shade: '#6e1f1b',
  skin: '#e8e1cf',
  hair: '#2b2620',
  pants: '#2b2620',
  accent: '#fde68a',
  headgear: 'crest',
  vest: '#c08a3e',
  weapon: 'spear',
  torso: 'ribs',
  enemy: true,
};

export type TrooperLook = 'soldier' | 'shield' | 'jet' | 'gren';
/** Trooper looks per faction (soldier, shield, jetpack/flyer, grenadier). */
export const FACTION_LOOKS: Record<Faction, Record<TrooperLook, Look>> = {
  army: { soldier: ENEMY_LOOK, shield: SHIELD_LOOK, jet: JET_LOOK, gren: GRENADIER_LOOK },
  pharaoh: {
    soldier: MUMMY_BASE,
    shield: {
      ...MUMMY_BASE,
      headgear: 'jackal',
      skin: '#1f1a17',
      color: '#1d4ed8',
      shade: '#1e3a8a',
      vest: '#d4a017',
      torso: 'plain',
      weapon: 'spear',
      accent: '#fbbf24',
    },
    jet: { ...MUMMY_BASE, accent: '#facc15' },
    gren: {
      ...MUMMY_BASE,
      headgear: 'nemes',
      skin: '#b07a4a',
      color: '#f5f0e1',
      shade: '#d6cfb8',
      vest: '#1d4ed8',
      torso: 'plain',
      accent: '#fbbf24',
    },
  },
  norse: {
    soldier: DRAUGR_BASE,
    shield: { ...DRAUGR_BASE, color: '#5b3a24', shade: '#3e2718', hair: '#c9b48a', accent: '#fca5a5' },
    jet: {
      ...DRAUGR_BASE,
      headgear: 'hood',
      color: '#1e293b',
      shade: '#0f172a',
      accent: '#bae6fd',
      beard: false,
    },
    gren: {
      ...DRAUGR_BASE,
      headgear: 'hood',
      color: '#7c2d12',
      shade: '#5a1f0b',
      weapon: 'staff',
      accent: '#93c5fd',
      beard: false,
    },
  },
  olympus: {
    soldier: HOPLITE_BASE,
    shield: { ...HOPLITE_BASE, color: '#7f1d1d', accent: '#fcd34d' },
    jet: {
      ...HOPLITE_BASE,
      headgear: 'horns',
      color: '#4b5563',
      shade: '#374151',
      skin: '#a8a29e',
      torso: 'plain',
      accent: '#fde047',
    },
    gren: { ...HOPLITE_BASE, color: '#1e3a8a', shade: '#172554', weapon: 'staff', accent: '#93c5fd' },
  },
  demon: {
    soldier: DEMON_BASE,
    shield: { ...DEMON_BASE, color: '#1f1f2e', accent: '#f97316', weapon: 'spear' },
    jet: { ...DEMON_BASE, skin: '#7c2d12', accent: '#fde047' },
    gren: { ...DEMON_BASE, skin: '#4d7c0f', color: '#1a2e05', accent: '#bef264' },
  },
  void: {
    soldier: ALIEN_BASE,
    shield: { ...ALIEN_BASE, skin: '#9ca3af', color: '#1e293b', accent: '#38bdf8' },
    jet: { ...ALIEN_BASE, skin: '#a7c4a0', accent: '#f0abfc' },
    gren: { ...ALIEN_BASE, skin: '#c4b5fd', color: '#4c1d95', accent: '#a7f3d0' },
  },
};

/**
 * Astra Saga hosts: each stage fights its own army (fire asuras, sea rakshasas, storm riders, naga warriors, maya
 * guards, ash ghosts, war-field soldiers, fort guards, duellists, the last great host), so stages never look like
 * the same level again. Index = stage number - 1.
 */
const host = (b: Omit<Look, 'enemy'>, shield: Partial<Look>, jet: Partial<Look>, gren: Partial<Look>) => {
  const base: Look = { ...b, enemy: true };
  return {
    soldier: base,
    shield: { ...base, ...shield },
    jet: { ...base, ...jet },
    gren: { ...base, ...gren },
  } satisfies Record<TrooperLook, Look>;
};
export const SAGA_HOSTS: readonly Record<TrooperLook, Look>[] = [
  // 1 Agnivan: fire asuras
  host(
    {
      color: '#3b0d14',
      shade: '#260709',
      skin: '#c2410c',
      hair: '#120507',
      pants: '#1c0a0c',
      accent: '#fde047',
      headgear: 'horns',
      vest: '#7c2d12',
      weapon: 'staff',
      torso: 'plain',
    },
    { color: '#1c1917', accent: '#fb923c', weapon: 'spear' },
    { skin: '#ea580c', accent: '#fef08a' },
    { skin: '#9a3412', color: '#451a03', accent: '#fdba74' },
  ),
  // 2 Sagar Setu: sea rakshasas with fin crests
  host(
    {
      color: '#155e75',
      shade: '#0e3a4a',
      skin: '#0f766e',
      hair: '#042f2e',
      pants: '#083344',
      accent: '#67e8f9',
      headgear: 'crest',
      vest: '#0e7490',
      weapon: 'spear',
      torso: 'plain',
    },
    { color: '#1e3a8a', accent: '#a5f3fc' },
    { skin: '#14b8a6', accent: '#f0abfc', weapon: 'staff' },
    { skin: '#065f46', color: '#134e4a', accent: '#5eead4', weapon: 'staff' },
  ),
  // 3 Vayu Shikhar: storm riders in hoods
  host(
    {
      color: '#cbd5e1',
      shade: '#94a3b8',
      skin: '#64748b',
      hair: '#1e293b',
      pants: '#334155',
      accent: '#38bdf8',
      headgear: 'hood',
      vest: '#e2e8f0',
      weapon: 'staff',
      torso: 'plain',
    },
    { color: '#475569', accent: '#facc15', weapon: 'spear' },
    { color: '#f1f5f9', skin: '#94a3b8', accent: '#93c5fd' },
    { color: '#1e293b', accent: '#fde047' },
  ),
  // 4 Naag Lok: naga warriors
  host(
    {
      color: '#166534',
      shade: '#14532d',
      skin: '#4d7c0f',
      hair: '#052e16',
      pants: '#14532d',
      accent: '#bef264',
      headgear: 'hood',
      vest: '#facc15',
      weapon: 'spear',
      torso: 'ribs',
    },
    { color: '#052e16', accent: '#fde047' },
    { skin: '#65a30d', accent: '#a3e635', weapon: 'staff' },
    { skin: '#3f6212', color: '#1a2e05', accent: '#d9f99d', weapon: 'staff' },
  ),
  // 5 Maya Nagri: palace guards of illusion
  host(
    {
      color: '#6b21a8',
      shade: '#4c1d95',
      skin: '#c4b5fd',
      hair: '#1e1b4b',
      pants: '#312e81',
      accent: '#f0abfc',
      headgear: 'nemes',
      vest: '#f9a8d4',
      weapon: 'staff',
      torso: 'plain',
    },
    { color: '#1e1b4b', accent: '#e879f9', weapon: 'spear' },
    { skin: '#e9d5ff', accent: '#fbcfe8' },
    { color: '#86198f', accent: '#f5d0fe' },
  ),
  // 6 Bhasm Parvat: ash ghosts in grave wraps
  host(
    {
      color: '#a8a29e',
      shade: '#78716c',
      skin: '#d6d3d1',
      hair: '#1c1917',
      pants: '#44403c',
      accent: '#5eead4',
      headgear: 'wraps',
      vest: '#57534e',
      weapon: 'staff',
      torso: 'ribs',
    },
    { color: '#44403c', accent: '#2dd4bf', weapon: 'spear' },
    { color: '#d6d3d1', accent: '#99f6e4' },
    { color: '#292524', accent: '#a7f3d0' },
  ),
  // 7 Samarpan Maidan: soldiers of the war field
  host(
    {
      color: '#991b1b',
      shade: '#7f1d1d',
      skin: '#a16207',
      hair: '#1c1917',
      pants: '#44403c',
      accent: '#fde047',
      headgear: 'helmet',
      vest: '#d6d3d1',
      weapon: 'spear',
      torso: 'vest',
    },
    { color: '#78350f', accent: '#fbbf24' },
    { color: '#b91c1c', accent: '#fecaca', weapon: 'staff' },
    { color: '#713f12', accent: '#fde68a', weapon: 'staff' },
  ),
  // 8 Chakra Durg: iron fort guards
  host(
    {
      color: '#334155',
      shade: '#1e293b',
      skin: '#9a3412',
      hair: '#0f172a',
      pants: '#1e293b',
      accent: '#f87171',
      headgear: 'viking',
      vest: '#64748b',
      weapon: 'spear',
      torso: 'fur',
    },
    { color: '#0f172a', accent: '#fca5a5' },
    { color: '#475569', accent: '#fdba74', weapon: 'staff' },
    { color: '#7f1d1d', accent: '#fecaca', weapon: 'staff' },
  ),
  // 9 Dwand Bhoomi: golden duellists
  host(
    {
      color: '#1d4ed8',
      shade: '#1e3a8a',
      skin: '#b45309',
      hair: '#1c1917',
      pants: '#1e3a8a',
      accent: '#fde047',
      headgear: 'crest',
      vest: '#fde68a',
      weapon: 'spear',
      torso: 'plain',
    },
    { color: '#ca8a04', accent: '#fef9c3' },
    { color: '#7c2d12', accent: '#fde68a', weapon: 'staff' },
    { color: '#0f766e', accent: '#fef08a', weapon: 'staff' },
  ),
  // 10 Mahayuddh: the last great host
  host(
    {
      color: '#1c1917',
      shade: '#0c0a09',
      skin: '#7f1d1d',
      hair: '#000000',
      pants: '#0c0a09',
      accent: '#ef4444',
      headgear: 'horns',
      vest: '#fbbf24',
      weapon: 'spear',
      torso: 'plain',
    },
    { color: '#3b0764', accent: '#c4b5fd' },
    { skin: '#1e3a8a', accent: '#93c5fd', weapon: 'staff' },
    { skin: '#14532d', color: '#052e16', accent: '#bef264', weapon: 'staff' },
  ),
];

export function heroLook(id: number): Look {
  const h = heroOf(id);
  return { ...h, vest: '#3d4434' };
}

// ------------------------------------------------------------------ colour helpers

function hexToRgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const m = hex.match(/\d+/g) ?? ['0', '0', '0'];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amt > 0) or darken (amt < 0) a colour, -1..1. */
export function tone(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number): number =>
    Math.round(Math.max(0, Math.min(255, amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ------------------------------------------------------------------ pixel canvas

class Px {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const g = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
  }

  r(x: number, y: number, w: number, h: number, c: string): void {
    this.g.fillStyle = c;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  dot(x: number, y: number, c: string): void {
    this.r(x, y, 1, 1, c);
  }

  /** Fill pixels for which `shape(u, v)` returns a colour, with (u, v) = coordinates rotated by `angle` about (px, py). */
  rotated(
    px: number,
    py: number,
    angle: number,
    radius: number,
    shape: (u: number, v: number) => string | null,
  ): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let y = Math.floor(py - radius); y <= py + radius; y++)
      for (let x = Math.floor(px - radius); x <= px + radius; x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const dx = x + 0.5 - px;
        const dy = y + 0.5 - py;
        const col = shape(dx * c + dy * s, -dx * s + dy * c);
        if (col) this.dot(x, y, col);
      }
  }

  /** 1-px outline around every opaque pixel (4-neighbourhood), the classic pixel-art finish. */
  outline(color = OUTLINE): HTMLCanvasElement {
    const img = this.g.getImageData(0, 0, this.w, this.h);
    const d = img.data;
    const [r, g, b] = hexToRgb(color);
    const solid = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < this.w && y < this.h && (d[(y * this.w + x) * 4 + 3] as number) > 100;
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)))
          add.push((y * this.w + x) * 4);
    for (const i of add) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
    this.g.putImageData(img, 0, 0);
    return this.canvas;
  }
}

// ------------------------------------------------------------------ characters

const AIM_ANGLE: Record<Aim, number> = {
  f: 0,
  uf: -Math.PI / 4,
  u: -Math.PI / 2,
  df: Math.PI / 4,
  d: Math.PI / 2,
};

export interface CharFrame {
  img: HTMLCanvasElement;
  /** Muzzle position relative to the feet centre (facing right). */
  muzzleX: number;
  muzzleY: number;
}

const cache = new Map<string, CharFrame>();

export function aimFrom(ax: number, ay: number): Aim {
  if (ay < 0) return ax === 0 ? 'u' : 'uf';
  if (ay > 0) return ax === 0 ? 'd' : 'df';
  return 'f';
}

/** A character frame, facing right. */
export function charFrame(lookKey: string, look: Look, pose: Pose, frame: number, aim: Aim): CharFrame {
  const key = `${lookKey}|${pose}|${frame}|${aim}`;
  let f = cache.get(key);
  if (!f) {
    f = drawCharacter(look, pose, frame, aim);
    cache.set(key, f);
  }
  return f;
}

function drawLeg(
  p: Px,
  L: Look,
  hipX: number,
  hipY: number,
  footDx: number,
  lift: number,
  back: boolean,
): void {
  const footY = FEET_Y - 4 - lift;
  const pants = back ? tone(L.pants, -0.25) : L.pants;
  const rows = Math.max(1, footY - hipY);
  for (let y = hipY; y < footY; y++) {
    const t = (y - hipY) / rows;
    const x = hipX + Math.round(footDx * t);
    p.r(x, y, 5, 1, pants);
    p.dot(x, y, tone(pants, -0.25));
    if (!back) p.dot(x + 3, y, tone(pants, 0.15));
  }
  // knee pad
  const kneeY = hipY + Math.round(rows * 0.5);
  p.r(hipX + Math.round(footDx * 0.5), kneeY, 5, 2, back ? '#2a2a2a' : '#3a3a3a');
  // boot
  const bx = hipX + footDx;
  const boot = back ? '#1e1b18' : '#2b2622';
  p.r(bx, footY, 6, 4, boot);
  p.r(bx + 1, footY, 4, 1, tone(boot, 0.25));
  p.r(bx, footY + 3, 7, 1, '#141210');
}

function drawHead(p: Px, L: Look, hx: number, hy: number): void {
  // neck
  p.r(hx + 3, hy + 10, 5, 2, tone(L.skin, -0.2));
  // face block 11x11 with rounded corners
  p.r(hx, hy + 1, 11, 9, L.skin);
  p.r(hx + 1, hy, 9, 11, L.skin);
  p.r(hx, hy + 1, 2, 9, tone(L.skin, -0.18)); // shade at the back of the head
  p.r(hx + 9, hy + 2, 1, 6, tone(L.skin, 0.12)); // light on the face
  // jaw shadow
  p.r(hx + 2, hy + 10, 8, 1, tone(L.skin, -0.22));
  // ear
  p.r(hx + 3, hy + 5, 2, 2, tone(L.skin, -0.14));
  // eye + brow
  p.r(hx + 7, hy + 5, 2, 2, '#1a1418');
  p.dot(hx + 8, hy + 5, '#ffffff');
  p.r(hx + 6, hy + 4, 4, 1, tone(L.hair, 0.05));
  // mouth
  p.r(hx + 8, hy + 8, 2, 1, tone(L.skin, -0.35));
  if (L.beard) {
    p.r(hx + 3, hy + 7, 8, 4, L.hair);
    p.r(hx + 4, hy + 11, 6, 1, L.hair);
    p.r(hx + 8, hy + 8, 2, 1, tone(L.hair, -0.4));
  }
  switch (L.headgear) {
    case 'bandana':
      // spiky hair
      p.r(hx - 1, hy - 3, 12, 5, L.hair);
      for (let i = 0; i < 5; i++) p.r(hx - 1 + i * 3, hy - 5 + (i % 2), 2, 3, L.hair);
      p.r(hx - 1, hy + 1, 3, 6, L.hair);
      // bandana with tails
      p.r(hx - 1, hy + 1, 13, 3, L.color);
      p.r(hx - 1, hy + 1, 13, 1, tone(L.color, 0.3));
      p.r(hx - 5, hy + 2, 4, 2, L.shade);
      p.r(hx - 8, hy + 3, 4, 2, L.color);
      break;
    case 'visor':
      p.r(hx - 1, hy - 2, 13, 6, L.color);
      p.r(hx, hy - 3, 11, 2, tone(L.color, 0.2));
      p.r(hx - 1, hy + 2, 3, 4, L.shade);
      p.r(hx + 5, hy + 3, 7, 3, L.accent);
      p.r(hx + 6, hy + 3, 3, 1, tone(L.accent, 0.6));
      // ponytail
      p.r(hx - 4, hy + 2, 4, 3, L.hair);
      p.r(hx - 6, hy + 4, 3, 5, L.hair);
      break;
    case 'beret':
      p.r(hx - 1, hy - 1, 12, 4, L.color);
      p.r(hx - 2, hy - 3, 11, 3, L.color);
      p.r(hx - 2, hy - 3, 6, 1, tone(L.color, 0.3));
      p.r(hx + 9, hy, 2, 2, '#e9c46a');
      p.r(hx - 1, hy + 3, 2, 3, L.hair);
      break;
    case 'hood':
      p.r(hx - 2, hy - 3, 14, 8, L.color);
      p.r(hx - 2, hy - 3, 14, 2, tone(L.color, 0.25));
      p.r(hx - 2, hy + 5, 4, 7, L.shade);
      p.r(hx + 5, hy + 7, 6, 4, '#1c1726'); // face mask
      p.r(hx + 6, hy + 4, 4, 2, L.accent);
      p.dot(hx + 8, hy + 4, '#ffffff');
      break;
    case 'hardhat':
      p.r(hx - 2, hy - 1, 15, 3, L.color);
      p.r(hx, hy - 4, 11, 4, L.color);
      p.r(hx + 1, hy - 4, 6, 1, tone(L.color, 0.35));
      p.r(hx + 4, hy - 3, 2, 3, L.shade);
      p.r(hx + 2, hy - 2, 7, 2, L.accent); // goggles on the hat
      p.r(hx - 1, hy + 2, 2, 4, L.hair);
      break;
    case 'helmet':
      p.r(hx - 2, hy - 3, 14, 10, '#d9dee5');
      p.r(hx - 2, hy - 3, 14, 2, '#ffffff');
      p.r(hx - 2, hy + 3, 3, 5, '#a9b2bd');
      p.r(hx + 4, hy + 2, 8, 5, '#0b3c49');
      p.r(hx + 5, hy + 2, 5, 1, L.accent);
      p.r(hx + 1, hy - 1, 2, 2, L.color);
      break;
    case 'headset':
      p.r(hx - 1, hy - 2, 12, 5, L.hair);
      p.r(hx - 2, hy + 1, 4, 8, L.hair);
      p.r(hx + 8, hy + 1, 3, 2, L.hair);
      p.r(hx + 1, hy - 3, 8, 2, L.color);
      p.r(hx - 1, hy + 3, 4, 5, L.color);
      p.r(hx, hy + 4, 2, 3, L.accent);
      p.r(hx + 6, hy + 8, 4, 1, '#333');
      break;
    case 'cap':
      p.r(hx - 1, hy - 2, 12, 4, L.color);
      p.r(hx + 8, hy + 1, 6, 2, L.shade); // peak
      p.r(hx, hy - 3, 9, 2, tone(L.color, 0.3));
      p.r(hx + 3, hy - 1, 3, 2, '#3d3d3d');
      p.r(hx - 1, hy + 2, 2, 4, L.hair);
      break;
    case 'horns':
      // curved horns, a heavy brow and glowing eyes
      p.r(hx - 1, hy - 4, 3, 4, '#e7e5e4');
      p.r(hx - 2, hy - 6, 2, 3, '#f5f5f4');
      p.r(hx + 8, hy - 4, 3, 4, '#e7e5e4');
      p.r(hx + 10, hy - 6, 2, 3, '#f5f5f4');
      p.r(hx, hy, 11, 2, L.hair);
      p.r(hx + 6, hy + 4, 4, 2, L.accent);
      p.dot(hx + 8, hy + 4, '#ffffff');
      p.r(hx + 7, hy + 8, 4, 2, '#1a0505'); // fanged mouth
      p.dot(hx + 8, hy + 9, '#f5f5f4');
      break;
    case 'dome':
      // glass dome helmet with a visor glow
      p.r(hx - 2, hy - 3, 15, 13, 'rgba(165,243,252,0.35)');
      p.r(hx - 1, hy - 4, 13, 1, 'rgba(224,242,254,0.8)');
      p.r(hx + 1, hy - 2, 2, 4, 'rgba(255,255,255,0.7)');
      p.r(hx + 6, hy + 4, 5, 2, L.accent);
      p.r(hx - 2, hy + 10, 15, 2, '#475569');
      break;
    case 'wraps':
      // mummy bandages over the whole head, one glowing eye showing through
      p.r(hx - 1, hy - 2, 13, 13, L.color);
      for (let i = 0; i < 6; i++)
        p.r(hx - 1, hy - 2 + i * 2 + (i % 2), 13, 1, i % 2 ? L.shade : tone(L.color, 0.25));
      p.r(hx + 1, hy + 3, 11, 1, L.shade);
      p.r(hx + 6, hy + 4, 4, 2, '#1a1418');
      p.r(hx + 7, hy + 4, 2, 2, L.accent);
      p.r(hx - 4, hy + 6, 4, 2, L.color); // loose bandage end
      p.r(hx - 6, hy + 8, 3, 2, L.shade);
      break;
    case 'jackal':
      // jackal head: tall ears, long snout, gold collar
      p.r(hx - 1, hy - 1, 12, 12, '#1f1a17');
      p.r(hx + 1, hy - 8, 3, 8, '#1f1a17');
      p.r(hx + 6, hy - 8, 3, 8, '#1f1a17');
      p.r(hx + 2, hy - 6, 1, 5, '#d4a017');
      p.r(hx + 7, hy - 6, 1, 5, '#d4a017');
      p.r(hx + 9, hy + 4, 6, 4, '#1f1a17'); // snout
      p.r(hx + 14, hy + 4, 1, 2, '#000000');
      p.r(hx + 6, hy + 2, 3, 2, L.accent);
      p.r(hx - 1, hy + 9, 13, 3, '#d4a017');
      p.r(hx - 1, hy + 10, 13, 1, '#1d4ed8');
      break;
    case 'nemes':
      // striped pharaoh headdress with a cobra on the brow
      p.r(hx - 2, hy - 3, 14, 6, '#1d4ed8');
      for (let i = 0; i < 14; i += 3) p.r(hx - 2 + i, hy - 3, 1, 6, '#fbbf24');
      p.r(hx - 3, hy + 2, 4, 10, '#1d4ed8');
      p.r(hx - 3, hy + 4, 4, 1, '#fbbf24');
      p.r(hx - 3, hy + 7, 4, 1, '#fbbf24');
      p.r(hx + 9, hy - 5, 2, 3, '#fbbf24'); // cobra
      p.r(hx + 6, hy + 4, 3, 1, '#111111'); // kohl eye line
      p.r(hx + 6, hy + 9, 2, 3, '#1d4ed8'); // false beard
      break;
    case 'viking':
      // iron helm with a nose guard over glowing undead eyes
      p.r(hx - 1, hy - 4, 13, 7, '#6b7280');
      p.r(hx, hy - 5, 11, 2, '#9ca3af');
      p.r(hx + 1, hy - 4, 2, 2, '#d1d5db');
      p.r(hx - 1, hy + 2, 13, 1, '#4b5563');
      p.r(hx + 8, hy + 2, 2, 5, '#6b7280'); // nose guard
      p.r(hx + 6, hy + 4, 2, 2, L.accent);
      p.r(hx - 2, hy + 3, 3, 7, L.hair); // braids
      break;
    case 'crest':
      // bronze crested helmet over a skull
      p.r(hx + 2, hy + 6, 7, 4, '#1a1418'); // skull grin shadow
      for (let i = 0; i < 3; i++) p.r(hx + 3 + i * 2, hy + 8, 1, 2, L.skin);
      p.r(hx - 1, hy - 3, 13, 8, '#b7791f');
      p.r(hx - 1, hy - 3, 13, 2, '#e0b44a');
      p.r(hx - 1, hy + 4, 4, 7, '#b7791f'); // cheek guard
      p.r(hx + 6, hy + 2, 3, 2, '#1a1418');
      p.dot(hx + 7, hy + 2, L.accent);
      // horsehair crest
      p.r(hx - 3, hy - 7, 14, 4, '#b91c1c');
      p.r(hx - 4, hy - 5, 3, 6, '#b91c1c');
      p.r(hx - 2, hy - 7, 12, 1, '#ef4444');
      break;
    case 'alien':
      // a huge bald cranium and big black almond eyes (covers the human face)
      p.r(hx - 2, hy - 6, 15, 12, L.skin);
      p.r(hx - 1, hy - 7, 13, 2, tone(L.skin, 0.15));
      p.r(hx, hy + 5, 10, 4, L.skin);
      p.r(hx + 2, hy + 9, 6, 2, L.skin);
      p.r(hx - 2, hy - 5, 2, 9, tone(L.skin, -0.18));
      p.r(hx + 5, hy, 6, 4, '#05070d');
      p.r(hx + 6, hy + 4, 4, 1, '#05070d');
      p.dot(hx + 9, hy + 1, '#e0f2fe');
      p.r(hx + 8, hy + 7, 2, 1, tone(L.skin, -0.35));
      break;
    case 'gasmask':
      p.r(hx - 2, hy - 3, 14, 7, '#4b525c');
      p.r(hx - 2, hy - 3, 14, 2, '#6d7580');
      p.r(hx + 2, hy + 4, 9, 6, '#2c3036');
      p.r(hx + 5, hy + 4, 6, 2, L.accent);
      p.r(hx + 6, hy + 4, 2, 1, '#ffb3b3');
      p.r(hx + 8, hy + 7, 4, 3, '#1c1f24'); // filter
      break;
  }
}

function drawGun(
  p: Px,
  L: Look,
  px: number,
  py: number,
  angle: number,
  enemy: boolean,
): { mx: number; my: number } {
  const metal = enemy ? '#2a2c31' : '#2c2f37';
  const light = enemy ? '#4a4f58' : '#59606e';
  const weapon = L.weapon ?? 'gun';
  const hands = (u: number, v: number): string | null => {
    if (u >= 12 && u < 14.5 && v >= 0.5 && v < 3) return L.skin;
    if (u >= 5 && u < 7.5 && v >= 0.5 && v < 3) return L.skin;
    if (u >= -1 && u < 5.5 && v >= -1 && v < 2.5) return v < 0 ? tone(L.color, 0.15) : L.color;
    return null;
  };
  p.rotated(px, py, angle, 24, (u, v) => {
    if (weapon === 'staff') {
      // a long staff with a glowing orb where the shots come from
      if (u >= 18 && u < 23 && v >= -3.5 && v < 1.5)
        return u >= 20 && u < 22 && v >= -2.5 && v < 0 ? '#ffffff' : L.accent;
      if (u >= -4 && u < 18 && v >= -0.8 && v < 0.8) return '#6b4423';
      return hands(u, v);
    }
    if (weapon === 'spear') {
      // shaft + a leaf-shaped blade
      if (u >= 16 && u < 23 && Math.abs(v) < 2.4 - (u - 16) * 0.3) return u >= 21 ? '#ffffff' : '#cbd5e1';
      if (u >= -6 && u < 16 && v >= -0.8 && v < 0.8) return '#7c5a35';
      return hands(u, v);
    }
    if (weapon === 'raygun') {
      // bulbous ray gun with glowing rings
      if (u >= 14 && u < 21 && v >= -2 && v < 0.5) return u >= 19 ? L.accent : '#cbd5e1';
      if (u >= 5 && u < 14 && v >= -3.5 && v < 1.2) return (u | 0) % 3 === 0 ? L.accent : '#94a3b8';
      return hands(u, v);
    }
    // rifle: barrel, body, magazine
    if (u >= 15 && u < 22 && v >= -2.2 && v < -0.6) return u >= 21 ? '#0d0d10' : light;
    if (u >= 3 && u < 15.5 && v >= -2.8 && v < 1) {
      if (v < -1.8) return light;
      if (u >= 5 && u < 8 && v < -0.5 && !enemy) return L.color;
      return metal;
    }
    if (u >= 9 && u < 11.8 && v >= 1 && v < 4.8) return '#17191d';
    return hands(u, v);
  });
  return {
    mx: px + Math.cos(angle) * 22 + Math.sin(angle) * 1.4,
    my: py + Math.sin(angle) * 22 - Math.cos(angle) * 1.4,
  };
}

function drawTorso(p: Px, L: Look, x: number, top: number, hipY: number): void {
  const h = hipY - top;
  p.r(x, top, 13, h, L.color);
  p.r(x, top, 2, h, L.shade);
  p.r(x + 11, top + 1, 1, h - 2, tone(L.color, 0.2));
  switch (L.torso ?? 'vest') {
    case 'wraps':
      for (let y = top + 1; y < hipY; y += 3) p.r(x, y, 13, 1, L.shade);
      p.r(x + 3, top + 2, 7, 1, tone(L.color, 0.3));
      return;
    case 'ribs':
      // bare ribcage under a cloak over one shoulder
      p.r(x + 2, top + 1, 10, h - 2, '#1a1418');
      for (let y = top + 2; y < hipY - 2; y += 2) p.r(x + 3, y, 8, 1, L.skin);
      p.r(x + 6, top + 1, 2, h - 2, L.skin); // spine
      p.r(x, top, 4, h, L.color);
      p.r(x, hipY - 3, 13, 3, L.vest); // bronze belt and kilt
      return;
    case 'fur':
      p.r(x + 2, top + 2, 9, h - 3, L.vest);
      p.r(x - 1, top - 1, 15, 4, '#d6d3d1'); // fur mantle
      for (let i = 0; i < 15; i += 2) p.dot(x - 1 + i, top + 3, '#a8a29e');
      p.r(x, hipY - 2, 13, 2, '#3f2a1a');
      p.r(x + 5, hipY - 2, 3, 2, '#9ca3af');
      return;
    case 'plain':
      p.r(x + 3, top + 2, 7, h - 4, L.vest);
      p.r(x + 3, top + 2, 7, 1, tone(L.vest, 0.3));
      p.r(x, hipY - 2, 13, 2, tone(L.color, -0.3));
      return;
    default:
      // tactical vest
      p.r(x + 2, top + 2, 9, h - 3, L.vest);
      p.r(x + 2, top + 2, 9, 1, tone(L.vest, 0.25));
      p.r(x + 3, top + 6, 3, 3, tone(L.vest, -0.3)); // pouches
      p.r(x + 7, top + 6, 3, 3, tone(L.vest, -0.3));
      p.r(x + 3, top + 6, 3, 1, tone(L.vest, 0.15));
      p.r(x + 7, top + 6, 3, 1, tone(L.vest, 0.15));
      // shoulder strap in hero colour
      p.r(x + 8, top + 1, 2, 4, L.shade);
      // belt + buckle
      p.r(x, hipY - 2, 13, 2, '#2b2620');
      p.r(x + 5, hipY - 2, 3, 2, '#d4a017');
  }
}

function drawCharacter(L: Look, pose: Pose, frame: number, aim: Aim): CharFrame {
  const p = new Px(SPRITE_W, SPRITE_H);
  const enemy = L.enemy === true || L.headgear === 'gasmask';
  if (pose === 'down') {
    // Lying on the ground, face up, an arm reaching out.
    const y = FEET_Y;
    p.r(2, y - 5, 6, 4, '#2b2622');
    p.r(7, y - 6, 12, 5, L.pants);
    p.r(7, y - 6, 12, 1, tone(L.pants, 0.15));
    p.r(18, y - 8, 13, 7, L.color);
    p.r(19, y - 8, 10, 2, tone(L.color, 0.25));
    p.r(20, y - 7, 8, 5, L.vest);
    p.r(31, y - 10, 10, 9, L.skin);
    p.r(
      31,
      y - 10,
      10,
      3,
      L.headgear === 'helmet' ? '#d9dee5' : L.headgear === 'gasmask' ? '#4b525c' : L.color,
    );
    p.r(36, y - 5, 3, 1, '#1a1418'); // closed eye
    p.r(28, y - 14, 3, 7, L.color); // raised arm
    p.r(28, y - 17, 3, 3, L.skin);
    return { img: p.outline(), muzzleX: 0, muzzleY: -10 };
  }

  if (pose === 'slide') {
    // Low slide: legs out in front along the floor, body leaning back, gun level.
    const y = FEET_Y;
    p.r(18, y - 6, 16, 4, L.pants);
    p.r(18, y - 6, 16, 1, tone(L.pants, 0.15));
    p.r(33, y - 8, 6, 6, '#2b2622'); // boot up front
    p.r(33, y - 3, 7, 1, '#141210');
    p.r(16, y - 4, 12, 3, tone(L.pants, -0.25)); // back leg
    drawTorso(p, L, 8, y - 19, y - 4);
    drawHead(p, L, 6, y - 31);
    const m = drawGun(p, L, 14, y - 14, 0, enemy);
    // dust kicked up
    p.r(38, y - 2, 3, 2, 'rgba(190,170,140,0.9)');
    p.r(42, y - 4, 2, 2, 'rgba(190,170,140,0.7)');
    return { img: p.outline(), muzzleX: m.mx - CENTER_X, muzzleY: m.my - FEET_Y };
  }

  const crouch = pose === 'crouch';
  const bob =
    pose === 'run'
      ? frame % 4 === 1 || frame % 4 === 2
        ? -1
        : 0
      : pose === 'idle'
        ? frame === 1
          ? -1
          : 0
        : 0;
  const hipY = (crouch ? 40 : pose === 'flip' ? 30 : 34) + bob;
  const lean = pose === 'dash' ? 3 : pose === 'melee' ? 1 : 0;
  const top = hipY - 13;
  const tx = 14 + lean;

  // legs
  if (crouch) {
    p.r(9, 42, 8, 4, tone(L.pants, -0.25)); // back thigh, kneeling
    p.r(7, 44, 6, 4, '#1e1b18');
    p.r(19, 40, 9, 4, L.pants); // front thigh forward
    p.r(24, 40, 5, 4, L.pants);
    p.r(24, 44, 7, 4, '#2b2622');
    p.r(24, 47, 8, 1, '#141210');
  } else if (pose === 'run') {
    const ph = (frame / RUN_FRAMES) * Math.PI * 2;
    const swing = Math.round(Math.sin(ph) * 6);
    const liftF = Math.max(0, Math.round(Math.cos(ph) * 3));
    const liftB = Math.max(0, Math.round(-Math.cos(ph) * 3));
    drawLeg(p, L, 16, hipY, -swing, liftB, true);
    drawLeg(p, L, 18, hipY, swing, liftF, false);
  } else if (pose === 'dash') {
    drawLeg(p, L, 15, hipY, -10, 3, true); // trailing leg stretched back
    drawLeg(p, L, 19, hipY, 6, 2, false);
  } else if (pose === 'melee') {
    drawLeg(p, L, 14, hipY, -5, 0, true); // wide stance
    drawLeg(p, L, 19, hipY, 5, 0, false);
  } else if (pose === 'flip') {
    drawLeg(p, L, 15, hipY, 2, 10, true); // knees tucked up
    drawLeg(p, L, 19, hipY, 5, 9, false);
  } else if (pose === 'jump') {
    drawLeg(p, L, 15, hipY, -3, 4, true);
    drawLeg(p, L, 19, hipY, 4, 6, false);
  } else if (pose === 'fall') {
    drawLeg(p, L, 15, hipY, -2, 1, true);
    drawLeg(p, L, 19, hipY, 2, 0, false);
  } else {
    drawLeg(p, L, 15, hipY, 0, 0, true);
    drawLeg(p, L, 19, hipY, 1, 0, false);
  }

  // back arm (behind the body)
  p.r(tx - 1, top + 2, 3, 7, L.shade);
  p.r(tx - 1, top + 9, 3, 2, tone(L.skin, -0.2));

  drawTorso(p, L, tx, top, hipY);
  drawHead(p, L, tx + 1 + (pose === 'dash' ? 1 : 0), top - 12);

  if (pose === 'melee') {
    // Knife arm: frame 0 = wind-up (blade back over the shoulder), 1 = slash (arm straight out).
    const sx = tx + 8;
    const sy = top + 4;
    if (frame === 0) {
      p.r(sx - 4, sy - 6, 3, 8, L.color);
      p.r(sx - 4, sy - 8, 3, 2, L.skin);
      p.r(sx - 3, sy - 16, 2, 8, '#e5e7eb');
      p.dot(sx - 3, sy - 16, '#ffffff');
    } else {
      p.r(sx, sy, 10, 3, L.color);
      p.r(sx, sy, 10, 1, tone(L.color, 0.2));
      p.r(sx + 10, sy, 3, 3, L.skin);
      p.r(sx + 13, sy + 1, 11, 2, '#e5e7eb');
      p.r(sx + 13, sy + 1, 11, 1, '#ffffff');
      p.r(sx + 12, sy - 1, 1, 5, '#3a3a3a'); // guard
    }
    return { img: p.outline(), muzzleX: sx + 24 - CENTER_X, muzzleY: sy + 1 - FEET_Y };
  }

  const angle = crouch ? 0 : AIM_ANGLE[aim];
  const sx = aim === 'u' ? tx + 9 : tx + 7;
  const sy = top + (aim === 'u' ? 3 : 5);
  const m = drawGun(p, L, sx, sy, angle, enemy);
  return { img: p.outline(), muzzleX: m.mx - CENTER_X, muzzleY: m.my - FEET_Y };
}

// ------------------------------------------------------------------ enemies, props, pick-ups

const misc = new Map<string, HTMLCanvasElement>();
function memo(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = misc.get(key);
  if (!c) {
    c = make();
    misc.set(key, c);
  }
  return c;
}

/** Turret base (static) - the barrel is drawn separately so it can turn. Origin: bottom centre, 40x30. */
export function turretBase(): HTMLCanvasElement {
  return memo('turret', () => {
    const p = new Px(40, 30);
    // sandbag ring
    for (let i = 0; i < 4; i++) {
      p.r(2 + i * 9, 20, 9, 6, '#a68a5b');
      p.r(2 + i * 9, 20, 9, 2, '#c4a774');
      p.r(2 + i * 9, 25, 9, 1, '#7d6743');
    }
    p.r(6, 24, 28, 6, '#8d7450');
    // dome
    p.r(10, 9, 20, 12, '#5d646f');
    p.r(12, 6, 16, 4, '#5d646f');
    p.r(12, 6, 16, 2, '#818a96');
    p.r(10, 9, 3, 12, '#454b55');
    p.r(17, 12, 6, 3, '#1b1d21');
    p.r(18, 13, 4, 1, '#ff3b3b');
    // hazard stripe
    for (let i = 0; i < 5; i++) p.r(10 + i * 4, 18, 2, 3, i % 2 ? '#1b1b1b' : '#f4c430');
    return p.outline();
  });
}

export function turretBarrel(): HTMLCanvasElement {
  return memo('turret-barrel', () => {
    const p = new Px(26, 8);
    p.r(0, 1, 22, 6, '#2b2e34');
    p.r(0, 1, 22, 2, '#4e545e');
    p.r(20, 0, 6, 8, '#1a1c20');
    return p.outline();
  });
}

/** Drone, 36x22, two rotor frames. Origin: bottom centre. */
export function droneSprite(frame: number): HTMLCanvasElement {
  return memo(`drone${frame % 2}`, () => {
    const p = new Px(40, 22);
    // rotors
    const blade = frame % 2 === 0 ? 14 : 8;
    p.r(10 - blade / 2, 2, blade, 2, 'rgba(220,226,235,0.9)');
    p.r(30 - blade / 2, 2, blade, 2, 'rgba(220,226,235,0.9)');
    p.r(9, 3, 2, 5, '#3a3f47');
    p.r(29, 3, 2, 5, '#3a3f47');
    p.r(6, 7, 28, 3, '#3a3f47');
    // body
    p.r(11, 8, 18, 9, '#55606d');
    p.r(13, 7, 14, 2, '#7c8896');
    p.r(11, 15, 18, 2, '#3b434d');
    p.r(22, 10, 6, 4, '#16191d');
    p.r(23, 11, 4, 2, '#ff3030');
    p.r(24, 11, 1, 1, '#ffb0b0');
    // skids
    p.r(12, 19, 16, 1, '#2a2e34');
    p.r(14, 17, 1, 2, '#2a2e34');
    p.r(25, 17, 1, 2, '#2a2e34');
    return p.outline();
  });
}

export function weaponCrate(letter: string, color: string): HTMLCanvasElement {
  return memo(`crate-${letter}`, () => {
    const p = new Px(34, 26);
    // wings
    p.r(0, 9, 7, 3, '#d9dee5');
    p.r(27, 9, 7, 3, '#d9dee5');
    p.r(2, 12, 5, 2, '#a9b2bd');
    p.r(27, 12, 5, 2, '#a9b2bd');
    // capsule
    p.r(7, 4, 20, 18, '#b91c1c');
    p.r(9, 2, 16, 22, '#b91c1c');
    p.r(9, 2, 16, 3, '#ef4444');
    p.r(7, 4, 2, 18, '#7f1d1d');
    p.r(11, 7, 12, 12, '#fef3c7');
    p.r(11, 7, 12, 2, '#ffffff');
    // letter in pixel font
    const L: Record<string, string[]> = {
      S: ['111', '100', '111', '001', '111'],
      M: ['101', '111', '111', '101', '101'],
      L: ['100', '100', '100', '100', '111'],
    };
    const glyph = L[letter] ?? L.S!;
    glyph.forEach((row, y) =>
      row.split('').forEach((c, x) => {
        if (c === '1') p.r(13 + x * 3, 8 + y * 2, 3, 2, color);
      }),
    );
    return p.outline();
  });
}

export function medkitSprite(): HTMLCanvasElement {
  return memo('medkit', () => {
    const p = new Px(28, 22);
    p.r(9, 0, 10, 4, '#9ca3af');
    p.r(11, 1, 6, 2, '#1f2937');
    p.r(1, 4, 26, 17, '#f8fafc');
    p.r(1, 4, 26, 3, '#ffffff');
    p.r(1, 18, 26, 3, '#cbd5e1');
    p.r(11, 7, 6, 12, '#ef4444');
    p.r(7, 10, 14, 6, '#ef4444');
    p.r(11, 7, 6, 2, '#f87171');
    return p.outline();
  });
}

/** Hero head portrait (for the HUD, lobby and results), 20x20 with transparent background. */
export function heroPortrait(id: number): HTMLCanvasElement {
  return memo(`portrait-${id}`, () => {
    const p = new Px(22, 22);
    const L = heroLook(id);
    p.r(3, 15, 16, 7, L.color);
    p.r(7, 16, 8, 6, L.vest);
    drawHead(p, L, 5, 5);
    return p.outline();
  });
}

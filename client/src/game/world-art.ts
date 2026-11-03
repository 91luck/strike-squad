import { GAME_CONFIG, Tile, artAt, tileAt, type ArtStyle, type LevelDef } from '@strikesquad/shared';
import { tone } from './sprites';

/**
 * Environment art: tile textures, props (bushes, palms, sandbags…) and the parallax backdrop for each zone.
 * Everything is generated once from a fixed seed, so every player sees the same world and nothing is downloaded.
 */

const T = GAME_CONFIG.tile;

/** Art styles come from the level data (`LevelDef.art`); this file owns what each one looks like. */
export type ZoneId = ArtStyle;

export interface ZoneStyle {
  sky: [string, string, string];
  sun: string;
  far: string;
  mid: string;
  fog: string;
  top: string;
  topLight: string;
  dirt: string;
  dirtDark: string;
  grade: string;
  /** Ground texture, platform material and the middle backdrop layer (tinted with `mid`). */
  ground: 'grass' | 'brick' | 'plate';
  plat: 'wood' | 'metal';
  layer: 'canopy' | 'industry' | 'dunes';
  /** Floating particles: fireflies, embers, snowflakes, sand dust or rain. */
  ambient: 'fireflies' | 'embers' | 'snow' | 'dust' | 'rain' | 'motes';
  /** Prop set: jungle plants, a field camp, or a military base. Tufts: grass tufts in the camp set. */
  props: 'jungle' | 'camp' | 'base';
  tufts: boolean;
  /** River/pit water (top, bottom). */
  water: [string, string];
  /** Blinking warning lights on the skyline; a cool moon instead of a warm sun. */
  lights: boolean;
  moon: boolean;
  /** Deep space: a starfield and a planet instead of sky, sun and clouds. */
  space?: boolean;
}

const BLUE_WATER: [string, string] = ['#1f6f8b', '#0a2533'];

export const ZONES: Record<ZoneId, ZoneStyle> = {
  jungle: {
    sky: ['#2f6db5', '#78b4e3', '#f7d9ae'],
    sun: '#ffe8a3',
    far: '#4d6f86',
    mid: '#1f4a37',
    fog: 'rgba(242, 184, 128, 0.25)',
    top: '#58a63c',
    topLight: '#8fd45a',
    dirt: '#6b4a2e',
    dirtDark: '#4e3420',
    grade: 'rgba(255, 200, 120, 0.05)',
    ground: 'grass',
    plat: 'wood',
    layer: 'canopy',
    ambient: 'fireflies',
    props: 'jungle',
    tufts: true,
    water: BLUE_WATER,
    lights: false,
    moon: false,
  },
  river: {
    sky: ['#2a5f9e', '#6aa6d6', '#f4c48f'],
    sun: '#ffd89a',
    far: '#46677f',
    mid: '#1d4536',
    fog: 'rgba(240, 163, 108, 0.25)',
    top: '#5aa845',
    topLight: '#94d867',
    dirt: '#6a4f36',
    dirtDark: '#4c3825',
    grade: 'rgba(120, 200, 255, 0.04)',
    ground: 'grass',
    plat: 'wood',
    layer: 'canopy',
    ambient: 'fireflies',
    props: 'jungle',
    tufts: true,
    water: BLUE_WATER,
    lights: false,
    moon: false,
  },
  towers: {
    sky: ['#231b3b', '#5b3a63', '#e0784c'],
    sun: '#ffb37a',
    far: '#4a3e5e',
    mid: '#2b2a33',
    fog: 'rgba(224, 120, 76, 0.22)',
    top: '#8c9a62',
    topLight: '#b7c486',
    dirt: '#6e6a63',
    dirtDark: '#54514c',
    grade: 'rgba(255, 140, 90, 0.05)',
    ground: 'brick',
    plat: 'metal',
    layer: 'canopy',
    ambient: 'embers',
    props: 'camp',
    tufts: true,
    water: BLUE_WATER,
    lights: false,
    moon: false,
  },
  fortress: {
    sky: ['#150e1c', '#3b1a24', '#a3392a'],
    sun: '#ff7a59',
    far: '#3a2630',
    mid: '#221a20',
    fog: 'rgba(163, 57, 42, 0.3)',
    top: '#7f8894',
    topLight: '#aab3be',
    dirt: '#4a505a',
    dirtDark: '#383d45',
    grade: 'rgba(255, 60, 40, 0.06)',
    ground: 'plate',
    plat: 'metal',
    layer: 'industry',
    ambient: 'embers',
    props: 'base',
    tufts: false,
    water: BLUE_WATER,
    lights: true,
    moon: false,
  },
  desert: {
    sky: ['#3a6fb0', '#8cc1e6', '#f6deb0'],
    sun: '#fff1c2',
    far: '#b08a64',
    mid: '#8a6a48',
    fog: 'rgba(240, 200, 140, 0.28)',
    top: '#e3c27a',
    topLight: '#f5dc9c',
    dirt: '#b98a52',
    dirtDark: '#8f6638',
    grade: 'rgba(255, 190, 110, 0.06)',
    ground: 'grass',
    plat: 'wood',
    layer: 'dunes',
    ambient: 'dust',
    props: 'camp',
    tufts: false,
    water: ['#3f8fa0', '#173c47'],
    lights: false,
    moon: false,
  },
  snow: {
    sky: ['#5d7fa8', '#a9c6df', '#e8eef5'],
    sun: '#fffaf0',
    far: '#9aaec4',
    mid: '#3f5a6e',
    fog: 'rgba(230, 240, 250, 0.35)',
    top: '#eef4fa',
    topLight: '#ffffff',
    dirt: '#6d7c8a',
    dirtDark: '#4f5c69',
    grade: 'rgba(160, 200, 255, 0.06)',
    ground: 'grass',
    plat: 'wood',
    layer: 'canopy',
    ambient: 'snow',
    props: 'camp',
    tufts: false,
    water: ['#7fb8d6', '#24465c'],
    lights: false,
    moon: false,
  },
  night: {
    sky: ['#05070f', '#121a33', '#2a2346'],
    sun: '#dfe8ff',
    far: '#1c2238',
    mid: '#10131f',
    fog: 'rgba(60, 80, 140, 0.25)',
    top: '#5b6472',
    topLight: '#8a95a5',
    dirt: '#30353f',
    dirtDark: '#22262e',
    grade: 'rgba(60, 90, 200, 0.08)',
    ground: 'plate',
    plat: 'metal',
    layer: 'industry',
    ambient: 'rain',
    props: 'base',
    tufts: false,
    water: ['#1d3b4f', '#060d14'],
    lights: true,
    moon: true,
  },
  inferno: {
    sky: ['#1a0505', '#4a0d0d', '#c2410c'],
    sun: '#ff4d2e',
    far: '#3b0a0a',
    mid: '#1c0606',
    fog: 'rgba(220, 60, 20, 0.3)',
    top: '#5c2a22',
    topLight: '#8a3b2c',
    dirt: '#3a1f1c',
    dirtDark: '#24120f',
    grade: 'rgba(255, 60, 20, 0.08)',
    ground: 'brick',
    plat: 'metal',
    layer: 'canopy',
    ambient: 'embers',
    props: 'base',
    tufts: false,
    water: ['#ff7a1a', '#7c1d06'],
    lights: false,
    moon: false,
  },
  space: {
    sky: ['#02030a', '#0b0f2a', '#1e1b4b'],
    sun: '#9be7ff',
    far: '#2a2352',
    mid: '#151233',
    fog: 'rgba(90, 70, 200, 0.18)',
    top: '#8b8fa8',
    topLight: '#c7cbe0',
    dirt: '#3d3f52',
    dirtDark: '#2a2b3a',
    grade: 'rgba(110, 80, 255, 0.07)',
    ground: 'plate',
    plat: 'metal',
    layer: 'dunes',
    ambient: 'motes',
    props: 'base',
    tufts: false,
    water: ['#3b1d6e', '#05010f'],
    lights: true,
    moon: true,
    space: true,
  },
};

/** Art style of the level at world x. */
export function zoneAt(level: LevelDef, x: number): ZoneId {
  return artAt(level, x);
}

// ------------------------------------------------------------------ deterministic noise

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// ------------------------------------------------------------------ tiles

const tileCache = new Map<string, HTMLCanvasElement>();

/** A 32x32 ground tile. `top`: the tile has open air above it (grass/edge). `v`: variant 0..3. */
export function groundTile(zone: ZoneId, top: boolean, v: number): HTMLCanvasElement {
  const key = `${zone}|${top}|${v}`;
  let c = tileCache.get(key);
  if (c) return c;
  const [cv, g] = canvas(T, T);
  const z = ZONES[zone];
  const r = rng(v * 7919 + zone.length * 31 + (top ? 5 : 0));
  const px = (x: number, y: number, col: string, w = 1, h = 1): void => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  if (z.ground === 'plate') {
    g.fillStyle = z.dirt;
    g.fillRect(0, 0, T, T);
    g.fillStyle = tone(z.dirt, 0.12);
    g.fillRect(1, 1, 30, 1);
    g.fillStyle = z.dirtDark;
    g.fillRect(0, 31, 32, 1);
    g.fillRect(31, 0, 1, 32);
    g.fillRect(0, 15, 32, 1);
    for (const [x, y] of [
      [3, 3],
      [28, 3],
      [3, 12],
      [28, 12],
      [3, 19],
      [28, 19],
      [3, 28],
      [28, 28],
    ] as const) {
      px(x, y, tone(z.dirt, 0.35), 2, 2);
      px(x + 1, y + 1, z.dirtDark);
    }
    for (let i = 0; i < 18; i++) px(Math.floor(r() * 30) + 1, Math.floor(r() * 30) + 1, tone(z.dirt, -0.12));
    if (top) {
      for (let i = 0; i < 8; i++) px(i * 4, 0, i % 2 ? '#1d1d1d' : '#f4c430', 4, 4);
      px(0, 4, '#1d1d1d', T, 1);
    }
  } else if (z.ground === 'brick') {
    g.fillStyle = z.dirt;
    g.fillRect(0, 0, T, T);
    // bricks
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let b = -1; b < 3; b++) {
        const x = b * 16 + off;
        const shadeAmt = (r() - 0.5) * 0.12;
        px(x + 1, row * 8 + 1, tone(z.dirt, shadeAmt), 14, 6);
        px(x + 1, row * 8 + 1, tone(z.dirt, shadeAmt + 0.12), 14, 1);
      }
      px(0, row * 8 + 7, z.dirtDark, T, 1);
    }
    if (top) {
      px(0, 0, z.top, T, 5);
      px(0, 0, z.topLight, T, 1);
      for (let i = 0; i < 6; i++) px(Math.floor(r() * 30), 5, z.top, 2, 1 + Math.floor(r() * 3));
    }
  } else {
    g.fillStyle = z.dirt;
    g.fillRect(0, 0, T, T);
    for (let i = 0; i < 26; i++)
      px(Math.floor(r() * 31), Math.floor(r() * 31), r() < 0.6 ? z.dirtDark : tone(z.dirt, 0.06), 2, 1);
    for (let i = 0; i < (v % 2 ? 1 : 0); i++) {
      const x = Math.floor(r() * 26);
      const y = (top ? 12 : 2) + Math.floor(r() * 16);
      px(x, y, '#8a8378', 5, 3);
      px(x + 1, y, '#a39b8e', 3, 1);
      px(x, y + 3, z.dirtDark, 5, 1);
    }
    if (top) {
      px(0, 0, z.top, T, 7);
      px(0, 0, z.topLight, T, 2);
      for (let x = 0; x < T; x += 2) px(x, 7, z.top, 2, 1 + Math.floor(r() * 4));
      for (let i = 0; i < 6; i++) px(Math.floor(r() * 31), 2 + Math.floor(r() * 4), tone(z.top, -0.15));
    }
  }
  tileCache.set(key, cv);
  c = cv;
  return c;
}

export function platformTile(zone: ZoneId, v: number): HTMLCanvasElement {
  const key = `plat|${zone}|${v}`;
  let c = tileCache.get(key);
  if (c) return c;
  const [cv, g] = canvas(T, 16);
  const metal = ZONES[zone].plat === 'metal';
  const base = metal ? '#5d646f' : '#9a6634';
  g.fillStyle = base;
  g.fillRect(0, 0, T, 9);
  g.fillStyle = tone(base, 0.25);
  g.fillRect(0, 0, T, 2);
  g.fillStyle = tone(base, -0.3);
  g.fillRect(0, 8, T, 1);
  if (metal) {
    g.fillStyle = '#2b2f36';
    for (let x = 2; x < T; x += 6) g.fillRect(x, 3, 3, 3);
  } else {
    g.fillStyle = tone(base, -0.25);
    g.fillRect(15, 0, 1, 9);
    g.fillRect(31, 0, 1, 9);
    g.fillStyle = '#d7d3c8';
    g.fillRect(3, 4, 1, 1);
    g.fillRect(19, 4, 1, 1);
    g.fillRect(12, 4, 1, 1);
    g.fillRect(28, 4, 1, 1);
  }
  // supports
  g.fillStyle = metal ? '#3b4048' : '#6b4423';
  if (v % 2 === 0) {
    g.fillRect(5, 9, 3, 7);
    g.fillRect(24, 9, 3, 7);
  }
  tileCache.set(key, cv);
  c = cv;
  return c;
}

// ------------------------------------------------------------------ props

export interface Prop {
  x: number;
  y: number;
  kind:
    'bush' | 'fern' | 'rock' | 'tuft' | 'palm' | 'crate' | 'sandbags' | 'wire' | 'sign' | 'lamp' | 'flower';
  front: boolean;
  v: number;
}

const propCache = new Map<string, HTMLCanvasElement>();

function outlined(
  w: number,
  h: number,
  draw: (px: (x: number, y: number, ww: number, hh: number, col: string) => void) => void,
): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  draw((x, y, ww, hh, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, ww, hh);
  });
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && (d[(y * w + x) * 4 + 3] as number) > 100;
  const add: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)))
        add.push((y * w + x) * 4);
  for (const i of add) {
    d[i] = 18;
    d[i + 1] = 15;
    d[i + 2] = 23;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Prop sprite; origin is bottom centre. */
export function propSprite(kind: Prop['kind'], v: number): HTMLCanvasElement {
  const key = `${kind}|${v}`;
  let c = propCache.get(key);
  if (c) return c;
  const r = rng(v * 131 + kind.length);
  switch (kind) {
    case 'bush':
      c = outlined(34, 20, (px) => {
        const g1 = v % 2 ? '#2f7d32' : '#3b8c3a';
        for (const [x, y, w] of [
          [2, 8, 12],
          [10, 3, 14],
          [20, 7, 12],
        ] as const) {
          px(x, y, w, 20 - y, g1);
          px(x + 2, y, w - 4, 2, '#6cc04a');
        }
        for (let i = 0; i < 10; i++) px(3 + Math.floor(r() * 28), 9 + Math.floor(r() * 9), 2, 2, '#225c25');
      });
      break;
    case 'fern':
      c = outlined(26, 22, (px) => {
        for (let i = 0; i < 5; i++) {
          const x = 3 + i * 4;
          px(x, 4 + (i % 2) * 3, 3, 18, i % 2 ? '#3f9b46' : '#4fb04f');
          px(x - 2, 8 + (i % 3) * 2, 3, 2, '#2f7d32');
        }
      });
      break;
    case 'flower':
      c = outlined(14, 14, (px) => {
        px(6, 5, 2, 9, '#3f9b46');
        const col = ['#ff6b6b', '#ffd93d', '#c77dff'][v % 3] as string;
        px(4, 1, 6, 5, col);
        px(6, 3, 2, 1, '#fff3b0');
      });
      break;
    case 'rock':
      c = outlined(26, 14, (px) => {
        px(2, 5, 22, 9, '#7c776e');
        px(5, 2, 14, 4, '#8e887e');
        px(5, 2, 10, 1, '#b3ab9e');
        px(2, 12, 22, 2, '#5b5750');
        px(16, 6, 4, 3, '#6a665e');
      });
      break;
    case 'tuft':
      c = outlined(16, 9, (px) => {
        for (let i = 0; i < 6; i++)
          px(
            1 + i * 2 + (i % 2),
            9 - (3 + ((i * 5) % 6)),
            2,
            3 + ((i * 5) % 6),
            i % 2 ? '#58a63c' : '#78c34c',
          );
      });
      break;
    case 'palm':
      c = outlined(80, 130, (px) => {
        // trunk curving slightly
        for (let y = 30; y < 130; y += 4) {
          const x = 38 + Math.round(Math.sin(y / 40) * 4);
          px(x, y, 7, 4, y % 8 ? '#8a6a45' : '#a2805a');
          px(x, y + 3, 7, 1, '#6c5134');
        }
        // fronds
        const fr = (x0: number, y0: number, dx: number, dy: number, n: number): void => {
          for (let i = 0; i < n; i++) {
            const x = x0 + dx * i;
            const y = y0 + dy * i + Math.round((i * i) / 6);
            px(x, y, 6, 3, i % 2 ? '#2f8a3a' : '#3fa548');
            px(x + 1, y + 3, 4, 2, '#226b2c');
          }
        };
        fr(40, 28, 5, -2, 7);
        fr(36, 28, -5, -2, 7);
        fr(42, 30, 6, 1, 6);
        fr(34, 30, -6, 1, 6);
        fr(38, 26, 1, -4, 4);
        px(37, 28, 8, 6, '#6b4f2e');
        px(36, 32, 4, 4, '#4a3520');
        px(42, 32, 4, 4, '#4a3520');
      });
      break;
    case 'crate':
      c = outlined(22, 20, (px) => {
        px(0, 0, 22, 20, '#a8743c');
        px(0, 0, 22, 2, '#c99257');
        px(0, 18, 22, 2, '#7d5428');
        px(2, 2, 2, 16, '#7d5428');
        px(18, 2, 2, 16, '#7d5428');
        for (let i = 0; i < 14; i++) px(4 + i, 4 + i, 2, 1, '#7d5428');
      });
      break;
    case 'sandbags':
      c = outlined(40, 16, (px) => {
        for (let i = 0; i < 4; i++) {
          px(1 + i * 10, 9, 9, 7, '#b39a6a');
          px(1 + i * 10, 9, 9, 2, '#cdb683');
        }
        for (let i = 0; i < 3; i++) {
          px(6 + i * 10, 3, 9, 7, '#a68d5f');
          px(6 + i * 10, 3, 9, 2, '#c2aa79');
        }
      });
      break;
    case 'wire':
      c = outlined(34, 14, (px) => {
        px(2, 0, 2, 14, '#5b4a3a');
        px(30, 0, 2, 14, '#5b4a3a');
        for (let x = 4; x < 30; x++) {
          px(x, 4 + Math.round(Math.sin(x / 2.2) * 2), 1, 1, '#9aa3ad');
          px(x, 9 + Math.round(Math.cos(x / 2.2) * 2), 1, 1, '#9aa3ad');
          if (x % 4 === 0) px(x, 3, 1, 3, '#c7ced6');
        }
      });
      break;
    case 'sign':
      c = outlined(22, 28, (px) => {
        px(10, 12, 3, 16, '#5b4a3a');
        px(1, 0, 20, 14, '#f4c430');
        px(1, 0, 20, 2, '#ffe07a');
        px(10, 3, 2, 6, '#1d1d1d');
        px(10, 10, 2, 2, '#1d1d1d');
      });
      break;
    case 'lamp':
      c = outlined(14, 60, (px) => {
        px(6, 8, 3, 52, '#3b4048');
        px(2, 2, 11, 7, '#2b2f36');
        px(4, 6, 7, 3, '#ffd166');
      });
      break;
  }
  propCache.set(key, c as HTMLCanvasElement);
  return c as HTMLCanvasElement;
}

/** Scatter props along the level surfaces (deterministic: everybody sees the same world). */
export function buildProps(level: LevelDef): Prop[] {
  const out: Prop[] = [];
  const r = rng(2026);
  const isSurface = (c: number, row: number): boolean => {
    const t = tileAt(level, c, row);
    return (
      t === Tile.Solid && tileAt(level, c, row - 1) === Tile.Empty && tileAt(level, c, row - 2) === Tile.Empty
    );
  };
  const busy = new Set<number>();
  for (const e of level.enemies) busy.add(Math.floor(e.x / T));
  for (const g of level.gates) for (let d = -1; d <= 1; d++) busy.add(g.col + d);
  for (let c = 1; c < level.cols - 2; c++) {
    for (let row = 1; row < level.rows; row++) {
      if (!isSurface(c, row)) continue;
      const x = c * T + T / 2;
      const y = row * T;
      const z = ZONES[zoneAt(level, x)];
      const roll = r();
      if (z.props === 'jungle') {
        if (c % 9 === 4 && row >= 13 && !busy.has(c)) out.push({ x, y, kind: 'palm', front: false, v: c });
        else if (roll < 0.22) out.push({ x: x + (r() - 0.5) * 12, y, kind: 'bush', front: false, v: c });
        else if (roll < 0.34) out.push({ x, y, kind: 'fern', front: false, v: c });
        else if (roll < 0.42) out.push({ x, y, kind: 'rock', front: false, v: c });
        else if (roll < 0.5) out.push({ x, y, kind: 'flower', front: false, v: c });
        if (r() < 0.35) out.push({ x: x + (r() - 0.5) * 20, y, kind: 'tuft', front: true, v: c });
      } else if (z.props === 'camp') {
        if (roll < 0.12) out.push({ x, y, kind: 'rock', front: false, v: c });
        else if (roll < 0.2 && !busy.has(c)) out.push({ x, y, kind: 'crate', front: false, v: c });
        else if (roll < 0.26) out.push({ x, y, kind: 'sandbags', front: false, v: c });
        if (r() < 0.25 && z.tufts) out.push({ x, y, kind: 'tuft', front: true, v: c });
      } else {
        if (roll < 0.1) out.push({ x, y, kind: 'crate', front: false, v: c });
        else if (roll < 0.2) out.push({ x, y, kind: 'sandbags', front: false, v: c });
        else if (roll < 0.26) out.push({ x, y, kind: 'wire', front: true, v: c });
        else if (roll < 0.3) out.push({ x, y, kind: 'sign', front: false, v: c });
        else if (c % 11 === 0) out.push({ x, y, kind: 'lamp', front: false, v: c });
      }
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------------ backdrop layers

const VIEW_H = 576;

/** Distant mountain ridge (white, tinted at draw time), 1024 wide, seamless. */
export function ridgeLayer(seed: number, height: number, amp: number, snow: boolean): HTMLCanvasElement {
  const [c, g] = canvas(1024, VIEW_H);
  g.fillStyle = '#ffffff';
  const ys: number[] = [];
  for (let x = 0; x <= 1024; x += 4) {
    const k = (x / 1024) * Math.PI * 2;
    const y =
      VIEW_H * height -
      amp *
        (0.55 * Math.sin(k * 2 + seed) +
          0.3 * Math.sin(k * 5 + seed * 2) +
          0.15 * Math.sin(k * 11 + seed * 3));
    ys.push(y);
    g.fillRect(x, Math.round(y), 4, VIEW_H);
  }
  if (snow) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    ys.forEach((y, i) => {
      if (i % 2 === 0) g.fillRect(i * 4, Math.round(y) + 6, 4, 30);
    });
  }
  return c;
}

/** Jungle canopy silhouettes (rounded crowns on trunks), 1024 wide. */
export function canopyLayer(seed: number): HTMLCanvasElement {
  const [c, g] = canvas(1024, VIEW_H);
  const r = rng(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, VIEW_H - 150, 1024, 150);
  for (let x = -40; x < 1064; x += 34 + Math.floor(r() * 30)) {
    const h = 150 + r() * 130;
    const w = 40 + r() * 50;
    g.fillRect(x + w / 2 - 4, VIEW_H - h, 8, h);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(
        x + w / 2 + (r() - 0.5) * w,
        VIEW_H - h + (r() - 0.3) * 30,
        w * (0.3 + r() * 0.25),
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  }
  return c;
}

/** Industrial skyline for the fortress: chimneys, tanks, towers. */
export function industryLayer(seed: number): HTMLCanvasElement {
  const [c, g] = canvas(1024, VIEW_H);
  const r = rng(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, VIEW_H - 130, 1024, 130);
  for (let x = 0; x < 1024; x += 60 + Math.floor(r() * 50)) {
    const kind = r();
    if (kind < 0.4) {
      const h = 180 + r() * 140;
      g.fillRect(x, VIEW_H - h, 18, h);
      g.fillRect(x - 4, VIEW_H - h, 26, 8);
    } else if (kind < 0.7) {
      const h = 110 + r() * 60;
      g.fillRect(x, VIEW_H - h, 70, h);
      g.beginPath();
      g.arc(x + 35, VIEW_H - h, 35, Math.PI, 0);
      g.fill();
    } else {
      const h = 200 + r() * 90;
      g.fillRect(x + 10, VIEW_H - h, 10, h);
      g.fillRect(x, VIEW_H - h, 30, 26);
    }
  }
  return c;
}

export function cloudSprite(v: number): HTMLCanvasElement {
  const key = `cloud${v}`;
  let c = propCache.get(key);
  if (c) return c;
  const [cv, g] = canvas(220, 70);
  const r = rng(v + 99);
  for (let i = 0; i < 9; i++) {
    const x = 30 + r() * 160;
    const y = 30 + r() * 20;
    const rad = 18 + r() * 22;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  propCache.set(key, cv);
  c = cv;
  return c;
}

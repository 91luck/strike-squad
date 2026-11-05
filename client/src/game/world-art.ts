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
  ground: 'grass' | 'brick' | 'plate' | 'sandstone' | 'ice' | 'marble' | 'obsidian' | 'hive';
  plat: 'wood' | 'metal' | 'stone' | 'ice' | 'marble' | 'bone' | 'chitin';
  layer: 'canopy' | 'industry' | 'dunes' | 'pyramids' | 'pines' | 'temples' | 'spires' | 'hive';
  /** Floating particles: fireflies, embers, snowflakes, sand dust or rain. */
  ambient: 'fireflies' | 'embers' | 'snow' | 'dust' | 'rain' | 'motes';
  /** Prop set: jungle plants, a field camp, or a military base. Tufts: grass tufts in the camp set. */
  props: 'jungle' | 'camp' | 'base' | 'tomb' | 'norse' | 'greek' | 'hell' | 'alien';
  /** Look of the arena gates (the walls that lock you in): blast door, carved stone, ice, bronze, bone, membrane. */
  gate: 'blast' | 'stone' | 'ice' | 'bronze' | 'bone' | 'membrane';
  /** Sky effect: northern lights or a lightning storm. */
  skyFx?: 'aurora' | 'storm';
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
    gate: 'blast',
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
    gate: 'blast',
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
    gate: 'blast',
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
    gate: 'blast',
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
    plat: 'stone',
    layer: 'pyramids',
    ambient: 'dust',
    props: 'tomb',
    tufts: false,
    water: ['#3f8fa0', '#173c47'],
    gate: 'stone',
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
    layer: 'pines',
    ambient: 'snow',
    props: 'norse',
    tufts: false,
    water: ['#7fb8d6', '#24465c'],
    gate: 'ice',
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
    gate: 'blast',
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
    ground: 'obsidian',
    plat: 'bone',
    layer: 'spires',
    ambient: 'embers',
    props: 'hell',
    tufts: false,
    water: ['#ff7a1a', '#7c1d06'],
    gate: 'bone',
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
    props: 'alien',
    tufts: false,
    water: ['#3b1d6e', '#05010f'],
    gate: 'membrane',
    lights: true,
    moon: true,
    space: true,
  },
  tomb: {
    sky: ['#2a1640', '#b4583a', '#f4c27a'],
    sun: '#ffd27a',
    far: '#8a5a3c',
    mid: '#5a3a24',
    fog: 'rgba(240, 180, 110, 0.28)',
    top: '#e6c88c',
    topLight: '#f7e2b0',
    dirt: '#c9a46a',
    dirtDark: '#9a7444',
    grade: 'rgba(255, 170, 80, 0.07)',
    ground: 'sandstone',
    plat: 'stone',
    layer: 'pyramids',
    ambient: 'dust',
    props: 'tomb',
    tufts: false,
    water: ['#3f8fa0', '#173c47'],
    gate: 'stone',
    lights: false,
    moon: false,
  },
  frosthall: {
    sky: ['#040d18', '#0c2638', '#1d4b5c'],
    sun: '#e0f2fe',
    far: '#29445a',
    mid: '#132a38',
    fog: 'rgba(160, 220, 255, 0.2)',
    top: '#e0f2fe',
    topLight: '#ffffff',
    dirt: '#5f8fb0',
    dirtDark: '#3d6a8a',
    grade: 'rgba(100, 200, 255, 0.08)',
    ground: 'ice',
    plat: 'ice',
    layer: 'pines',
    ambient: 'snow',
    props: 'norse',
    tufts: false,
    water: ['#7fb8d6', '#24465c'],
    gate: 'ice',
    skyFx: 'aurora',
    lights: false,
    moon: true,
  },
  olympus: {
    sky: ['#0b1020', '#26304d', '#59607e'],
    sun: '#e0e7ff',
    far: '#3b4260',
    mid: '#1f2438',
    fog: 'rgba(140, 150, 200, 0.22)',
    top: '#6b8f47',
    topLight: '#9cc06a',
    dirt: '#bdb7aa',
    dirtDark: '#8f897c',
    grade: 'rgba(120, 140, 255, 0.07)',
    ground: 'marble',
    plat: 'marble',
    layer: 'temples',
    ambient: 'rain',
    props: 'greek',
    tufts: true,
    water: ['#1d3b4f', '#060d14'],
    gate: 'bronze',
    skyFx: 'storm',
    lights: false,
    moon: true,
  },
  temple: {
    sky: ['#0f0a24', '#4c1d95', '#f59e0b'],
    sun: '#fde68a',
    far: '#4b3b7a',
    mid: '#2a2046',
    fog: 'rgba(250, 204, 21, 0.18)',
    top: '#f5f1e6',
    topLight: '#ffffff',
    dirt: '#e2dccd',
    dirtDark: '#b8b09e',
    grade: 'rgba(255, 210, 90, 0.06)',
    ground: 'marble',
    plat: 'marble',
    layer: 'temples',
    ambient: 'dust',
    props: 'greek',
    tufts: false,
    water: ['#1d3b4f', '#060d14'],
    gate: 'bronze',
    skyFx: 'storm',
    lights: false,
    moon: false,
  },
  hellgate: {
    sky: ['#0a0203', '#2a0606', '#7f1d1d'],
    sun: '#ef4444',
    far: '#2a0808',
    mid: '#140404',
    fog: 'rgba(200, 40, 20, 0.32)',
    top: '#3b1f1c',
    topLight: '#f97316',
    dirt: '#221719',
    dirtDark: '#0e090a',
    grade: 'rgba(255, 40, 20, 0.09)',
    ground: 'obsidian',
    plat: 'bone',
    layer: 'spires',
    ambient: 'embers',
    props: 'hell',
    tufts: false,
    water: ['#ff7a1a', '#7c1d06'],
    gate: 'bone',
    lights: false,
    moon: false,
  },
  hive: {
    sky: ['#020806', '#062016', '#14532d'],
    sun: '#86efac',
    far: '#0f2a1c',
    mid: '#0a1a12',
    fog: 'rgba(60, 220, 120, 0.16)',
    top: '#4ade80',
    topLight: '#bbf7d0',
    dirt: '#1f2d22',
    dirtDark: '#0f1a12',
    grade: 'rgba(60, 255, 140, 0.06)',
    ground: 'hive',
    plat: 'chitin',
    layer: 'hive',
    ambient: 'motes',
    props: 'alien',
    tufts: false,
    water: ['#22c55e', '#052e16'],
    gate: 'membrane',
    lights: true,
    moon: false,
  },
  // ---------------------------------------------------------------- Astra Saga worlds
  /** Agnivan: a forest burning under an orange sky. */
  vana: {
    sky: ['#2a0f0a', '#8a2b0e', '#f59e0b'],
    sun: '#ffb347',
    far: '#5a2412',
    mid: '#2a160c',
    fog: 'rgba(255, 120, 40, 0.3)',
    top: '#4d7c0f',
    topLight: '#a3e635',
    dirt: '#5b3a1e',
    dirtDark: '#3e2712',
    grade: 'rgba(255, 110, 30, 0.08)',
    ground: 'grass',
    plat: 'wood',
    layer: 'canopy',
    ambient: 'embers',
    props: 'jungle',
    tufts: true,
    water: ['#ff7a1a', '#7c1d06'],
    gate: 'stone',
    lights: false,
    moon: false,
  },
  /** Sagar Setu: the sea bridge at dusk, deep teal water. */
  sagar: {
    sky: ['#0b2545', '#13597a', '#f4a261'],
    sun: '#ffd7a0',
    far: '#1d4e6b',
    mid: '#0f3247',
    fog: 'rgba(120, 200, 230, 0.2)',
    top: '#d6c39a',
    topLight: '#f3e6c4',
    dirt: '#8a7350',
    dirtDark: '#6b5638',
    grade: 'rgba(60, 170, 220, 0.06)',
    ground: 'sandstone',
    plat: 'wood',
    layer: 'dunes',
    ambient: 'rain',
    props: 'camp',
    tufts: false,
    water: ['#0e7490', '#082f49'],
    gate: 'stone',
    lights: false,
    moon: false,
  },
  /** Vayu Shikhar: violet storm over snow peaks. */
  shikhar: {
    sky: ['#140b2e', '#3b2a6b', '#8b7fc7'],
    sun: '#e0e7ff',
    far: '#3a3366',
    mid: '#211c3f',
    fog: 'rgba(170, 160, 255, 0.22)',
    top: '#e8ecff',
    topLight: '#ffffff',
    dirt: '#6a6f8f',
    dirtDark: '#4c5070',
    grade: 'rgba(140, 120, 255, 0.08)',
    ground: 'ice',
    plat: 'stone',
    layer: 'pines',
    ambient: 'snow',
    props: 'norse',
    tufts: false,
    water: ['#7c83d6', '#1e1b4b'],
    gate: 'ice',
    skyFx: 'storm',
    lights: false,
    moon: true,
  },
  /** Naag Lok: the serpent underworld, emerald glow on dark jewelled rock. */
  naglok: {
    sky: ['#010806', '#032a22', '#0f766e'],
    sun: '#5eead4',
    far: '#06302a',
    mid: '#031a16',
    fog: 'rgba(45, 212, 191, 0.16)',
    top: '#0d9488',
    topLight: '#99f6e4',
    dirt: '#1f2a28',
    dirtDark: '#0f1716',
    grade: 'rgba(20, 220, 180, 0.07)',
    ground: 'obsidian',
    plat: 'stone',
    layer: 'spires',
    ambient: 'motes',
    props: 'tomb',
    tufts: false,
    water: ['#14b8a6', '#022c22'],
    gate: 'stone',
    lights: false,
    moon: true,
  },
  /** Maya Nagri: a golden city of illusions under a magenta sky. */
  maya: {
    sky: ['#1a0533', '#6b1d75', '#f0abfc'],
    sun: '#fde68a',
    far: '#4a1d5e',
    mid: '#2b1037',
    fog: 'rgba(240, 171, 252, 0.2)',
    top: '#fcd34d',
    topLight: '#fff7cc',
    dirt: '#b98a3a',
    dirtDark: '#8a6426',
    grade: 'rgba(240, 120, 255, 0.07)',
    ground: 'marble',
    plat: 'marble',
    layer: 'temples',
    ambient: 'motes',
    props: 'greek',
    tufts: false,
    water: ['#c026d3', '#3b0764'],
    gate: 'bronze',
    lights: false,
    moon: false,
  },
  /** Bhasm Parvat: grey ash mountain, embers in the haze. */
  bhasm: {
    sky: ['#121212', '#3a3633', '#9a8f86'],
    sun: '#f5d0a9',
    far: '#3d3935',
    mid: '#24211f',
    fog: 'rgba(200, 190, 180, 0.28)',
    top: '#8a8580',
    topLight: '#c9c4bd',
    dirt: '#4a4541',
    dirtDark: '#33302d',
    grade: 'rgba(255, 150, 80, 0.05)',
    ground: 'obsidian',
    plat: 'bone',
    layer: 'spires',
    ambient: 'dust',
    props: 'hell',
    tufts: false,
    water: ['#ef4444', '#450a0a'],
    gate: 'bone',
    lights: false,
    moon: false,
  },
  /** Samarpan Maidan: the great battlefield at dawn, banners and broken chariots. */
  kurukshetra: {
    sky: ['#3b1d0f', '#b4532a', '#fcd9a0'],
    sun: '#fff1c2',
    far: '#8a5a3c',
    mid: '#5a3a24',
    fog: 'rgba(250, 200, 140, 0.3)',
    top: '#b08850',
    topLight: '#d9b77a',
    dirt: '#7a5a36',
    dirtDark: '#5a4026',
    grade: 'rgba(255, 170, 90, 0.07)',
    ground: 'grass',
    plat: 'wood',
    layer: 'dunes',
    ambient: 'dust',
    props: 'camp',
    tufts: true,
    water: ['#a16207', '#422006'],
    gate: 'stone',
    lights: false,
    moon: false,
  },
  /** Chakra Durg: the discus fortress, bronze rings and gold light. */
  chakra: {
    sky: ['#170f05', '#5a3a0c', '#e0a530'],
    sun: '#fde047',
    far: '#4a3410',
    mid: '#2a1e08',
    fog: 'rgba(250, 204, 21, 0.18)',
    top: '#c08a2e',
    topLight: '#fcd34d',
    dirt: '#6b4e1e',
    dirtDark: '#4a3512',
    grade: 'rgba(255, 200, 60, 0.07)',
    ground: 'plate',
    plat: 'metal',
    layer: 'industry',
    ambient: 'embers',
    props: 'base',
    tufts: false,
    water: ['#ca8a04', '#422006'],
    gate: 'bronze',
    lights: true,
    moon: false,
  },
  /** Dwand Bhoomi: the duel ground, white marble under a blue twilight. */
  dwand: {
    sky: ['#06142e', '#1e3a8a', '#93c5fd'],
    sun: '#fef3c7',
    far: '#24407a',
    mid: '#132550',
    fog: 'rgba(147, 197, 253, 0.2)',
    top: '#f1f5f9',
    topLight: '#ffffff',
    dirt: '#cbd5e1',
    dirtDark: '#94a3b8',
    grade: 'rgba(120, 170, 255, 0.07)',
    ground: 'marble',
    plat: 'marble',
    layer: 'temples',
    ambient: 'motes',
    props: 'greek',
    tufts: false,
    water: ['#1d4ed8', '#0b1a3f'],
    gate: 'bronze',
    skyFx: 'aurora',
    lights: false,
    moon: true,
  },
  /** Mahayuddh: the last war, a crimson sky split by gold. */
  mahayuddh: {
    sky: ['#0a0208', '#4a0a2a', '#f472b6'],
    sun: '#fde047',
    far: '#3a0a24',
    mid: '#1e0514',
    fog: 'rgba(244, 114, 182, 0.22)',
    top: '#3b1f1c',
    topLight: '#fbbf24',
    dirt: '#2a1418',
    dirtDark: '#160a0c',
    grade: 'rgba(255, 60, 140, 0.08)',
    ground: 'obsidian',
    plat: 'bone',
    layer: 'spires',
    ambient: 'embers',
    props: 'hell',
    tufts: false,
    water: ['#ff7a1a', '#7c1d06'],
    gate: 'bone',
    skyFx: 'storm',
    lights: false,
    moon: false,
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
      // army plating gets hazard stripes; a spaceship deck gets a neon edge
      if (z.space) {
        px(0, 0, z.topLight, T, 2);
        px(0, 2, '#67e8f9', T, 1);
        for (let i = 0; i < 4; i++) px(3 + i * 8, 3, '#a78bfa', 3, 1);
      } else {
        for (let i = 0; i < 8; i++) px(i * 4, 0, i % 2 ? '#1d1d1d' : '#f4c430', 4, 4);
        px(0, 4, '#1d1d1d', T, 1);
      }
    }
  } else if (z.ground === 'sandstone' || z.ground === 'marble') {
    // big cut blocks; sandstone gets carved glyphs, marble gets veins and an olive/stone lip on top
    const marble = z.ground === 'marble';
    g.fillStyle = z.dirt;
    g.fillRect(0, 0, T, T);
    const off = v % 2 ? 16 : 0;
    px(0, 15, z.dirtDark, T, 1);
    px((off + 15) % 32, 0, z.dirtDark, 1, 15);
    px((off + 31) % 32, 16, z.dirtDark, 1, 16);
    px(0, 0, tone(z.dirt, 0.14), T, 1);
    px(0, 16, tone(z.dirt, 0.1), T, 1);
    if (marble) {
      for (let i = 0; i < 3; i++) {
        let x = Math.floor(r() * 28);
        for (let y = 2 + Math.floor(r() * 10); y < 30; y += 2) {
          px(x, y, tone(z.dirt, -0.12), 1, 2);
          x += r() < 0.5 ? 1 : -1;
          if (x < 0 || x > 31) break;
        }
      }
    } else if (v % 4 === 1) {
      // a carved eye glyph / ankh
      const gx = 6 + Math.floor(r() * 14);
      const gy = top ? 18 : 4 + Math.floor(r() * 16);
      px(gx, gy + 2, z.dirtDark, 8, 1);
      px(gx + 2, gy, z.dirtDark, 4, 1);
      px(gx + 3, gy + 1, z.dirtDark, 2, 2);
      px(gx + 1, gy + 4, z.dirtDark, 1, 3);
    } else if (v % 4 === 3) {
      const gx = 8 + Math.floor(r() * 12);
      px(gx + 1, 4, z.dirtDark, 3, 3);
      px(gx + 2, 5, z.dirt, 1, 1);
      px(gx + 2, 7, z.dirtDark, 1, 6);
      px(gx, 9, z.dirtDark, 5, 1);
    }
    for (let i = 0; i < 10; i++)
      px(Math.floor(r() * 31), Math.floor(r() * 31), tone(z.dirt, (r() - 0.5) * 0.15));
    if (top) {
      px(0, 0, z.top, T, marble ? 4 : 3);
      px(0, 0, z.topLight, T, 1);
      if (marble && z.top !== z.dirt)
        for (let x = 0; x < T; x += 3) px(x, 4, z.top, 2, 1 + Math.floor(r() * 3));
    }
  } else if (z.ground === 'ice') {
    g.fillStyle = z.dirt;
    g.fillRect(0, 0, T, T);
    // translucent ice blocks with bright cracks and trapped bubbles
    for (let i = 0; i < 4; i++) {
      const x0 = Math.floor(r() * 30);
      for (let k = 0; k < 7; k++) px(x0 + k, Math.floor(r() * 3) + k * 3, tone(z.dirt, 0.35));
    }
    px(0, 0, tone(z.dirt, 0.2), 1, T);
    px(0, 31, z.dirtDark, T, 1);
    for (let i = 0; i < 4; i++)
      px(3 + Math.floor(r() * 26), 6 + Math.floor(r() * 22), 'rgba(255,255,255,0.7)');
    px(4 + (v % 3) * 7, 10, tone(z.dirt, 0.45), 6, 2);
    if (top) {
      px(0, 0, z.top, T, 6);
      px(0, 0, z.topLight, T, 2);
      // icicles hanging off the lip
      for (let x = 2; x < T; x += 7) px(x, 6, z.top, 2, 2 + Math.floor(r() * 4));
    }
  } else if (z.ground === 'obsidian') {
    g.fillStyle = z.dirt;
    g.fillRect(0, 0, T, T);
    for (let i = 0; i < 14; i++) px(Math.floor(r() * 30), Math.floor(r() * 30), tone(z.dirt, 0.12), 3, 1);
    // glowing lava cracks
    let x = Math.floor(r() * 24) + 4;
    for (let y = top ? 6 : 0; y < 32; y += 2) {
      px(x, y, '#f97316', 1, 2);
      if (y % 6 === 0) px(x, y, '#fde047');
      x += r() < 0.5 ? 1 : -1;
    }
    if (top) {
      px(0, 0, z.top, T, 5);
      px(0, 0, z.topLight, T, 1);
      for (let i = 0; i < 4; i++) px(Math.floor(r() * 30), 1 + Math.floor(r() * 3), '#fb923c');
    }
  } else if (z.ground === 'hive') {
    g.fillStyle = z.dirt;
    g.fillRect(0, 0, T, T);
    // organic hex cells with a faint glow
    for (let cy = 0; cy < 4; cy++)
      for (let cx = 0; cx < 4; cx++) {
        const hx = cx * 8 + (cy % 2 ? 4 : 0);
        const hy = cy * 8;
        px(hx + 1, hy + 1, tone(z.dirt, 0.1), 6, 6);
        px(hx + 2, hy + 2, z.dirtDark, 4, 4);
        if (r() < 0.12) px(hx + 3, hy + 3, '#4ade80', 2, 2);
      }
    if (top) {
      px(0, 0, z.top, T, 4);
      px(0, 0, z.topLight, T, 1);
      for (let x = 1; x < T; x += 5) px(x, 4, z.top, 2, 2 + Math.floor(r() * 4)); // slime drips
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

/** One-way platform material per style: base colour, top highlight, supports. */
const PLAT: Record<ZoneStyle['plat'], { base: string; support: string }> = {
  wood: { base: '#9a6634', support: '#6b4423' },
  metal: { base: '#5d646f', support: '#3b4048' },
  stone: { base: '#c79b5c', support: '#8a6438' },
  ice: { base: '#a5d8f0', support: '#5f9cc0' },
  marble: { base: '#e5e1d6', support: '#a8a195' },
  bone: { base: '#d6cbb0', support: '#3b1f1c' },
  chitin: { base: '#355e3b', support: '#1a2e1d' },
};

export function platformTile(zone: ZoneId, v: number): HTMLCanvasElement {
  const key = `plat|${zone}|${v}`;
  let c = tileCache.get(key);
  if (c) return c;
  const [cv, g] = canvas(T, 16);
  const kind = ZONES[zone].plat;
  const { base, support } = PLAT[kind];
  g.fillStyle = base;
  g.fillRect(0, 0, T, 9);
  g.fillStyle = tone(base, 0.25);
  g.fillRect(0, 0, T, 2);
  g.fillStyle = tone(base, -0.3);
  g.fillRect(0, 8, T, 1);
  if (kind === 'metal') {
    g.fillStyle = '#2b2f36';
    for (let x = 2; x < T; x += 6) g.fillRect(x, 3, 3, 3);
  } else if (kind === 'wood') {
    g.fillStyle = tone(base, -0.25);
    g.fillRect(15, 0, 1, 9);
    g.fillRect(31, 0, 1, 9);
    g.fillStyle = '#d7d3c8';
    for (const x of [3, 12, 19, 28]) g.fillRect(x, 4, 1, 1);
  } else if (kind === 'stone' || kind === 'marble') {
    g.fillStyle = tone(base, -0.22);
    g.fillRect(v % 2 ? 10 : 22, 0, 1, 9);
    // a carved band
    g.fillStyle = kind === 'stone' ? '#1d4ed8' : '#b7791f';
    g.fillRect(0, 4, T, 1);
  } else if (kind === 'ice') {
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(3 + (v % 3) * 8, 2, 6, 1);
    g.fillStyle = base;
    for (let x = 4; x < T; x += 9) g.fillRect(x, 9, 2, 3 + (x % 3)); // icicles
  } else if (kind === 'bone') {
    // a row of ribs and skulls
    g.fillStyle = tone(base, -0.35);
    for (let x = 2; x < T; x += 5) g.fillRect(x, 2, 1, 6);
    g.fillStyle = '#1a0505';
    g.fillRect(14, 3, 2, 2);
    g.fillRect(18, 3, 2, 2);
  } else {
    g.fillStyle = '#86efac';
    for (let x = 3; x < T; x += 8) g.fillRect(x, 3, 2, 2);
  }
  if (v % 2 === 0 && kind !== 'ice') {
    g.fillStyle = support;
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
    | 'bush'
    | 'fern'
    | 'rock'
    | 'tuft'
    | 'palm'
    | 'crate'
    | 'sandbags'
    | 'wire'
    | 'sign'
    | 'lamp'
    | 'flower'
    // pharaoh's tomb
    | 'obelisk'
    | 'urn'
    | 'idol'
    // frozen north
    | 'pine'
    | 'runestone'
    | 'shields'
    | 'bones'
    // Olympus
    | 'column'
    | 'ruin'
    | 'amphora'
    | 'statue'
    // demon citadel
    | 'skulls'
    | 'spikes'
    | 'brazier'
    // alien hive
    | 'crystal'
    | 'pod'
    | 'stalk';
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
    case 'obelisk':
      c = outlined(18, 70, (px) => {
        px(4, 8, 10, 62, '#d9b77a');
        px(4, 8, 3, 62, '#b8935a');
        px(6, 2, 6, 7, '#d9b77a');
        px(8, 0, 2, 3, '#fbbf24');
        for (let y = 14; y < 64; y += 9) {
          px(8, y, 3, 2, '#7a5a34');
          px(9, y + 3, 1, 3, '#7a5a34');
        }
      });
      break;
    case 'urn':
      c = outlined(16, 22, (px) => {
        px(4, 0, 8, 3, '#9a5b2e');
        px(5, 3, 6, 2, '#7a4422');
        px(2, 5, 12, 13, '#b8703a');
        px(2, 5, 3, 13, '#8f5427');
        px(3, 9, 10, 2, '#1d4ed8');
        px(4, 18, 8, 4, '#9a5b2e');
      });
      break;
    case 'idol':
      // a half-buried pharaoh statue head
      c = outlined(44, 40, (px) => {
        px(6, 6, 32, 34, '#1d4ed8');
        for (let x = 6; x < 38; x += 4) px(x, 6, 2, 34, '#fbbf24');
        px(12, 8, 20, 32, '#d0a76a');
        px(12, 8, 4, 32, '#a9844f');
        px(16, 18, 5, 2, '#1a1418');
        px(24, 18, 5, 2, '#1a1418');
        px(21, 22, 3, 7, '#b38c55');
        px(18, 31, 8, 2, '#8a6a3e');
        px(20, 0, 4, 7, '#fbbf24');
      });
      break;
    case 'pine':
      c = outlined(46, 96, (px) => {
        px(21, 70, 5, 26, '#4a3424');
        for (let i = 0; i < 5; i++) {
          const w = 12 + i * 7;
          const y = 6 + i * 13;
          px(23 - w / 2, y, w, 15, i % 2 ? '#1f4d3a' : '#25593f');
          px(23 - w / 2, y, w, 3, '#eef6fb'); // snow on each tier
        }
        px(21, 0, 4, 8, '#25593f');
      });
      break;
    case 'runestone':
      c = outlined(22, 36, (px) => {
        px(3, 4, 16, 32, '#6b7280');
        px(5, 0, 12, 6, '#6b7280');
        px(3, 4, 3, 32, '#4b5563');
        px(9, 8, 2, 20, '#38bdf8');
        px(9, 10, 6, 2, '#38bdf8');
        px(9, 18, 5, 2, '#38bdf8');
        px(13, 20, 2, 6, '#38bdf8');
        px(5, 0, 12, 2, '#eef6fb');
      });
      break;
    case 'shields':
      // a rack of painted round shields
      c = outlined(46, 24, (px) => {
        px(0, 18, 46, 3, '#5b3a24');
        const cols = ['#b91c1c', '#1d4ed8', '#ca8a04'];
        for (let i = 0; i < 3; i++) {
          const x = 2 + i * 15;
          px(x, 2, 13, 16, cols[i] as string);
          px(x + 2, 0, 9, 20, cols[i] as string);
          px(x + 5, 7, 3, 3, '#d1d5db');
          px(x + 6, 2, 1, 16, 'rgba(0,0,0,0.25)');
        }
      });
      break;
    case 'bones':
      c = outlined(30, 12, (px) => {
        px(2, 7, 26, 3, '#e7e5e4');
        px(1, 6, 3, 5, '#f5f5f4');
        px(26, 6, 3, 5, '#f5f5f4');
        px(10, 2, 9, 7, '#e7e5e4');
        px(12, 4, 2, 2, '#1a1418');
        px(16, 4, 2, 2, '#1a1418');
      });
      break;
    case 'column':
      c = outlined(26, 110, (px) => {
        px(1, 0, 24, 7, '#e7e2d6');
        px(3, 7, 20, 4, '#cfc9bb');
        for (let x = 4; x < 22; x += 4) {
          px(x, 11, 3, 91, '#ece8de');
          px(x + 3, 11, 1, 91, '#bdb6a6');
        }
        px(2, 102, 22, 8, '#d6d0c2');
      });
      break;
    case 'ruin':
      // a broken column stump with a fallen drum beside it
      c = outlined(48, 44, (px) => {
        px(4, 6, 18, 38, '#e2ddd0');
        for (let x = 6; x < 20; x += 4) px(x + 3, 6, 1, 38, '#b8b1a1');
        px(4, 2, 6, 5, '#e2ddd0');
        px(14, 4, 8, 3, '#e2ddd0');
        px(24, 30, 22, 14, '#d6d0c2');
        px(24, 30, 22, 3, '#ece8de');
        px(30, 34, 2, 8, '#b8b1a1');
        px(37, 34, 2, 8, '#b8b1a1');
        px(2, 40, 8, 4, '#6b8f47');
      });
      break;
    case 'amphora':
      c = outlined(16, 26, (px) => {
        px(6, 0, 4, 4, '#c2410c');
        px(2, 3, 2, 6, '#9a3412');
        px(12, 3, 2, 6, '#9a3412');
        px(3, 6, 10, 15, '#ea580c');
        px(3, 10, 10, 4, '#1c1917');
        px(5, 11, 2, 2, '#ea580c');
        px(9, 11, 2, 2, '#ea580c');
        px(6, 21, 4, 5, '#c2410c');
      });
      break;
    case 'statue':
      // a marble hero on a plinth, spear raised
      c = outlined(34, 92, (px) => {
        px(2, 76, 30, 16, '#d6d0c2');
        px(2, 76, 30, 3, '#ece8de');
        px(12, 46, 4, 30, '#ece8de');
        px(18, 46, 4, 30, '#e2ddd0');
        px(10, 22, 14, 26, '#ece8de');
        px(10, 22, 4, 26, '#cfc9bb');
        px(12, 10, 10, 12, '#ece8de');
        px(11, 6, 12, 5, '#ece8de');
        px(24, 0, 2, 50, '#bdb6a6');
        px(22, 22, 4, 4, '#ece8de');
      });
      break;
    case 'skulls':
      c = outlined(34, 20, (px) => {
        for (const [x, y] of [
          [2, 10],
          [12, 10],
          [22, 10],
          [7, 2],
          [17, 2],
        ] as const) {
          px(x, y, 9, 8, '#e7e5e4');
          px(x + 1, y + 3, 2, 2, '#1a0505');
          px(x + 5, y + 3, 2, 2, '#1a0505');
          px(x + 3, y + 6, 3, 2, '#a8a29e');
        }
      });
      break;
    case 'spikes':
      c = outlined(36, 26, (px) => {
        for (let i = 0; i < 6; i++) {
          const h = 12 + ((i * 7) % 12);
          for (let k = 0; k < h; k++)
            px(
              3 + i * 5 + Math.floor(k / 6),
              26 - k,
              Math.max(1, 3 - Math.floor(k / 5)),
              1,
              k > h - 3 ? '#fca5a5' : '#3f1d1d',
            );
        }
      });
      break;
    case 'brazier':
      c = outlined(20, 40, (px) => {
        px(8, 14, 4, 26, '#3b1f1c');
        px(4, 36, 12, 4, '#3b1f1c');
        px(2, 8, 16, 7, '#57534e');
        px(2, 8, 16, 2, '#78716c');
        px(5, 1, 10, 8, '#f97316');
        px(7, 0, 6, 6, '#fde047');
      });
      break;
    case 'crystal':
      c = outlined(30, 34, (px) => {
        const cols = ['#a78bfa', '#67e8f9', '#86efac'];
        const col = cols[v % 3] as string;
        px(12, 0, 6, 34, col);
        px(12, 0, 2, 34, '#ffffff');
        px(4, 12, 6, 22, tone(col, -0.2));
        px(20, 8, 6, 26, tone(col, -0.1));
        px(21, 8, 2, 26, 'rgba(255,255,255,0.7)');
      });
      break;
    case 'pod':
      // an alien egg pod, half open
      c = outlined(26, 28, (px) => {
        px(4, 6, 18, 22, '#365314');
        px(6, 2, 14, 6, '#4d7c0f');
        px(4, 6, 4, 22, '#1a2e05');
        px(10, 8, 6, 12, '#bef264');
        px(12, 10, 2, 6, '#ffffff');
        px(2, 24, 22, 4, '#1a2e05');
      });
      break;
    case 'stalk':
      c = outlined(18, 64, (px) => {
        for (let y = 10; y < 64; y += 3) px(8 + Math.round(Math.sin(y / 9) * 3), y, 3, 3, '#166534');
        px(4, 0, 10, 12, '#22c55e');
        px(6, 2, 6, 7, '#bbf7d0');
      });
      break;
  }
  propCache.set(key, c as HTMLCanvasElement);
  return c as HTMLCanvasElement;
}

/** Prop sets for the themed worlds: one tall landmark, one big piece and three small ones. */
const THEMED_PROPS: Record<
  'tomb' | 'norse' | 'greek' | 'hell' | 'alien',
  { tall: Prop['kind']; big: Prop['kind']; small: [Prop['kind'], Prop['kind'], Prop['kind']] }
> = {
  tomb: { tall: 'obelisk', big: 'idol', small: ['rock', 'urn', 'palm'] },
  norse: { tall: 'pine', big: 'shields', small: ['runestone', 'bones', 'rock'] },
  greek: { tall: 'column', big: 'statue', small: ['ruin', 'amphora', 'bush'] },
  hell: { tall: 'brazier', big: 'spikes', small: ['skulls', 'bones', 'spikes'] },
  alien: { tall: 'stalk', big: 'crystal', small: ['pod', 'crystal', 'pod'] },
};

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
      } else if (z.props !== 'base') {
        // Themed worlds: a tall landmark every so often, smaller dressing in between.
        const set = THEMED_PROPS[z.props];
        if (c % 10 === 5 && row >= 12 && !busy.has(c)) out.push({ x, y, kind: set.tall, front: false, v: c });
        else if (roll < 0.14) out.push({ x, y, kind: set.small[0], front: false, v: c });
        else if (roll < 0.24) out.push({ x, y, kind: set.small[1], front: false, v: c });
        else if (roll < 0.3) out.push({ x, y, kind: set.small[2], front: false, v: c });
        else if (roll < 0.33 && !busy.has(c)) out.push({ x, y, kind: set.big, front: false, v: c });
        if (z.tufts && r() < 0.25) out.push({ x: x + (r() - 0.5) * 20, y, kind: 'tuft', front: true, v: c });
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

/** Silhouette skylines for the themed worlds (white, tinted at draw time), 1024 wide and seamless. */
export function themedLayer(
  kind: 'pyramids' | 'pines' | 'temples' | 'spires' | 'hive',
  seed: number,
): HTMLCanvasElement {
  const [c, g] = canvas(1024, VIEW_H);
  const r = rng(seed);
  g.fillStyle = '#ffffff';
  const base = VIEW_H - 120;
  g.fillRect(0, base, 1024, 120);
  const tri = (x: number, w: number, h: number): void => {
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x + w / 2, base - h);
    g.lineTo(x + w, base);
    g.fill();
  };
  if (kind === 'pyramids') {
    for (let x = -60; x < 1024; x += 220 + Math.floor(r() * 120)) {
      const w = 220 + r() * 160;
      tri(x, w, w * 0.62);
      if (r() < 0.6) tri(x + w * 0.8, w * 0.5, w * 0.3);
      if (r() < 0.5) g.fillRect(x + w + 20, base - 150, 14, 150); // obelisk
    }
  } else if (kind === 'pines') {
    for (let x = -20; x < 1044; x += 16 + Math.floor(r() * 18)) {
      const h = 110 + r() * 150;
      for (let i = 0; i < 6; i++) {
        const w = 10 + i * 7;
        g.fillRect(x - w / 2, base - h + i * (h / 7), w, h / 7 + 2);
      }
      g.fillRect(x - 3, base - 20, 6, 20);
    }
    // a viking longhall on the ridge
    const hx = 300 + r() * 300;
    g.fillRect(hx, base - 70, 180, 70);
    tri(hx - 20, 220, 120);
  } else if (kind === 'temples') {
    for (let x = 0; x < 1024; x += 260 + Math.floor(r() * 140)) {
      const w = 160 + r() * 80;
      const h = 90 + r() * 50;
      g.fillRect(x, base - h, w, 12); // entablature
      g.beginPath();
      g.moveTo(x - 8, base - h);
      g.lineTo(x + w / 2, base - h - 40);
      g.lineTo(x + w + 8, base - h);
      g.fill();
      for (let k = 0; k <= 6; k++) g.fillRect(x + 4 + (k * (w - 18)) / 6, base - h + 12, 10, h - 12);
      g.fillRect(x - 10, base - 10, w + 20, 10);
      // broken columns between temples
      for (let k = 0; k < 3; k++) g.fillRect(x + w + 30 + k * 26, base - 40 - r() * 60, 10, 120);
    }
  } else if (kind === 'spires') {
    for (let x = -20; x < 1044; x += 40 + Math.floor(r() * 60)) {
      const h = 140 + r() * 220;
      const w = 18 + r() * 30;
      g.beginPath();
      g.moveTo(x, base);
      g.lineTo(x + w * 0.3, base - h * 0.6);
      g.lineTo(x + w * 0.5, base - h);
      g.lineTo(x + w * 0.7, base - h * 0.55);
      g.lineTo(x + w, base);
      g.fill();
      if (r() < 0.4) g.fillRect(x + w * 0.5 - 14, base - h * 0.5, 28, 6); // crossbar like a horned tower
    }
  } else {
    // alien hive: bulbous domes on stalks and arching ribs
    for (let x = -40; x < 1064; x += 90 + Math.floor(r() * 80)) {
      const h = 120 + r() * 180;
      const rad = 22 + r() * 30;
      g.fillRect(x - 5, base - h, 10, h);
      g.beginPath();
      g.ellipse(x, base - h, rad, rad * 1.3, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 14;
    g.strokeStyle = '#ffffff';
    for (let x = 0; x < 1024; x += 256) {
      g.beginPath();
      g.arc(x + 128, base, 150, Math.PI, 0);
      g.stroke();
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

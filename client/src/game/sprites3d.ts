import { hdCanvases } from './hero-hd';
import type { Aim, CharFrame, Pose } from './sprites';

/**
 * The heroes' and troopers' rendered sprites: each hero (and each faction's trooper) is modelled, rigged and posed in Blender (art3d/hero_rig.py), every pose,
 * run frame and aim rendered, then packed into one atlas per hero (art3d/pack.py): `assets/sprites3d/h<id>.webp`
 * plus `h<id>.json` (frame rectangles and muzzle positions). Frames are the size of the hand-drawn HD frames
 * (hero-hd.ts: 96x100, feet at (40, 96)), so they take their place one for one.
 *
 * Loading is lazy and never blocks: until a hero's atlas has arrived (or where it is missing, or in tests without a
 * browser) the game draws the hand-drawn frame instead.
 */

interface AtlasMeta {
  w: number;
  h: number;
  frames: Record<string, { x: number; y: number; muzzleX: number; muzzleY: number }>;
}

const metas = import.meta.glob<AtlasMeta>('../assets/sprites3d/*.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../assets/sprites3d/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Poses that have a frame per aim; the others are drawn with the gun straight ahead. */
const AIMED: ReadonlySet<Pose> = new Set(['idle', 'run', 'jump', 'fall', 'crouch']);

interface Atlas {
  meta: AtlasMeta;
  img: HTMLImageElement | null;
  ready: boolean;
  /** Called once it has loaded. */
  waiting: (() => void)[];
  frames: Map<string, CharFrame>;
}

const atlases = new Map<string, Atlas>();

function atlasOf(id: string): Atlas | undefined {
  let a = atlases.get(id);
  if (a) return a;
  const meta = metas[`../assets/sprites3d/${id}.json`];
  const url = urls[`../assets/sprites3d/${id}.webp`];
  if (!meta || !url) return undefined;
  a = { meta, img: null, ready: false, waiting: [], frames: new Map() };
  atlases.set(id, a);
  if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
    const img = new Image();
    img.decoding = 'async';
    const atlas = a;
    img.onload = () => {
      atlas.ready = true;
      for (const cb of atlas.waiting.splice(0)) cb();
    };
    img.src = url;
    a.img = img;
  }
  return a;
}

/** Starts loading the heroes' atlases (call once the renderer is up; nothing waits on it). */
export function preloadHeroSprites(ids: readonly number[], extras = false): void {
  for (const id of ids) {
    atlasOf(`h${id}`);
    if (extras) {
      atlasOf(`h${id}-face`);
      atlasOf(`h${id}-big`);
    }
  }
}

/** Runs `cb` once the sprites under `key` have loaded (never, if there are none, or no browser). */
export function onSpritesReady(key: string, cb: () => void): void {
  const a = atlasOf(key);
  if (a && !a.ready && a.img) a.waiting.push(cb);
}

/** True once the rendered sprites under `key` (`h<id>` for a hero, `<faction>-<trooper>` for an enemy) can be drawn. */
export function spritesReady(key: string): boolean {
  return atlasOf(key)?.ready ?? false;
}

/** Whether a rendered atlas exists for this sprite key at all. */
export function hasSprites3d(key: string): boolean {
  return `../assets/sprites3d/${key}.json` in metas;
}

/** Cuts frame `fk` (or a fallback) out of atlas `key` once; `hd`: registers it as a game-size HD frame. */
function cut(key: string, keys: readonly string[], hd: boolean): CharFrame | undefined {
  if (!hasSprites3d(key)) return undefined;
  const a = atlasOf(key);
  if (!a || !a.ready || !a.img) return undefined;
  const fk = keys[0] as string;
  let f = a.frames.get(fk);
  if (f) return f;
  const r = keys.map((k) => a.meta.frames[k]).find((x) => x);
  if (!r) return undefined;
  const c = document.createElement('canvas');
  c.width = a.meta.w;
  c.height = a.meta.h;
  c.getContext('2d')?.drawImage(a.img, r.x, r.y, a.meta.w, a.meta.h, 0, 0, a.meta.w, a.meta.h);
  if (hd) hdCanvases.add(c);
  f = { img: c, muzzleX: r.muzzleX, muzzleY: r.muzzleY };
  a.frames.set(fk, f);
  return f;
}

/**
 * The rendered frame under `key` (a hero: `h<id>`; a trooper: `<faction>-enemy|shield|jet|gren`), or undefined (not
 * loaded yet, or no such frame): the caller then draws the hand-drawn one. Troopers were rendered aiming straight
 * ahead only. Frames are cut out of the atlas once and kept; the first request starts the atlas loading.
 */
export function frame3d(key: string, pose: Pose, frame: number, aim: Aim): CharFrame | undefined {
  const fk = `${pose}_${frame}_${AIMED.has(pose) ? aim : 'f'}`;
  return cut(key, [fk, `${pose}_${frame}_f`, `${pose}_0_f`], true);
}

/** Scale of the menu showcase frames against the game's 1x sprite pixels (3x the HD frames). */
export const BIG = 6;

/**
 * The menu showcase frame (idle or run, aiming ahead or up-forward) at 3x the HD size: anchor (120, 288), muzzle in
 * game pixels like any frame. Undefined until loaded.
 */
export function bigFrame3d(
  id: number,
  pose: 'idle' | 'run',
  frame: number,
  aim: 'f' | 'uf',
): CharFrame | undefined {
  return cut(`h${id}-big`, [`${pose}_${frame}_${aim}`, `${pose}_${frame}_f`], false);
}

/** A head-and-shoulders portrait of hero `id` (128x128), or undefined until loaded. */
export function portrait3d(id: number): HTMLCanvasElement | undefined {
  return cut(`h${id}-face`, ['idle_0_f'], false)?.img;
}

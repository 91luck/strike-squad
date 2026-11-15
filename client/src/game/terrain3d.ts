/**
 * The saga stages' ground (art3d/terrain.py): per art style a lit, seamless rock/earth texture (`fill`, 256x256
 * world px) and a surface strip (`top`: grass, snow, sand, a marble edge…, 256 world px wide, 28 high, its ground
 * line 12 px down). The renderer samples them by world position, so the ground runs on without a tile pattern.
 * Lazy and never blocking: until both have loaded, the hand-drawn tiles are drawn.
 */

const urls = import.meta.glob<string>('../assets/terrain/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** World px the textures repeat over; the surface strip's height and how far it rises above the ground line. */
export const TERRAIN_SIZE = 256;
export const TOP_H = 28;
export const TOP_LIP = 12;
/** A ledge strip's height: a 16 px deck and 8 px of what hangs under it. */
export const PLAT_H = 24;

const imgs = new Map<string, { img: HTMLImageElement; ready: boolean }>();

function load(key: string): { img: HTMLImageElement; ready: boolean } | undefined {
  let e = imgs.get(key);
  if (e) return e;
  const url = urls[`../assets/terrain/${key}.webp`];
  if (!url || typeof Image === 'undefined') return undefined;
  const img = new Image();
  img.decoding = 'async';
  e = { img, ready: false };
  const entry = e;
  img.onload = () => {
    entry.ready = true;
  };
  img.src = url;
  imgs.set(key, e);
  return e;
}

/** The art style's fill and surface, once both have loaded (the first call starts loading them). */
export function terrain3d(art: string): { fill: HTMLImageElement; top: HTMLImageElement } | undefined {
  const f = load(`${art}-fill`);
  const t = load(`${art}-top`);
  load(`${art}-plat`);
  return f?.ready && t?.ready ? { fill: f.img, top: t.img } : undefined;
}

/** The art style's ledge (one-way platform) strip, once loaded. */
export function terrainPlat(art: string): HTMLImageElement | undefined {
  const p = load(`${art}-plat`);
  return p?.ready ? p.img : undefined;
}

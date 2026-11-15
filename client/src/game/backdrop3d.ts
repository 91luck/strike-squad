/**
 * The saga stages' rendered backdrops: three parallax layers per stage art style (far ranges, the nearer skyline,
 * the stage's own world), modelled and lit in Blender (art3d/backdrop.py) and packed with a bloom
 * (art3d/pack_bg.py): `assets/backdrops/<art>-<far|far2|mid>.webp`. Each covers one 1024x576 backdrop tile of the
 * world, minus the empty sky cropped off its top (`top`, world px, in backdrops.json), and tiles seamlessly.
 *
 * Loading is lazy: a stage's layers start loading the first time they are asked for (or when the renderer warms the
 * zone coming up), and until they have arrived the hand-drawn layers are drawn instead.
 */

export type BackdropLayer = 'far' | 'far2' | 'mid';

const meta = import.meta.glob<Record<string, { top: number }>>('../assets/backdrops/backdrops.json', {
  eager: true,
  import: 'default',
});
const urls = import.meta.glob<string>('../assets/backdrops/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const tops: Record<string, { top: number }> = Object.values(meta)[0] ?? {};

export interface Backdrop3d {
  img: HTMLImageElement;
  /** World pixels of sky cropped off the top of the 576-high tile. */
  top: number;
}

const loaded = new Map<string, { img: HTMLImageElement; ready: boolean }>();

function load(key: string): { img: HTMLImageElement; ready: boolean } | undefined {
  let l = loaded.get(key);
  if (l) return l;
  const url = urls[`../assets/backdrops/${key}.webp`];
  if (!url || typeof Image === 'undefined') return undefined;
  const img = new Image();
  img.decoding = 'async';
  l = { img, ready: false };
  const entry = l;
  img.onload = () => {
    entry.ready = true;
  };
  img.src = url;
  loaded.set(key, l);
  return l;
}

/** Whether rendered layers exist for this art style at all. */
export function hasBackdrop3d(art: string): boolean {
  return `${art}-mid` in tops;
}

/** Starts loading a style's layers (nothing waits on it). */
export function warmBackdrop3d(art: string): void {
  if (!hasBackdrop3d(art)) return;
  for (const l of ['far', 'far2', 'mid'] as const) load(`${art}-${l}`);
  load('clouds');
}

/** The rendered layer, or undefined while it loads (or where there is none): draw the hand-drawn one then. */
export function backdrop3d(art: string, layer: BackdropLayer): Backdrop3d | undefined {
  const key = `${art}-${layer}`;
  const t = tops[key];
  if (!t) return undefined;
  const l = load(key);
  return l?.ready ? { img: l.img, top: t.top } : undefined;
}

/** True once all three of a style's layers can be drawn (the renderer switches a stage over all at once). */
export function backdrop3dReady(art: string): boolean {
  return (
    hasBackdrop3d(art) &&
    backdrop3d(art, 'far') !== undefined &&
    backdrop3d(art, 'far2') !== undefined &&
    backdrop3d(art, 'mid') !== undefined
  );
}

/**
 * The rendered clouds (three, side by side in one 1320x140 image, each 220x70 world px at 2x), multiplied by a
 * stage's light colour; undefined until loaded. Cached per colour (a stage uses one).
 */
const tintedClouds = new Map<string, HTMLCanvasElement>();
export function clouds3d(color: string): HTMLCanvasElement | undefined {
  const l = load('clouds');
  if (!l?.ready) return undefined;
  let c = tintedClouds.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = l.img.width;
  c.height = l.img.height;
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.drawImage(l.img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(l.img, 0, 0);
  if (tintedClouds.size > 4) tintedClouds.clear();
  tintedClouds.set(color, c);
  return c;
}

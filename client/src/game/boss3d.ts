/**
 * The saga bosses' rendered parts (Blender, art3d/boss_rig.py → art3d/pack_boss.py): one atlas per boss,
 * `assets/bosses3d/<boss>.webp` + `.json`. A part is drawn by its pivot at a world point; arms (and the mace) are
 * modelled hanging straight down from the pivot and are turned and stretched to reach a given point, so a boss's
 * draw code keeps computing the same shoulder and hand positions its 2D drawing used and the attacks read as before.
 *
 * Loading is lazy (the first request starts it) and never blocks: until the atlas has arrived, `bossReady` is false
 * and the draw code falls back to its 2D drawing.
 */

type Ctx = CanvasRenderingContext2D;

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  /** pivot in atlas pixels from the part's top-left */
  ax: number;
  ay: number;
  /** modelled length in world px (arms, maces) */
  len?: number;
}
interface Meta {
  ss: number;
  parts: Record<string, Part>;
}

const metas = import.meta.glob<Meta>('../assets/bosses3d/*.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../assets/bosses3d/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const atlases = new Map<string, { img: HTMLImageElement; ready: boolean; meta: Meta }>();

function atlas(boss: string): { img: HTMLImageElement; ready: boolean; meta: Meta } | undefined {
  let a = atlases.get(boss);
  if (a) return a;
  const meta = metas[`../assets/bosses3d/${boss}.json`];
  const url = urls[`../assets/bosses3d/${boss}.webp`];
  if (!meta || !url || typeof Image === 'undefined') return undefined;
  const img = new Image();
  img.decoding = 'async';
  a = { img, ready: false, meta };
  const entry = a;
  img.onload = () => {
    entry.ready = true;
  };
  img.src = url;
  atlases.set(boss, a);
  return a;
}

/** True once the boss's rendered parts can be drawn (and starts loading them the first time it is asked). */
export function bossReady(boss: string): boolean {
  return atlas(boss)?.ready ?? false;
}

/** Whether a rendered atlas exists for this boss at all. */
export function hasBoss3d(boss: string): boolean {
  return `../assets/bosses3d/${boss}.json` in metas;
}

/**
 * Draws `part` with its pivot at world (x, y): turned by `angle` (radians, clockwise), mirrored when `flip`, and
 * stretched along its length by `stretch`.
 */
export function drawPart(
  ctx: Ctx,
  boss: string,
  part: string,
  x: number,
  y: number,
  angle = 0,
  flip = false,
  stretch = 1,
): void {
  const a = atlas(boss);
  const p = a?.meta.parts[part];
  if (!a?.ready || !p) return;
  const k = 1 / a.meta.ss;
  ctx.save();
  // the bosses' hit flash (a brightness filter) is made for flat colours; on lit 3D it would bleach the figure white
  if (ctx.filter.startsWith('brightness')) ctx.filter = 'brightness(1.25)';
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.scale(flip ? -k : k, k * stretch);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(a.img, p.x, p.y, p.w, p.h, -p.ax, -p.ay, p.w, p.h);
  ctx.imageSmoothingEnabled = smooth;
  ctx.restore();
}

/**
 * Draws a limb part (modelled hanging straight down from its pivot) from (sx, sy) reaching to (hx, hy): turned to
 * point there and stretched to the distance.
 */
export function drawLimb(
  ctx: Ctx,
  boss: string,
  part: string,
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  flip = false,
): void {
  const a = atlas(boss);
  const p = a?.meta.parts[part];
  if (!p) return;
  const dx = hx - sx;
  const dy = hy - sy;
  const L = Math.hypot(dx, dy);
  drawPart(ctx, boss, part, sx, sy, Math.atan2(-dx, dy), flip, p.len ? L / p.len : 1);
}

/** The boss's rendered face (for the story comms), or undefined until loaded / where there is none. */
export function bossFace(
  boss: string,
): { img: HTMLImageElement; x: number; y: number; w: number; h: number } | undefined {
  const a = atlas(boss);
  const p = a?.meta.parts.face;
  if (!a?.ready || !p) return undefined;
  return { img: a.img, x: p.x, y: p.y, w: p.w, h: p.h };
}

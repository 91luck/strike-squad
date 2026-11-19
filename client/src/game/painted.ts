/**
 * Painted foes: whole creatures cut from the concept atlas (art3d/ai_foes.py → assets/painted/foes.webp + .json), drawn
 * with simple motion instead of a skeleton: a rocking hop while walking, a breath while still, a hover and a wing beat for
 * the flyers. Until the atlas has loaded `drawPainted` returns false and the old drawing is used.
 */

type Ctx = CanvasRenderingContext2D;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** size in game px */
  ww: number;
  wh: number;
  /** which way it faces in the picture */
  right: boolean;
  fly: boolean;
  /** game px of the baked ink line around the figure (the feet sit this far above the picture's bottom) */
  pad?: number;
}

const metas = import.meta.glob<Record<string, Frame>>('../assets/painted/foes.json', {
  eager: true,
  import: 'default',
});
const urls = import.meta.glob<string>('../assets/painted/foes.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const meta = Object.values(metas)[0] ?? {};
let img: HTMLImageElement | null = null;
let ready = false;

function load(): void {
  if (img || typeof Image === 'undefined') return;
  const url = Object.values(urls)[0];
  if (!url) return;
  img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    ready = true;
  };
  img.src = url;
}

/** The foe kinds that have a painting. */
export const PAINTED = new Set<string>(Object.keys(meta));

/** Starts loading the atlas (the renderer asks when a level begins). */
export function preloadPainted(): void {
  load();
}

/**
 * Draws foe `kind` standing (feet) at (x, y) facing `f` (+1 right, -1 left). `moving` makes it hop; `flash` is the hit flash.
 * Returns false while the atlas is not there yet.
 */
export function drawPainted(
  ctx: Ctx,
  kind: string,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  moving: boolean,
  flash: boolean,
): boolean {
  load();
  const fr = meta[kind];
  if (!fr || !ready || !img) return false;
  const t = nowMs / 1000;
  const k = fr.wh / fr.h;
  let lift = 0;
  let rock = 0;
  let sy = 1;
  if (fr.fly) {
    lift = Math.sin(t * 5 + id) * 3 + 6;
    sy = 1 + Math.sin(t * 16 + id) * 0.05;
    rock = Math.sin(t * 5 + id) * 0.04;
  } else if (moving) {
    lift = Math.abs(Math.sin(t * 11 + id)) * 2.2;
    // a stride rock, leaning a little into the walk
    rock = Math.sin(t * 11 + id) * 0.05 + 0.04;
  } else {
    sy = 1 + Math.sin(t * 2.4 + id) * 0.018;
  }
  // a hit: squashed and knocked back for the flash
  let sx = 1;
  if (flash) {
    sx = 1.07;
    sy *= 0.93;
    rock -= 0.08;
  }
  // a soft shadow on the ground (smaller and fainter the higher a flyer hovers)
  const sw = fr.ww * (fr.fly ? 0.32 : 0.42);
  ctx.save();
  ctx.globalAlpha = fr.fly ? 0.18 : 0.32;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(
    Math.round(x),
    Math.round(y) + 1,
    sw * (1 - lift * 0.02),
    Math.max(1.5, sw * 0.18),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - lift + (fr.pad ?? 0)));
  ctx.rotate(rock * f);
  ctx.scale((fr.right ? f : -f) * sx, sy);
  if (flash) ctx.filter = 'brightness(2.2)';
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, (-fr.w * k) / 2, -fr.h * k, fr.w * k, fr.h * k);
  ctx.imageSmoothingEnabled = smooth;
  ctx.restore();
  return true;
}

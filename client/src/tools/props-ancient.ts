/**
 * Dev tool (not in any build): the ancient props, classic sprite next to its high-definition painting, three
 * variants each, at the same on-screen size. Open /tools/props-ancient.html under `npm run dev`.
 */
import { ANCIENT_PROPS } from '../game/prop-hd-ancient';
import { propSprite, type Prop } from '../game/world-art';

const Z = 3; // screen pixels per HD pixel (classic pixels are drawn twice as big)
const kinds = Object.keys(ANCIENT_PROPS) as Prop['kind'][];
const canvas = document.getElementById('sheet') as HTMLCanvasElement;
const cells = kinds.map((k) => {
  const c = propSprite(k, 0);
  return { k, w: c.width * 2 * Z + 16, h: c.height * 2 * Z + 16 };
});
const rowW = (c: { w: number }) => c.w * 4;
canvas.width = Math.max(...cells.map(rowW));
canvas.height = cells.reduce((s, c) => s + c.h, 0);
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled = false;
let y = 0;
for (const { k, w, h } of cells) {
  ctx.fillStyle = '#3b4a63';
  ctx.fillRect(0, y, canvas.width, h);
  const classic = propSprite(k, 0);
  ctx.drawImage(classic, 8, y + 8, classic.width * 2 * Z, classic.height * 2 * Z);
  for (let v = 0; v < 3; v++) {
    const hd = (ANCIENT_PROPS[k] as (v: number) => HTMLCanvasElement)(v);
    ctx.fillStyle = v % 2 ? '#344257' : '#2e3b50';
    ctx.fillRect(w * (v + 1), y, w, h);
    ctx.drawImage(hd, w * (v + 1) + 8, y + 8, hd.width * Z, hd.height * Z);
    if (hd.width !== classic.width * 2 || hd.height !== classic.height * 2) {
      ctx.fillStyle = '#ff2d55';
      ctx.fillText(`SIZE ${hd.width}x${hd.height}`, w * (v + 1) + 10, y + 20);
    }
  }
  y += h;
}

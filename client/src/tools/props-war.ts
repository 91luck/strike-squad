/**
 * Dev tool (not in any build): the war and myth props, classic sprite next to its high-definition painting,
 * three variants each, blown up `?zoom=` times (default 3). Open /tools/props-war.html under `npm run dev`.
 */
import { WAR_PROPS } from '../game/prop-hd-war';
import { propSprite, type Prop } from '../game/world-art';

const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 3);
const kinds = Object.keys(WAR_PROPS) as Prop['kind'][];
const variants = [0, 1, 2];
const cell = (k: Prop['kind']) => propSprite(k, 0);
const colW = Math.max(...kinds.map((k) => cell(k).width)) * zoom + 16;
const rowH = (k: Prop['kind']) => cell(k).height * zoom + 16;
const canvas = document.getElementById('sheet') as HTMLCanvasElement;
canvas.width = colW * variants.length * 2;
canvas.height = kinds.reduce((s, k) => s + rowH(k), 0);
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled = false;
let y = 0;
kinds.forEach((k, row) => {
  variants.forEach((v, i) => {
    const classic = propSprite(k, v);
    const hd = (WAR_PROPS[k] as (v: number) => HTMLCanvasElement)(v);
    for (const [j, img, s] of [
      [0, classic, zoom],
      [1, hd, zoom / 2],
    ] as const) {
      const x = (i * 2 + j) * colW;
      ctx.fillStyle = (row + i * 2 + j) % 2 ? '#1a2238' : '#243052';
      ctx.fillRect(x, y, colW, rowH(k));
      ctx.drawImage(img, x + 8, y + 8, img.width * s, img.height * s);
      if (img.width * (j ? 0.5 : 1) !== classic.width || img.height * (j ? 0.5 : 1) !== classic.height) {
        ctx.fillStyle = '#ff2d2d';
        ctx.fillText(`SIZE ${img.width}x${img.height}`, x + 4, y + 12);
      }
    }
  });
  y += rowH(k);
});

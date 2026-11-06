/**
 * Dev tool (not in any build): every Astra Saga boss on one sheet, in the attack pose given by `?at=<id>`
 * (default idle), to check that each boss reads as its own creature. Open /tools/bosses.html under `npm run dev`.
 */
import { BOSS_STYLE_IDS, BOSS_STYLES, GAME_CONFIG, type EnemySnapshot } from '@strikesquad/shared';
import { ASURA_LOOKS, drawAsuraFlyer, drawAsuraKing, drawAsuraWalker } from '../game/asura-art';
import type { BossKit } from '../game/boss-art';

const cols = 6;
const cellW = 300;
const cellH = 330;
const rows = Math.ceil(BOSS_STYLE_IDS.length / cols);
const canvas = document.getElementById('sheet') as HTMLCanvasElement;
canvas.width = cols * cellW;
canvas.height = rows * cellH;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const at = Number(new URLSearchParams(location.search).get('at') ?? 0);

const kit: BossKit = {
  ctx,
  reduce: true,
  glow: (x, y, r, c) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  },
  add: () => undefined,
  warnIcon: () => undefined,
  sightLine: () => undefined,
  shadowAt: (x, y, w) => {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  label: () => undefined,
};

BOSS_STYLE_IDS.forEach((id, i) => {
  const style = BOSS_STYLES[id];
  const look = ASURA_LOOKS[id];
  if (!style || !look) return;
  const cx = (i % cols) * cellW + cellW / 2;
  const floor = Math.floor(i / cols) * cellH + cellH - 40;
  ctx.fillStyle = i % 2 ? '#162040' : '#1a2448';
  ctx.fillRect((i % cols) * cellW, floor - cellH + 40, cellW, cellH);
  ctx.fillStyle = '#3b2f2a';
  ctx.fillRect((i % cols) * cellW, floor, cellW, 40);
  const e: EnemySnapshot = {
    id: i,
    k: style.body,
    x: cx,
    y: style.body === 'gunship' ? floor - 170 : floor,
    hp: 100,
    f: -1,
    h: 0,
    a: Math.PI * 100,
    sh: 0,
    at,
    tt: 6,
    p: 1,
    ph: 1,
    ra: -1,
    rt: 0,
    rs: 0,
    sn: 0,
    im: 0,
    el: 0,
  };
  if (style.body === 'walker') drawAsuraWalker(kit, look, e, 1000, { t: 0.2, wind: 0.6, telegraph: at > 0 });
  else if (style.body === 'gunship')
    drawAsuraFlyer(kit, look, e, 1000, { t: 0.2, wind: 0.6, telegraph: at > 0 });
  else drawAsuraKing(kit, look, { ...e, x: cx + 30 }, false, 1000, { t: 0, wind: 0, telegraph: false }, 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(id.toUpperCase(), cx, floor + 26);
  void GAME_CONFIG;
});
document.body.dataset.ready = '1';

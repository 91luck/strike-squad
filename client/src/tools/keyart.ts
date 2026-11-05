import '@fontsource/russo-one/latin-400.css';
import { ATTACK, GAME_CONFIG, Sim, getMission, type EnemySnapshot, type SagaId } from '@strikesquad/shared';
import { drawArrow, drawChakra, drawSerpent } from '../game/astra-fx';
import { drawThemedWalker, type BossKit } from '../game/boss-art';
import { Renderer } from '../game/renderer';
import { CENTER_X, FEET_Y, charFrame, heroLook } from '../game/sprites';

/**
 * Key art for the store pages (CrazyGames covers): a real level from the game as the backdrop (drawn by the
 * game's own renderer), with the hero, an asura beast and the astras painted large on top, and the title.
 * A development tool, not shipped: open /tools/keyart.html?w=1920&h=1080&layout=landscape in `npm run dev`
 * (scripts/make-store-media.ts screenshots it). Cover rules: only the game's title as text, no borders, no logos.
 */

type Layout = 'landscape' | 'portrait' | 'square';
const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1920);
const H = Number(q.get('h') ?? 1080);
const layout = (q.get('layout') ?? 'landscape') as Layout;
const stage = (q.get('stage') ?? 'astra-10') as SagaId;

const bg = document.getElementById('bg') as HTMLCanvasElement;
const fx = document.getElementById('fx') as HTMLCanvasElement;
/** The level backdrop's height: shorter on tall covers, so the ground sits lower in the frame's middle. */
const BG_H = H;
bg.style.width = fx.style.width = `${W}px`;
bg.style.height = `${BG_H}px`;
fx.style.height = `${H}px`;
document.body.style.background = '#0d0308';
fx.width = W;
fx.height = H;

// ---------------------------------------------------------------- backdrop: the real level, empty of actors

const level = getMission(stage);
const sim = new Sim({ seed: 7, settings: { mission: stage } });
sim.addPlayer({ id: 'me', name: 'Arjun', slot: 0, hero: 0 });
while (sim.phase === 'countdown') sim.step();
const arena = level.arenas.find((a) => a.boss === 'boss') ?? level.arenas[0];
const renderer = new Renderer(bg, { maxDpr: 1 });
renderer.setLevel(level);
const r = renderer as unknown as Record<string, unknown>;
r.drawProgress = () => undefined;
r.drawOffscreenMarkers = () => undefined;
r.drawPickups = () => undefined;
r.drawCheckpoints = () => undefined;
const snap = sim.snapshot();
const camWorldX = (arena?.left ?? 0) + 6 * 32;
snap.players = snap.players.map((p) => ({ ...p, x: camWorldX, y: 4000 }));
snap.enemies = [];
snap.bullets = [];
snap.fx = [];
snap.boss = null;
snap.arena = null;
snap.taken = 0x7fffffff;
for (let i = 0; i < 90; i++)
  renderer.draw(snap, { meId: 'me', nowMs: 1000 + i * 33, reduceMotion: false, mine: null });

// ---------------------------------------------------------------- the painting

const ctx = fx.getContext('2d') as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled = false;
/** Ground line of the backdrop (the level is 576 world px tall, ground at row 14). */
const groundY = BG_H * ((14 * 32) / 576);
const L = {
  landscape: { heroX: 0.25, heroH: 0.44, bossX: 0.74, bossW: 0.24, title: 0.12, sub: 0.225, titleSize: 0.1 },
  portrait: { heroX: 0.31, heroH: 0.33, bossX: 0.76, bossW: 0.42, title: 0.085, sub: 0.15, titleSize: 0.105 },
  square: { heroX: 0.27, heroH: 0.34, bossX: 0.74, bossW: 0.33, title: 0.1, sub: 0.19, titleSize: 0.1 },
}[layout];

function radial(x: number, y: number, r0: number, color: string, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r0);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r0, y - r0, r0 * 2, r0 * 2);
  ctx.restore();
}

// Mood: deepen the sky edges and the ground so the actors pop.
{
  const v = ctx.createRadialGradient(
    W / 2,
    H * 0.45,
    Math.min(W, H) * 0.25,
    W / 2,
    H * 0.5,
    Math.max(W, H) * 0.75,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(6,0,12,0.72)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  const fl = ctx.createLinearGradient(0, groundY - 20, 0, H);
  fl.addColorStop(0, 'rgba(8,2,10,0.1)');
  fl.addColorStop(1, 'rgba(8,2,10,0.85)');
  ctx.fillStyle = fl;
  ctx.fillRect(0, groundY - 20, W, H - groundY + 20);
  // The backdrop may be shorter than the cover: fade its last rows into the page colour (no hard edge).
  if (BG_H < H) {
    const f = ctx.createLinearGradient(0, BG_H - 140, 0, BG_H);
    f.addColorStop(0, 'rgba(13,3,8,0)');
    f.addColorStop(1, 'rgba(13,3,8,1)');
    ctx.fillStyle = f;
    ctx.fillRect(0, BG_H - 140, W, 140);
  }
}

const u = H / 1080; // design unit
const now = 4321;

// The narayanastra halo: a ring of arrows in the sky behind the title.
{
  const cx = W / 2;
  const cy = H * (L.sub + 0.02);
  const R = Math.min(W, H) * (layout === 'landscape' ? 0.42 : 0.4);
  radial(cx, cy, R * 0.9, 'rgba(253,224,71,0.35)');
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.36);
    ctx.scale(2.2 * u, 2.2 * u);
    drawArrow(ctx, 0, 0, Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2));
    ctx.restore();
  }
  ctx.restore();
}

// The asura beast (the saga's walker, in the last war's crimson).
const bossX = W * L.bossX;
const bossScale = (W * L.bossW) / GAME_CONFIG.enemies.walker.width;
{
  radial(bossX, groundY - 50 * bossScale, 70 * bossScale, 'rgba(244,63,94,0.55)');
  const kit: BossKit = {
    ctx,
    reduce: false,
    glow: (x, y, rr, c) => radial(x, y, rr, c),
    add: () => undefined,
    warnIcon: () => undefined,
    sightLine: () => undefined,
    shadowAt: (x, y, w) => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    label: () => undefined,
  };
  const e: EnemySnapshot = {
    id: 1,
    k: 'walker',
    x: 0,
    y: 0,
    hp: 100,
    f: -1,
    h: 0,
    a: 0,
    sh: 0,
    at: ATTACK.charge,
    tt: 30,
    p: 1,
    ph: 1,
    ra: -1,
    rt: 0,
    rs: 0,
    sn: 0,
    im: 0,
  };
  ctx.save();
  ctx.translate(bossX, groundY);
  ctx.scale(bossScale, bossScale);
  ctx.filter = `hue-rotate(${level.tint}deg) saturate(1.25) brightness(1.25)`;
  ctx.shadowColor = 'rgba(255,120,170,0.9)';
  ctx.shadowBlur = 30 * (H / 1080);
  drawThemedWalker(kit, 'demon', e, now, { t: 30, wind: 26, telegraph: false });
  ctx.restore();
  ctx.filter = 'none';
}

// The squad: a second hero behind, the lead hero big in front, both rim-lit.
function hero(
  id: number,
  x: number,
  heightPx: number,
  alpha = 1,
  aim: 'f' | 'uf' = 'f',
): { mx: number; my: number } {
  const f = charFrame(`key${id}`, heroLook(id), 'run', 2, aim);
  const s = heightPx / FEET_Y;
  const dx = x - CENTER_X * s;
  const dy = groundY - FEET_Y * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(255,214,120,0.9)';
  ctx.shadowBlur = 26 * u;
  ctx.drawImage(f.img, dx, dy, f.img.width * s, f.img.height * s);
  ctx.shadowBlur = 0;
  ctx.drawImage(f.img, dx, dy, f.img.width * s, f.img.height * s);
  ctx.restore();
  // shadow on the ground
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, groundY + 2, 16 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Muzzle offsets are measured from the feet anchor (centre x, ground y).
  return { mx: x + f.muzzleX * s, my: groundY + f.muzzleY * s };
}
const heroX = W * L.heroX;
const heroH = H * L.heroH;
hero(1, heroX - heroH * 0.42, heroH * 0.72, 0.9, 'uf');
const muzzle = hero(0, heroX, heroH);

// Muzzle flash and the astras flying at the beast: serpents, the discus, a stream of fire.
radial(muzzle.mx, muzzle.my, 60 * u, 'rgba(255,240,200,0.95)');
radial(muzzle.mx, muzzle.my, 140 * u, 'rgba(255,170,60,0.45)');
{
  const tx = bossX - 30 * bossScale;
  const ty = groundY - 60 * bossScale;
  for (let i = 0; i < 3; i++) {
    const t = 0.35 + i * 0.18;
    const x = muzzle.mx + (tx - muzzle.mx) * t;
    const y = muzzle.my + (ty - muzzle.my) * t + Math.sin(t * 9 + i) * 70 * u - 40 * u * i;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(3.2 * u, 3.2 * u);
    drawSerpent(ctx, 0, 0, 1, -0.25 + i * 0.25, false, now + i * 140);
    ctx.restore();
  }
  // the discus, with its spin trail
  const cx = muzzle.mx + (tx - muzzle.mx) * 0.62;
  const cy = muzzle.my - 150 * u;
  for (let k = 5; k >= 1; k--) {
    ctx.save();
    ctx.globalAlpha = 0.12 * (6 - k);
    ctx.translate(cx - k * 26 * u, cy + k * 9 * u);
    ctx.scale(5.2 * u, 5.2 * u);
    drawChakra(ctx, 0, 0, now - k * 40, false);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(5.6 * u, 5.6 * u);
  drawChakra(ctx, 0, 0, now, false);
  ctx.restore();
  radial(cx, cy, 120 * u, 'rgba(253,224,71,0.5)');
}

// Embers drifting up from the burning ground.
{
  let seed = 9;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W;
    const y = groundY - rnd() * H * 0.7;
    const s = (1 + rnd() * 3.5) * u;
    radial(x, y, s * 4, rnd() < 0.5 ? 'rgba(255,170,60,0.9)' : 'rgba(253,224,71,0.8)', 0.7);
  }
  // fire licking along the ground line
  for (let x = 0; x < W; x += 18 * u) {
    const h = (26 + Math.sin(x * 0.05) * 14 + Math.sin(x * 0.013) * 18) * u;
    const g = ctx.createLinearGradient(0, groundY - h, 0, groundY + 6 * u);
    g.addColorStop(0, 'rgba(255,60,0,0)');
    g.addColorStop(0.6, 'rgba(255,130,30,0.55)');
    g.addColorStop(1, 'rgba(255,230,150,0.75)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 12 * u, groundY + 6 * u);
    ctx.quadraticCurveTo(x, groundY - h * 1.5, x + 12 * u, groundY + 6 * u);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the title (the only text a cover may carry)

async function title(): Promise<void> {
  await document.fonts.load(`100px "Russo One"`);
  const size = Math.min(W, H * 1.6) * L.titleSize;
  const draw = (text: string, y: number, px: number, fill: CanvasGradient | string, depth: string): void => {
    ctx.font = `${px}px "Russo One"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // fit the width
    const max = W * 0.92;
    const w = ctx.measureText(text).width;
    const k = w > max ? max / w : 1;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(k, k);
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = px * 0.25;
    ctx.shadowOffsetY = px * 0.08;
    ctx.fillStyle = depth;
    ctx.fillText(text, 0, px * 0.07);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#1a0a02';
    ctx.lineWidth = px * 0.11;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  const gold = ctx.createLinearGradient(0, H * L.title - size / 2, 0, H * L.title + size / 2);
  gold.addColorStop(0, '#ffe55c');
  gold.addColorStop(0.5, '#ffb300');
  gold.addColorStop(1, '#ff6a00');
  draw('STRIKE SQUAD', H * L.title, size, gold, '#7a2e00');
  const sub = size * 0.52;
  const silver = ctx.createLinearGradient(0, H * L.sub - sub / 2, 0, H * L.sub + sub / 2);
  silver.addColorStop(0, '#ffffff');
  silver.addColorStop(1, '#ffd6e8');
  draw('ASTRA SAGA', H * L.sub, sub, silver, '#5b0b2e');
  document.body.dataset.ready = '1';
}
void title();

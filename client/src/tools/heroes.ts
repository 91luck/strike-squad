/**
 * Dev tool (not in any build): every hero in every pose and aim, high definition next to the classic sprite,
 * blown up `?zoom=` times (default 3). Open /tools/heroes.html under `npm run dev`.
 */
import { HEROES } from '@strikesquad/shared';
import {
  FACTION_LOOKS,
  SAGA_HOSTS,
  charFrame,
  heroLook,
  type Aim,
  type Look,
  type Pose,
} from '../game/sprites';
import { HD_CENTER, HD_FEET, hdCanvases } from '../game/hero-hd';

const q = new URLSearchParams(location.search);
const zoom = Number(q.get('zoom') ?? 3);
// ?troopers=1: every faction's and saga host's troopers instead of the heroes
const rows: [string, Look][] = q.get('troopers')
  ? [
      ...Object.entries(FACTION_LOOKS).flatMap(([f, l]) =>
        Object.entries(l).map(([k, look]): [string, Look] => [`${f}-${k}`, look]),
      ),
      ...SAGA_HOSTS.flatMap((l, i) =>
        Object.entries(l).map(([k, look]): [string, Look] => [`saga${i + 1}-${k}`, look]),
      ),
    ]
  : HEROES.map((h): [string, Look] => [`h${h.id}`, heroLook(h.id)]);
const shots: [Pose, number, Aim][] = [
  ['idle', 0, 'f'],
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): [Pose, number, Aim] => ['run', i, 'f']),
  ['idle', 0, 'uf'],
  ['idle', 0, 'u'],
  ['idle', 0, 'df'],
  ['jump', 0, 'f'],
  ['fall', 0, 'f'],
  ['crouch', 0, 'f'],
  ['dash', 0, 'f'],
  ['slide', 0, 'f'],
  ['melee', 0, 'f'],
  ['melee', 1, 'f'],
  ['flip', 0, 'f'],
  ['down', 0, 'f'],
];
const cw = 50 * zoom;
const ch = 56 * zoom;
const canvas = document.getElementById('sheet') as HTMLCanvasElement;
canvas.width = shots.length * cw;
canvas.height = rows.length * ch;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled = false;
rows.forEach(([key, look], row) => {
  shots.forEach(([pose, frame, aim], col) => {
    ctx.fillStyle = (row + col) % 2 ? '#1a2238' : '#202a44';
    ctx.fillRect(col * cw, row * ch, cw, ch);
    const f = charFrame(key, look, pose, frame, aim);
    const hd = hdCanvases.has(f.img);
    const k = hd ? zoom / 2 : zoom;
    const ox = hd ? HD_CENTER : 20;
    const oy = hd ? HD_FEET : 48;
    const fx = col * cw + cw / 2;
    const fy = row * ch + ch - 4 * zoom;
    ctx.drawImage(f.img, fx - ox * k, fy - oy * k, f.img.width * k, f.img.height * k);
    ctx.fillStyle = '#ff4060';
    ctx.fillRect(fx + f.muzzleX * zoom - 2, fy + f.muzzleY * zoom - 2, 4, 4);
  });
});

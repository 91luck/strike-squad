/**
 * High-definition backdrop shading.
 *
 * The parallax layers (mountains, jungle canopy, skylines) are white silhouettes. A flat tint makes them read as
 * cut-outs; this module lights them like painted scenery instead:
 * - a vertical gradient: lit at the top, darker towards the base;
 * - a rim of light along every top edge and the sun-side edges, in a warm (or, by moonlight, cool) tone;
 * - surface texture (leafy clumps or rock strata) so large shapes are not plain;
 * - aerial perspective: the base melts into the zone's haze, so far layers sit back and near ones stand out.
 * Everything is computed once per layer, colour and resolution, then cached by the renderer.
 */

export interface LayerLight {
  /** The layer's colour (the zone's far or mid colour). */
  color: string;
  /** Rim light colour (sunlit or moonlit). */
  rim: string;
  /** Haze colour the base fades into. */
  haze: string;
  /** How strongly the base fades into the haze, 0..1. */
  hazeAmt: number;
  texture: 'leaf' | 'rock' | 'none';
  /** Resolution factor the silhouette was drawn at. */
  k: number;
}

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

function mix(a: string, b: string, t: number): string {
  const p = (c: string): number[] => {
    if (c.startsWith('rgb')) return (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    let h = c.replace('#', '');
    if (h.length === 3)
      h = h
        .split('')
        .map((x) => x + x)
        .join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + ((B[i] ?? 0) - v) * t)).join(',')})`;
}

let patterns: { leaf: HTMLCanvasElement; rock: HTMLCanvasElement } | null = null;

/** Seamless 256 px texture tiles: clumps of leaves, and layered rock. White on clear, used as light and shade. */
function texturePatterns(): { leaf: HTMLCanvasElement; rock: HTMLCanvasElement } {
  if (patterns) return patterns;
  let s = 7;
  const r = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const [leaf, lg] = cv(256, 256);
  for (let i = 0; i < 260; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 3 + r() * 7;
    const light = r() < 0.5;
    lg.fillStyle = light ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.55)';
    for (const dx of [-256, 0, 256])
      for (const dy of [-256, 0, 256]) {
        lg.beginPath();
        lg.arc(x + dx, y + dy + (light ? -1.5 : 1.5), rad, 0, Math.PI * 2);
        lg.fill();
      }
  }
  const [rock, rg] = cv(256, 256);
  for (let y = 0; y < 256; y += 6 + Math.floor(r() * 10)) {
    rg.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)';
    rg.beginPath();
    rg.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) rg.lineTo(x, y + Math.sin((x / 256) * Math.PI * 2 * 2 + y) * 3);
    rg.lineTo(256, y + 2);
    for (let x = 256; x >= 0; x -= 16) rg.lineTo(x, y + 2 + Math.sin((x / 256) * Math.PI * 2 * 3 + y) * 1.5);
    rg.closePath();
    rg.fill();
  }
  for (let i = 0; i < 120; i++) {
    rg.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.3)';
    rg.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 2 + Math.floor(r() * 4), 2);
  }
  patterns = { leaf, rock };
  return patterns;
}

/** A band `px` deep along the silhouette's edges facing (dx, dy): the mask minus the mask shifted that way. */
function edgeBand(mask: HTMLCanvasElement, dx: number, dy: number, color: string): HTMLCanvasElement {
  const [c, g] = cv(mask.width, mask.height);
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(mask, dx, dy);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The silhouette `mask`, lit as painted scenery. */
export function shadeLayer(mask: HTMLCanvasElement, L: LayerLight): HTMLCanvasElement {
  const W = mask.width;
  const H = mask.height;
  const [c, g] = cv(W, H);
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  // body: lighter where it meets the sky, darker towards its base
  const grad = g.createLinearGradient(0, H * 0.25, 0, H);
  grad.addColorStop(0, mix(L.color, '#ffffff', 0.08));
  grad.addColorStop(0.55, L.color);
  grad.addColorStop(1, mix(L.color, '#000000', 0.38));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-atop';
  // texture: dark and light flecks, faint, so the big shapes have a surface
  if (L.texture !== 'none') {
    const tex = texturePatterns()[L.texture];
    const pat = g.createPattern(tex, 'repeat');
    if (pat) {
      g.globalAlpha = 0.16;
      g.fillStyle = pat;
      g.save();
      g.scale(L.k / 2, L.k / 2);
      g.fillRect(0, 0, (W * 2) / L.k, (H * 2) / L.k);
      g.restore();
      g.globalAlpha = 1;
    }
  }
  // rim light along the tops and the sun-side (right) edges, and a cool shadow along the left edges
  const k = L.k;
  g.globalAlpha = 0.85;
  g.drawImage(edgeBand(mask, 0, Math.round(2.5 * k), mix(L.color, L.rim, 0.55)), 0, 0);
  g.globalAlpha = 0.55;
  g.drawImage(edgeBand(mask, -Math.round(2 * k), Math.round(k), mix(L.color, L.rim, 0.4)), 0, 0);
  g.globalAlpha = 0.35;
  g.drawImage(edgeBand(mask, Math.round(3 * k), 0, mix(L.color, '#000000', 0.35)), 0, 0);
  g.globalAlpha = 1;
  // aerial perspective: the base sinks into the haze
  const haze = g.createLinearGradient(0, H * 0.45, 0, H);
  haze.addColorStop(0, 'rgba(0,0,0,0)');
  haze.addColorStop(1, L.haze);
  g.globalAlpha = L.hazeAmt;
  g.fillStyle = haze;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  return c;
}

const clouds = new Map<string, HTMLCanvasElement>();

/**
 * A cumulus cloud 220 x 70 world px at `k` times resolution: a soft lit top, a flatter shaded base, and a warm
 * (or moonlit) rim on the sun side.
 */
export function cloudHD(v: number, k: number, rim: string): HTMLCanvasElement {
  const key = `${v}|${k}|${rim}`;
  let c = clouds.get(key);
  if (c) return c;
  let s = v * 9301 + 49297;
  const r = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const [shape, sg] = cv(220 * k, 70 * k);
  sg.scale(k, k);
  sg.fillStyle = '#fff';
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < 11; i++) puffs.push([30 + r() * 160, 34 + r() * 14, 12 + r() * 18]);
  for (const [x, y, rad] of puffs) {
    sg.beginPath();
    sg.arc(x, y, rad, 0, Math.PI * 2);
    sg.fill();
  }
  // a flat base
  sg.globalCompositeOperation = 'destination-out';
  sg.fillRect(0, 54, 220, 20);
  sg.globalCompositeOperation = 'source-over';
  const [out, og] = cv(220 * k, 70 * k);
  og.drawImage(shape, 0, 0);
  og.globalCompositeOperation = 'source-in';
  const grad = og.createLinearGradient(0, 10 * k, 0, 56 * k);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.6, 'rgba(236,240,248,0.85)');
  grad.addColorStop(1, 'rgba(176,186,210,0.8)');
  og.fillStyle = grad;
  og.fillRect(0, 0, out.width, out.height);
  og.globalCompositeOperation = 'source-atop';
  og.globalAlpha = 0.7;
  og.drawImage(edgeBand(shape, -3 * k, 2 * k, rim), 0, 0);
  og.globalAlpha = 1;
  c = out;
  clouds.set(key, c);
  return c;
}

/**
 * Sun shafts: a fan of soft additive beams from (x, y) down across the scene, turning very slowly. `strength`
 * 0..1; drawn in screen space.
 */
export function drawSunShafts(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  H: number,
  color: string,
  strength: number,
  nowMs: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const len = H * 1.6;
  // soft beams: they start past the sun's disc, swell, then fade out over the land
  const g = ctx.createRadialGradient(x, y, 0, x, y, len);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.07, 'rgba(0,0,0,0)');
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.5 + (i - 3) * 0.26 + Math.sin(nowMs / 9000 + i * 1.7) * 0.06;
    const w = 0.05 + ((i * 37) % 5) * 0.012;
    ctx.globalAlpha = strength * (0.035 + ((i * 53) % 7) * 0.005);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a - w) * len, y + Math.sin(a - w) * len);
    ctx.lineTo(x + Math.cos(a + w) * len, y + Math.sin(a + w) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

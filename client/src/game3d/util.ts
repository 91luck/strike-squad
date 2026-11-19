import * as THREE from 'three';
import { GAME_CONFIG, Tile, type LevelDef } from '@strikesquad/shared';

/** Shared pieces for the 3D stage looks (themes.ts and the architecture kits). */

export const T = GAME_CONFIG.tile;

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ground line under x (top of the first solid tile from the top), as three's y, or a default. */
export function groundY(level: LevelDef, x: number): number {
  const c = Math.max(0, Math.min(level.cols - 1, Math.floor(x / T)));
  for (let r = 1; r < level.rows; r++) if (level.tiles[r * level.cols + c] === 1) return -r * T;
  return -(level.rows - 3) * T;
}

/** Instanced copies of one mesh at the given transforms. */
export function instances(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  list: Inst[],
  shadows: boolean,
  cast = true,
): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  list.forEach((it, i) => {
    o.position.copy(it.p);
    o.scale.copy(it.s);
    o.rotation.set(it.rx ?? 0, it.r ?? 0, it.rz ?? 0);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  m.castShadow = cast && shadows;
  m.receiveShadow = shadows;
  m.frustumCulled = false;
  return m;
}

/** A low-poly hill range: a strip of noise-shaped peaks along x at depth z. */
export function hills(
  width: number,
  z: number,
  base: number,
  height: number,
  color: number,
  seed: number,
  rough = 0.35,
): THREE.Mesh {
  const r = rng(seed);
  const n = Math.ceil(width / 120) + 2;
  const g = new THREE.PlaneGeometry(width + 2000, height * 1.6, n, 6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const peaks: number[] = [];
  for (let i = 0; i <= n; i++) peaks.push(r());
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const k = (x + (width + 2000) / 2) / (width + 2000);
    const j = Math.min(n, Math.floor(k * n));
    const f = k * n - j;
    const h0 = peaks[j] ?? 0.5;
    const h1 = peaks[j + 1] ?? 0.5;
    const h = h0 + (h1 - h0) * (f * f * (3 - 2 * f));
    const top = (0.35 + 0.65 * h) * height;
    const t = (y + height * 0.8) / (height * 1.6); // 0 bottom .. 1 top
    pos.setY(i, -height * 0.8 + t * (top + height * 0.8));
    pos.setZ(i, (r() - 0.5) * height * rough * t);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  m.position.set(width / 2, base, z);
  return m;
}

/** Embers or motes rising through the view (a shader moves them, so they cost nothing per frame). */
export function motes(
  level: LevelDef,
  color: number,
  count: number,
  rise: number,
  size: number,
): THREE.Points {
  const W = level.cols * T;
  const r = rng(7);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = r() * W;
    pos[i * 3 + 1] = -r() * level.rows * T;
    pos[i * 3 + 2] = -50 - r() * 900;
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const c = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: c },
      rise: { value: rise },
      size: { value: size },
      span: { value: level.rows * T },
    },
    vertexShader: `
      attribute float seed; uniform float time; uniform float rise; uniform float size; uniform float span;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = time * rise + seed * span;
        p.y = position.y + mod(t, span);
        if (p.y > 0.0) p.y -= span;
        p.x += sin(time * 0.7 + seed * 40.0) * 30.0;
        vA = 0.5 + 0.5 * sin(time * 3.0 + seed * 20.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * (900.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(color, (1.0 - d * 2.0) * vA);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export type Inst = { p: THREE.Vector3; s: THREE.Vector3; r?: number; rx?: number; rz?: number };

export /** Runs of walkway: columns side by side whose surface is at the same row (the causeway between gaps and steps). */
function runs(level: LevelDef): { c0: number; c1: number; row: number }[] {
  const out: { c0: number; c1: number; row: number }[] = [];
  const surf = (c: number): number => {
    for (let r = 1; r < level.rows; r++) if (level.tiles[r * level.cols + c] === Tile.Solid) return r;
    return -1;
  };
  let start = 0;
  let row = surf(0);
  for (let c = 1; c <= level.cols; c++) {
    const r = c < level.cols ? surf(c) : -2;
    if (r !== row) {
      if (row > 0) out.push({ c0: start, c1: c - 1, row });
      start = c;
      row = r;
    }
  }
  return out;
}

export /** A soft round glow (moon halo, lamp light), as a sprite texture. */
function glowTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glow(color: number, size: number, opacity: number): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  s.scale.set(size, size, 1);
  return s;
}

/** Fire burning in the far forest: glowing sheets behind the trees, flickering. */
export function fireGlow(g: THREE.Group, level: LevelDef, color: number, seed: number): void {
  const W = level.cols * T;
  const r = rng(seed);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) } },
    vertexShader:
      'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; uniform vec3 color; varying vec2 vUv;
      float n(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float sn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(n(i), n(i+vec2(1,0)), f.x), mix(n(i+vec2(0,1)), n(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vec2(vUv.x * 18.0, vUv.y * 3.0 - time * 1.4);
        float f = sn(p) * 0.6 + sn(p * 2.3) * 0.4;
        float h = 1.0 - vUv.y;
        float a = smoothstep(0.25, 0.95, f * h * 1.6) * h;
        gl_FragColor = vec4(color * (1.2 + f), a * 0.85);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mat.name = 'fire';
  for (let i = 0; i < W / 900 + 2; i++) {
    const w = 900 + r() * 700;
    const x = r() * W;
    const z = -1100 - r() * 900;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 520), mat);
    m.position.set(x, groundY(level, Math.min(W - 1, x)) - 40, z);
    g.add(m);
  }
}

/**
 * A box whose texture keeps its world scale (one texture repeat per `per` world px on every face), for long walls
 * and tiers that instancing would stretch. Centred at `p`.
 */
export function wallBox(
  p: THREE.Vector3,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  per = 256,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // faces in order +x, -x, +y, -y, +z, -z, four vertices each
  const size: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const [su, sv] = size[f] as [number, number];
      uv.setXY(i, (uv.getX(i) * su) / per, (uv.getY(i) * sv) / per);
    }
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(p);
  return m;
}

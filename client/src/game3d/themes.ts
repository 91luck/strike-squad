import * as THREE from 'three';
import { type LevelDef } from '@strikesquad/shared';
import { fireGlow, groundY, hills, instances, motes, rng, runs, T, type Inst } from './util';
import { archGeo, pillarGeo, spireGeo } from './shapes';
import { seaPlane, setuAnimate, setuScenery } from './setu';
import { shikharAnimate, shikharScenery } from './shikhar';
import { naglokAnimate, naglokScenery } from './naglok';
import {
  bhasmScenery,
  chakraScenery,
  dwandScenery,
  mayaScenery,
  ranbhoomiScenery,
  stageAnimate,
  suvarnaScenery,
} from './stages';

/**
 * The 3D look of each art style (world3d.ts): sky, fog and light, how the ground is tinted, and the scenery built
 * behind the play plane. Scenery is instanced (one draw per kind of thing) and seeded, so it is the same every run.
 *
 * Depth plan (world px, the play plane at z = 0, the camera at about +1000): the ground's top runs back to -220;
 * the near scenery stands from -260 to -700, the far from -900 to -2600, hills and peaks to -4000, the sky at -5200.
 */

export interface SceneryOpts {
  shadows: boolean;
  /** A repeating texture from assets/terrain by name (e.g. 'setu-stone'). */
  tex: (key: string) => THREE.Texture;
}

export interface Theme {
  /** Terrain texture set (assets/terrain/<terrain>-fill/top/plat.webp). */
  terrain: string;
  skyTop: number;
  skyMid: number;
  skyBottom: number;
  fog: number;
  fogDensity: number;
  skyLight: number;
  groundLight: number;
  hemi: number;
  sun: number;
  sunIntensity: number;
  /** Where the sun light comes from (x, y), relative to the camera. */
  sunDir: [number, number];
  frontTint: number;
  topTint: number;
  /**
   * A built stage: walls, paving and the carved edge come from assets/terrain/<kit>-wall/pave/band.webp instead of
   * the earth fill and its turf (the stage is architecture, not ground).
   */
  kit?: string;
  /** Stone the tide reaches darkens to `color` below the mean sea surface, over `reach` px either side of it. */
  wet?: { color: number; reach: number };
  /** A sea surface that follows the tide (world3d moves it). */
  sea?: (level: LevelDef) => THREE.Mesh;
  scenery: (g: THREE.Group, level: LevelDef, o: SceneryOpts) => void;
  particles?: (level: LevelDef) => THREE.Points;
  animate?: (g: THREE.Group, nowMs: number, cx: number, cy: number) => void;
}

// ------------------------------------------------------------------ forest pieces

function forest(
  g: THREE.Group,
  level: LevelDef,
  o: { shadows: boolean },
  look: { trunk: number; leaf: number[]; burnt: number; dens: number; seed: number },
): void {
  const W = level.cols * T;
  const r = rng(look.seed);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const pineGeo = new THREE.ConeGeometry(1, 1, 8);
  pineGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: look.trunk, roughness: 1 });
  const leafMats = look.leaf.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }),
  );
  const burntMat = new THREE.MeshStandardMaterial({ color: look.burnt, roughness: 1, flatShading: true });
  const trunks: { p: THREE.Vector3; s: THREE.Vector3; r?: number }[] = [];
  const crowns: { p: THREE.Vector3; s: THREE.Vector3; r?: number }[][] = look.leaf.map(() => []);
  const pines: { p: THREE.Vector3; s: THREE.Vector3; r?: number }[][] = look.leaf.map(() => []);
  const burnt: { p: THREE.Vector3; s: THREE.Vector3; r?: number }[] = [];
  const bands: [number, number, number][] = [
    [-270, -700, 1 / (90 / look.dens)],
    [-900, -2600, 1 / (70 / look.dens)],
  ];
  for (const [z0, z1, per] of bands) {
    const count = Math.floor(W * per);
    for (let i = 0; i < count; i++) {
      const x = r() * (W + 1600) - 800;
      const z = z0 + (z1 - z0) * r();
      const far = (z0 - z) / (z0 - z1);
      const base = groundY(level, Math.max(0, Math.min(W - 1, x))) - 40 - far * 220;
      const h = 220 + r() * 260 + far * 200;
      const w = 18 + r() * 14;
      trunks.push({ p: new THREE.Vector3(x, base, z), s: new THREE.Vector3(w, h, w), r: r() * 6 });
      const k = Math.floor(r() * look.leaf.length);
      if (r() < 0.12) {
        burnt.push({
          p: new THREE.Vector3(x, base + h * 0.75, z),
          s: new THREE.Vector3(60 + r() * 30, 40 + r() * 30, 60),
          r: r() * 6,
        });
      } else if (r() < 0.45) {
        (pines[k] as typeof trunks).push({
          p: new THREE.Vector3(x, base + h * 0.3, z),
          s: new THREE.Vector3(70 + r() * 40, h * 0.95, 70 + r() * 40),
          r: r() * 6,
        });
      } else {
        const cs = 80 + r() * 70;
        (crowns[k] as typeof trunks).push({
          p: new THREE.Vector3(x, base + h * 0.92, z),
          s: new THREE.Vector3(cs, cs * (0.8 + r() * 0.3), cs),
          r: r() * 6,
        });
        (crowns[k] as typeof trunks).push({
          p: new THREE.Vector3(x + (r() - 0.5) * 70, base + h * 0.75, z + 20),
          s: new THREE.Vector3(cs * 0.7, cs * 0.6, cs * 0.7),
          r: r() * 6,
        });
      }
    }
  }
  g.add(instances(trunkGeo, trunkMat, trunks, o.shadows));
  crowns.forEach(
    (list, i) => list.length && g.add(instances(crownGeo, leafMats[i] as THREE.Material, list, o.shadows)),
  );
  pines.forEach(
    (list, i) => list.length && g.add(instances(pineGeo, leafMats[i] as THREE.Material, list, o.shadows)),
  );
  if (burnt.length) g.add(instances(crownGeo, burntMat, burnt, o.shadows));
  // rocks and ferns along the near edge of the ground
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 1, flatShading: true });
  const rocks: typeof trunks = [];
  for (let i = 0; i < W / 140; i++) {
    const x = r() * W;
    const s = 14 + r() * 30;
    rocks.push({
      p: new THREE.Vector3(x, groundY(level, x) + s * 0.3, -230 - r() * 60),
      s: new THREE.Vector3(s * 1.4, s, s),
      r: r() * 6,
    });
  }
  g.add(instances(rockGeo, rockMat, rocks, o.shadows));
}

/** Agnivan's ruins: an old forest temple the jungle took back (broken pillars, a fallen arch, a shrine's spire). */
function ruins(g: THREE.Group, level: LevelDef, o: SceneryOpts, tint: number): void {
  const r = rng(77);
  const mat = new THREE.MeshStandardMaterial({ map: o.tex('setu-stone'), color: tint, roughness: 0.95 });
  const pillars: Inst[] = [];
  const arches: Inst[] = [];
  const spires: Inst[] = [];
  for (const run of runs(level)) {
    const y = -run.row * T;
    const x0 = run.c0 * T + 120;
    const x1 = (run.c1 + 1) * T - 120;
    for (let x = x0 + r() * 400; x < x1; x += 1100 + r() * 700) {
      const z = -330 - r() * 220;
      const pair = r() < 0.6;
      const h = 150 + r() * 60;
      pillars.push({
        p: new THREE.Vector3(x, y - 6, z),
        s: new THREE.Vector3(32, pair ? h : h * 0.5, 32),
        rz: pair ? 0 : 0.08,
      });
      if (pair) {
        pillars.push({
          p: new THREE.Vector3(x + 110, y - 6, z),
          s: new THREE.Vector3(32, h * (r() < 0.5 ? 1 : 0.55), 32),
        });
        if (r() < 0.7)
          arches.push({ p: new THREE.Vector3(x + 55, y + h, z), s: new THREE.Vector3(140, 140, 30) });
      }
      if (r() < 0.4)
        spires.push({
          p: new THREE.Vector3(x + 260, y - 30, z - 160),
          s: new THREE.Vector3(150, 330, 150),
          rz: (r() - 0.5) * 0.2,
        });
    }
  }
  if (pillars.length) g.add(instances(pillarGeo(), mat, pillars, o.shadows));
  if (arches.length) g.add(instances(archGeo(), mat, arches, o.shadows));
  if (spires.length) g.add(instances(spireGeo(), mat, spires, o.shadows));
}

export const THEMES: Record<string, Theme> = {
  // Agnivan's first stretch: a deep forest at dusk, a red glow on the horizon
  vana: {
    terrain: 'vana',
    skyTop: 0x22324f,
    skyMid: 0x4a4466,
    skyBottom: 0xe0844f,
    fog: 0x3b3346,
    fogDensity: 0.00032,
    skyLight: 0xa9c4ff,
    groundLight: 0x3a2a1c,
    hemi: 1.7,
    sun: 0xffc08a,
    sunIntensity: 3.2,
    sunDir: [0.45, 0.8],
    frontTint: 0xffffff,
    topTint: 0xb7c98a,
    scenery: (g, level, o) => {
      g.add(hills(level.cols * T, -3600, -level.rows * T * 0.55, 900, 0x2c2a40, 11, 0.5));
      g.add(hills(level.cols * T, -2900, -level.rows * T * 0.62, 600, 0x2f3a33, 12));
      fireGlow(g, level, 0xff6a1a, 3);
      ruins(g, level, o, 0x8a9a78);
      forest(g, level, o, {
        trunk: 0x3d2a1e,
        leaf: [0x2f5a2c, 0x3d6b30, 0x24472a],
        burnt: 0x1d1a18,
        dens: 1,
        seed: 5,
      });
    },
    particles: (level) => motes(level, 0xffb35c, 260, 60, 5),
    animate: (g, nowMs) => {
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m && m.name === 'fire') (m.uniforms.time as { value: number }).value = nowMs / 1000;
      });
    },
  },
  // the burning heart of Agnivan: blackened trees, the forest on fire behind them, embers everywhere
  inferno: {
    terrain: 'inferno',
    skyTop: 0x150707,
    skyMid: 0x5a1a0c,
    skyBottom: 0xff7a26,
    fog: 0x4a1a0e,
    fogDensity: 0.00045,
    skyLight: 0xff9a6a,
    groundLight: 0x2a0d06,
    hemi: 1.4,
    sun: 0xff8f4a,
    sunIntensity: 3.4,
    sunDir: [-0.35, 0.75],
    frontTint: 0xf2e2d6,
    topTint: 0x9a8270,
    scenery: (g, level, o) => {
      g.add(hills(level.cols * T, -3600, -level.rows * T * 0.55, 900, 0x2a1210, 21, 0.5));
      fireGlow(g, level, 0xff4a0a, 9);
      fireGlow(g, level, 0xffa020, 13);
      ruins(g, level, o, 0x6a5a50);
      forest(g, level, o, {
        trunk: 0x1c1512,
        leaf: [0x2a1d16, 0x3b2214],
        burnt: 0x141010,
        dens: 0.8,
        seed: 8,
      });
    },
    particles: (level) => motes(level, 0xff8a2a, 520, 90, 6),
    animate: (g, nowMs) => {
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m && m.name === 'fire') (m.uniforms.time as { value: number }).value = nowMs / 1000;
      });
    },
  },
  // Sagar Setu: an old stone causeway across a moonlit sea; a colonnade along it, the great setu of old far out
  sagar: {
    terrain: 'sagar',
    kit: 'setu',
    wet: { color: 0x2c4a44, reach: 22 },
    sea: seaPlane,
    skyTop: 0x07142a,
    skyMid: 0x1b3a5e,
    skyBottom: 0x5f8fb0,
    fog: 0x24425e,
    fogDensity: 0.00026,
    skyLight: 0x9ec2f0,
    groundLight: 0x1a2630,
    hemi: 1.5,
    sun: 0xd8e6ff,
    sunIntensity: 2.6,
    sunDir: [-0.55, 0.7],
    frontTint: 0xe8e4dc,
    topTint: 0xd8d2c4,
    scenery: setuScenery,
    particles: (level) => motes(level, 0xcfe8ff, 160, 18, 3.5),
    animate: setuAnimate,
  },
  // Vayu Shikhar: the climb at dawn, a monastery on the cliffs, snow peaks lit gold over a sea of cloud
  shikhar: {
    terrain: 'shikhar',
    skyTop: 0x2f4f8f,
    skyMid: 0xc890a0,
    skyBottom: 0xffc78a,
    fog: 0xb898a8,
    fogDensity: 0.00021,
    skyLight: 0xc4d6ff,
    groundLight: 0x4a3a44,
    hemi: 1.6,
    sun: 0xffd2a0,
    sunIntensity: 3.4,
    sunDir: [0.75, 0.4],
    frontTint: 0xe6e2f0,
    topTint: 0xf2f0f6,
    scenery: shikharScenery,
    particles: (level) => motes(level, 0xffffff, 320, -45, 4),
    animate: shikharAnimate,
  },
  // Naag Lok: a cavern with a serpent temple in it, lamps and glowing crystals in the dark, no sky
  naglok: {
    terrain: 'naglok',
    skyTop: 0x020605,
    skyMid: 0x06120f,
    skyBottom: 0x0b1f19,
    fog: 0x0a1a15,
    fogDensity: 0.00042,
    skyLight: 0x5a9a84,
    groundLight: 0x120c08,
    hemi: 1.1,
    sun: 0xffb070,
    sunIntensity: 1.6,
    sunDir: [0.3, 0.9],
    frontTint: 0xd8e8de,
    topTint: 0xb8d0c0,
    scenery: naglokScenery,
    particles: (level) => motes(level, 0x6affc0, 220, 14, 4),
    animate: naglokAnimate,
  },
  // Maya Nagri: a marble palace at a violet dusk, an arcade with gilded kiosks, lit halls, a skyline of domes
  maya: {
    terrain: 'maya',
    kit: 'mahal',
    skyTop: 0x2a1648,
    skyMid: 0x8a4a8a,
    skyBottom: 0xffa0b8,
    fog: 0x6a3a6a,
    fogDensity: 0.00024,
    skyLight: 0xd8b8ff,
    groundLight: 0x3a2040,
    hemi: 1.6,
    sun: 0xffc0d8,
    sunIntensity: 2.8,
    sunDir: [0.6, 0.45],
    frontTint: 0xffffff,
    topTint: 0xffffff,
    scenery: mayaScenery,
    particles: (level) => motes(level, 0xffc890, 180, 22, 5),
    animate: stageAnimate,
  },
  // Bhasm Parvat: inside the burning mountain, basalt columns and ash trees, the crater glowing far off
  bhasm: {
    terrain: 'bhasm',
    skyTop: 0x0c0404,
    skyMid: 0x3a0c06,
    skyBottom: 0xa02a0a,
    fog: 0x3a120a,
    fogDensity: 0.0004,
    skyLight: 0xff9a6a,
    groundLight: 0x200806,
    hemi: 1.3,
    sun: 0xff7a3a,
    sunIntensity: 3,
    sunDir: [0.2, -0.3],
    frontTint: 0xf0e0d8,
    topTint: 0xc8a898,
    scenery: bhasmScenery,
    particles: (level) => motes(level, 0xff7a2a, 480, 80, 5),
    animate: (g, nowMs, cx, cy) => {
      stageAnimate(g, nowMs, cx, cy);
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m && m.name === 'fire') (m.uniforms.time as { value: number }).value = nowMs / 1000;
      });
    },
  },
  // Samarpan Maidan: the battlefield at a dusty golden sunset, banners and broken chariots, the armies far off
  ranbhoomi: {
    terrain: 'ranbhoomi',
    skyTop: 0x5a4a6a,
    skyMid: 0xd8905a,
    skyBottom: 0xffd28a,
    fog: 0xc89a6a,
    fogDensity: 0.00026,
    skyLight: 0xffe0b0,
    groundLight: 0x4a3020,
    hemi: 1.5,
    sun: 0xffc880,
    sunIntensity: 3.4,
    sunDir: [0.8, 0.3],
    frontTint: 0xffffff,
    topTint: 0xe8d8b8,
    scenery: ranbhoomiScenery,
    particles: (level) => motes(level, 0xffe0a8, 200, 10, 4),
    animate: stageAnimate,
  },
  // Chakra Durg: a granite fortress under a storm-blue sky, great wheels of the chakravyuh turning above it
  chakra: {
    terrain: 'chakra',
    kit: 'durg',
    skyTop: 0x0c1428,
    skyMid: 0x2a3a62,
    skyBottom: 0x6a7aa8,
    fog: 0x2a3654,
    fogDensity: 0.00022,
    skyLight: 0xa8b8ff,
    groundLight: 0x1a1c24,
    hemi: 1.6,
    sun: 0xc8d4ff,
    sunIntensity: 2.6,
    sunDir: [-0.5, 0.7],
    frontTint: 0xffffff,
    topTint: 0xffffff,
    scenery: chakraScenery,
    particles: (level) => motes(level, 0x9ab8ff, 160, 16, 4),
    animate: stageAnimate,
  },
  // Dwand Bhoomi: an arena of red sandstone at evening, the stands full, torches lit
  dwand: {
    terrain: 'dwand',
    kit: 'akhada',
    skyTop: 0x2a1a3a,
    skyMid: 0x9a4a3a,
    skyBottom: 0xffa060,
    fog: 0x7a3a2a,
    fogDensity: 0.00022,
    skyLight: 0xffc8a0,
    groundLight: 0x3a1a10,
    hemi: 1.5,
    sun: 0xffb070,
    sunIntensity: 3,
    sunDir: [-0.7, 0.4],
    frontTint: 0xffffff,
    topTint: 0xffffff,
    scenery: dwandScenery,
    particles: (level) => motes(level, 0xffc080, 140, 12, 4),
    animate: stageAnimate,
  },
  // Suvarna Nagri: the golden city burning at night, gilded arcade and temples, fire on every horizon
  mahayuddh: {
    terrain: 'mahayuddh',
    kit: 'suvarna',
    skyTop: 0x120606,
    skyMid: 0x4a1408,
    skyBottom: 0xd85a14,
    fog: 0x4a1a0c,
    fogDensity: 0.00028,
    skyLight: 0xffb070,
    groundLight: 0x2a1008,
    hemi: 1.5,
    sun: 0xff9a4a,
    sunIntensity: 3,
    sunDir: [0.4, 0.6],
    frontTint: 0xffffff,
    topTint: 0xffffff,
    scenery: suvarnaScenery,
    particles: (level) => motes(level, 0xffa040, 420, 70, 5),
    animate: (g, nowMs, cx, cy) => {
      stageAnimate(g, nowMs, cx, cy);
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m && m.name === 'fire') (m.uniforms.time as { value: number }).value = nowMs / 1000;
      });
    },
  },
};

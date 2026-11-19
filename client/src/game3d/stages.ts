import * as THREE from 'three';
import { type LevelDef } from '@strikesquad/shared';
import { fireGlow, glow, glowTex, hills, instances, rng, runs, T, wallBox, type Inst } from './util';
import {
  archGeo,
  boxGeo,
  domeGeo,
  hexColumnGeo,
  minaretGeo,
  onionGeo,
  pillarGeo,
  spireGeo,
  tentGeo,
  wheelGeo,
  merge,
} from './shapes';
import type { SceneryOpts } from './themes';

/**
 * The architecture of stages 5 to 10, one built world each (stages 2-4 have their own files):
 *
 *   Maya Nagri       a marble palace: a slender arcade with onion domes, lit palace facades, a skyline of domes
 *   Bhasm Parvat     a volcano: basalt columns, dead ash trees, a lava river and the burning crater far off
 *   Samarpan Maidan  a battlefield: banners, spears in the ground, broken chariots, a camp of tents, the armies
 *   Chakra Durg      a fortress: a battlemented curtain wall, round bastions, great turning wheels in the sky
 *   Dwand Bhoomi     an arena: tiered stands full of spectators, torches, an arcade around the top
 *   Suvarna Nagri    the golden city burning: a gilded arcade, temples and domes of gold, fire and smoke
 */

type Run = { c0: number; c1: number; row: number };

/** Calls `fn` every `step` px (± jitter) along each run of walkway at least `minLen` px long. */
function along(
  rs: Run[],
  minLen: number,
  step: number,
  r: () => number,
  fn: (x: number, y: number, run: Run) => void,
  margin = 40,
): void {
  for (const run of rs) {
    const x0 = run.c0 * T + margin;
    const x1 = (run.c1 + 1) * T - margin;
    if (x1 - x0 < minLen) continue;
    for (let x = x0; x <= x1; x += step * (0.8 + r() * 0.4)) fn(x, -run.row * T, run);
  }
}

/** An arcade along the back of the walkway: pillars on a world grid, arches between, a beam over them. */
function arcade(
  g: THREE.Group,
  rs: Run[],
  r: () => number,
  o: SceneryOpts,
  a: {
    z: number;
    step: number;
    h: number;
    w: number;
    mat: THREE.Material;
    lost?: number;
    onTop?: (x: number, y: number) => void;
  },
): void {
  const pillars: Inst[] = [];
  const arches: Inst[] = [];
  const beams: Inst[] = [];
  for (const run of rs) {
    const y = -run.row * T;
    const x0 = run.c0 * T;
    const x1 = (run.c1 + 1) * T;
    if (x1 - x0 < a.step * 3) continue;
    let prev: number | null = null;
    let from: number | null = null;
    const close = (): void => {
      if (from !== null && prev !== null && prev - from >= a.step)
        beams.push({
          p: new THREE.Vector3((from + prev) / 2, y + a.h + a.step * 0.62 + 10, a.z),
          s: new THREE.Vector3(prev - from + a.w + 6, 20, a.w + 6),
        });
    };
    for (let x = Math.ceil((x0 + 30) / a.step) * a.step; x <= x1 - 30; x += a.step) {
      if (r() < (a.lost ?? 0)) {
        close();
        prev = from = null;
        continue;
      }
      pillars.push({ p: new THREE.Vector3(x, y, a.z), s: new THREE.Vector3(a.w, a.h, a.w) });
      if (prev !== null)
        arches.push({
          p: new THREE.Vector3(x - a.step / 2, y + a.h + 4, a.z),
          s: new THREE.Vector3(a.step + 4, a.step + 4, a.w * 0.8),
        });
      if (from === null) from = x;
      if (a.onTop && Math.round(x / a.step) % 4 === 2) a.onTop(x, y + a.h + a.step * 0.62 + 20);
      prev = x;
    }
    close();
  }
  if (pillars.length) g.add(instances(pillarGeo(), a.mat, pillars, o.shadows));
  if (arches.length) g.add(instances(archGeo(), a.mat, arches, o.shadows));
  if (beams.length) g.add(instances(boxGeo(), a.mat, beams, o.shadows));
}

/** Flickering flames (sprites named 'flame'; `flicker` animates them) and their glow on the play plane. */
function flames(g: THREE.Group, at: THREE.Vector3[], color: number, size: number): void {
  const tex = glowTex();
  for (const p of at) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    s.position.copy(p);
    s.scale.set(size, size, 1);
    s.name = 'flame';
    s.userData.size = size;
    g.add(s);
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xfff2c8,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    core.position.copy(p);
    core.scale.set(size * 0.2, size * 0.3, 1);
    g.add(core);
  }
}

/** A palace facade texture: a wall with rows of arched windows, some lit. */
function facadeTex(wall: string, lit: string, dark: string, seed: number): THREE.Texture {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.fillStyle = wall;
  x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const wx = 16 + col * 60;
      const wy = 26 + row * 80;
      x.fillStyle = r() < 0.6 ? lit : dark;
      x.beginPath();
      x.moveTo(wx, wy + 56);
      x.lineTo(wx, wy + 18);
      x.quadraticCurveTo(wx, wy, wx + 14, wy - 6);
      x.quadraticCurveTo(wx + 28, wy, wx + 28, wy + 18);
      x.lineTo(wx + 28, wy + 56);
      x.closePath();
      x.fill();
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(wx - 4, wy + 56, 36, 6);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A skyline of domes and minarets far off, one colour (seen against the sky). */
function skyline(
  g: THREE.Group,
  W: number,
  base: number,
  z: number,
  color: number,
  seed: number,
  gold = false,
): void {
  const r = rng(seed);
  const mat = gold
    ? new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.35 })
    : new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const blocks: Inst[] = [];
  const domes: Inst[] = [];
  const mins: Inst[] = [];
  for (let x = -800; x < W + 800; x += 160 + r() * 260) {
    const w = 140 + r() * 220;
    const h = 120 + r() * 260;
    blocks.push({ p: new THREE.Vector3(x, base + h / 2, z - r() * 200), s: new THREE.Vector3(w, h, 120) });
    if (r() < 0.6)
      domes.push({
        p: new THREE.Vector3(x, base + h, z - 60),
        s: new THREE.Vector3(w * 0.7, w * 0.9, w * 0.7),
      });
    if (r() < 0.35)
      mins.push({ p: new THREE.Vector3(x + w / 2, base, z - 40), s: new THREE.Vector3(260, h + 260, 260) });
  }
  g.add(instances(boxGeo(), mat, blocks, false, false));
  g.add(instances(onionGeo(), mat, domes, false, false));
  if (mins.length) g.add(instances(minaretGeo(), mat, mins, false, false));
}

// ------------------------------------------------------------------ 5 Maya Nagri

export function mayaScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(505);
  const rs = runs(level);
  const marble = new THREE.MeshStandardMaterial({
    map: o.tex('mahal-stone'),
    color: 0xf0e6f4,
    roughness: 0.45,
    metalness: 0.05,
  });
  const sun = new THREE.Group();
  sun.name = 'sun';
  sun.add(
    glow(0xff9ad0, 2200, 0.5),
    new THREE.Mesh(
      new THREE.CircleGeometry(150, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe0ee, fog: false }),
    ),
  );
  g.add(sun);
  skyline(g, W, -H * 0.6, -2600, 0x4a2a62, 51);
  // palace halls behind the arcade: lit facades, a dome and minarets on each
  {
    const front = new THREE.MeshStandardMaterial({
      map: facadeTex('#e6dce8', '#ffcf8a', '#5a4a6a', 52),
      roughness: 0.6,
    });
    const halls: Inst[] = [];
    const domes: Inst[] = [];
    const mins: Inst[] = [];
    along(rs, 300, 620, r, (x, y) => {
      const w = 260 + r() * 160;
      const h = 260 + r() * 200;
      const z = -760 - r() * 200;
      halls.push({ p: new THREE.Vector3(x, y - 40 + h / 2, z), s: new THREE.Vector3(w, h, 200) });
      domes.push({
        p: new THREE.Vector3(x, y - 40 + h, z),
        s: new THREE.Vector3(w * 0.62, w * 0.8, w * 0.62),
      });
      mins.push({ p: new THREE.Vector3(x - w / 2, y - 40, z + 90), s: new THREE.Vector3(360, h + 220, 360) });
      mins.push({ p: new THREE.Vector3(x + w / 2, y - 40, z + 90), s: new THREE.Vector3(360, h + 220, 360) });
    });
    g.add(instances(boxGeo(), front, halls, o.shadows));
    g.add(instances(onionGeo(), marble, domes, o.shadows));
    g.add(instances(minaretGeo(), marble, mins, o.shadows));
  }
  // the arcade, with little domed kiosks along its top
  const kiosks: Inst[] = [];
  arcade(g, rs, r, o, {
    z: -190,
    step: 84,
    h: 196,
    w: 22,
    mat: marble,
    lost: 0.04,
    onTop: (x, y) => kiosks.push({ p: new THREE.Vector3(x, y, -190), s: new THREE.Vector3(70, 80, 70) }),
  });
  if (kiosks.length)
    g.add(
      instances(
        onionGeo(),
        new THREE.MeshStandardMaterial({ color: 0xf2c46a, metalness: 0.7, roughness: 0.3 }),
        kiosks,
        o.shadows,
      ),
    );
}

// ------------------------------------------------------------------ 6 Bhasm Parvat

export function bhasmScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(606);
  const rs = runs(level);
  const basalt = new THREE.MeshStandardMaterial({
    map: o.tex('bhasm-fill'),
    color: 0x5a4a48,
    roughness: 0.95,
    flatShading: true,
  });
  // the volcano far off, its crater glowing, smoke over it
  const volcano = new THREE.ConeGeometry(1, 1, 14, 1, true);
  volcano.translate(0, 0.5, 0);
  const vx = W * 0.62;
  g.add(
    instances(
      volcano,
      new THREE.MeshStandardMaterial({ color: 0x2a1a18, roughness: 1, flatShading: true }),
      [{ p: new THREE.Vector3(vx, -H - 400, -4200), s: new THREE.Vector3(2600, 2600, 1400) }],
      false,
      false,
    ),
  );
  const crater = glow(0xff5a1a, 1600, 0.85);
  crater.position.set(vx, -H + 2150, -4100);
  g.add(crater);
  g.add(hills(W, -3000, -H * 0.7, 700, 0x241414, 61, 0.5));
  fireGlow(g, level, 0xff5a0a, 62);
  // basalt columns in clusters and dead ash trees
  const cols: Inst[] = [];
  const trunks: Inst[] = [];
  const branches: Inst[] = [];
  along(rs, 120, 260, r, (x, y) => {
    const n = 3 + Math.floor(r() * 4);
    const z = -260 - r() * 400;
    for (let k = 0; k < n; k++) {
      const h = 120 + r() * 320;
      cols.push({
        p: new THREE.Vector3(x + (k - n / 2) * 34, y - 60, z + (r() - 0.5) * 60),
        s: new THREE.Vector3(36, h + 60, 36),
        r: r(),
      });
    }
    if (r() < 0.5) {
      const h = 160 + r() * 120;
      const tx = x + 120;
      const tz = -230 - r() * 80;
      trunks.push({ p: new THREE.Vector3(tx, y + h / 2, tz), s: new THREE.Vector3(10, h, 10) });
      for (let b = 0; b < 3; b++)
        branches.push({
          p: new THREE.Vector3(tx, y + h * (0.55 + b * 0.15), tz),
          s: new THREE.Vector3(5, 70 - b * 15, 5),
          rz: (b % 2 ? 1 : -1) * (0.6 + r() * 0.4),
        });
    }
  });
  g.add(instances(hexColumnGeo(), basalt, cols, o.shadows));
  const ash = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 1 });
  const stick = new THREE.CylinderGeometry(0.5, 0.7, 1, 5);
  stick.translate(0, 0.5, 0);
  if (trunks.length) g.add(instances(new THREE.CylinderGeometry(0.4, 0.6, 1, 6), ash, trunks, o.shadows));
  if (branches.length) g.add(instances(stick, ash, branches, o.shadows));
  // glowing cracks where the lava shows: embers along the foot of the columns
  flames(
    g,
    cols.filter((_, i) => i % 5 === 0).map((c) => new THREE.Vector3(c.p.x, c.p.y + 70, c.p.z + 30)),
    0xff5a14,
    90,
  );
}

// ------------------------------------------------------------------ 7 Samarpan Maidan

export function ranbhoomiScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(707);
  const rs = runs(level);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });
  const sun = new THREE.Group();
  sun.name = 'sun';
  sun.add(
    glow(0xffb050, 2600, 0.6),
    new THREE.Mesh(
      new THREE.CircleGeometry(190, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe2a0, fog: false }),
    ),
  );
  g.add(sun);
  g.add(hills(W, -3800, -H * 0.62, 500, 0x6a4a3a, 71, 0.4));
  // the armies drawn up far off: ranks of soldiers with their spears up, war elephants among them
  {
    const man = new THREE.CapsuleGeometry(0.3, 0.7, 1, 5);
    man.translate(0, 0.65, 0);
    const rank: Inst[] = [];
    const spears: Inst[] = [];
    const ellies: Inst[] = [];
    const base = -H * 0.62;
    for (let x = -600; x < W + 600; x += 38) {
      for (let k = 0; k < 3; k++) {
        const z = -2000 - k * 80 - r() * 30;
        rank.push({ p: new THREE.Vector3(x + r() * 12, base, z), s: new THREE.Vector3(26, 40, 26) });
        if (r() < 0.5)
          spears.push({ p: new THREE.Vector3(x + 8, base + 30, z), s: new THREE.Vector3(2, 70, 2) });
      }
      if (r() < 0.03)
        ellies.push({ p: new THREE.Vector3(x, base + 50, -1900), s: new THREE.Vector3(110, 100, 60) });
    }
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a3226, roughness: 1 });
    g.add(instances(man, dark, rank, false, false));
    g.add(instances(boxGeo(), dark, spears, false, false));
    if (ellies.length) g.add(instances(new THREE.SphereGeometry(0.5, 10, 6), dark, ellies, false, false));
  }
  // the camp: tents with pennants
  {
    const tents: Inst[] = [];
    along(rs, 200, 360, r, (x, y) => {
      if (r() < 0.6)
        tents.push({
          p: new THREE.Vector3(x + r() * 100, y - 20, -900 - r() * 500),
          s: new THREE.Vector3(160 + r() * 80, 120 + r() * 60, 140),
        });
    });
    if (tents.length)
      g.add(
        instances(
          tentGeo(),
          new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.95 }),
          tents,
          o.shadows,
        ),
      );
  }
  // near: banners, spears stuck in the ground, broken chariots, shields
  {
    const poles: Inst[] = [];
    const flagsRed: Inst[] = [];
    const flagsGold: Inst[] = [];
    const spears: Inst[] = [];
    const bodies: Inst[] = [];
    const wheels: Inst[] = [];
    const shields: Inst[] = [];
    along(rs, 120, 230, r, (x, y) => {
      const z = -180 - r() * 140;
      const k = r();
      if (k < 0.35) {
        const h = 200 + r() * 80;
        poles.push({ p: new THREE.Vector3(x, y + h / 2, z), s: new THREE.Vector3(6, h, 6) });
        (r() < 0.5 ? flagsRed : flagsGold).push({
          p: new THREE.Vector3(x + 30, y + h - 34, z),
          s: new THREE.Vector3(56, 64, 1),
        });
      } else if (k < 0.7) {
        for (let s = 0; s < 3; s++)
          spears.push({
            p: new THREE.Vector3(x + s * 22, y + 50, z),
            s: new THREE.Vector3(3, 130, 3),
            rz: (r() - 0.5) * 0.7,
          });
      } else if (k < 0.85) {
        bodies.push({ p: new THREE.Vector3(x, y + 34, z), s: new THREE.Vector3(90, 40, 60), rz: 0.12 });
        wheels.push({
          p: new THREE.Vector3(x - 34, y + 30, z + 32),
          s: new THREE.Vector3(66, 66, 66),
          rz: r(),
        });
        wheels.push({
          p: new THREE.Vector3(x + 60, y + 6, z + 20),
          s: new THREE.Vector3(66, 66, 66),
          rx: -1.3,
        });
      } else {
        shields.push({ p: new THREE.Vector3(x, y + 4, z), s: new THREE.Vector3(40, 40, 40), rx: -1.4 });
      }
    });
    if (poles.length) g.add(instances(boxGeo(), wood, poles, o.shadows));
    const flag = new THREE.PlaneGeometry(1, 1);
    if (flagsRed.length)
      g.add(
        instances(
          flag,
          new THREE.MeshStandardMaterial({ color: 0xb02a20, side: THREE.DoubleSide }),
          flagsRed,
          false,
          false,
        ),
      );
    if (flagsGold.length)
      g.add(
        instances(
          flag,
          new THREE.MeshStandardMaterial({ color: 0xe0a830, side: THREE.DoubleSide }),
          flagsGold,
          false,
          false,
        ),
      );
    if (spears.length) g.add(instances(boxGeo(), wood, spears, o.shadows));
    if (bodies.length)
      g.add(
        instances(
          boxGeo(),
          new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.8 }),
          bodies,
          o.shadows,
        ),
      );
    if (wheels.length) g.add(instances(wheelGeo(), wood, wheels, o.shadows));
    if (shields.length)
      g.add(
        instances(
          new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16),
          new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.4 }),
          shields,
          o.shadows,
        ),
      );
  }
}

// ------------------------------------------------------------------ 8 Chakra Durg

export function chakraScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(808);
  const rs = runs(level);
  const granite = new THREE.MeshStandardMaterial({
    map: o.tex('durg-wall'),
    color: 0xc8ccd8,
    roughness: 0.9,
  });
  // great wheels turning in the sky, the fortress's rings
  {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a94b0,
      metalness: 0.6,
      roughness: 0.4,
      emissive: 0x1a2a5a,
      emissiveIntensity: 0.6,
    });
    for (const [x, y, rad, z] of [
      [W * 0.25, -H * 0.1, 900, -4200],
      [W * 0.6, -H * 0.2, 1300, -4800],
      [W * 0.9, -H * 0.05, 700, -3900],
    ] as const) {
      // one merged mesh per wheel (rim, inner ring, spokes, teeth): one draw call each
      const parts: THREE.BufferGeometry[] = [
        new THREE.TorusGeometry(rad, rad * 0.06, 8, 48),
        new THREE.TorusGeometry(rad * 0.55, rad * 0.04, 8, 40),
      ];
      for (let i = 0; i < 12; i++)
        parts.push(new THREE.BoxGeometry(rad * 2, rad * 0.03, rad * 0.03).rotateZ((i / 12) * Math.PI));
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        parts.push(
          new THREE.BoxGeometry(rad * 0.08, rad * 0.12, rad * 0.06)
            .rotateZ(a)
            .translate(Math.cos(a) * rad * 1.06, Math.sin(a) * rad * 1.06, 0),
        );
      }
      const wheel = new THREE.Mesh(merge(parts), mat);
      wheel.position.set(x, y, z);
      wheel.name = 'wheel';
      wheel.userData.speed = (r() < 0.5 ? -1 : 1) * (0.05 + r() * 0.08);
      g.add(wheel);
    }
  }
  g.add(hills(W, -3200, -H * 0.66, 500, 0x2a3040, 81, 0.4));
  // the curtain wall behind the walkway, with merlons along its top, and round bastions
  {
    const merlons: Inst[] = [];
    const towers: Inst[] = [];
    const caps: Inst[] = [];
    const domes: Inst[] = [];
    for (const run of rs) {
      const y = -run.row * T;
      const x0 = run.c0 * T;
      const x1 = (run.c1 + 1) * T;
      if (x1 - x0 < 160) continue;
      const h = 230;
      const z = -300;
      const wall = wallBox(
        new THREE.Vector3((x0 + x1) / 2, y - 100 + (h + 100) / 2, z),
        x1 - x0,
        h + 100,
        60,
        granite,
      );
      wall.castShadow = wall.receiveShadow = o.shadows;
      g.add(wall);
      for (let x = x0 + 14; x < x1 - 10; x += 40)
        merlons.push({ p: new THREE.Vector3(x, y + h + 16, z + 10), s: new THREE.Vector3(24, 32, 40) });
      for (let x = x0 + 300; x < x1 - 150; x += 900 + r() * 300) {
        const th = h + 140 + r() * 80;
        towers.push({
          p: new THREE.Vector3(x, y - 100 + (th + 100) / 2, z + 40),
          s: new THREE.Vector3(150, th + 100, 150),
        });
        caps.push({ p: new THREE.Vector3(x, y + th + 10, z + 40), s: new THREE.Vector3(176, 20, 176) });
        domes.push({ p: new THREE.Vector3(x, y + th + 20, z + 40), s: new THREE.Vector3(120, 120, 120) });
      }
    }
    g.add(instances(boxGeo(), granite, merlons, o.shadows));
    const cyl = new THREE.CylinderGeometry(0.5, 0.56, 1, 18);
    if (towers.length) g.add(instances(cyl, granite, towers, o.shadows));
    if (caps.length) g.add(instances(new THREE.CylinderGeometry(0.5, 0.5, 1, 18), granite, caps, o.shadows));
    if (domes.length)
      g.add(
        instances(
          domeGeo(),
          new THREE.MeshStandardMaterial({ color: 0x6a7488, metalness: 0.5, roughness: 0.4 }),
          domes,
          o.shadows,
        ),
      );
    // torches along the wall
    const at: THREE.Vector3[] = [];
    along(rs, 160, 360, r, (x, y) => at.push(new THREE.Vector3(x, y + 150, -262)));
    flames(g, at, 0xffa040, 110);
  }
}

// ------------------------------------------------------------------ 9 Dwand Bhoomi

export function dwandScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(909);
  const rs = runs(level);
  const sand = new THREE.MeshStandardMaterial({ map: o.tex('akhada-wall'), color: 0xe0c0b0, roughness: 0.9 });
  // the stands: tiers rising behind the floor, full of people
  const crowd: Inst[][] = [[], [], [], []];
  for (const run of rs) {
    const y = -run.row * T;
    const x0 = run.c0 * T;
    const x1 = (run.c1 + 1) * T;
    if (x1 - x0 < 200) continue;
    for (let k = 0; k < 6; k++) {
      const z = -300 - k * 70;
      const ty = y + 30 + k * 46;
      const tier = wallBox(new THREE.Vector3((x0 + x1) / 2, ty - 120, z), x1 - x0, 240, 70, sand);
      tier.receiveShadow = o.shadows;
      g.add(tier);
      for (let x = x0 + 10; x < x1 - 10; x += 18 + r() * 10)
        if (r() < 0.75)
          (crowd[Math.floor(r() * 4)] as Inst[]).push({
            p: new THREE.Vector3(x, ty, z + 10),
            s: new THREE.Vector3(14, 22 + r() * 6, 14),
          });
    }
  }
  const man = new THREE.CapsuleGeometry(0.4, 0.6, 1, 5);
  man.translate(0, 0.6, 0);
  const cols = [0x7a2a20, 0x9a7a30, 0x2a3a6a, 0x9a9488];
  crowd.forEach(
    (list, i) =>
      list.length &&
      g.add(
        instances(
          man,
          new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.9 }),
          list,
          false,
          false,
        ),
      ),
  );
  // the arcade around the top of the stands, and the far wall of the arena
  arcade(g, rs, r, o, { z: -760, step: 120, h: 220, w: 34, mat: sand });
  g.add(hills(W, -2600, -H * 0.3, 400, 0x5a2a1c, 91, 0.2));
  // torches on poles along the floor
  const poles: Inst[] = [];
  const at: THREE.Vector3[] = [];
  along(rs, 200, 300, r, (x, y) => {
    poles.push({ p: new THREE.Vector3(x, y + 80, -200), s: new THREE.Vector3(8, 160, 8) });
    at.push(new THREE.Vector3(x, y + 170, -200));
  });
  if (poles.length)
    g.add(instances(boxGeo(), new THREE.MeshStandardMaterial({ color: 0x3a2414 }), poles, o.shadows));
  flames(g, at, 0xff9a3a, 100);
}

// ------------------------------------------------------------------ 10 Suvarna Nagri

export function suvarnaScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(1010);
  const rs = runs(level);
  const gold = new THREE.MeshStandardMaterial({
    map: o.tex('suvarna-stone'),
    color: 0xffe2a0,
    metalness: 0.75,
    roughness: 0.32,
  });
  skyline(g, W, -H * 0.66, -3000, 0x8a5a1a, 101, true);
  fireGlow(g, level, 0xff6a14, 102);
  fireGlow(g, level, 0xffb030, 103);
  // temples of gold behind the arcade
  {
    const spires: Inst[] = [];
    const domes: Inst[] = [];
    const bases: Inst[] = [];
    along(rs, 260, 520, r, (x, y) => {
      const z = -800 - r() * 300;
      const h = 360 + r() * 260;
      bases.push({ p: new THREE.Vector3(x, y - 40, z), s: new THREE.Vector3(h * 0.6, 120, h * 0.5) });
      spires.push({ p: new THREE.Vector3(x, y + 20, z), s: new THREE.Vector3(h * 0.45, h, h * 0.45) });
      if (r() < 0.6)
        domes.push({
          p: new THREE.Vector3(x + h * 0.45, y + 20, z + 40),
          s: new THREE.Vector3(160, 200, 160),
        });
    });
    g.add(instances(boxGeo(), gold, bases, o.shadows));
    g.add(instances(spireGeo(), gold, spires, o.shadows));
    if (domes.length) g.add(instances(onionGeo(), gold, domes, o.shadows));
  }
  arcade(g, rs, r, o, { z: -200, step: 96, h: 190, w: 26, mat: gold, lost: 0.08 });
  // braziers burning along the walkway
  const at: THREE.Vector3[] = [];
  const bowls: Inst[] = [];
  along(rs, 200, 420, r, (x, y) => {
    at.push(new THREE.Vector3(x, y + 70, -150));
    bowls.push({ p: new THREE.Vector3(x, y, -150), s: new THREE.Vector3(30, 60, 30) });
  });
  if (bowls.length) g.add(instances(pillarGeo(), gold, bowls, o.shadows));
  flames(g, at, 0xff7a20, 130);
}

/** Flames flicker, wheels turn, a low sun or moon keeps its place in the sky. */
export function stageAnimate(g: THREE.Group, nowMs: number, cx: number, cy: number): void {
  const t = nowMs / 1000;
  let i = 0;
  for (const o of g.children) {
    if (o.name === 'flame') {
      const s = (o.userData.size as number) * (0.85 + 0.15 * Math.sin(t * 9 + i) * Math.sin(t * 5.1 + i * 2));
      o.scale.set(s, s * 1.15, 1);
      i++;
    } else if (o.name === 'wheel') o.rotation.z = t * (o.userData.speed as number);
    else if (o.name === 'sun') o.position.set(cx + 500, cy + 260, -5200);
  }
}

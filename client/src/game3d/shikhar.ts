import * as THREE from 'three';
import { Tile, type LevelDef } from '@strikesquad/shared';
import { glow, instances, rng, runs, T, type Inst } from './util';
import type { SceneryOpts } from './themes';

/**
 * Vayu Shikhar's architecture: a climb up a mountain face at dawn, with a monastery built into the cliffs.
 *
 *   near   timber scaffolds under every ledge (posts, cross braces), prayer-flag lines strung between poles,
 *          chortens (stepped stupas) on the long ledges
 *   middle the cliff itself rising behind the climb, with whitewashed monastery halls clinging to it (tapering
 *          walls, a maroon band of windows, a gilded finial on the roof)
 *   far    a range of snow peaks lit gold by the rising sun, a sea of cloud below them
 */

/** A chorten: a stepped base, a round body, a ringed spire and a finial; 1 wide, 1 tall. */
function chortenGeo(): THREE.BufferGeometry {
  const p: [number, number][] = [
    [0, 0],
    [0.5, 0],
    [0.5, 0.1],
    [0.42, 0.1],
    [0.42, 0.18],
    [0.34, 0.18],
    [0.34, 0.24],
    [0.3, 0.26],
  ];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    p.push([0.3 * Math.sin(a) + 0.02, 0.26 + 0.22 * (1 - Math.cos(a)) * 0.5 + i * 0.002]);
  }
  p.push([0.14, 0.5], [0.14, 0.54]);
  for (let i = 0; i < 6; i++) p.push([0.12 - i * 0.012, 0.56 + i * 0.05], [0.1 - i * 0.012, 0.58 + i * 0.05]);
  p.push([0.08, 0.88], [0.05, 0.92], [0.03, 0.97], [0, 1]);
  return new THREE.LatheGeometry(
    p.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)),
    12,
  );
}

/** A monastery hall: a box whose walls lean inward as they rise (1 wide at the base, 1 tall, 1 deep). */
function hallGeo(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - 0.12 * y));
    pos.setZ(i, pos.getZ(i) * (1 - 0.12 * y));
  }
  g.computeVertexNormals();
  return g;
}

/** A jagged snow peak: a cone pushed about by noise, white above its snow line (vertex colours). */
function peakGeo(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const g = new THREE.ConeGeometry(1, 1, 9, 6);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  const rock = new THREE.Color(0x5a5f73);
  const snow = new THREE.Color(0xf4f2f6);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.02 && y < 0.98) {
      pos.setX(i, pos.getX(i) * (0.8 + r() * 0.5));
      pos.setZ(i, pos.getZ(i) * (0.8 + r() * 0.5));
      pos.setY(i, y + (r() - 0.5) * 0.06);
    }
    const k = THREE.MathUtils.smoothstep(pos.getY(i), 0.45 + r() * 0.12, 0.6);
    c.copy(rock).lerp(snow, k);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function shikharScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(303);
  const rs = runs(level);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
  const solidAt = (c: number, row: number): boolean =>
    c >= 0 &&
    c < level.cols &&
    row >= 0 &&
    row < level.rows &&
    level.tiles[row * level.cols + c] === Tile.Solid;

  // ---- the sun coming up, and the peaks it lights
  const sun = new THREE.Group();
  sun.name = 'sun';
  sun.add(glow(0xffd29a, 2400, 0.55), glow(0xfff2d8, 600, 0.9));
  g.add(sun);
  const peakMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  for (const [z, count, hMin, hMax, seed] of [
    [-4600, W / 900 + 4, 1500, 2300, 1],
    [-3600, W / 700 + 4, 1000, 1700, 2],
  ] as const) {
    const list: Inst[] = [];
    for (let i = 0; i < count; i++) {
      const h = hMin + r() * (hMax - hMin);
      list.push({
        p: new THREE.Vector3(-1200 + r() * (W + 2400), -H * 0.55 - 300, z - r() * 300),
        s: new THREE.Vector3(h * (0.5 + r() * 0.3), h, h * 0.5),
        r: r() * 6,
      });
    }
    g.add(instances(peakGeo(seed), peakMat, list, false, false));
  }
  // a sea of cloud under the peaks: big soft sheets, drifting
  const cloudTex = glow(0xffffff, 1, 1).material.map as THREE.Texture;
  for (let i = 0; i < W / 500 + 6; i++) {
    const m = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTex,
        color: 0xf2e4ea,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    m.position.set(-800 + r() * (W + 1600), -H * 0.42 - r() * 300, -2400 - r() * 900);
    m.scale.set(1400 + r() * 900, 380 + r() * 200, 1);
    m.name = 'cloud';
    g.add(m);
  }

  // ---- the cliff behind the climb: rock buttresses following the ground, halls built against them
  {
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8296, roughness: 1, flatShading: true });
    const rocks: Inst[] = [];
    const halls: Inst[] = [];
    const roofs: Inst[] = [];
    const bands: Inst[] = [];
    const finials: Inst[] = [];
    const plinths: Inst[] = [];
    for (const run of rs) {
      const y = -run.row * T;
      // boulders at the foot of the cliff behind long stretches only (a short pillar top has nothing behind it)
      if (run.c1 - run.c0 >= 7)
        for (let x = run.c0 * T + 80; x < (run.c1 + 1) * T - 80; x += 260 + r() * 260) {
          const s = 120 + r() * 160;
          rocks.push({
            p: new THREE.Vector3(x, y - s * 0.5, -900 - r() * 300),
            s: new THREE.Vector3(s * 1.3, s * 1.2, s * 0.7),
            r: r() * 6,
          });
        }
      if ((run.c1 - run.c0) * T > 420 && r() < 0.75) {
        const x = (run.c0 + 2 + r() * (run.c1 - run.c0 - 4)) * T;
        const w = 180 + r() * 140;
        const h = 150 + r() * 120;
        const z = -470;
        const base = y - 10;
        halls.push({ p: new THREE.Vector3(x, base, z), s: new THREE.Vector3(w, h, 120) });
        plinths.push({ p: new THREE.Vector3(x, base - 200, z), s: new THREE.Vector3(w * 1.15, 400, 150) });
        bands.push({
          p: new THREE.Vector3(x, base + h * 0.83, z + 1),
          s: new THREE.Vector3(w * 0.93, h * 0.13, 122),
        });
        roofs.push({ p: new THREE.Vector3(x, base + h + 6, z), s: new THREE.Vector3(w * 0.96, 14, 130) });
        finials.push({ p: new THREE.Vector3(x, base + h + 13, z), s: new THREE.Vector3(26, 46, 26) });
        // a smaller hall stacked on top, set back
        if (r() < 0.6) {
          halls.push({
            p: new THREE.Vector3(x + (r() - 0.5) * w * 0.3, base + h + 12, z - 50),
            s: new THREE.Vector3(w * 0.6, h * 0.6, 90),
          });
          roofs.push({
            p: new THREE.Vector3(x, base + h + 12 + h * 0.6 + 5, z - 50),
            s: new THREE.Vector3(w * 0.6, 12, 98),
          });
        }
      }
    }
    g.add(instances(rockGeo, rockMat, rocks, o.shadows));
    g.add(instances(box, rockMat, plinths, o.shadows));
    g.add(
      instances(
        hallGeo(),
        new THREE.MeshStandardMaterial({ color: 0xf0ebe2, roughness: 0.9 }),
        halls,
        o.shadows,
      ),
    );
    g.add(instances(box, new THREE.MeshStandardMaterial({ color: 0x6e1f22, roughness: 0.8 }), bands, false));
    g.add(
      instances(box, new THREE.MeshStandardMaterial({ color: 0x4a2a20, roughness: 0.9 }), roofs, o.shadows),
    );
    const gold = new THREE.MeshStandardMaterial({ color: 0xe6b54a, metalness: 0.8, roughness: 0.3 });
    g.add(instances(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0), gold, finials, false));
  }

  // ---- timber scaffolds under the ledges: a post at each end down to the rock, braces between
  {
    const posts: Inst[] = [];
    const braces: Inst[] = [];
    for (let row = 1; row < level.rows; row++) {
      let c = 0;
      while (c < level.cols) {
        if (level.tiles[row * level.cols + c] !== Tile.OneWay) {
          c++;
          continue;
        }
        const c0 = c;
        while (c < level.cols && level.tiles[row * level.cols + c] === Tile.OneWay) c++;
        const c1 = c - 1;
        const top = -row * T - 22;
        for (const pc of c1 - c0 >= 2 ? [c0, c1] : [c0]) {
          let rr = row + 1;
          while (rr < level.rows && !solidAt(pc, rr)) rr++;
          const bottom = rr < level.rows ? -rr * T : -H - 200;
          const len = top - bottom;
          if (len < 8) continue;
          const x = pc * T + (pc === c0 ? 8 : T - 8);
          for (const z of [10, -50])
            posts.push({ p: new THREE.Vector3(x, bottom + len / 2, z), s: new THREE.Vector3(9, len, 9) });
          if (len > 50)
            braces.push({
              p: new THREE.Vector3(x, top - Math.min(len, 90) / 2, -20),
              s: new THREE.Vector3(7, Math.min(len, 90) * 1.1, 7),
              r: 0,
            });
        }
        if (c1 > c0)
          braces.push({
            p: new THREE.Vector3((c0 * T + (c1 + 1) * T) / 2, top - 8, 8),
            s: new THREE.Vector3((c1 - c0 + 1) * T - 12, 6, 6),
          });
      }
    }
    g.add(instances(box, wood, posts, o.shadows));
    g.add(instances(box, wood, braces, o.shadows));
  }

  // ---- prayer flags on poles along the long runs, and chortens
  {
    const poles: Inst[] = [];
    const chortens: Inst[] = [];
    const flagCols = [0x2f6fd8, 0xf2f2f2, 0xd8322f, 0x2fa84a, 0xf2c12f];
    const flags: Inst[][] = flagCols.map(() => []);
    for (const run of rs) {
      const y = -run.row * T;
      const len = (run.c1 - run.c0 + 1) * T;
      if (len < 260) continue;
      const xa = run.c0 * T + 40;
      const xb = (run.c1 + 1) * T - 40;
      const z = -150;
      const h = 190;
      poles.push({ p: new THREE.Vector3(xa, y + h / 2, z), s: new THREE.Vector3(6, h, 6) });
      poles.push({ p: new THREE.Vector3(xb, y + h / 2, z), s: new THREE.Vector3(6, h, 6) });
      // the line sags between the poles; a flag every 18 px
      const n = Math.floor((xb - xa) / 18);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = xa + (xb - xa) * t;
        const sag = Math.sin(t * Math.PI) * Math.min(80, (xb - xa) * 0.12);
        (flags[i % flagCols.length] as Inst[]).push({
          p: new THREE.Vector3(x, y + h - 6 - sag - 9, z),
          s: new THREE.Vector3(13, 17, 1),
        });
      }
      if (len > 520 && r() < 0.7) {
        const s = 70 + r() * 40;
        chortens.push({
          p: new THREE.Vector3(xa + (xb - xa) * (0.3 + r() * 0.4), y, -110),
          s: new THREE.Vector3(s, s * 1.6, s),
        });
      }
    }
    g.add(instances(box, wood, poles, o.shadows));
    const flagGeo = new THREE.PlaneGeometry(1, 1);
    flags.forEach((list, i) => {
      if (!list.length) return;
      const m = instances(
        flagGeo,
        new THREE.MeshStandardMaterial({ color: flagCols[i], roughness: 0.8, side: THREE.DoubleSide }),
        list,
        false,
        false,
      );
      m.name = 'flags';
      g.add(m);
    });
    if (chortens.length)
      g.add(
        instances(
          chortenGeo(),
          new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.85 }),
          chortens,
          o.shadows,
        ),
      );
  }
}

/** The sun stays low on the horizon, far behind everything; the clouds drift. */
export function shikharAnimate(g: THREE.Group, nowMs: number, cx: number, cy: number): void {
  const sun = g.getObjectByName('sun');
  if (sun) sun.position.set(cx + 700, cy + 120, -5200);
  const drift = (nowMs / 1000) * 9;
  for (const o of g.children) if (o.name === 'cloud') o.position.x = (o.userData.x0 ??= o.position.x) + drift;
}

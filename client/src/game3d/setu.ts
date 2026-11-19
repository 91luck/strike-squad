import * as THREE from 'three';
import { Tile, type LevelDef } from '@strikesquad/shared';
import { glow, glowTex, hills, instances, rng, runs, T, type Inst } from './util';
import { archGeo, domeGeo, pillarGeo, spireGeo } from './shapes';
import type { SceneryOpts } from './themes';

/**
 * Sagar Setu's architecture: the stage is an old stone causeway across the sea, so the 3D world around the play
 * plane is built, not grown.
 *
 *   near   a colonnade along the back of the walkway (turned pillars, arches, a beam), broken where the sea took it;
 *          a chhatri (a domed pavilion on four pillars) where the causeway ends at open water; lamps on both
 *   middle rocks in the surf
 *   far    the great setu of old standing in the sea on tall piers, arch after arch, broken spans; temple spires
 *          on the islands; a full moon over all of it, its light laid on the water
 *
 * The walls, paving and lotus moulding of the causeway itself are the 'setu' kit textures (world3d.ts); the sea is a
 * surface that follows the tide (`seaPlane`).
 */

export function setuScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const sea = -(level.tide?.base ?? (level.rows - 3) * T); // three's y of the mean sea surface
  const r = rng(202);
  const stoneTex = o.tex('setu-stone');
  stoneTex.repeat.set(1, 1);
  const stone = (color: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ map: stoneTex, color, roughness: 0.85 });
  const nearStone = stone(0xb9ad96);
  const farStone = stone(0x7d8ea4);

  // ---- the moon, a halo, and the far islands
  const moon = new THREE.Group();
  moon.name = 'moon';
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(170, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff6e2, fog: false }),
  );
  moon.add(disc, glow(0xbfdcff, 1500, 0.55), glow(0xffffff, 520, 0.6));
  g.add(moon);
  g.add(hills(W, -4200, sea - 120, 420, 0x16263c, 41, 0.4));
  g.add(hills(W, -3300, sea - 160, 300, 0x1c3048, 42, 0.5));

  // ---- the great setu of old, far out in the sea
  const pg = pillarGeo();
  const ag = archGeo();
  const box = new THREE.BoxGeometry(1, 1, 1);
  {
    const z = -2700;
    const span = 520;
    const pierW = 96;
    const top = sea + 620;
    const piers: Inst[] = [];
    const arches: Inst[] = [];
    const decks: Inst[] = [];
    const caps: Inst[] = [];
    for (let x = -600, i = 0; x < W + 600; x += span, i++) {
      const broken = r() < 0.22;
      const h = broken ? 200 + r() * 260 : top - sea + 40;
      piers.push({
        p: new THREE.Vector3(x, sea - 200 + (h + 200) / 2, z),
        s: new THREE.Vector3(pierW, h + 200, 90),
      });
      caps.push({
        p: new THREE.Vector3(x, sea - 200 + h + 200 + 8, z),
        s: new THREE.Vector3(pierW + 26, 16, 110),
      });
      if (!broken && r() > 0.18) {
        arches.push({
          p: new THREE.Vector3(x + span / 2, top - (span - pierW) / 2 - 30, z),
          s: new THREE.Vector3(span - pierW + 30, span - pierW + 30, 80),
        });
        decks.push({
          p: new THREE.Vector3(x + span / 2, top + 40, z),
          s: new THREE.Vector3(span + 10, 46, 100),
        });
      }
    }
    g.add(instances(box, farStone, piers, false, false));
    g.add(instances(box, farStone, caps, false, false));
    g.add(instances(ag, farStone, arches, false, false));
    g.add(instances(box, farStone, decks, false, false));
  }

  // ---- islands with temple spires
  {
    const sg = spireGeo();
    const mound = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 1, flatShading: true });
    const spireMat = stone(0x9a96a0);
    const isles: Inst[] = [];
    const spires: Inst[] = [];
    for (let x = 200; x < W; x += 1300 + r() * 900) {
      const z = -3300 - r() * 500;
      const w = 360 + r() * 260;
      isles.push({ p: new THREE.Vector3(x, sea - 10, z), s: new THREE.Vector3(w, 90 + r() * 60, 200) });
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const big = k === 0;
        const h = big ? 420 + r() * 120 : 220 + r() * 80;
        spires.push({
          p: new THREE.Vector3(x + (k - (n - 1) / 2) * w * 0.32, sea + 40, z + 30),
          s: new THREE.Vector3(h * 0.42, h, h * 0.42),
        });
      }
    }
    g.add(instances(mound, rockMat, isles, false, false));
    g.add(instances(sg, spireMat, spires, false, false));
  }

  // ---- rocks in the surf, between the causeway and the far setu
  {
    const rg = new THREE.DodecahedronGeometry(1, 0);
    const rm = new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.6, flatShading: true });
    const rocks: Inst[] = [];
    for (let i = 0; i < W / 260; i++) {
      const s = 30 + r() * 70;
      rocks.push({
        p: new THREE.Vector3(r() * W, sea + s * 0.15, -320 - r() * 700),
        s: new THREE.Vector3(s * 1.5, s, s),
        r: r() * 6,
      });
    }
    g.add(instances(rg, rm, rocks, o.shadows));
  }

  // ---- the colonnade along the back of the walkway, chhatris where the causeway meets open water
  {
    const z = -186;
    const step = 96;
    const ph = 168; // pillar height
    const pillars: Inst[] = [];
    const arches: Inst[] = [];
    const beams: Inst[] = [];
    const domes: Inst[] = [];
    const slabs: Inst[] = [];
    const lamps: THREE.Vector3[] = [];
    const ends: { x: number; y: number; side: -1 | 1 }[] = [];
    const rs = runs(level);
    const isSea = (c: number): boolean => {
      if (c < 0 || c >= level.cols) return false;
      for (let rr = 0; rr < level.rows; rr++)
        if (level.tiles[rr * level.cols + c] === Tile.Solid) return false;
      return true;
    };
    for (const run of rs) {
      const y = -run.row * T;
      const x0 = run.c0 * T;
      const x1 = (run.c1 + 1) * T;
      // a chhatri where a long stretch of causeway ends at open water (never two close together)
      const long = run.c1 - run.c0 >= 6;
      const free = (x: number): boolean => ends.every((e) => Math.abs(e.x - x) > 420);
      if (long && isSea(run.c0 - 1) && free(x0 + 40)) ends.push({ x: x0 + 40, y, side: -1 });
      if (long && isSea(run.c1 + 1) && free(x1 - 40)) ends.push({ x: x1 - 40, y, side: 1 });
      if (x1 - x0 < step * 3) continue;
      // pillars on a grid in world x, so neighbouring runs line up; the last one or two lost to the sea at random
      const first = Math.ceil((x0 + 30) / step) * step;
      let prev: number | null = null;
      let beamFrom: number | null = null;
      for (let x = first; x <= x1 - 30; x += step) {
        const lost = r() < 0.14;
        if (lost) {
          if (beamFrom !== null && prev !== null && prev - beamFrom >= step)
            beams.push({
              p: new THREE.Vector3((beamFrom + prev) / 2, y + ph + 74, z),
              s: new THREE.Vector3(prev - beamFrom + 34, 22, 34),
            });
          prev = null;
          beamFrom = null;
          // a stump where it stood
          pillars.push({ p: new THREE.Vector3(x, y, z), s: new THREE.Vector3(30, 30 + r() * 30, 30) });
          continue;
        }
        pillars.push({ p: new THREE.Vector3(x, y, z), s: new THREE.Vector3(30, ph, 30) });
        if (prev !== null && r() > 0.1)
          arches.push({
            p: new THREE.Vector3(x - step / 2, y + ph + 6, z),
            s: new THREE.Vector3(step + 4, step + 4, 26),
          });
        if (beamFrom === null) beamFrom = x;
        if (Math.round(x / step) % 4 === 0) lamps.push(new THREE.Vector3(x, y + ph - 18, z + 18));
        prev = x;
      }
      if (beamFrom !== null && prev !== null && prev - beamFrom >= step)
        beams.push({
          p: new THREE.Vector3((beamFrom + prev) / 2, y + ph + 74, z),
          s: new THREE.Vector3(prev - beamFrom + 34, 22, 34),
        });
    }
    for (const e of ends) {
      // a chhatri: a slab, four pillars, a dome; a lamp hung inside
      const cz = -150;
      slabs.push({ p: new THREE.Vector3(e.x, e.y + 6, cz), s: new THREE.Vector3(110, 12, 110) });
      for (const dx of [-38, 38])
        for (const dz of [-38, 38])
          pillars.push({
            p: new THREE.Vector3(e.x + dx, e.y + 12, cz + dz),
            s: new THREE.Vector3(18, 120, 18),
          });
      slabs.push({ p: new THREE.Vector3(e.x, e.y + 138, cz), s: new THREE.Vector3(124, 14, 124) });
      domes.push({ p: new THREE.Vector3(e.x, e.y + 145, cz), s: new THREE.Vector3(104, 120, 104) });
      lamps.push(new THREE.Vector3(e.x, e.y + 100, cz));
    }
    g.add(instances(pg, nearStone, pillars, o.shadows));
    if (arches.length) g.add(instances(ag, nearStone, arches, o.shadows));
    if (beams.length) g.add(instances(box, nearStone, beams, o.shadows));
    if (slabs.length) g.add(instances(box, nearStone, slabs, o.shadows));
    if (domes.length) g.add(instances(domeGeo(), stone(0xd2c6ac), domes, o.shadows));
    // lamps: a warm flame and its light on the stone around it
    const tex = glowTex();
    for (const p of lamps) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color: 0xffb35a,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      s.position.copy(p);
      s.scale.set(90, 90, 1);
      s.name = 'lamp';
      g.add(s);
      const core = s.clone();
      core.material = (s.material as THREE.SpriteMaterial).clone();
      (core.material as THREE.SpriteMaterial).color.set(0xfff0c8);
      core.scale.set(18, 26, 1);
      core.name = 'lampcore';
      g.add(core);
    }
  }
}

/** Sagar Setu's moon follows the camera (it is that far away); the lamps flicker. */
export function setuAnimate(g: THREE.Group, nowMs: number, cx: number, cy: number): void {
  const moon = g.getObjectByName('moon');
  if (moon) moon.position.set(cx - 900, cy + 900, -5000);
  const t = nowMs / 1000;
  let i = 0;
  for (const o of g.children) {
    if (o.name !== 'lamp') continue;
    const f = 0.85 + 0.15 * Math.sin(t * 9 + i * 1.7) * Math.sin(t * 5.3 + i);
    o.scale.set(90 * f, 90 * f, 1);
    i++;
  }
}

/** The open sea: a surface from in front of the camera to the horizon, rolling, with the moon's path across it. */
export function seaPlane(level: LevelDef): THREE.Mesh {
  void level;
  const geo = new THREE.PlaneGeometry(26000, 9000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -3300); // from z = +1200 (under the camera) to -7800
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      camX: { value: 0 },
      deep: { value: new THREE.Color(0x0e3a55) },
      shallow: { value: new THREE.Color(0x1f7c9c) },
      far: { value: new THREE.Color(0x3b5f7e) },
      moon: { value: new THREE.Color(0xfff1d0) },
    },
    vertexShader: `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float time; uniform float camX;
      uniform vec3 deep; uniform vec3 shallow; uniform vec3 far; uniform vec3 moon;
      varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main() {
        float d = clamp((1200.0 - vW.z) / 9000.0, 0.0, 1.0);   // 0 at the camera, 1 at the horizon
        vec2 p = vec2(vW.x * 0.012, vW.z * 0.03);
        float w = n(p + vec2(time * 0.35, time * 0.6)) * 0.6 + n(p * 2.7 - vec2(time * 0.5, time * 0.2)) * 0.4;
        vec3 c = mix(shallow, deep, smoothstep(0.0, 0.25, d));
        c = mix(c, far, smoothstep(0.15, 0.9, d));
        c += (w - 0.5) * 0.08;
        // the moon's path: a column of glints under it, widening with distance
        float mx = camX - 900.0 * (1.0 - d * 0.15);
        float lane = exp(-pow((vW.x - mx) / (60.0 + d * 1400.0), 2.0));
        float glint = smoothstep(0.62, 0.9, w + n(p * 6.0 + time) * 0.35);
        c += moon * lane * (0.12 + glint * 0.9) * (0.4 + d);
        // foam lines near the camera
        float foam = smoothstep(0.78, 0.86, n(vec2(vW.x * 0.02 + time * 0.4, vW.z * 0.05))) * (1.0 - d * 3.0);
        c += vec3(0.6) * max(foam, 0.0) * 0.35;
        gl_FragColor = vec4(c, 0.9);
      }`,
    transparent: true,
    depthWrite: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  return m;
}

import * as THREE from 'three';
import { type LevelDef } from '@strikesquad/shared';
import { glowTex, instances, rng, runs, T, type Inst } from './util';
import type { SceneryOpts } from './themes';

/**
 * Naag Lok's architecture: the serpent underworld, a cavern with a carved temple in it.
 *
 *   near   serpent pillars: a stone column with a great snake coiled up it, its hood spread over the capital and
 *          its eyes lit; oil lamps on the ledges
 *   middle stalactites hanging from the dark, glowing crystals and cave fungus at the foot of the walls
 *   far    the cavern wall closing everything in (no sky), lost in a green-black haze
 */

/** A column with a snake coiled around it and a hood over the top; about 1 wide and 1 tall. */
function serpentGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.CylinderGeometry(0.22, 0.26, 1, 12);
  col.translate(0, 0.5, 0);
  parts.push(col);
  const base = new THREE.CylinderGeometry(0.36, 0.4, 0.08, 12);
  base.translate(0, 0.04, 0);
  parts.push(base);
  // the coils: a tube along a helix
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const a = t * Math.PI * 2 * 3.2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.3, 0.06 + t * 0.82, Math.sin(a) * 0.3));
  }
  parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.075, 8));
  // the hood: a flattened half-dome leaning forward over the capital
  const hood = new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  hood.scale(1, 0.55, 0.45);
  hood.rotateX(0.5);
  hood.translate(0, 0.96, 0.08);
  parts.push(hood);
  const merged = mergeGeos(parts);
  return merged;
}

/** Merges plain (non-indexed after conversion) geometries with position + normal + uv. */
function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.attributes.position as THREE.BufferAttribute).array);
    nor.push(...(g.attributes.normal as THREE.BufferAttribute).array);
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    if (u) uv.push(...u.array);
    else for (let i = 0; i < g.attributes.position!.count; i++) uv.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

export function naglokScenery(g: THREE.Group, level: LevelDef, o: SceneryOpts): void {
  const W = level.cols * T;
  const H = level.rows * T;
  const r = rng(404);
  const rs = runs(level);

  // ---- the cavern wall: rock masses over the whole height, far back
  {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x24332e, roughness: 1, flatShading: true });
    const list: Inst[] = [];
    for (let x = -600; x < W + 600; x += 240) {
      for (let y = 300; y > -H - 500; y -= 260) {
        const s = 200 + r() * 160;
        list.push({
          p: new THREE.Vector3(x + r() * 120, y + r() * 100, -1100 - r() * 400),
          s: new THREE.Vector3(s, s, s * 0.6),
          r: r() * 6,
        });
      }
    }
    g.add(instances(geo, mat, list, false, false));
  }

  // ---- stalactites from the roof, crystals and fungus at the foot of the walls
  {
    const cone = new THREE.ConeGeometry(1, 1, 6);
    cone.rotateX(Math.PI);
    cone.translate(0, -0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b4a42, roughness: 0.9, flatShading: true });
    const drips: Inst[] = [];
    for (let x = -300; x < W + 300; x += 70 + r() * 90) {
      const h = 80 + r() * 260;
      drips.push({
        p: new THREE.Vector3(x, 40 + r() * 80, -300 - r() * 700),
        s: new THREE.Vector3(14 + r() * 26, h, 14 + r() * 26),
        r: r() * 6,
      });
    }
    g.add(instances(cone, mat, drips, false, false));
    const crystal = new THREE.OctahedronGeometry(1, 0);
    crystal.scale(0.4, 1, 0.4);
    const cryMat = new THREE.MeshStandardMaterial({
      color: 0x2fe0a0,
      emissive: 0x1ab884,
      emissiveIntensity: 1.3,
      roughness: 0.3,
    });
    const cry: Inst[] = [];
    for (const run of rs) {
      const y = -run.row * T;
      for (let x = run.c0 * T; x < (run.c1 + 1) * T; x += 120 + r() * 220) {
        const n = 2 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const s = 10 + r() * 22;
          cry.push({
            p: new THREE.Vector3(x + k * 12, y + s * 0.6, -240 - r() * 120),
            s: new THREE.Vector3(s, s * 1.4, s),
            r: r() * 6,
          });
        }
      }
    }
    if (cry.length) g.add(instances(crystal, cryMat, cry, false, false));
  }

  // ---- serpent pillars along the walk, with lit eyes; oil lamps between them
  {
    const pillars: Inst[] = [];
    const eyes: THREE.Vector3[] = [];
    const lamps: THREE.Vector3[] = [];
    for (const run of rs) {
      const y = -run.row * T;
      const len = (run.c1 - run.c0 + 1) * T;
      if (len < 200) continue;
      for (let x = run.c0 * T + 90; x < (run.c1 + 1) * T - 60; x += 380 + r() * 200) {
        const h = 230 + r() * 60;
        pillars.push({ p: new THREE.Vector3(x, y, -200), s: new THREE.Vector3(h * 0.38, h, h * 0.38) });
        eyes.push(new THREE.Vector3(x - 9, y + h * 0.98, -170), new THREE.Vector3(x + 9, y + h * 0.98, -170));
        lamps.push(new THREE.Vector3(x + 150, y + 26, -150));
      }
    }
    if (pillars.length) {
      const mat = new THREE.MeshStandardMaterial({
        map: o.tex('naglok-fill'),
        color: 0x7a9a88,
        roughness: 0.85,
      });
      g.add(instances(serpentGeo(), mat, pillars, o.shadows));
    }
    const tex = glowTex();
    const sprite = (p: THREE.Vector3, color: number, size: number, name: string): void => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      s.position.copy(p);
      s.scale.set(size, size, 1);
      s.name = name;
      g.add(s);
    };
    for (const p of eyes) sprite(p, 0xff3a2a, 22, 'eye');
    // the 2D veil of darkness lets the lamps and the serpents' eyes through (world3d.lights)
    g.userData.lights = [
      ...lamps.map((p) => ({ x: p.x, y: -p.y, r: 120 })),
      ...pillars.map((p) => ({ x: p.p.x, y: -(p.p.y + p.s.y * 0.75), r: 110 })),
    ];
    for (const p of lamps) {
      sprite(p, 0xffa040, 150, 'lamp');
      sprite(p, 0xfff0c0, 20, 'lampcore');
    }
    // the lamps' bowls
    const bowl = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const bowls: Inst[] = lamps.map((p) => ({
      p: new THREE.Vector3(p.x, p.y - 6, p.z),
      s: new THREE.Vector3(14, 10, 14),
    }));
    if (bowls.length)
      g.add(
        instances(bowl, new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.6 }), bowls, false),
      );
  }
}

/** Lamps flicker, the serpents' eyes pulse. */
export function naglokAnimate(g: THREE.Group, nowMs: number): void {
  const t = nowMs / 1000;
  let i = 0;
  for (const o of g.children) {
    if (o.name === 'lamp') {
      const f = 0.85 + 0.15 * Math.sin(t * 8 + i) * Math.sin(t * 4.7 + i * 2);
      o.scale.set(150 * f, 150 * f, 1);
      i++;
    } else if (o.name === 'eye') {
      const f = 0.7 + 0.3 * Math.sin(t * 2 + o.position.x * 0.01);
      o.scale.set(22 * f, 22 * f, 1);
    }
  }
}

import * as THREE from 'three';

/** Shapes the architecture kits share (pillars, arches, domes, spires), each about 1 unit in size. */

/** A turned pillar, 1 unit tall and about 1 wide at its base: plinth, shaft with a slight swell, capital. */
export function pillarGeo(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0, 0],
    [0.5, 0],
    [0.5, 0.06],
    [0.42, 0.08],
    [0.42, 0.1],
    [0.3, 0.13],
    [0.32, 0.45],
    [0.3, 0.8],
    [0.36, 0.83],
    [0.33, 0.86],
    [0.46, 0.9],
    [0.5, 0.94],
    [0.5, 1],
    [0, 1],
  ];
  const g = new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    10,
  );
  return g;
}

/** An arch ring between two pillars: a half annulus spanning 1 unit, its springing at y = 0, 0.12 thick, 1 deep. */
export function archGeo(): THREE.BufferGeometry {
  const R = 0.5;
  const r = 0.38;
  const ring = new THREE.Shape();
  ring.moveTo(-R, 0);
  ring.lineTo(-R, 0.62);
  ring.lineTo(R, 0.62);
  ring.lineTo(R, 0);
  ring.lineTo(r, 0);
  ring.absarc(0, 0, r, 0, Math.PI, false);
  ring.lineTo(-R, 0);
  const g = new THREE.ExtrudeGeometry(ring, { depth: 1, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -0.5);
  return g;
}

/** A dome on a drum with a lotus finial, 1 unit wide, standing on y = 0. */
export function domeGeo(): THREE.BufferGeometry {
  const pts: [number, number][] = [[0, 0]];
  pts.push([0.5, 0], [0.5, 0.12], [0.54, 0.14], [0.54, 0.18], [0.48, 0.2]);
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push([0.48 * Math.cos(a) * (1 + 0.08 * Math.sin(a * 2)), 0.2 + 0.5 * Math.sin(a)]);
  }
  pts.push([0.08, 0.74], [0.12, 0.78], [0.05, 0.84], [0.03, 0.95], [0, 1]);
  return new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)),
    14,
  );
}

/** A temple spire (a curved tower of stacked tiers with a ribbed cap and a pot finial), 1 unit wide, 1 tall. */
export function spireGeo(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.5, 0),
    new THREE.Vector2(0.5, 0.18),
  ];
  const tiers = 9;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const t1 = (i + 1) / tiers;
    const w = (t: number): number => 0.46 * Math.cos(t * Math.PI * 0.48) ** 0.8;
    const y = (t: number): number => 0.18 + t * 0.62;
    pts.push(new THREE.Vector2(w(t0) + 0.03, y(t0)), new THREE.Vector2(w(t1), y(t1) - 0.01));
  }
  pts.push(
    new THREE.Vector2(0.14, 0.8),
    new THREE.Vector2(0.2, 0.83),
    new THREE.Vector2(0.14, 0.87),
    new THREE.Vector2(0.05, 0.88),
    new THREE.Vector2(0.07, 0.93),
    new THREE.Vector2(0.02, 1),
    new THREE.Vector2(0, 1),
  );
  return new THREE.LatheGeometry(pts, 12);
}

/** An onion dome with a pointed tip (a palace dome), 1 wide, 1 tall, standing on y = 0. */
export function onionGeo(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.36, 0),
    new THREE.Vector2(0.36, 0.1),
  ];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = 0.1 + t * 0.72;
    const w = 0.36 + 0.16 * Math.sin(t * Math.PI * 0.9) - 0.34 * t * t;
    pts.push(new THREE.Vector2(Math.max(0.02, w), y));
  }
  pts.push(
    new THREE.Vector2(0.04, 0.84),
    new THREE.Vector2(0.06, 0.88),
    new THREE.Vector2(0.02, 1),
    new THREE.Vector2(0, 1),
  );
  return new THREE.LatheGeometry(pts, 16);
}

/** A slender minaret: a tapering shaft with two balconies and a small dome, 1 tall (about 0.12 wide). */
export function minaretGeo(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0, 0],
    [0.07, 0],
    [0.06, 0.4],
    [0.09, 0.41],
    [0.09, 0.43],
    [0.055, 0.44],
    [0.05, 0.72],
    [0.08, 0.73],
    [0.08, 0.75],
    [0.045, 0.76],
    [0.045, 0.86],
    [0.06, 0.88],
    [0.05, 0.93],
    [0.02, 0.97],
    [0, 1],
  ];
  return new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    10,
  );
}

/** A six-sided basalt column, 1 wide, 1 tall, standing on y = 0. */
export function hexColumnGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  g.translate(0, 0.5, 0);
  return g;
}

/** A battlement: a merlon block, 1 unit. */
export function boxGeo(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

/** A spoked wheel lying in the x-y plane, 1 across. */
export function wheelGeo(): THREE.BufferGeometry {
  const rim = new THREE.TorusGeometry(0.45, 0.05, 6, 20);
  const parts = [rim];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.BoxGeometry(0.9, 0.04, 0.04);
    sp.rotateZ((i / 6) * Math.PI);
    parts.push(sp as unknown as THREE.TorusGeometry);
  }
  return merge(parts);
}

/** A tent: a square pyramid, 1 wide, 1 tall. */
export function tentGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.7, 1, 4);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  return g;
}

/** Merges geometries with position + normal (+ uv where they have it). */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position as THREE.BufferAttribute;
    pos.push(...p.array);
    nor.push(...(g.attributes.normal as THREE.BufferAttribute).array);
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    if (u) uv.push(...u.array);
    else for (let i = 0; i < p.count; i++) uv.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

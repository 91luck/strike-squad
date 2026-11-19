import * as THREE from 'three';
import { GAME_CONFIG, Tile, type LevelDef } from '@strikesquad/shared';
import { THEMES, type Theme } from './themes';

/**
 * The stage in real 3D (Three.js): the ground and ledges as lit, textured solids with depth, the world behind them
 * as 3D scenery (forests, hills, ruins…), with sky, fog, sun, shadows and drifting particles. The gameplay is
 * unchanged: it still happens on one plane (z = 0), where the 2D canvas above this one draws the soldiers, foes,
 * shots and effects. That is the "2.5D" of modern side-scrollers: 3D graphics, 2D play.
 *
 * Exact alignment: the camera looks straight down -z at the play plane from the distance at which the plane shows
 * exactly the 2D camera's view (viewW x viewH world px), so a point on the plane lands on the same screen pixel in
 * both canvases. World units are pixels; three's y is the game's y flipped.
 *
 * The ground is built in chunks of columns from the level's tiles and rebuilt when tiles there change (a floor that
 * gives way, a gate). Only what a theme exists for is drawn in 3D (`hasTheme`); other stages stay in 2D.
 */

const T = GAME_CONFIG.tile;
const CHUNK = 32; // columns per ground mesh
/** The ground's front face sits this far toward the camera, its back this far away (world px). */
const Z_FRONT = 40;
const Z_BACK = -220;
const FOV = 32;
/** The carved-edge strip (assets/terrain/*-band.webp): its height and how much of it stands above the walk line, px. */
const LIP_H = 56;
const LIP_PX = 24;

const terrainUrls = import.meta.glob<string>('../assets/terrain/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

interface Chunk {
  mesh: THREE.Group;
  sig: string;
}

export class World3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 10, 9000);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  private level: LevelDef | null = null;
  private chunks = new Map<number, Chunk>();
  private scenery = new THREE.Group();
  private particles: THREE.Points | null = null;
  private theme: Theme | null = null;
  private loader = new THREE.TextureLoader();
  private tex = new Map<string, THREE.Texture>();
  private mats: {
    front: THREE.Material;
    top: THREE.Material;
    lip: THREE.Material;
    ledge: THREE.Material;
  } | null = null;
  private shadows: boolean;
  private skyMat: THREE.ShaderMaterial | null = null;
  private sea: THREE.Mesh | null = null;
  private frames = 0;

  constructor(host: HTMLElement, opts: { shadows: boolean }) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game3d';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.shadows = opts.shadows;
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.scenery);
    this.sun.castShadow = opts.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.5;
  }

  /** Builds the stage: theme, sky, scenery; the ground is built lazily, chunk by chunk, as it comes into view. */
  setLevel(level: LevelDef, art: string): void {
    this.level = level;
    for (const c of this.chunks.values()) this.scene.remove(c.mesh);
    this.chunks.clear();
    this.scenery.clear();
    this.scenery.userData = {};
    const th = THEMES[art];
    if (!th) return;
    this.theme = th;
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.hemi.color.set(th.skyLight);
    this.hemi.groundColor.set(th.groundLight);
    this.hemi.intensity = th.hemi;
    this.sun.color.set(th.sun);
    this.sun.intensity = th.sunIntensity;
    // the sky: a gradient on a great backdrop far behind everything
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(th.skyTop) },
        mid: { value: new THREE.Color(th.skyMid) },
        bottom: { value: new THREE.Color(th.skyBottom) },
      },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec2 vUv; void main(){ float t = vUv.y; vec3 c = t > 0.5 ? mix(mid, top, (t-0.5)*2.0) : mix(bottom, mid, t*2.0); gl_FragColor = vec4(c,1.0); }',
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.skyMat);
    sky.name = 'sky';
    sky.renderOrder = -10;
    this.scenery.add(sky);
    // a built stage (a bridge, a fort, a palace) has its own wall, paving and carved edge; others are earth and rock
    const kit = th.kit;
    const fill = this.texture(kit ? `${kit}-wall` : `${th.terrain}-fill`, true);
    const top = this.texture(kit ? `${kit}-band` : `${th.terrain}-top`, false);
    const plat = this.texture(`${th.terrain}-plat`, false);
    const pave = kit ? this.texture(`${kit}-pave`, true) : fill;
    this.mats = {
      front: new THREE.MeshStandardMaterial({
        map: fill,
        roughness: 0.92,
        metalness: 0,
        color: th.frontTint,
        vertexColors: !!th.wet,
      }),
      top: new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95, color: th.topTint }),
      lip: new THREE.MeshStandardMaterial({ map: top, transparent: true, alphaTest: 0.35, roughness: 0.9 }),
      ledge: new THREE.MeshStandardMaterial({
        map: plat,
        roughness: 0.85,
        transparent: true,
        alphaTest: 0.3,
      }),
    };
    const tex = (key: string): THREE.Texture => this.texture(key, true);
    th.scenery(this.scenery, level, { shadows: this.shadows, tex });
    this.sea = th.sea ? th.sea(level) : null;
    if (this.sea) this.scenery.add(this.sea);
    this.particles = th.particles ? th.particles(level) : null;
    if (this.particles) this.scenery.add(this.particles);
  }

  private texture(key: string, repeat: boolean): THREE.Texture {
    let t = this.tex.get(key);
    if (t) return t;
    const url = terrainUrls[`../assets/terrain/${key}.webp`] ?? '';
    t = this.loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    this.tex.set(key, t);
    return t;
  }

  resize(w: number, h: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** Draws a frame for the 2D camera's view (world px). */
  render(camX: number, camY: number, viewW: number, viewH: number, nowMs: number, waterY?: number): void {
    const L = this.level;
    if (!L || !this.theme) return;
    const cam = this.camera;
    cam.aspect = viewW / viewH;
    cam.fov = FOV;
    const dist = viewH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const cx = camX + viewW / 2;
    const cy = -(camY + viewH / 2);
    cam.position.set(cx, cy, dist);
    cam.lookAt(cx, cy, 0);
    cam.far = dist + 6000;
    cam.updateProjectionMatrix();
    // the ground in view (and a chunk either side)
    const c0 = Math.max(0, Math.floor((camX - viewW) / T / CHUNK));
    const c1 = Math.min(Math.floor((L.cols - 1) / CHUNK), Math.floor((camX + viewW * 2) / T / CHUNK));
    for (let k = c0; k <= c1; k++) this.ensureChunk(k);
    for (const [k, ch] of this.chunks) ch.mesh.visible = k >= c0 - 1 && k <= c1 + 1;
    // the sky fills the far view; the sun and its shadows follow the camera
    const sky = this.scenery.getObjectByName('sky');
    if (sky) {
      const far = 5200;
      const h = 2 * (dist + far) * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.15;
      sky.position.set(cx, cy, -far);
      sky.scale.set(h * cam.aspect, h, 1);
    }
    const th = this.theme;
    this.sun.position.set(cx + th.sunDir[0] * 1200, cy + th.sunDir[1] * 1200, 900);
    this.sun.target.position.set(cx, cy, 0);
    const sc = this.sun.shadow.camera;
    sc.left = -viewW * 0.8;
    sc.right = viewW * 0.8;
    sc.top = viewH * 0.9;
    sc.bottom = -viewH * 0.9;
    sc.near = 10;
    sc.far = 4000;
    sc.updateProjectionMatrix();
    th.animate?.(this.scenery, nowMs, cx, cy);
    if (this.sea) {
      // the sea's surface follows the tide; the plane is centred under the camera so it reaches every horizon
      if (waterY !== undefined) this.sea.position.y = -waterY;
      this.sea.position.x = cx;
      const u = (this.sea.material as THREE.ShaderMaterial).uniforms;
      if (u.time) u.time.value = nowMs / 1000;
      if (u.camX) u.camX.value = cx;
    }
    if (this.particles) {
      const u = (this.particles.material as THREE.ShaderMaterial).uniforms;
      if (u?.time) u.time.value = nowMs / 1000;
    }
    this.renderer.render(this.scene, cam);
    // for the tests and the stats overlay: what the last frame drew
    if ((this.frames++ & 31) === 0) {
      this.canvas.dataset.calls = String(this.renderer.info.render.calls);
      this.canvas.dataset.tris = String(this.renderer.info.render.triangles);
    }
  }

  /** (Re)builds a chunk of ground when it is first seen or its tiles have changed. */
  private ensureChunk(k: number): void {
    const L = this.level;
    const m = this.mats;
    if (!L || !m) return;
    const a = k * CHUNK;
    const b = Math.min(L.cols, a + CHUNK);
    let sig = '';
    for (let c = a; c < b; c++) for (let r = 0; r < L.rows; r++) sig += L.tiles[r * L.cols + c];
    const old = this.chunks.get(k);
    if (old && old.sig === sig) return;
    if (old) this.scene.remove(old.mesh);
    const g = new THREE.Group();
    const front: number[] = [];
    const frontUv: number[] = [];
    const top: number[] = [];
    const topUv: number[] = [];
    const lip: number[] = [];
    const lipUv: number[] = [];
    const side: number[] = [];
    const sideUv: number[] = [];
    const ledge: number[] = [];
    const ledgeUv: number[] = [];
    const th = this.theme;
    const kit = th?.kit;
    const solid = (c: number, r: number): boolean =>
      c >= 0 && c < L.cols && r >= 0 && r < L.rows && L.tiles[r * L.cols + c] === Tile.Solid;
    const S = 256;
    const quad = (arr: number[], uv: number[], p: number[][], q: number[][]): void => {
      // two triangles p0 p1 p2, p0 p2 p3
      for (const i of [0, 1, 2, 0, 2, 3]) {
        arr.push(...(p[i] as number[]));
        uv.push(...(q[i] as number[]));
      }
    };
    for (let c = a; c < b; c++) {
      for (let r = 0; r < L.rows; r++) {
        const t = L.tiles[r * L.cols + c];
        const x0 = c * T;
        const x1 = x0 + T;
        const y0 = -r * T;
        const y1 = y0 - T;
        if (t === Tile.Solid) {
          // the face toward us, textured by world position
          quad(
            front,
            frontUv,
            [
              [x0, y1, Z_FRONT],
              [x1, y1, Z_FRONT],
              [x1, y0, Z_FRONT],
              [x0, y0, Z_FRONT],
            ],
            [
              [x0 / S, y1 / S],
              [x1 / S, y1 / S],
              [x1 / S, y0 / S],
              [x0 / S, y0 / S],
            ],
          );
          if (!solid(c, r - 1)) {
            // the surface, running back into the world, and the grass (or snow, or sand) over its front edge
            quad(
              top,
              topUv,
              [
                [x0, y0, Z_FRONT],
                [x1, y0, Z_FRONT],
                [x1, y0, Z_BACK],
                [x0, y0, Z_BACK],
              ],
              [
                [x0 / S, Z_FRONT / S],
                [x1 / S, Z_FRONT / S],
                [x1 / S, Z_BACK / S],
                [x0 / S, Z_BACK / S],
              ],
            );
            const lt = 12;
            const lb = 28 - 12;
            // a carved edge stands out from the wall (and gets a top of its own); turf hangs flat over it
            const zl = Z_FRONT + (kit ? 7 : 0.6);
            if (kit)
              quad(
                top,
                topUv,
                [
                  [x0, y0 + 3, zl],
                  [x1, y0 + 3, zl],
                  [x1, y0 + 3, Z_FRONT],
                  [x0, y0 + 3, Z_FRONT],
                ],
                [
                  [x0 / S, zl / S],
                  [x1 / S, zl / S],
                  [x1 / S, Z_FRONT / S],
                  [x0 / S, Z_FRONT / S],
                ],
              );
            quad(
              lip,
              lipUv,
              [
                [x0, y0 - lb, zl],
                [x1, y0 - lb, zl],
                [x1, y0 + (kit ? 3 : lt), zl],
                [x0, y0 + (kit ? 3 : lt), zl],
              ],
              [
                [(x0 % S) / S, 0],
                [((x0 % S) + T) / S, 0],
                [((x0 % S) + T) / S, kit ? 1 - (LIP_PX - 6) / LIP_H : 1],
                [(x0 % S) / S, kit ? 1 - (LIP_PX - 6) / LIP_H : 1],
              ],
            );
          }
          for (const [dc, xs] of [
            [-1, x0],
            [1, x1],
          ] as const) {
            if (solid(c + dc, r)) continue;
            quad(
              side,
              sideUv,
              [
                [xs, y1, dc < 0 ? Z_BACK : Z_FRONT],
                [xs, y1, dc < 0 ? Z_FRONT : Z_BACK],
                [xs, y0, dc < 0 ? Z_FRONT : Z_BACK],
                [xs, y0, dc < 0 ? Z_BACK : Z_FRONT],
              ],
              [
                [0, y1 / S],
                [1, y1 / S],
                [1, y0 / S],
                [0, y0 / S],
              ],
            );
          }
        } else if (t === Tile.OneWay) {
          // a ledge: a beam with some depth, its face from the stage's ledge strip
          const h = 24;
          const zf = 22;
          const zb = -60;
          quad(
            ledge,
            ledgeUv,
            [
              [x0, y0 - h, zf],
              [x1, y0 - h, zf],
              [x1, y0, zf],
              [x0, y0, zf],
            ],
            [
              [(x0 % S) / S, 0],
              [((x0 % S) + T) / S, 0],
              [((x0 % S) + T) / S, 1],
              [(x0 % S) / S, 1],
            ],
          );
          quad(
            top,
            topUv,
            [
              [x0, y0, zf],
              [x1, y0, zf],
              [x1, y0, zb],
              [x0, y0, zb],
            ],
            [
              [x0 / S, zf / S],
              [x1 / S, zf / S],
              [x1 / S, zb / S],
              [x0 / S, zb / S],
            ],
          );
        }
      }
    }
    const wet = th?.wet;
    const add = (pos: number[], uv: number[], mat: THREE.Material, cast: boolean): void => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (wet && (mat as THREE.MeshStandardMaterial).vertexColors) {
        // stone that the tide covers is dark and green; just above it, a pale salt line
        const line = -(this.level?.tide?.base ?? 1e9);
        const col: number[] = [];
        const dark = new THREE.Color(wet.color);
        const salt = new THREE.Color(0xd8e0d0);
        const c = new THREE.Color();
        for (let i = 1; i < pos.length; i += 3) {
          const y = pos[i] as number;
          const under = THREE.MathUtils.clamp((line + wet.reach - y) / (wet.reach * 2), 0, 1);
          c.setRGB(1, 1, 1).lerp(dark, under);
          const s = Math.max(0, 1 - Math.abs(y - (line + wet.reach * 1.4)) / 10) * 0.25;
          c.lerp(salt, s);
          col.push(c.r, c.g, c.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = this.shadows;
      mesh.castShadow = cast && this.shadows;
      g.add(mesh);
    };
    add(front, frontUv, m.front, true);
    add(side, sideUv, m.front, true);
    add(top, topUv, m.top, false);
    add(lip, lipUv, m.lip, false);
    add(ledge, ledgeUv, m.ledge, true);
    this.scene.add(g);
    this.chunks.set(k, { mesh: g, sig });
  }

  /** Light sources in the 3D scenery, on the play plane (x, y in game px, radius), for a stage drawn dark. */
  lights(): { x: number; y: number; r: number }[] {
    return (this.scenery.userData.lights as { x: number; y: number; r: number }[] | undefined) ?? [];
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}

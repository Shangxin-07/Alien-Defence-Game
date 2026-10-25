import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { Battle, Unit, alive, conscious } from "./battle";
import { CityStyle } from "./cityMap";
import { CoverLook, Point, TacMap } from "./map";

/** Fog: never seen, seen before, in view now. */
const FOG = [0.07, 0.38, 1];
const WALL_H = 1.15;

const COVER: Record<CoverLook, { h: number; s: number; color: string }> = {
  car: { h: 0.7, s: 0.9, color: "#6a7584" },
  crate: { h: 0.75, s: 0.8, color: "#8a6a40" },
  bin: { h: 0.65, s: 0.6, color: "#3f5a46" },
  planter: { h: 0.45, s: 0.85, color: "#5c5348" },
  bench: { h: 0.4, s: 0.85, color: "#6b5236" },
  barrier: { h: 0.55, s: 0.95, color: "#b34a3a" },
  wreck: { h: 0.6, s: 0.9, color: "#2b2622" },
};
const CAR_PAINT = ["#7a2e2a", "#2f4f7a", "#9a9a92", "#2a2a2c", "#4f6a3a", "#b08a3a"];

/** Draws the battlefield, the units and the effects. Knows nothing about the rules. */
export class TacticalView {
  readonly root = new Group();
  private map!: TacMap;
  private floor!: InstancedMesh;
  private things: { mesh: InstancedMesh; tiles: number[]; base: Color[] }[] = [];
  private floorBase: Color[] = [];
  private readonly units = new Map<number, { g: Group; body: Group; target: Vector3; from: Vector3; t: number }>();
  private readonly selRing: Mesh;
  /** Where each alien was last seen, while it's out of sight. */
  private readonly ghosts = new Map<number, Mesh>();
  private readonly marks: InstancedMesh;
  private readonly reachMesh: InstancedMesh;
  private readonly fx: { obj: Object3D; life: number; max: number }[] = [];
  private readonly tmp = new Matrix4();
  private readonly col = new Color();
  private readonly lights: Group = new Group();

  constructor(scene: Scene) {
    scene.add(this.root);
    scene.add(new HemisphereLight(0x8fa6c8, 0x1a1712, 1.1));
    const moon = new DirectionalLight(0xb8c8ff, 1.1);
    moon.position.set(-6, 12, 4);
    scene.add(moon);

    this.selRing = new Mesh(new RingGeometry(0.36, 0.46, 24), new MeshBasicMaterial({ color: 0xe8a93b }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 0.07;
    this.selRing.visible = false;
    this.root.add(this.selRing);

    const sq = new PlaneGeometry(0.34, 0.34);
    sq.rotateX(-Math.PI / 2);
    this.marks = new InstancedMesh(sq, new MeshBasicMaterial({ color: 0xffffff }), 80);
    this.marks.count = 0;
    this.marks.position.y = 0.075;
    this.root.add(this.marks);

    const cell = new PlaneGeometry(0.94, 0.94);
    cell.rotateX(-Math.PI / 2);
    this.reachMesh = new InstancedMesh(cell, new MeshBasicMaterial({ color: 0x8fd1a2, transparent: true, opacity: 0.12, depthWrite: false }), 2000);
    this.reachMesh.count = 0;
    this.reachMesh.position.y = 0.065;
    this.root.add(this.reachMesh);
    this.root.add(this.lights);
  }

  /** World position of a tile's centre. */
  world(p: Point, y = 0, out = new Vector3()): Vector3 {
    return out.set(p.x - this.map.w / 2 + 0.5, y, p.y - this.map.h / 2 + 0.5);
  }

  tileAt(x: number, z: number): Point | null {
    const p = { x: Math.floor(x + this.map.w / 2), y: Math.floor(z + this.map.h / 2) };
    return this.map.inside(p.x, p.y) ? p : null;
  }

  /** Builds the static scenery. Call once per battle. */
  build(map: TacMap, style: CityStyle, lamps: Point[]): void {
    this.map = map;
    for (const t of this.things) {
      this.root.remove(t.mesh);
      t.mesh.dispose();
    }
    this.things = [];
    if (this.floor) {
      this.root.remove(this.floor);
      this.floor.dispose();
    }
    this.lights.clear();

    const n = map.w * map.h;
    const tile = new BoxGeometry(1, 0.1, 1);
    this.floor = new InstancedMesh(tile, new MeshLambertMaterial(), n);
    const ground: Record<string, Color> = {
      road: new Color(style.road),
      pavement: new Color(style.pavement),
      verge: new Color(style.verge),
      floor: new Color(style.floor),
      rubble: new Color(style.road).lerp(new Color("#5a4a3a"), 0.5),
      yard: new Color(style.road).lerp(new Color(style.pavement), 0.5),
    };
    this.floorBase = [];
    const pos = new Vector3();
    for (let i = 0; i < n; i++) {
      const p = { x: i % map.w, y: Math.floor(i / map.w) };
      this.world(p, -0.05, pos);
      this.tmp.makeTranslation(pos.x, pos.y, pos.z);
      this.floor.setMatrixAt(i, this.tmp);
      const c = ground[map.ground[i]].clone();
      // A little noise so the ground isn't flat colour; road markings down the middle.
      c.offsetHSL(0, 0, ((p.x * 7 + p.y * 13) % 5) * 0.004);
      if (map.lit[i]) c.lerp(new Color("#d8b070"), 0.12);
      this.floorBase.push(c);
    }
    this.root.add(this.floor);

    // Everything that stands on a tile, grouped by shape.
    const groups = new Map<string, { geo: BufferGeometry; tiles: number[]; colors: Color[]; y: number; jitter?: boolean }>();
    const add = (key: string, geo: () => BufferGeometry, y: number, i: number, color: Color) => {
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { geo: geo(), tiles: [], colors: [], y }));
      g.tiles.push(i);
      g.colors.push(color);
    };
    const wall = new Color(style.wall);
    const glass = new Color("#5f86a0");
    const door = new Color("#5a3d26");
    for (let i = 0; i < n; i++) {
      const t = map.thing[i];
      const look = map.look[i];
      if (t === "wall") add("wall", () => new BoxGeometry(1, WALL_H, 1), WALL_H / 2, i, wall.clone().offsetHSL(0, 0, ((i * 31) % 3) * 0.01));
      else if (t === "window") {
        add("sill", () => new BoxGeometry(1, 0.55, 1), 0.275, i, wall.clone());
        add("glass", () => new BoxGeometry(0.9, WALL_H - 0.55, 0.25), 0.55 + (WALL_H - 0.55) / 2, i, map.lit[i] ? new Color("#d8c08a") : glass.clone());
        add("lintel", () => new BoxGeometry(1, 0.12, 1), WALL_H - 0.06, i, wall.clone());
      } else if (t === "door") add("door", () => new BoxGeometry(0.9, WALL_H * 0.9, 0.9), (WALL_H * 0.9) / 2, i, door.clone());
      else if (t === "open") add("open", () => new BoxGeometry(1, 0.06, 1), 0.03, i, door.clone().multiplyScalar(0.7));
      else if (t === "tree") {
        add("trunk", () => new CylinderGeometry(0.07, 0.1, 0.9, 6), 0.45, i, new Color("#4a3624"));
        const shape = style.treeShape;
        add(
          `crown-${shape}`,
          () => (shape === "cone" ? new ConeGeometry(0.48, 1.5, 7) : shape === "palm" ? new ConeGeometry(0.62, 0.35, 7) : new SphereGeometry(0.5, 8, 6)),
          shape === "cone" ? 1.5 : shape === "palm" ? 1.75 : 1.3,
          i,
          new Color(style.tree).offsetHSL(0, 0, ((i * 17) % 5) * 0.012),
        );
      } else if (t === "cover" && look) {
        const c = COVER[look];
        const color = new Color(look === "car" ? CAR_PAINT[i % CAR_PAINT.length] : c.color);
        add(look, () => new BoxGeometry(c.s, c.h, look === "car" ? 0.55 : c.s), c.h / 2, i, color);
        if (look === "car") add("roof", () => new BoxGeometry(0.55, 0.3, 0.48), c.h + 0.15, i, color.clone().multiplyScalar(0.8));
      }
    }
    for (const g of groups.values()) {
      const mesh = new InstancedMesh(g.geo, new MeshLambertMaterial(), g.tiles.length);
      g.tiles.forEach((i, k) => {
        this.world({ x: i % map.w, y: Math.floor(i / map.w) }, g.y, pos);
        // Cars lie along the road; everything else square to the grid.
        const turned = map.look[i] === "car" || map.look[i] === "wreck" ? (Math.floor(i / map.w) === 18 || Math.floor(i / map.w) === 21 ? 0 : 1) : 0;
        this.tmp.makeRotationY(turned ? Math.PI / 2 : 0).setPosition(pos);
        mesh.setMatrixAt(k, this.tmp);
      });
      this.root.add(mesh);
      this.things.push({ mesh, tiles: g.tiles, base: g.colors });
    }

    // Lamp posts and the pools of light under them.
    const post = new CylinderGeometry(0.04, 0.05, 2.2, 6);
    const head = new SphereGeometry(0.12, 8, 6);
    const pool = new CircleGeometry(3, 28);
    pool.rotateX(-Math.PI / 2);
    const postMat = new MeshLambertMaterial({ color: 0x3a3f44 });
    const headMat = new MeshBasicMaterial({ color: 0xffd890 });
    const poolMat = new MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false });
    for (const l of lamps) {
      const g = new Group();
      this.world(l, 0, g.position);
      const p = new Mesh(post, postMat);
      p.position.y = 1.1;
      const h = new Mesh(head, headMat);
      h.position.y = 2.25;
      const pl = new Mesh(pool, poolMat);
      pl.position.y = 0.06;
      g.add(p, h, pl);
      this.lights.add(g);
    }
  }

  /** Recolours everything for what your people can see now. */
  fog(b: Battle): void {
    const level = (i: number) => FOG[b.visible[i] ? 2 : b.seen[i] ? 1 : 0];
    for (let i = 0; i < this.floorBase.length; i++) this.floor.setColorAt(i, this.col.copy(this.floorBase[i]).multiplyScalar(level(i)));
    this.floor.instanceColor!.needsUpdate = true;
    for (const t of this.things) {
      t.tiles.forEach((i, k) => t.mesh.setColorAt(k, this.col.copy(t.base[k]).multiplyScalar(level(i))));
      t.mesh.instanceColor!.needsUpdate = true;
    }
  }

  /** Doors swing open when someone walks through: swap the closed slab for an open one. */
  openDoor(at: Point): void {
    const i = this.map.idx(at.x, at.y);
    for (const t of this.things) {
      const k = t.tiles.indexOf(i);
      if (k < 0) continue;
      t.mesh.getMatrixAt(k, this.tmp);
      // Squash it into a thin slab against one side of the frame.
      const pos = new Vector3().setFromMatrixPosition(this.tmp);
      this.tmp.makeScale(0.12, 1, 1).setPosition(pos.x - 0.42, pos.y, pos.z);
      t.mesh.setMatrixAt(k, this.tmp);
      t.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- Units ----------

  /** `size` scales the whole figure, `width` its shoulders; a `crest` marks whoever gives the orders. */
  addUnit(u: Unit, color: string, shape: { size?: number; width?: number; crest?: boolean } = {}): void {
    const g = new Group();
    const body = new Group();
    const mat = new MeshLambertMaterial({ color });
    if (u.side === "alien") {
      const torso = new Mesh(new CylinderGeometry(0.14, 0.2, 0.9, 8), mat);
      torso.position.y = 0.75;
      const headM = new Mesh(new SphereGeometry(0.24, 12, 10), mat);
      headM.scale.set(1, 1.25, 1);
      headM.position.y = 1.42;
      const eyes = new Mesh(new BoxGeometry(0.3, 0.07, 0.06), new MeshBasicMaterial({ color: 0xff3b2a }));
      eyes.position.set(0, 1.45, -0.21);
      const legs = new Mesh(new CylinderGeometry(0.06, 0.06, 0.4, 6), mat);
      legs.position.y = 0.2;
      body.add(torso, headM, eyes, legs);
      if (shape.crest) {
        const crest = new Mesh(new ConeGeometry(0.1, 0.36, 6), new MeshBasicMaterial({ color: 0xffd34d }));
        crest.position.y = 1.85;
        body.add(crest);
      }
    } else {
      const torso = new Mesh(new CylinderGeometry(0.2, 0.17, 0.75, 10), mat);
      torso.position.y = 0.72;
      const legs = new Mesh(new BoxGeometry(0.3, 0.38, 0.18), new MeshLambertMaterial({ color: "#2a2d33" }));
      legs.position.y = 0.19;
      const headM = new Mesh(new SphereGeometry(0.15, 10, 8), new MeshLambertMaterial({ color: "#c9a487" }));
      headM.position.y = 1.25;
      // A nose so you can tell which way they face.
      const gun = new Mesh(new BoxGeometry(0.06, 0.06, 0.4), new MeshLambertMaterial({ color: "#1c1c1c" }));
      gun.position.set(0.14, 0.82, -0.25);
      body.add(torso, legs, headM, gun);
    }
    g.add(body);
    g.scale.set(shape.width ?? 1, shape.size ?? 1, shape.width ?? 1);
    this.root.add(g);
    if (u.side === "alien") {
      const ghost = new Mesh(new RingGeometry(0.3, 0.44, 4, 1), new MeshBasicMaterial({ color: 0xe2553f, transparent: true, opacity: 0.8 }));
      ghost.rotation.x = -Math.PI / 2;
      ghost.visible = false;
      this.root.add(ghost);
      this.ghosts.set(u.id, ghost);
    }
    const pos = this.world(u);
    g.position.copy(pos);
    this.units.set(u.id, { g, body, target: pos.clone(), from: pos.clone(), t: 1 });
    this.pose(u);
  }

  clearUnits(): void {
    for (const v of this.units.values()) this.root.remove(v.g);
    for (const g of this.ghosts.values()) this.root.remove(g);
    this.units.clear();
    this.ghosts.clear();
  }

  /** Stance, facing and death, straight from the unit's state. */
  pose(u: Unit): void {
    const v = this.units.get(u.id);
    if (!v) return;
    v.g.rotation.y = -(u.facing * Math.PI) / 4;
    v.body.scale.y = u.kneeling ? 0.68 : 1;
    if (!conscious(u)) {
      v.body.rotation.x = Math.PI / 2;
      v.body.position.set(0, 0.2, 0);
      v.body.traverse((o) => {
        if (o instanceof Mesh && o.material instanceof MeshLambertMaterial) o.material.color.multiplyScalar(alive(u) ? 0.8 : 0.45);
      });
      v.body.userData.down = true;
    }
  }

  stepTo(id: number, p: Point, facing: number): void {
    const v = this.units.get(id);
    if (!v) return;
    v.from.copy(v.g.position);
    this.world(p, 0, v.target);
    v.t = 0;
    v.g.rotation.y = -(facing * Math.PI) / 4;
  }

  face(id: number, facing: number): void {
    const v = this.units.get(id);
    if (v) v.g.rotation.y = -(facing * Math.PI) / 4;
  }

  setVisible(id: number, visible: boolean): void {
    const v = this.units.get(id);
    if (v) v.g.visible = visible;
  }

  /** Snaps every unit to the battle state. */
  sync(b: Battle): void {
    for (const u of b.units) {
      const v = this.units.get(u.id);
      if (!v) continue;
      this.world(u, 0, v.target);
      v.g.position.copy(v.target);
      v.t = 1;
      if (!conscious(u) && !v.body.userData.down) this.pose(u);
      else if (conscious(u)) this.pose(u);
      v.g.visible = u.side === "human" || b.isSeen(u) || !conscious(u);
      const ghost = this.ghosts.get(u.id);
      const last = b.lastSeen.get(u.id);
      if (!ghost) continue;
      ghost.visible = !b.isSeen(u) && !!last && conscious(u);
      if (last) this.world(last, 0.08, ghost.position);
    }
    this.fog(b);
  }

  unitPos(id: number): Vector3 | null {
    return this.units.get(id)?.g.position ?? null;
  }

  select(u: Unit | null): void {
    this.selRing.visible = !!u;
    if (u) this.world(u, 0.07, this.selRing.position);
  }

  /** Where the unit can walk this turn. */
  showReach(tiles: number[]): void {
    const pos = new Vector3();
    this.reachMesh.count = Math.min(tiles.length, 2000);
    for (let k = 0; k < this.reachMesh.count; k++) {
      const i = tiles[k];
      this.world({ x: i % this.map.w, y: Math.floor(i / this.map.w) }, 0, pos);
      this.tmp.makeTranslation(pos.x, 0, pos.z);
      this.reachMesh.setMatrixAt(k, this.tmp);
    }
    this.reachMesh.instanceMatrix.needsUpdate = true;
  }

  /** The route a move would take: green while affordable. */
  showPath(path: Point[], ok: boolean): void {
    const pos = new Vector3();
    this.marks.count = Math.min(path.length, 80);
    (this.marks.material as MeshBasicMaterial).color.set(ok ? 0x8fd1a2 : 0xe2553f);
    for (let k = 0; k < this.marks.count; k++) {
      this.world(path[k], 0, pos);
      this.tmp.makeTranslation(pos.x, 0, pos.z);
      this.marks.setMatrixAt(k, this.tmp);
    }
    this.marks.instanceMatrix.needsUpdate = true;
  }

  // ---------- Effects ----------

  tracer(from: Point, to: Point, plasma: boolean, hidden: boolean): void {
    const a = this.world(from, 0.9);
    const b = this.world(to, 0.7);
    // A shot out of the dark shows only its last stretch.
    if (hidden) a.lerp(b, Math.max(0, 1 - 3 / Math.max(1, a.distanceTo(b))));
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z], 3));
    const line = new Line(geo, new LineBasicMaterial({ color: plasma ? 0x9dff5a : 0xffe08a, transparent: true }));
    this.root.add(line);
    this.fx.push({ obj: line, life: 0.45, max: 0.45 });
    const flash = new Mesh(new SphereGeometry(plasma ? 0.28 : 0.16, 8, 6), new MeshBasicMaterial({ color: plasma ? 0x9dff5a : 0xffd070, transparent: true }));
    flash.position.copy(b);
    this.root.add(flash);
    this.fx.push({ obj: flash, life: 0.35, max: 0.35 });
  }

  update(dt: number): void {
    for (const v of this.units.values()) {
      if (v.t >= 1) continue;
      v.t = Math.min(1, v.t + dt / 0.14);
      v.g.position.lerpVectors(v.from, v.target, v.t);
    }
    for (let k = this.fx.length - 1; k >= 0; k--) {
      const f = this.fx[k];
      f.life -= dt;
      const o = f.obj as Mesh;
      (o.material as MeshBasicMaterial).opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) {
        this.root.remove(f.obj);
        this.fx.splice(k, 1);
      }
    }
  }
}

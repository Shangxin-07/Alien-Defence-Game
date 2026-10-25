import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  Vector3,
} from "three";
import { BaseLayout, GRID, Item, ItemStatus, LEVELS } from "./layout";
import { ROOMS } from "./rooms";

/** World units between stacked levels. */
export const LEVEL_GAP = 2.4;

export const levelY = (level: number) => -level * LEVEL_GAP;

export interface ViewColors {
  surface: string;
  /** Street level of a city base. */
  street: string;
  rock: string;
  grid: string;
  build: string;
  alert: string;
  ok: string;
}

/** Room anchor for an on-screen name tag. */
export interface Tag {
  uid: number;
  text: string;
  status: ItemStatus;
  pos: Vector3;
}

const box = new BoxGeometry(1, 1, 1);
const boxEdges = new EdgesGeometry(box);

/**
 * Draws the base as stacked grids. The active level is solid, the ones under it are ghosted
 * so you can see what's below, and the ones above are hidden so they don't block the view.
 */
export class BaseView {
  readonly root = new Group();
  private readonly content = new Group();
  private readonly ghost: Mesh;
  private readonly ghostEdges: LineSegments;
  private readonly ghostMat: MeshStandardMaterial;
  private readonly ghostLine: LineBasicMaterial;
  private readonly colors: Record<keyof ViewColors, Color>;
  tags: Tag[] = [];

  constructor(scene: Scene, colors: ViewColors) {
    this.colors = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, new Color(v)])) as Record<keyof ViewColors, Color>;
    scene.add(this.root);
    this.root.add(this.content);
    scene.add(new HemisphereLight(0xcfe2e6, 0x1a1410, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(4, 10, 6);
    scene.add(sun);

    this.ghostMat = new MeshStandardMaterial({ transparent: true, opacity: 0.4, depthWrite: false });
    this.ghostLine = new LineBasicMaterial({ transparent: true });
    this.ghost = new Mesh(box, this.ghostMat);
    this.ghostEdges = new LineSegments(boxEdges, this.ghostLine);
    this.ghost.add(this.ghostEdges);
    this.ghost.visible = false;
    this.ghost.renderOrder = 10;
    this.root.add(this.ghost);
  }

  rebuild(layout: BaseLayout, active: number): void {
    for (const c of [...this.content.children]) {
      this.content.remove(c);
      c.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) {
          if (o.geometry !== box && o.geometry !== boxEdges) o.geometry.dispose();
          (o.material as MeshStandardMaterial).dispose();
        }
      });
    }
    this.tags = [];
    const statuses = layout.statuses();
    for (let level = active; level < LEVELS; level++) {
      const depth = level - active;
      // Ghosted levels fade out the further down they are.
      const opacity = depth === 0 ? 1 : 0.2 / depth;
      const g = new Group();
      g.position.y = levelY(level);
      g.add(this.floor(level, opacity, depth === 0, layout.site === "city"));
      for (const it of layout.items.values()) {
        if (it.level !== level) continue;
        if (ROOMS[it.type].detritus) {
          g.add(this.building(it.x + it.w / 2 - GRID / 2, it.y + it.h / 2 - GRID / 2, it.w - 0.1, it.h - 0.1, ROOMS[it.type].height, new Color(ROOMS[it.type].color)));
          if (depth === 0 && ROOMS[it.type].owned) {
            this.tags.push({ uid: it.uid, text: ROOMS[it.type].short, status: "online", pos: new Vector3(it.x + it.w / 2 - GRID / 2, levelY(level) + ROOMS[it.type].height + 0.15, it.y + it.h / 2 - GRID / 2) });
          }
          continue;
        }
        const st = statuses.get(it.uid)!;
        this.drawItem(g, layout, it, st, opacity);
        if (depth === 0 && ROOMS[it.type].short && it.type !== "lift") {
          this.tags.push({ uid: it.uid, text: ROOMS[it.type].short, status: st, pos: new Vector3(it.x + it.w / 2 - GRID / 2, levelY(level) + ROOMS[it.type].height + 0.15, it.y + it.h / 2 - GRID / 2) });
        }
      }
      if (depth === 0) this.markLiftsNearby(g, layout, level);
      this.content.add(g);
    }
  }

  /** Outlines where lift shafts sit on the levels above and below, so new lifts can be stacked on them. */
  private markLiftsNearby(g: Group, layout: BaseLayout, level: number) {
    for (const it of layout.items.values()) {
      if (!ROOMS[it.type].shaft || Math.abs(it.level - level) !== 1) continue;
      for (let y = it.y; y < it.y + it.h; y++) {
        for (let x = it.x; x < it.x + it.w; x++) {
          if (layout.itemAt(level, x, y)) continue;
          const e = new LineSegments(boxEdges, new LineBasicMaterial({ color: ROOMS.lift.color, transparent: true, opacity: 0.8 }));
          e.scale.set(0.8, 0.02, 0.8);
          e.position.set(x + 0.5 - GRID / 2, 0.02, y + 0.5 - GRID / 2);
          g.add(e);
        }
      }
    }
  }

  showGhost(level: number, x: number, y: number, w: number, h: number, height: number, ok: boolean): void {
    const c = ok ? this.colors.ok : this.colors.alert;
    this.ghostMat.color.copy(c);
    this.ghostLine.color.copy(c);
    this.ghost.scale.set(w - 0.06, height + 0.04, h - 0.06);
    this.ghost.position.set(x + w / 2 - GRID / 2, levelY(level) + (height + 0.04) / 2, y + h / 2 - GRID / 2);
    this.ghost.visible = true;
  }

  hideGhost(): void {
    this.ghost.visible = false;
  }

  /** A city building: a block with floor lines so it reads as a building rather than a base module. */
  private building(cx: number, cz: number, w: number, d: number, height: number, color: Color): Group {
    const g = new Group();
    const m = new Mesh(box, new MeshStandardMaterial({ color, roughness: 0.95 }));
    m.scale.set(w, height, d);
    m.position.set(cx, height / 2, cz);
    g.add(m);
    const lines = new LineBasicMaterial({ color: color.clone().multiplyScalar(0.55) });
    for (let y = 0.4; y < height - 0.1; y += 0.4) {
      const e = new LineSegments(boxEdges, lines);
      e.scale.set(w + 0.01, 0.001, d + 0.01);
      e.position.set(cx, y, cz);
      g.add(e);
    }
    const roof = new LineSegments(boxEdges, new LineBasicMaterial({ color: color.clone().multiplyScalar(1.4) }));
    roof.scale.set(w, height, d);
    roof.position.copy(m.position);
    g.add(roof);
    return g;
  }

  /** The rest of the city around the base, for scale. Same skyline every time. */
  private skyline(): Group {
    const g = new Group();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const palette = ["#4a5761", "#6b625a", "#57534a", "#5e5560"].map((c) => new Color(c).multiplyScalar(0.7));
    const half = GRID / 2;
    for (let z = -half - 7; z < half + 7; z += 2) {
      for (let x = -half - 7; x < half + 7; x += 2) {
        // Leave a street ring around the base grid.
        if (x >= -half - 2 && x < half + 1 && z >= -half - 2 && z < half + 1) continue;
        if (rand() < 0.2) continue;
        const h = 0.5 + rand() * rand() * 3;
        g.add(this.building(x + 1, z + 1, 1.6, 1.6, h, palette[Math.floor(rand() * palette.length)]));
      }
    }
    return g;
  }

  private floor(level: number, opacity: number, active: boolean, city: boolean): Group {
    const g = new Group();
    // Underground floors are slightly see-through so the ghosted levels below show.
    const alpha = active ? (level === 0 ? 1 : 0.86) : opacity * 0.6;
    const slab = new Mesh(
      new PlaneGeometry(GRID, GRID),
      new MeshStandardMaterial({ color: level === 0 ? (city ? this.colors.street : this.colors.surface) : this.colors.rock, transparent: alpha < 1, opacity: alpha, depthWrite: active }),
    );
    slab.rotation.x = -Math.PI / 2;
    g.add(slab);
    if (active && level === 0) {
      // Open ground around the perimeter so the surface doesn't float in the void.
      const ground = city ? this.colors.street : this.colors.surface;
      const apron = new Mesh(new PlaneGeometry(GRID * 4, GRID * 4), new MeshStandardMaterial({ color: ground.clone().multiplyScalar(0.55) }));
      apron.rotation.x = -Math.PI / 2;
      apron.position.y = -0.01;
      g.add(apron);
      if (city) g.add(this.skyline());
    }
    const pts: number[] = [];
    const half = GRID / 2;
    for (let i = 0; i <= GRID; i++) {
      pts.push(i - half, 0.005, -half, i - half, 0.005, half, -half, 0.005, i - half, half, 0.005, i - half);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pts, 3));
    g.add(new LineSegments(geo, new LineBasicMaterial({ color: this.colors.grid, transparent: true, opacity: active ? 0.9 : opacity })));
    return g;
  }

  private drawItem(g: Group, layout: BaseLayout, it: Item, st: ItemStatus, opacity: number) {
    const def = ROOMS[it.type];
    const solid = opacity === 1;
    let color = new Color(def.color);
    if (st === "isolated" || st === "unpowered") color = color.multiplyScalar(0.35);
    const mat = new MeshStandardMaterial({ color, transparent: !solid || st === "building", opacity: st === "building" ? 0.55 * opacity : opacity, depthWrite: solid, roughness: 0.8, metalness: 0.1 });
    const cx = it.x + it.w / 2 - GRID / 2;
    const cz = it.y + it.h / 2 - GRID / 2;
    const progress = st === "building" ? 1 - it.daysLeft / def.days : 1;

    if (it.type === "tunnel") {
      const arms = [[0, 0]];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (layout.itemAt(it.level, it.x + dx, it.y + dy)) arms.push([dx, dy]);
      for (const [dx, dy] of arms) {
        const m = new Mesh(box, mat);
        const along = dx === 0 && dy === 0 ? 0.44 : 0.3;
        m.scale.set(dx ? along : 0.44, def.height * Math.max(0.3, progress), dy ? along : 0.44);
        m.position.set(cx + dx * 0.36, (m.scale.y / 2), cz + dy * 0.36);
        g.add(m);
      }
    } else {
      const h = def.height * Math.max(0.12, progress);
      const m = new Mesh(box, mat);
      m.scale.set(it.w - 0.14, h, it.h - 0.14);
      m.position.set(cx, h / 2, cz);
      g.add(m);
    }

    // Scaffold outline while building, red outline when not working.
    if (st !== "online" && solid && it.type !== "tunnel") {
      const e = new LineSegments(boxEdges, new LineBasicMaterial({ color: st === "building" ? this.colors.build : this.colors.alert }));
      e.scale.set(it.w - 0.1, def.height, it.h - 0.1);
      e.position.set(cx, def.height / 2, cz);
      g.add(e);
    }

    // Lift shafts drop to the lift on the level below.
    if (!def.shaft) return;
    for (let y = it.y; y < it.y + it.h; y++) {
      for (let x = it.x; x < it.x + it.w; x++) {
        const below = layout.itemAt(it.level + 1, x, y);
        if (!below || !ROOMS[below.type].shaft) continue;
        const shaft = new Mesh(box, new MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.25 * opacity, depthWrite: false }));
        shaft.scale.set(0.34, LEVEL_GAP, 0.34);
        shaft.position.set(x + 0.5 - GRID / 2, -LEVEL_GAP / 2, y + 0.5 - GRID / 2);
        g.add(shaft);
      }
    }
  }
}

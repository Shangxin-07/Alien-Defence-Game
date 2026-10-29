import { DIAGONAL_TU, DOOR_TU, LIFT_TU, STAIRS_TU, STEP_TU } from "./rules";

/**
 * What the floor of a tile is. Rubble is slow going. Above the street, "air" is open sky with
 * nothing to stand on; below it, "earth" is solid ground nobody has dug out.
 */
export type Ground = "road" | "pavement" | "verge" | "floor" | "rubble" | "yard" | "roof" | "air" | "earth";
/**
 * What stands on a tile. Walls and closed doors block sight; cover and windows soak up shots.
 * Stairs and lifts link a tile to the same tile on the level above or below.
 */
export type Thing = "none" | "wall" | "window" | "door" | "open" | "cover" | "tree" | "stairs" | "lift";
/** How a piece of cover looks; it plays the same whatever it is. */
export type CoverLook = "car" | "crate" | "bin" | "planter" | "bench" | "barrier" | "wreck" | "parapet";

/** A tile. `z` is the level: 0 the street, below it cellars, above it floors. Left out, it's the street. */
export interface Point {
  x: number;
  y: number;
  z?: number;
}

/** The level a point is on. */
export const lvl = (p: Point): number => p.z ?? 0;

/** A plain copy of a point, level and all, with nothing else a unit carries. */
export const pt = (p: Point): Point => ({ x: p.x, y: p.y, z: lvl(p) });

export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y && lvl(a) === lvl(b);

/** How tall a storey is, in tiles, for distances between levels. */
export const LEVEL_H = 1.5;

/** Next to each other on the same level: close enough to swing a baton or pass a medikit. */
export const adjacent = (a: Point, b: Point) => lvl(a) === lvl(b) && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

/** Names of levels, for the screen. */
export function levelName(z: number): string {
  if (z < 0) return z === -1 ? "Basement" : `Sub-basement ${-z}`;
  if (z === 0) return "Street";
  return z === 1 ? "1st floor" : z === 2 ? "2nd floor" : z === 3 ? "3rd floor" : `${z}th floor`;
}

/** Facing: 0 = north (−y), then clockwise in 45° steps. */
export const DIRS: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

export const RUBBLE_TU = 2;

export function facingTo(from: Point, to: Point): number {
  const a = Math.atan2(to.x - from.x, -(to.y - from.y));
  return (Math.round(a / (Math.PI / 4)) + 8) % 8;
}

/** Steps of 45° between two facings, the short way round. */
export function turnSteps(a: number, b: number): number {
  const d = Math.abs(a - b) % 8;
  return Math.min(d, 8 - d);
}

/** Straight-line distance in tiles, storeys counted at LEVEL_H tiles each. */
export const dist = (a: Point, b: Point) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = ((a.z ?? 0) - (b.z ?? 0)) * LEVEL_H;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/** A point on a line of sight or fire. `slab` marks where it runs into a floor or ceiling. */
export interface LinePoint {
  x: number;
  y: number;
  z: number;
  slab?: boolean;
}

/** Where a unit's eyes and gun are, in storeys above the floor it stands on. */
const EYE = 0.5;

/**
 * A battlefield of tiles, one or more levels deep. Level 0 is the street; `bottom` is the lowest level.
 * Tile indexes run along rows, then down the map, then up through the levels.
 */
export class TacMap {
  readonly ground: Ground[];
  readonly thing: Thing[];
  readonly look: (CoverLook | null)[];
  /** Under a street light or a lit window: visible from afar at night. */
  readonly lit: Uint8Array;
  /** Which building a tile belongs to, or −1 outdoors. */
  readonly building: Int16Array;
  /** Tiles on one level. */
  readonly plane: number;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly levels = 1,
    readonly bottom = 0,
  ) {
    this.plane = w * h;
    const n = this.plane * levels;
    this.ground = new Array<Ground>(n).fill("road");
    this.thing = new Array<Thing>(n).fill("none");
    this.look = new Array<CoverLook | null>(n).fill(null);
    this.lit = new Uint8Array(n);
    this.building = new Int16Array(n).fill(-1);
    // Off the street level, it's sky above and earth below until something is built there.
    for (let z = bottom; z < bottom + levels; z++) {
      if (!z) continue;
      const from = (z - bottom) * this.plane;
      this.ground.fill(z < 0 ? "earth" : "air", from, from + this.plane);
      if (z < 0) this.thing.fill("wall", from, from + this.plane);
    }
  }

  /** The highest level. */
  get top(): number {
    return this.bottom + this.levels - 1;
  }

  /** A copy with its own doors to open. */
  clone(): TacMap {
    const m = new TacMap(this.w, this.h, this.levels, this.bottom);
    this.ground.forEach((g, i) => (m.ground[i] = g));
    this.thing.forEach((t, i) => (m.thing[i] = t));
    this.look.forEach((l, i) => (m.look[i] = l));
    m.lit.set(this.lit);
    m.building.set(this.building);
    return m;
  }

  idx(x: number, y: number, z = 0): number {
    return (z - this.bottom) * this.plane + y * this.w + x;
  }

  /** The tile at an index. */
  at(i: number): Point {
    const z = Math.floor(i / this.plane);
    const r = i - z * this.plane;
    return { x: r % this.w, y: Math.floor(r / this.w), z: z + this.bottom };
  }

  inside(x: number, y: number, z = 0): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && z >= this.bottom && z <= this.top;
  }

  thingAt(x: number, y: number, z = 0): Thing {
    return this.inside(x, y, z) ? this.thing[this.idx(x, y, z)] : "wall";
  }

  groundAt(x: number, y: number, z = 0): Ground {
    return this.inside(x, y, z) ? this.ground[this.idx(x, y, z)] : "earth";
  }

  walkable(x: number, y: number, z = 0): boolean {
    const t = this.thingAt(x, y, z);
    if (t !== "none" && t !== "door" && t !== "open" && t !== "stairs" && t !== "lift") return false;
    const g = this.groundAt(x, y, z);
    return g !== "air" && g !== "earth";
  }

  blocksSight(x: number, y: number, z = 0): boolean {
    const t = this.thingAt(x, y, z);
    return t === "wall" || t === "door" || this.groundAt(x, y, z) === "earth";
  }

  /** Low obstacles that stop some shots passing over them. */
  isCover(x: number, y: number, z = 0): boolean {
    const t = this.thingAt(x, y, z);
    return t === "cover" || t === "window" || t === "tree";
  }

  /** Stairs or a lift here that also run to the level `dz` away. */
  linked(x: number, y: number, z: number, dz: number): "stairs" | "lift" | null {
    const t = this.thingAt(x, y, z);
    if ((t !== "stairs" && t !== "lift") || this.thingAt(x, y, z + dz) !== t) return null;
    return t;
  }

  /**
   * Whether a floor separates level z − 1 from level z at a tile. The bottom of the map and the sky
   * over the top count as solid; open air and stairwells don't.
   */
  slab(x: number, y: number, z: number): boolean {
    if (z <= this.bottom || z > this.top) return true;
    if (this.groundAt(x, y, z) === "air") return false;
    return !this.linked(x, y, z, -1);
  }

  /** Time units to step from one tile onto a neighbour, or up or down stairs, or Infinity if you can't. */
  stepCost(from: Point, to: Point): number {
    const fz = lvl(from);
    const tz = lvl(to);
    if (fz !== tz) {
      if (from.x !== to.x || from.y !== to.y || Math.abs(tz - fz) !== 1) return Infinity;
      const via = this.linked(from.x, from.y, fz, tz - fz);
      return via === "stairs" ? STAIRS_TU : via === "lift" ? LIFT_TU : Infinity;
    }
    if (!this.walkable(to.x, to.y, tz)) return Infinity;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return Infinity;
    let cost = dx && dy ? DIAGONAL_TU : STEP_TU;
    // No squeezing diagonally past a corner.
    if (dx && dy && (!this.walkable(from.x + dx, from.y, tz) || !this.walkable(from.x, from.y + dy, tz))) return Infinity;
    const i = this.idx(to.x, to.y, tz);
    if (this.thing[i] === "door") cost += DOOR_TU;
    if (this.ground[i] === "rubble") cost += RUBBLE_TU;
    return cost;
  }

  /**
   * Tiles a line between two tile centres passes through, in order, start and end included.
   * Sampled finely so a line can't slip between two touching walls. Between levels it runs from eye
   * to eye: it can drop past a window to the street, or climb a stairwell, but not go through a floor.
   * Where it would, the point is marked `slab`. The end may be off the map or between levels, for a
   * shot flying on past what it missed.
   */
  line(a: Point, b: Point): LinePoint[] {
    const az = lvl(a);
    const bz = lvl(b);
    const out: LinePoint[] = [{ x: a.x, y: a.y, z: az }];
    const d = dist(a, b);
    const steps = Math.ceil(d * 4);
    let lx = a.x;
    let ly = a.y;
    let lz = az;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      // The level the line is in: eyes are half a storey up.
      const z = Math.floor(az + EYE + (bz - az) * t);
      if (x === lx && y === ly && z === lz) continue;
      // Diagonal hop: if both corner tiles block, the line is blocked; record the worse one.
      if (x !== lx && y !== ly) {
        const c1 = this.blocksSight(x, ly, lz);
        const c2 = this.blocksSight(lx, y, lz);
        if (c1 && c2) out.push({ x, y: ly, z: lz });
      }
      if (z !== lz) {
        // Up or down through the floor between: only where nothing solid is in the way.
        const through = z > lz ? this.slab(x, y, z) : this.slab(x, y, lz);
        out.push(through ? { x, y, z, slab: true } : { x, y, z });
      } else out.push({ x, y, z });
      lx = x;
      ly = y;
      lz = z;
    }
    return out;
  }

  /** Whether a point on a line stops it: a wall, a closed door, solid earth, or a floor. */
  stops(p: LinePoint): boolean {
    return !!p.slab || this.blocksSight(p.x, p.y, p.z);
  }

  /**
   * Clear line of sight between two tiles: nothing solid strictly between them. The same walk as
   * `line`, without building it, since sight checks run for every tile every step.
   */
  clearLine(a: Point, b: Point): boolean {
    const az = a.z ?? 0;
    const bz = b.z ?? 0;
    const steps = Math.ceil(dist(a, b) * 4);
    const end = Math.floor(bz + EYE);
    let lx = a.x;
    let ly = a.y;
    let lz = az;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      const z = Math.floor(az + EYE + (bz - az) * t);
      if (x === lx && y === ly && z === lz) continue;
      if (x !== lx && y !== ly && this.blocksSight(x, ly, lz) && this.blocksSight(lx, y, lz)) return false;
      if (z !== lz && (z > lz ? this.slab(x, y, z) : this.slab(x, y, lz))) return false;
      if ((x !== b.x || y !== b.y || z !== end) && this.blocksSight(x, y, z)) return false;
      lx = x;
      ly = y;
      lz = z;
    }
    return true;
  }

  /** The tiles one move away: the eight around on the same level, and up or down any stairs or lift. */
  neighbours(p: Point): Point[] {
    const z = lvl(p);
    const out: Point[] = [];
    for (const d of DIRS) if (this.inside(p.x + d.x, p.y + d.y, z)) out.push({ x: p.x + d.x, y: p.y + d.y, z });
    for (const dz of [1, -1]) if (this.linked(p.x, p.y, z, dz)) out.push({ x: p.x, y: p.y, z: z + dz });
    return out;
  }

  /**
   * Cheapest time-unit cost from a start tile to every tile, with the previous step of each route.
   * Tiles in `blocked` (other units) can't be entered.
   */
  reach(start: Point, budget: number, blocked: Set<number>): { cost: Float32Array; prev: Int32Array } {
    const n = this.plane * this.levels;
    const cost = new Float32Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const s = this.idx(start.x, start.y, lvl(start));
    cost[s] = 0;
    // Grids are small; a simple binary heap keeps it quick enough for every hover.
    const heap: number[] = [s];
    const less = (i: number, j: number) => cost[heap[i]] < cost[heap[j]];
    const swap = (i: number, j: number) => ([heap[i], heap[j]] = [heap[j], heap[i]]);
    const push = (v: number) => {
      heap.push(v);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(i, p)) break;
        swap(i, p);
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && less(l, m)) m = l;
          if (r < heap.length && less(r, m)) m = r;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return top;
    };
    // Every hover and every alien step runs this, so it walks the grid without making garbage.
    const from: Point = { x: 0, y: 0, z: 0 };
    const to: Point = { x: 0, y: 0, z: 0 };
    const relax = (c: number, t: number) => {
      if (done[t] || blocked.has(t)) return;
      const nc = cost[c] + this.stepCost(from, to);
      if (nc > budget || nc >= cost[t]) return;
      cost[t] = nc;
      prev[t] = c;
      push(t);
    };
    while (heap.length) {
      const c = pop();
      if (done[c]) continue;
      done[c] = 1;
      const zi = Math.floor(c / this.plane);
      const r = c - zi * this.plane;
      from.x = r % this.w;
      from.y = (r - from.x) / this.w;
      from.z = to.z = zi + this.bottom;
      for (const d of DIRS) {
        to.x = from.x + d.x;
        to.y = from.y + d.y;
        if (to.x < 0 || to.y < 0 || to.x >= this.w || to.y >= this.h) continue;
        relax(c, c + d.y * this.w + d.x);
      }
      to.x = from.x;
      to.y = from.y;
      for (const dz of [1, -1]) {
        if (!this.linked(from.x, from.y, from.z!, dz)) continue;
        to.z = from.z! + dz;
        relax(c, c + dz * this.plane);
      }
    }
    return { cost, prev };
  }

  /** The route to a tile from a `reach` result, start excluded. */
  route(prev: Int32Array, target: Point): Point[] {
    const path: Point[] = [];
    let c = this.idx(target.x, target.y, lvl(target));
    while (prev[c] !== -1) {
      path.push(this.at(c));
      c = prev[c];
    }
    return path.reverse();
  }

  /**
   * Walkable tiles that can't be reached from a start tile by any route, stairs and lifts included.
   * A battlefield should have none: nobody can be locked out of a floor or a room.
   */
  cutOff(from: Point): Point[] {
    const { cost } = this.reach(from, Infinity, new Set());
    const out: Point[] = [];
    for (let i = 0; i < cost.length; i++) {
      if (Number.isFinite(cost[i])) continue;
      const p = this.at(i);
      if (this.walkable(p.x, p.y, p.z)) out.push(p);
    }
    return out;
  }
}

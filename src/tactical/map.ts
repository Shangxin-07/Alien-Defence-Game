import { DIAGONAL_TU, DOOR_TU, STEP_TU } from "./rules";

/** What the floor of a tile is. Rubble is slow going. */
export type Ground = "road" | "pavement" | "verge" | "floor" | "rubble" | "yard";
/** What stands on a tile. Walls and closed doors block sight; cover and windows soak up shots. */
export type Thing = "none" | "wall" | "window" | "door" | "open" | "cover" | "tree";
/** How a piece of cover looks; it plays the same whatever it is. */
export type CoverLook = "car" | "crate" | "bin" | "planter" | "bench" | "barrier" | "wreck";

export interface Point {
  x: number;
  y: number;
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

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A flat battlefield, one level, a grid of tiles. */
export class TacMap {
  readonly ground: Ground[];
  readonly thing: Thing[];
  readonly look: (CoverLook | null)[];
  /** Under a street light or a lit window: visible from afar at night. */
  readonly lit: Uint8Array;
  /** Which building a tile belongs to, or −1 outdoors. */
  readonly building: Int16Array;

  constructor(readonly w: number, readonly h: number) {
    const n = w * h;
    this.ground = new Array<Ground>(n).fill("road");
    this.thing = new Array<Thing>(n).fill("none");
    this.look = new Array<CoverLook | null>(n).fill(null);
    this.lit = new Uint8Array(n);
    this.building = new Int16Array(n).fill(-1);
  }

  /** A copy with its own doors to open. */
  clone(): TacMap {
    const m = new TacMap(this.w, this.h);
    this.ground.forEach((g, i) => (m.ground[i] = g));
    this.thing.forEach((t, i) => (m.thing[i] = t));
    this.look.forEach((l, i) => (m.look[i] = l));
    m.lit.set(this.lit);
    m.building.set(this.building);
    return m;
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  thingAt(x: number, y: number): Thing {
    return this.inside(x, y) ? this.thing[this.idx(x, y)] : "wall";
  }

  walkable(x: number, y: number): boolean {
    const t = this.thingAt(x, y);
    return t === "none" || t === "door" || t === "open";
  }

  blocksSight(x: number, y: number): boolean {
    const t = this.thingAt(x, y);
    return t === "wall" || t === "door";
  }

  /** Low obstacles that stop some shots passing over them. */
  isCover(x: number, y: number): boolean {
    const t = this.thingAt(x, y);
    return t === "cover" || t === "window" || t === "tree";
  }

  /** Time units to step from one tile onto a neighbour, or Infinity if you can't. */
  stepCost(from: Point, to: Point): number {
    if (!this.walkable(to.x, to.y)) return Infinity;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return Infinity;
    let cost = dx && dy ? DIAGONAL_TU : STEP_TU;
    // No squeezing diagonally past a corner.
    if (dx && dy && (!this.walkable(from.x + dx, from.y) || !this.walkable(from.x, from.y + dy))) return Infinity;
    const i = this.idx(to.x, to.y);
    if (this.thing[i] === "door") cost += DOOR_TU;
    if (this.ground[i] === "rubble") cost += RUBBLE_TU;
    return cost;
  }

  /**
   * Tiles a line between two tile centres passes through, in order, start and end included.
   * Sampled finely so a line can't slip between two touching walls.
   */
  line(a: Point, b: Point): Point[] {
    const out: Point[] = [{ x: a.x, y: a.y }];
    const d = dist(a, b);
    const steps = Math.ceil(d * 4);
    let lx = a.x;
    let ly = a.y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      if (x === lx && y === ly) continue;
      // Diagonal hop: if both corner tiles block, the line is blocked; record the worse one.
      if (x !== lx && y !== ly) {
        const c1 = this.blocksSight(x, ly);
        const c2 = this.blocksSight(lx, y);
        if (c1 && c2) out.push({ x, y: ly });
      }
      out.push({ x, y });
      lx = x;
      ly = y;
    }
    return out;
  }

  /** Clear line of sight between two tiles: nothing solid strictly between them. */
  clearLine(a: Point, b: Point): boolean {
    const pts = this.line(a, b);
    for (let i = 1; i < pts.length - 1; i++) if (this.blocksSight(pts[i].x, pts[i].y)) return false;
    return true;
  }

  /**
   * Cheapest time-unit cost from a start tile to every tile, with the previous step of each route.
   * Tiles in `blocked` (other units) can't be entered.
   */
  reach(start: Point, budget: number, blocked: Set<number>): { cost: Float32Array; prev: Int32Array } {
    const n = this.w * this.h;
    const cost = new Float32Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const s = this.idx(start.x, start.y);
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
    while (heap.length) {
      const c = pop();
      if (done[c]) continue;
      done[c] = 1;
      const from = { x: c % this.w, y: Math.floor(c / this.w) };
      for (const d of DIRS) {
        const to = { x: from.x + d.x, y: from.y + d.y };
        if (!this.inside(to.x, to.y)) continue;
        const t = this.idx(to.x, to.y);
        if (done[t] || blocked.has(t)) continue;
        const nc = cost[c] + this.stepCost(from, to);
        if (nc > budget || nc >= cost[t]) continue;
        cost[t] = nc;
        prev[t] = c;
        push(t);
      }
    }
    return { cost, prev };
  }

  /** The route to a tile from a `reach` result, start excluded. */
  route(prev: Int32Array, target: Point): Point[] {
    const path: Point[] = [];
    let c = this.idx(target.x, target.y);
    while (prev[c] !== -1) {
      path.push({ x: c % this.w, y: Math.floor(c / this.w) });
      c = prev[c];
    }
    return path.reverse();
  }
}

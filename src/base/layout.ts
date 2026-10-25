import { Capacity, DEPTH_COST, ROOMS, Role, RoomDef, RoomId, powerSupply } from "./rooms";

/** Cells along each side of a level. */
export const GRID = 8;
/** The surface plus three levels underground. */
export const LEVELS = 4;

export const LEVEL_NAMES = ["Surface", "Level −1", "Level −2", "Level −3"];

/**
 * - city: a covert base dug under a city block. The surface is already built on, and every
 *   building cleared or facility put up in plain sight costs cover.
 * - remote: open ground well away from anyone.
 */
export type Site = "city" | "remote";

/** Cover a city base starts with; it only ever goes down. */
export const FULL_COVER = 100;

/** Specialism needs at least this many cells of specialist rooms before it counts. */
const MIN_SPECIALIST_CELLS = 4;

/** Share of specialist floor space needed for each bonus step. */
const SPECIALISM_TIERS = [
  { share: 0.8, bonus: 30 },
  { share: 0.6, bonus: 20 },
  { share: 0.4, bonus: 10 },
];

export interface Specialism {
  /** The leading role, or null when nothing leads (too small or too mixed). */
  role: Role | null;
  share: number;
  /** Percentage bonus to the role's work; 0 for a mixed base. */
  bonus: number;
  /** Floor space of built rooms per role, in cells. */
  cells: Record<Role, number>;
}

/** Cover a facility costs while it stands on the surface of a city base. */
export function surfaceExposure(def: RoomDef): number {
  return def.exposure ?? (def.conductor ? (def.id === "tunnel" ? 1 : 0) : 6);
}

/** Small deterministic RNG so a city block looks the same every time for the same seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface Item {
  uid: number;
  type: RoomId;
  level: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Days of construction left; 0 once built. */
  daysLeft: number;
}

/**
 * - building: under construction
 * - online: built, linked to the entrance and powered
 * - isolated: built, but no tunnel route back to the entrance
 * - unpowered: linked, but the generators ran out before reaching it
 */
export type ItemStatus = "building" | "online" | "isolated" | "unpowered";

export interface BaseStats {
  supply: number;
  demand: number;
  capacity: Record<Capacity, number>;
  radar: number;
  building: number;
}

export interface SavedBase {
  funds: number;
  day: number;
  site?: Site;
  heat?: number;
  items: Omit<Item, "uid">[];
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID;

/** A base: up to four stacked grids of rooms joined by tunnels and lifts. */
export class BaseLayout {
  funds: number;
  day = 0;
  readonly site: Site;
  /** Cover already spent clearing city buildings. */
  heat = 0;
  readonly items = new Map<number, Item>();
  private readonly cells: Int32Array[] = Array.from({ length: LEVELS }, () => new Int32Array(GRID * GRID));
  private nextUid = 1;
  private statusCache: Map<number, ItemStatus> | null = null;

  constructor(funds = 0, site: Site = "remote") {
    this.funds = funds;
    this.site = site;
  }

  /**
   * A small working base like the one you start the campaign with.
   * A city base hides under a block of buildings and starts with a lab; a remote one has a hangar and radar up top.
   */
  static starter(site: Site = "city", seed = 7): BaseLayout {
    const b = new BaseLayout(4_000_000, site);
    const put = (type: RoomId, level: number, x: number, y: number, rotated = false) =>
      b.place(type, level, x, y, rotated, { free: true, instant: true });
    put("lift", 0, 4, 4);
    if (site === "city") {
      b.raiseCity(seed);
      put("lift", 1, 4, 4);
      for (const [x, y] of [[4, 3], [4, 5], [3, 4], [5, 4]]) put("tunnel", 1, x, y);
      put("quarters", 1, 2, 2);
      put("generator", 1, 5, 2);
      put("stores", 1, 2, 5);
      put("lab", 1, 5, 5);
      return b;
    }
    put("tunnel", 0, 4, 3);
    put("hangar", 0, 1, 1);
    put("radar", 0, 5, 4);
    put("lift", 1, 4, 4);
    for (const [x, y] of [[4, 3], [4, 5], [3, 4], [5, 4]]) put("tunnel", 1, x, y);
    put("quarters", 1, 2, 2);
    put("generator", 1, 5, 2);
    put("stores", 1, 2, 5);
    return b;
  }

  static load(data: SavedBase): BaseLayout {
    const b = new BaseLayout(data.funds, data.site ?? "remote");
    b.day = data.day;
    b.heat = data.heat ?? 0;
    for (const it of data.items) b.insert({ ...it, uid: b.nextUid++ });
    return b;
  }

  save(): SavedBase {
    return { funds: this.funds, day: this.day, site: this.site, heat: this.heat, items: [...this.items.values()].map(({ uid: _, ...it }) => it) };
  }

  footprint(type: RoomId, rotated: boolean): { w: number; h: number } {
    const { w, h } = ROOMS[type];
    return rotated ? { w: h, h: w } : { w, h };
  }

  cost(type: RoomId, level: number): number {
    return Math.round((ROOMS[type].cost * DEPTH_COST[level]) / 1000) * 1000;
  }

  itemAt(level: number, x: number, y: number): Item | undefined {
    if (level < 0 || level >= LEVELS || !inGrid(x, y)) return undefined;
    return this.items.get(this.cells[level][y * GRID + x]);
  }

  /** Why the room can't go here, or null if it can. */
  check(type: RoomId, level: number, x: number, y: number, rotated = false): string | null {
    const def = ROOMS[type];
    const { w, h } = this.footprint(type, rotated);
    if (level < 0 || level >= LEVELS) return "No such level";
    if (def.detritus) return `${def.name} can't be built`;
    if (def.siting === "surface" && level !== 0) return `${def.name} must be on the surface`;
    if (def.siting === "underground" && level === 0) return `${def.name} must be underground`;
    if (!inGrid(x, y) || !inGrid(x + w - 1, y + h - 1)) return "Outside the base perimeter";
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.itemAt(level, i, j)) return "Space already taken";
    if (this.cost(type, level) > this.funds) return "Not enough funds";
    if (!this.items.size) return type === "lift" && level === 0 ? null : "Start with an access lift on the surface";
    if (!this.wouldJoin(type, level, x, y, w, h)) {
      return def.conductor ? "Must join an existing room, tunnel or lift" : "Must open onto a tunnel or lift";
    }
    return null;
  }

  place(
    type: RoomId,
    level: number,
    x: number,
    y: number,
    rotated = false,
    opts: { free?: boolean; instant?: boolean } = {},
  ): Item {
    const reason = opts.free ? this.checkIgnoringFunds(type, level, x, y, rotated) : this.check(type, level, x, y, rotated);
    if (reason) throw new Error(reason);
    if (!opts.free) this.funds -= this.cost(type, level);
    const item: Item = { uid: this.nextUid++, type, level, x, y, ...this.footprint(type, rotated), daysLeft: opts.instant ? 0 : ROOMS[type].days };
    this.insert(item);
    return item;
  }

  /** Why this item can't be removed, or null. Demolition refunds nothing. */
  checkDemolish(uid: number): string | null {
    const it = this.items.get(uid);
    if (!it) return "Nothing there";
    if (ROOMS[it.type].detritus && ROOMS[it.type].cost > this.funds) return "Not enough funds to clear it";
    if (it.type === "lift" && it.level === 0) {
      const others = [...this.items.values()].some((o) => o !== it && o.type === "lift" && o.level === 0);
      if (!others) return "The base needs a surface entrance";
    }
    return null;
  }

  demolish(uid: number): void {
    const reason = this.checkDemolish(uid);
    if (reason) throw new Error(reason);
    const it = this.items.get(uid)!;
    const def = ROOMS[it.type];
    if (def.detritus) {
      this.funds -= def.cost;
      this.heat += def.exposure ?? 0;
    }
    this.forCells(it, (i) => (this.cells[it.level][i] = 0));
    this.items.delete(uid);
    this.statusCache = null;
  }

  /** Runs the clock forward; returns what finished building. */
  advance(days: number): Item[] {
    const done: Item[] = [];
    this.day += days;
    for (const it of this.items.values()) {
      if (!it.daysLeft) continue;
      it.daysLeft = Math.max(0, it.daysLeft - days);
      if (!it.daysLeft) done.push(it);
    }
    if (done.length) this.statusCache = null;
    return done;
  }

  /** Days until the next construction job finishes, or 0 if nothing is being built. */
  nextCompletion(): number {
    let best = 0;
    for (const it of this.items.values()) if (it.daysLeft && (!best || it.daysLeft < best)) best = it.daysLeft;
    return best;
  }

  status(uid: number): ItemStatus {
    return this.statuses().get(uid) ?? "isolated";
  }

  statuses(): Map<number, ItemStatus> {
    if (this.statusCache) return this.statusCache;
    const linked = this.linked();
    const out = new Map<number, ItemStatus>();
    // Generators feed linked rooms in the order they were built until the power runs out.
    let supply = 0;
    for (const it of this.items.values()) if (it.type === "generator" && !it.daysLeft && linked.has(it.uid)) supply += powerSupply(it.level);
    for (const it of [...this.items.values()].sort((a, b) => a.uid - b.uid)) {
      if (ROOMS[it.type].detritus) continue;
      if (it.daysLeft) out.set(it.uid, "building");
      else if (!linked.has(it.uid)) out.set(it.uid, "isolated");
      else if (ROOMS[it.type].power > supply) out.set(it.uid, "unpowered");
      else {
        supply -= ROOMS[it.type].power;
        out.set(it.uid, "online");
      }
    }
    return (this.statusCache = out);
  }

  /** City cover from 0 (blown) to 100, or null for a remote base. */
  cover(): number | null {
    if (this.site !== "city") return null;
    let used = this.heat;
    for (const it of this.items.values()) if (it.level === 0 && !ROOMS[it.type].detritus) used += surfaceExposure(ROOMS[it.type]);
    return Math.max(0, FULL_COVER - used);
  }

  /** What the base has become from what's been built in it. Unfinished rooms don't count yet. */
  specialism(): Specialism {
    const cells: Record<Role, number> = { research: 0, manufacturing: 0, surveillance: 0, military: 0 };
    for (const it of this.items.values()) {
      const role = ROOMS[it.type].role;
      if (role && !it.daysLeft) cells[role] += it.w * it.h;
    }
    const total = Object.values(cells).reduce((a, b) => a + b, 0);
    const [role, top] = (Object.entries(cells) as [Role, number][]).sort((a, b) => b[1] - a[1])[0];
    const share = total ? top / total : 0;
    if (total < MIN_SPECIALIST_CELLS) return { role: null, share, bonus: 0, cells };
    const tier = SPECIALISM_TIERS.find((t) => share >= t.share);
    return { role: tier ? role : null, share, bonus: tier?.bonus ?? 0, cells };
  }

  stats(): BaseStats {
    const capacity: Record<Capacity, number> = { crew: 0, science: 0, engineering: 0, storage: 0, beds: 0, hangars: 0, containment: 0, defence: 0 };
    let supply = 0;
    let demand = 0;
    let radar = 0;
    let building = 0;
    const linked = this.linked();
    for (const [uid, st] of this.statuses()) {
      const it = this.items.get(uid)!;
      const def = ROOMS[it.type];
      if (st === "building") {
        building++;
        continue;
      }
      if (!linked.has(uid)) continue;
      if (it.type === "generator") supply += powerSupply(it.level);
      demand += def.power;
      if (st !== "online") continue;
      for (const [k, v] of Object.entries(def.provides)) capacity[k as Capacity] += v;
      radar = Math.max(radar, def.radar ?? 0);
    }
    return { supply, demand, capacity, radar, building };
  }

  /** Built items with a route back to a surface lift. */
  private linked(): Set<number> {
    const seen = new Set<number>();
    const queue: Item[] = [];
    for (const it of this.items.values()) {
      if (it.type === "lift" && it.level === 0 && !it.daysLeft) {
        seen.add(it.uid);
        queue.push(it);
      }
    }
    while (queue.length) {
      const it = queue.pop()!;
      // Only tunnels and lifts pass people along; rooms are dead ends.
      if (!ROOMS[it.type].conductor) continue;
      const next: Item[] = this.neighbours(it);
      if (it.type === "lift") {
        for (const dl of [-1, 1]) {
          const o = this.itemAt(it.level + dl, it.x, it.y);
          if (o?.type === "lift") next.push(o);
        }
      }
      for (const o of next) {
        if (o.daysLeft || seen.has(o.uid)) continue;
        seen.add(o.uid);
        queue.push(o);
      }
    }
    return seen;
  }

  /** Items on the same level sharing an edge with this one. */
  private neighbours(it: Item): Item[] {
    const out = new Set<Item>();
    for (let j = it.y; j < it.y + it.h; j++) {
      for (let i = it.x; i < it.x + it.w; i++) {
        for (const [dx, dy] of DIRS) {
          const o = this.itemAt(it.level, i + dx, j + dy);
          if (o && o !== it) out.add(o);
        }
      }
    }
    return [...out];
  }

  /** True if a new item here would connect to something: a conductor on either side of a shared edge, or a stacked lift. */
  private wouldJoin(type: RoomId, level: number, x: number, y: number, w: number, h: number): boolean {
    const conductor = !!ROOMS[type].conductor;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        for (const [dx, dy] of DIRS) {
          const o = this.itemAt(level, i + dx, j + dy);
          if (o && !ROOMS[o.type].detritus && (conductor || ROOMS[o.type].conductor)) return true;
        }
      }
    }
    if (type === "lift") {
      for (const dl of [-1, 1]) if (this.itemAt(level + dl, x, y)?.type === "lift") return true;
    }
    return false;
  }

  /** Fills the surface with city buildings, keeping the ground around the entrance clear. */
  private raiseCity(seed: number) {
    const rand = rng(seed);
    const kinds: RoomId[] = ["tower", "apartments", "apartments", "warehouse", "shops", "shops", "shops"];
    const reserved = (x: number, y: number) => Math.abs(x - 4) <= 1 && Math.abs(y - 4) <= 1;
    for (let tries = 0; tries < 400; tries++) {
      const type = kinds[Math.floor(rand() * kinds.length)];
      const { w, h } = this.footprint(type, rand() < 0.5);
      const x = Math.floor(rand() * (GRID - w + 1));
      const y = Math.floor(rand() * (GRID - h + 1));
      let free = true;
      for (let j = y; j < y + h && free; j++) for (let i = x; i < x + w && free; i++) free = !reserved(i, j) && !this.itemAt(0, i, j);
      if (free) this.insert({ uid: this.nextUid++, type, level: 0, x, y, w, h, daysLeft: 0 });
    }
  }

  private checkIgnoringFunds(type: RoomId, level: number, x: number, y: number, rotated: boolean): string | null {
    const funds = this.funds;
    this.funds = Infinity;
    try {
      return this.check(type, level, x, y, rotated);
    } finally {
      this.funds = funds;
    }
  }

  private insert(it: Item) {
    this.items.set(it.uid, it);
    this.forCells(it, (i) => (this.cells[it.level][i] = it.uid));
    this.statusCache = null;
  }

  private forCells(it: Item, fn: (index: number) => void) {
    for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) fn(j * GRID + i);
  }
}

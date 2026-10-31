import { Capacity, DEPTH_COST, ROOMS, SCRAP_VALUE, Role, RoomDef, RoomId, TIER_RANK, Tier, powerSupply } from "./rooms";

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

/** Most people who can work one job at once, per cell of its footprint: two diggers fill a shaft. */
export const CREW_PER_CELL = 2;

/** Saves from before construction took work counted days for a crew of about this many. */
const OLD_SAVE_CREW = 4;

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
  /** Person-days of work left; 0 once built. */
  workLeft: number;
  /** While being converted, what stood here before. It keeps working as that until the job is done. */
  from?: RoomId;
}

/** Someone on construction at this base, and how much a day of their work is worth. */
export interface Builder {
  id: number;
  skill: number;
}

/** How a job under construction is getting on with today's crew. */
export interface JobPlan {
  /** Builders on it today. */
  crew: number[];
  /** Person-days of work it gets a day. */
  rate: number;
  /** Days to finish at this rate, or null if nobody is on it. */
  eta: number | null;
  /** Why nobody can work on it yet, or null. */
  blocked: string | null;
}

/**
 * - building: under construction
 * - online: built, linked to the entrance and powered
 * - isolated: built, but no tunnel route back to the entrance
 * - shaftOnly: the only way in is down a bare shaft, which is no way to live or work
 * - unpowered: linked, but the generators ran out before reaching it
 */
export type ItemStatus = "building" | "online" | "isolated" | "shaftOnly" | "unpowered";

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
  items: (Omit<Item, "uid" | "workLeft"> & { workLeft?: number; daysLeft?: number })[];
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID;

/** A base: up to four stacked grids of rooms joined by tunnels and lifts. */
export class BaseLayout {
  funds: number;
  /** Scrap on hand, lent by the campaign like funds. It pays for rooms before money does. */
  scrap = 0;
  day = 0;
  readonly site: Site;
  /** Cover already spent clearing city buildings. */
  heat = 0;
  readonly items = new Map<number, Item>();
  /** Who is building here today. Set by the campaign; not saved. */
  crew: Builder[] = [];
  private readonly cells: Int32Array[] = Array.from({ length: LEVELS }, () => new Int32Array(GRID * GRID));
  private nextUid = 1;
  private statusCache: Map<number, ItemStatus> | null = null;
  private linkCache = new Map<Tier, Set<number>>();
  private planCache: Map<number, JobPlan> | null = null;

  constructor(funds = 0, site: Site = "remote") {
    this.funds = funds;
    this.site = site;
  }

  /**
   * A new base, as bought. A city base is a single front building in a city block, with no way down
   * until it's converted into an access point. A remote base is just the access lift.
   */
  static starter(site: Site = "city", seed = 7): BaseLayout {
    const b = new BaseLayout(4_000_000, site);
    if (site === "city") {
      b.insert({ uid: b.nextUid++, type: "frontBuilding", level: 0, x: 3, y: 3, w: 2, h: 2, workLeft: 0 });
      b.raiseCity(seed);
    } else {
      b.insert({ uid: b.nextUid++, type: "lift", level: 0, x: 4, y: 4, w: 1, h: 1, workLeft: 0 });
    }
    return b;
  }

  static load(data: SavedBase): BaseLayout {
    const b = new BaseLayout(data.funds, data.site ?? "remote");
    b.day = data.day;
    b.heat = data.heat ?? 0;
    for (const { daysLeft, workLeft, ...it } of data.items) b.insert({ ...it, workLeft: workLeft ?? (daysLeft ?? 0) * OLD_SAVE_CREW, uid: b.nextUid++ });
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

  /** How a price gets paid: scrap first, then money for the rest. */
  payment(cost: number): { scrap: number; money: number } {
    const scrap = Math.min(this.scrap, Math.ceil(cost / SCRAP_VALUE));
    return { scrap, money: Math.max(0, cost - scrap * SCRAP_VALUE) };
  }

  /** True if scrap and money together cover it. */
  canAfford(cost: number): boolean {
    return cost <= this.funds + this.scrap * SCRAP_VALUE;
  }

  /** Person-days to build, deeper digging taking longer. */
  work(type: RoomId, level: number): number {
    return Math.round(ROOMS[type].work * DEPTH_COST[level]);
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
    if (def.convertsFrom) {
      const from = ROOMS[def.convertsFrom];
      const target = this.itemAt(level, x, y);
      if (target?.type !== def.convertsFrom || target.x !== x || target.y !== y) {
        return def.convertsFrom === "frontBuilding" ? `Must be built in place of your ${from.name.toLowerCase()}` : `Must be fitted into a finished ${from.name.toLowerCase()}`;
      }
      if (target.workLeft) return `Finish the ${from.name.toLowerCase()} first`;
      return this.canAfford(this.cost(type, level)) ? null : "Not enough funds or scrap";
    }
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.itemAt(level, i, j)) return "Space already taken";
    if (!this.canAfford(this.cost(type, level))) return "Not enough funds or scrap";
    if (!this.hasEntrance()) {
      if (this.site === "city") return `Convert your ${ROOMS.frontBuilding.name.toLowerCase()} into an access point first`;
      return ROOMS[type].shaft && level === 0 ? null : "Start with a way down from the surface";
    }
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
    if (!opts.free) {
      const pay = this.payment(this.cost(type, level));
      this.scrap -= pay.scrap;
      this.funds -= pay.money;
    }
    let from: RoomId | undefined;
    if (ROOMS[type].convertsFrom) {
      from = this.itemAt(level, x, y)!.type;
      this.remove(this.itemAt(level, x, y)!);
    }
    const workLeft = opts.instant ? 0 : this.work(type, level);
    const item: Item = { uid: this.nextUid++, type, level, x, y, ...this.footprint(type, rotated), workLeft };
    // A city building being gutted is no use to anyone, but a shaft being fitted with stairs still has its ladders.
    if (workLeft && from && ROOMS[from].shaft) item.from = from;
    this.insert(item);
    return item;
  }

  /** Why this item can't be removed, or null. Demolition refunds nothing. */
  checkDemolish(uid: number): string | null {
    const it = this.items.get(uid);
    if (!it) return "Nothing there";
    if (ROOMS[it.type].owned) return "This is your base. Convert it into an access point instead";
    if (ROOMS[it.type].detritus && ROOMS[it.type].cost > this.funds) return "Not enough funds to clear it";
    if (ROOMS[it.type].shaft && it.level === 0) {
      const others = [...this.items.values()].some((o) => o !== it && ROOMS[o.type].shaft && o.level === 0);
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
    this.remove(it);
  }

  /** Why builders can't work on this job yet, or null if they can. */
  jobBlocker(it: Item): string | null {
    if (!it.workLeft || it.level === 0) return null;
    // Fitting out a shaft that's already in use.
    if (it.from && this.linked("shaft").has(it.uid)) return null;
    const def = ROOMS[it.type];
    const route = this.linked(def.heavy ? "lift" : "shaft");
    const reach = (o: Item) => route.has(o.uid) && !!ROOMS[this.asBuilt(o)!].conductor;
    const next = this.neighbours(it);
    if (def.shaft) next.push(...this.stackedShafts(it.level, it.x, it.y, it.w, it.h));
    if (next.some(reach)) return null;
    if (def.heavy && next.some((o) => this.linked("shaft").has(o.uid) && ROOMS[this.asBuilt(o)!].conductor)) {
      return "Needs a lift down to this level: the machinery won't fit down stairs";
    }
    return "Builders can't reach it yet: dig a way in first";
  }

  /**
   * Who works on what today. Builders take the jobs in the order they were placed, the most skilled
   * first, and each job only fits so many people; anyone left over moves on to the next job.
   */
  plan(): Map<number, JobPlan> {
    if (this.planCache) return this.planCache;
    const out = new Map<number, JobPlan>();
    const free = [...this.crew].sort((a, b) => b.skill - a.skill || a.id - b.id);
    for (const it of [...this.items.values()].filter((i) => i.workLeft).sort((a, b) => a.uid - b.uid)) {
      const blocked = this.jobBlocker(it);
      const crew = blocked ? [] : free.splice(0, it.w * it.h * CREW_PER_CELL);
      const rate = crew.reduce((n, b) => n + b.skill, 0);
      out.set(it.uid, { crew: crew.map((b) => b.id), rate, eta: rate > 0 ? Math.ceil(it.workLeft / rate - 1e-9) : null, blocked });
    }
    return (this.planCache = out);
  }

  /** A day of work by today's crew, and a day on the base's clock. Returns what finished building. */
  workDay(): Item[] {
    const done: Item[] = [];
    this.day++;
    for (const [uid, job] of this.plan()) {
      if (!job.rate) continue;
      const it = this.items.get(uid)!;
      it.workLeft = Math.max(0, it.workLeft - job.rate);
      if (it.workLeft < 1e-6) {
        it.workLeft = 0;
        delete it.from;
        done.push(it);
      }
    }
    this.invalidate();
    return done;
  }

  /** Days until the next job finishes with today's crew, or 0 if nothing is getting built. */
  nextCompletion(): number {
    let best = 0;
    for (const job of this.plan().values()) if (job.eta && (!best || job.eta < best)) best = job.eta;
    return best;
  }

  /** Builders sitting idle today because no job can take them. */
  idleBuilders(): number {
    let busy = 0;
    for (const job of this.plan().values()) busy += job.crew.length;
    return this.crew.length - busy;
  }

  /** Changes who's building here. */
  setCrew(crew: Builder[]): void {
    this.crew = crew;
    this.planCache = null;
  }

  status(uid: number): ItemStatus {
    return this.statuses().get(uid) ?? "isolated";
  }

  statuses(): Map<number, ItemStatus> {
    if (this.statusCache) return this.statusCache;
    const linked = this.linked("stairs");
    const out = new Map<number, ItemStatus>();
    // Generators feed linked rooms in the order they were built until the power runs out.
    let supply = 0;
    for (const it of this.items.values()) if (it.type === "generator" && !it.workLeft && linked.has(it.uid)) supply += powerSupply(it.level);
    for (const it of [...this.items.values()].sort((a, b) => a.uid - b.uid)) {
      if (ROOMS[it.type].detritus) continue;
      if (it.workLeft) out.set(it.uid, "building");
      else if (!linked.has(it.uid)) out.set(it.uid, this.linked("shaft").has(it.uid) ? "shaftOnly" : "isolated");
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
      if (role && !it.workLeft) cells[role] += it.w * it.h;
    }
    const total = Object.values(cells).reduce((a, b) => a + b, 0);
    const [role, top] = (Object.entries(cells) as [Role, number][]).sort((a, b) => b[1] - a[1])[0];
    const share = total ? top / total : 0;
    if (total < MIN_SPECIALIST_CELLS) return { role: null, share, bonus: 0, cells };
    const tier = SPECIALISM_TIERS.find((t) => share >= t.share);
    return { role: tier ? role : null, share, bonus: tier?.bonus ?? 0, cells };
  }

  stats(): BaseStats {
    const capacity: Record<Capacity, number> = { crew: 0, science: 0, engineering: 0, storage: 0, beds: 0, hangars: 0, containment: 0, defence: 0, food: 0 };
    let supply = 0;
    let demand = 0;
    let radar = 0;
    let building = 0;
    const linked = this.linked("stairs");
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

  /** What an item works as right now: itself once built, what it replaces while being converted, or nothing. */
  private asBuilt(it: Item): RoomId | null {
    if (!it.workLeft) return it.type;
    return it.from ?? null;
  }

  private tierOf(type: RoomId): number {
    return TIER_RANK[ROOMS[type].tier ?? "lift"];
  }

  /**
   * Built items with a route back to the surface entrance, using only shafts at least this good
   * between levels: builders can use any shaft, people need stairs, machinery needs a lift.
   */
  private linked(min: Tier): Set<number> {
    const cached = this.linkCache.get(min);
    if (cached) return cached;
    const need = TIER_RANK[min];
    const seen = new Set<number>();
    const queue: Item[] = [];
    for (const it of this.items.values()) {
      const t = this.asBuilt(it);
      if (t && ROOMS[t].shaft && it.level === 0) {
        seen.add(it.uid);
        queue.push(it);
      }
    }
    while (queue.length) {
      const it = queue.pop()!;
      const t = this.asBuilt(it)!;
      // Only tunnels and shafts pass people along; rooms are dead ends.
      if (!ROOMS[t].conductor) continue;
      const next: Item[] = this.neighbours(it).filter((o) => !ROOMS[o.type].detritus);
      if (ROOMS[t].shaft) {
        for (const o of this.stackedShafts(it.level, it.x, it.y, it.w, it.h)) {
          const ot = this.asBuilt(o);
          if (ot && Math.min(this.tierOf(t), this.tierOf(ot)) >= need) next.push(o);
        }
      }
      for (const o of next) {
        if (!this.asBuilt(o) || seen.has(o.uid)) continue;
        seen.add(o.uid);
        queue.push(o);
      }
    }
    this.linkCache.set(min, seen);
    return seen;
  }

  private invalidate() {
    this.statusCache = null;
    this.planCache = null;
    this.linkCache.clear();
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
    return !!ROOMS[type].shaft && this.stackedShafts(level, x, y, w, h).length > 0;
  }

  /** Lift shafts directly above or below any cell of this footprint. */
  private stackedShafts(level: number, x: number, y: number, w: number, h: number): Item[] {
    const out = new Set<Item>();
    for (const dl of [-1, 1]) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          const o = this.itemAt(level + dl, i, j);
          if (o && ROOMS[o.type].shaft) out.add(o);
        }
      }
    }
    return [...out];
  }

  /** A way in from the surface exists or is being built. */
  hasEntrance(): boolean {
    for (const it of this.items.values()) if (it.level === 0 && ROOMS[it.type].shaft) return true;
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
      if (free) this.insert({ uid: this.nextUid++, type, level: 0, x, y, w, h, workLeft: 0 });
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

  private remove(it: Item) {
    this.forCells(it, (i) => (this.cells[it.level][i] = 0));
    this.items.delete(it.uid);
    this.invalidate();
  }

  private insert(it: Item) {
    this.items.set(it.uid, it);
    this.forCells(it, (i) => (this.cells[it.level][i] = it.uid));
    this.invalidate();
  }

  private forCells(it: Item, fn: (index: number) => void) {
    for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) fn(j * GRID + i);
  }
}

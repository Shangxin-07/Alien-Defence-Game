import { BaseLayout, Item, SavedBase, Site } from "./base/layout";
import { CITIES, City } from "./geoscape/cities";
import { CAMPAIGN_START } from "./geoscape/clock";
import { DEG, LatLon } from "./geoscape/geo";
import { BUILDER_DAYS, LAB_BONUS, LIAISON, PROJECTS, Person, Project, ResearchState, blocker, fitToWork, project } from "./staff";
import type { Outcome } from "./tactical/battle";

export const DAY_MS = 86_400_000;
export const START_FUNDS = 4_000_000;
/** Command can't stretch further than this many bases. */
export const MAX_BASES = 8;
/** A site this close to a city centre is inside the city. */
export const CITY_RADIUS_KM = 120;
/** Bases closer than this would share the same patch of sky and the same patrols. */
export const MIN_SPACING_KM = 400;
/** Buying a city block through cut-outs costs more than claiming empty ground. The first base is paid for. */
export const FOUNDING_COST: Record<Site, number> = { city: 900_000, remote: 600_000 };

const EARTH_KM = 6371;
const NMI_KM = 1.852;
const CALLSIGNS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];

export interface BaseRecord {
  id: number;
  name: string;
  lat: number;
  lon: number;
  site: Site;
  /** The city hiding a covert base. */
  city?: string;
  layout: BaseLayout;
}

/** What a spot on the globe offers: the kind of base, or why there can't be one. */
export interface Survey {
  site: Site | null;
  city?: City;
  cost: number;
  /** Why a base can't go here, or null if it can. */
  reason: string | null;
}

export interface Completion {
  base: BaseRecord;
  item: Item;
}

/** How the opening night went, and what it brought home. */
export interface PrologueRecord {
  city: string;
  outcome: Outcome | "skipped";
  recovered: string[];
  survivors: number;
  turns: number;
}

export const prologueWon = (p: PrologueRecord | null) => p?.outcome === "captured" || p?.outcome === "killed";

interface SavedCampaign {
  version: 1;
  /** Missing in saves from before the prologue existed. */
  prologue?: PrologueRecord | null;
  /** Missing in saves from before staff existed. */
  staff?: Person[];
  research?: ResearchState;
  nextPerson?: number;
  time: number;
  funds: number;
  nextId: number;
  bases: (Omit<BaseRecord, "layout"> & { layout: SavedBase })[];
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Radar range in nautical miles as an angle at the Earth's centre, in radians. */
export const nmiToRadians = (nmi: number) => (nmi * NMI_KM) / EARTH_KM;

export function nearestCity(ll: LatLon): { city: City; km: number } {
  let best = { city: CITIES[0], km: Infinity };
  for (const city of CITIES) {
    const km = distanceKm(ll, city);
    if (km < best.km) best = { city, km };
  }
  return best;
}

/** Same number for the same text, so a city block looks the same every time it's founded. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The war as a whole: one clock, one purse and every base on the globe. */
export class Campaign {
  time = CAMPAIGN_START;
  funds = START_FUNDS;
  readonly bases: BaseRecord[] = [];
  /** Null until the prologue has been played or skipped. */
  prologue: PrologueRecord | null = null;
  /** Everyone working for you. */
  readonly staff: Person[] = [];
  research: ResearchState = { active: null, progress: {}, done: [] };
  /** Things that happened while the clock ran, for the screen to announce. */
  readonly news: string[] = [];
  private nextId = 1;
  private nextPerson = 1;
  /** Construction help carried over between days, per base. */
  private readonly buildCredit = new Map<number, number>();

  /** Records the prologue. A replay never throws away a better result. */
  recordPrologue(r: PrologueRecord): void {
    if (prologueWon(this.prologue) && !prologueWon(r)) return;
    if (this.prologue?.outcome === "captured" && r.outcome === "killed") return;
    this.prologue = r;
  }

  /** What came home from the prologue. */
  get recovered(): string[] {
    return this.prologue?.recovered ?? [];
  }

  /**
   * Takes on the people who walked out of the prologue, once. If nobody did, the council
   * sends a liaison, so there is always someone to do the work.
   */
  enlist(people: Omit<Person, "id" | "base" | "job">[]): void {
    if (this.staff.length) return;
    const base = this.bases[0]?.id ?? null;
    for (const p of people.length ? people : [LIAISON]) {
      this.staff.push({ ...p, stats: { ...p.stats }, id: this.nextPerson++, base, job: "research" });
    }
  }

  /** Whether some base can hold a live alien. */
  get containment(): boolean {
    return this.bases.some((b) => b.layout.stats().capacity.containment > 0);
  }

  /** Projects you could work on, with what's stopping each. Ones needing things you never got stay hidden. */
  projects(): { project: Project; blocker: string | null; progress: number }[] {
    return PROJECTS.filter((p) => !p.items || p.items.some((i) => this.recovered.includes(i))).map((p) => ({
      project: p,
      blocker: blocker(p, this.research, this.recovered, this.containment),
      progress: this.research.progress[p.id] ?? 0,
    }));
  }

  setResearch(id: string | null): void {
    if (id && blocker(project(id), this.research, this.recovered, this.containment)) throw new Error("Can't research that yet");
    this.research.active = id;
  }

  /** Research points a day from everyone on it, labs and research bases making it go faster. */
  researchRate(): number {
    let rate = 0;
    for (const p of this.staff) {
      if (p.job !== "research" || p.base === null || !fitToWork(p)) continue;
      const base = this.bases.find((b) => b.id === p.base);
      if (!base) continue;
      const lab = base.layout.stats().capacity.science > 0 ? LAB_BONUS : 0;
      const sp = base.layout.specialism();
      rate += p.aptitude * (1 + lab + (sp.role === "research" ? sp.bonus / 100 : 0));
    }
    return rate;
  }

  /** Days until the active project is done at today's rate, or null if it isn't moving. */
  researchEta(): number | null {
    const id = this.research.active;
    const rate = this.researchRate();
    if (!id || rate <= 0) return null;
    return Math.ceil((project(id).points - (this.research.progress[id] ?? 0)) / rate);
  }

  /** One day of everyone's work: healing, research and help on the building sites. */
  private workDay() {
    for (const p of this.staff) p.health = Math.min(p.stats.health, p.health + 1);
    const id = this.research.active;
    if (id) {
      const done = (this.research.progress[id] ?? 0) + this.researchRate();
      this.research.progress[id] = done;
      if (done >= project(id).points) {
        this.research.done.push(id);
        this.research.active = null;
        this.news.push(`Research complete: ${project(id).name}`);
      }
    }
    for (const base of this.bases) {
      const crew = this.staff.filter((p) => p.base === base.id && p.job === "construction" && fitToWork(p)).length;
      if (!crew) continue;
      let credit = (this.buildCredit.get(base.id) ?? 0) + crew * BUILDER_DAYS;
      // Builders bring forward whatever is closest to done; the day tick itself finishes it.
      while (credit >= 1) {
        const next = [...base.layout.items.values()].filter((it) => it.daysLeft > 1).sort((a, b) => a.daysLeft - b.daysLeft)[0];
        if (!next) break;
        next.daysLeft--;
        credit--;
      }
      this.buildCredit.set(base.id, Math.min(credit, 1));
    }
  }

  /** Whole days since the campaign began. Construction moves on at each day boundary. */
  get day(): number {
    return Math.floor((this.time - CAMPAIGN_START) / DAY_MS);
  }

  /** Anywhere near a city counts as that city (even a click that lands in its harbour); otherwise open land. */
  survey(ll: LatLon, land: boolean): Survey {
    const near = nearestCity(ll);
    const site: Site | null = near.km <= CITY_RADIUS_KM ? "city" : land ? "remote" : null;
    const city = site === "city" ? near.city : undefined;
    if (city) ll = city;
    const cost = site && this.bases.length ? FOUNDING_COST[site] : 0;
    const out = (reason: string | null): Survey => ({ site, city, cost, reason });
    if (!site) return out("Bases need dry land");
    if (this.bases.length >= MAX_BASES) return out(`Command can't run more than ${MAX_BASES} bases`);
    if (!this.bases.length && site !== "city") return out("The first base has to be hidden in a city");
    const crowded = this.bases.find((b) => distanceKm(ll, b) < MIN_SPACING_KM);
    if (crowded) return out(`Too close to ${crowded.name}`);
    if (cost > this.funds) return out("Not enough funds");
    return out(null);
  }

  found(ll: LatLon, land: boolean): BaseRecord {
    const s = this.survey(ll, land);
    if (s.reason) throw new Error(s.reason);
    const seed = hash(s.city?.name ?? `${ll.lat.toFixed(1)},${ll.lon.toFixed(1)}`);
    const layout = BaseLayout.starter(s.site!, seed);
    layout.day = this.day;
    this.funds -= s.cost;
    // A covert base sits under the city itself.
    if (s.city) ll = { lat: s.city.lat, lon: s.city.lon };
    const id = this.nextId++;
    const base: BaseRecord = {
      id,
      name: `Base ${CALLSIGNS[(id - 1) % CALLSIGNS.length]}`,
      lat: ll.lat,
      lon: ll.lon,
      site: s.site!,
      city: s.city?.name,
      layout,
    };
    this.bases.push(base);
    // The first base takes in everyone who has been waiting for a roof.
    for (const p of this.staff) if (p.base === null) p.base = id;
    return base;
  }

  /** Lends the shared purse to a base while you build in it. Call `settle` after every change. */
  open(base: BaseRecord): BaseLayout {
    base.layout.funds = this.funds;
    return base.layout;
  }

  settle(base: BaseRecord): void {
    this.funds = base.layout.funds;
  }

  /** Runs the clock to a new time; construction in every base moves on a day at a time. */
  advanceTo(time: number): Completion[] {
    const before = this.day;
    this.time = Math.max(this.time, time);
    const days = this.day - before;
    if (days <= 0) return [];
    const done: Completion[] = [];
    for (let d = 0; d < days; d++) {
      this.workDay();
      for (const base of this.bases) for (const item of base.layout.advance(1)) done.push({ base, item });
    }
    return done;
  }

  advanceDays(days: number): Completion[] {
    // Land just after the day boundary so a partial day already elapsed isn't lost or double counted.
    const target = CAMPAIGN_START + (this.day + days) * DAY_MS;
    return this.advanceTo(Math.max(target, this.time));
  }

  /** Radar cover of each base, for drawing on the globe. */
  radar(): { lat: number; lon: number; nmi: number }[] {
    return this.bases.map((b) => ({ lat: b.lat, lon: b.lon, nmi: b.layout.stats().radar })).filter((r) => r.nmi > 0);
  }

  save(): SavedCampaign {
    return {
      version: 1,
      time: this.time,
      funds: this.funds,
      nextId: this.nextId,
      prologue: this.prologue,
      staff: this.staff,
      research: this.research,
      nextPerson: this.nextPerson,
      bases: this.bases.map((b) => ({ ...b, layout: b.layout.save() })),
    };
  }

  static load(data: SavedCampaign): Campaign {
    if (data.version !== 1) throw new Error("Unknown save version");
    const c = new Campaign();
    c.time = data.time;
    c.funds = data.funds;
    c.nextId = data.nextId;
    c.prologue = data.prologue ?? null;
    c.nextPerson = data.nextPerson ?? 1;
    if (data.research) c.research = data.research;
    if (data.staff) c.staff.push(...data.staff);
    else if (c.prologue) {
      // Saves from before staff existed: the survivors are there, but we never kept who they were.
      const n = c.prologue.survivors;
      c.enlist(Array.from({ length: n }, (_, i) => ({ ...LIAISON, name: `Survivor ${i + 1}`, role: "Survivor" })));
    }
    for (const b of data.bases) c.bases.push({ ...b, layout: BaseLayout.load(b.layout) });
    for (const p of c.staff) if (p.base === null && c.bases[0]) p.base = c.bases[0].id;
    return c;
  }
}

import { BaseLayout, Builder, Item, SavedBase, Site } from "./base/layout";
import { CITIES, City } from "./geoscape/cities";
import { CAMPAIGN_START } from "./geoscape/clock";
import { DEG, LatLon } from "./geoscape/geo";
import {
  DESERT_AFTER, DESERT_CHANCE, MAX_RUN_DAYS, MAX_TEAM, MEDICINE_HEAL, PICKED_PER_DAY, MIN_RICHNESS, RATION, RECOVER_PER_DAY, Run, SITES,
  START_SUPPLIES, SiteId, Supplies, addSupplies, dayLoot, dayRisk, describeSupplies, emptySupplies,
} from "./scavenge";
import { LAB_BONUS, LIAISON, PROJECTS, Person, Project, ResearchState, blocker, buildSkill, fitToWork, project, workPace } from "./staff";
import type { Outcome } from "./tactical/battle";

export const DAY_MS = 86_400_000;
/** Nobody is paying you yet: the opening is built by hand. */
export const START_FUNDS = 0;
/** Until governments take notice, the council sends what it can scrape together, once a month. */
export const GRANT = 1_000_000;
export const GRANT_DAYS = 30;
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

/** How a fight on a scavenging run ended, and who walked away. */
export interface AmbushResult {
  outcome: Outcome;
  /** Survivors by person id, with what health they have left. */
  people: { id: number; health: number }[];
}

/** What a run brings home from a fight that went each way, beyond its finds. */
const AMBUSH_SPOILS: Record<Outcome, { share: number; item?: string }> = {
  captured: { share: 1, item: "Live alien" },
  killed: { share: 1, item: "Alien corpse" },
  fled: { share: 0.5 },
  wiped: { share: 0 },
};

interface SavedCampaign {
  version: 1;
  /** Missing in saves from before scavenging existed. */
  supplies?: Supplies;
  runs?: Run[];
  nextRun?: number;
  richness?: Partial<Record<SiteId, number>>;
  trophies?: string[];
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
  /** Food, medicine and scrap in the stores. Scrap is lent to bases like funds. */
  supplies: Supplies = { ...START_SUPPLIES };
  /** Scavenging runs out in the city. */
  readonly runs: Run[] = [];
  /** How much is left to find at each kind of place, 1 = untouched. */
  richness: Partial<Record<SiteId, number>> = {};
  /** Alien remains and prisoners brought back since the prologue. */
  readonly trophies: string[] = [];
  /** Dice for runs and hunger. Swappable so tests can fix them. */
  rand: () => number = Math.random;
  private nextId = 1;
  private nextPerson = 1;
  private nextRun = 1;

  /** Records the prologue. A replay never throws away a better result. */
  recordPrologue(r: PrologueRecord): void {
    if (prologueWon(this.prologue) && !prologueWon(r)) return;
    if (this.prologue?.outcome === "captured" && r.outcome === "killed") return;
    this.prologue = r;
  }

  /** Alien tech and remains on hand, from the prologue and since. */
  get recovered(): string[] {
    return [...new Set([...(this.prologue?.recovered ?? []), ...this.trophies])];
  }

  /** A run waiting on the player because it ran into an alien. The clock holds until it's dealt with. */
  get ambush(): Run | undefined {
    return this.runs.find((r) => r.ambush);
  }

  /** Days the food lasts at today's headcount. */
  get foodDays(): number {
    return this.staff.length ? Math.floor(this.supplies.food / (RATION * this.staff.length)) : Infinity;
  }

  /** Who's free to go out: at a base, not already out, and not too hurt. */
  canScavenge(p: Person): boolean {
    return p.base !== null && !p.away && fitToWork(p);
  }

  /** Why this run can't go, or null if it can. */
  checkRun(site: SiteId, team: number[], days: number): string | null {
    if (!this.bases.length) return "You need a base to go out from";
    if (!SITES[site]) return "No such place";
    if (!team.length) return "Pick who goes";
    if (team.length > MAX_TEAM) return `No more than ${MAX_TEAM} on a run`;
    if (!Number.isInteger(days) || days < 1 || days > MAX_RUN_DAYS) return `Runs last 1 to ${MAX_RUN_DAYS} days`;
    for (const id of team) {
      const p = this.staff.find((x) => x.id === id);
      if (!p || !this.canScavenge(p)) return `${p?.name ?? "Someone"} can't go`;
    }
    return null;
  }

  /** Sends people out. They stop their other work until they're back. */
  startRun(site: SiteId, team: number[], days: number): Run {
    const reason = this.checkRun(site, team, days);
    if (reason) throw new Error(reason);
    const run: Run = { id: this.nextRun++, site, team: [...new Set(team)], daysLeft: days, loot: emptySupplies() };
    for (const id of run.team) this.person(id)!.away = run.id;
    this.runs.push(run);
    for (const base of this.bases) base.layout.setCrew(this.builders(base.id));
    return run;
  }

  /** The fight is over: the dead stay behind, the living come home with whatever they kept. */
  resolveAmbush(result: AmbushResult): void {
    const run = this.ambush;
    if (!run) throw new Error("No fight to resolve");
    const alive = new Map(result.people.map((p) => [p.id, p.health]));
    const dead = run.team.filter((id) => !alive.has(id)).map((id) => this.person(id)!);
    for (const p of dead) this.staff.splice(this.staff.indexOf(p), 1);
    for (const [id, health] of alive) {
      const p = this.person(id);
      if (p) p.health = Math.max(1, Math.min(p.stats.health, health));
    }
    run.team = run.team.filter((id) => alive.has(id));
    const spoils = AMBUSH_SPOILS[result.outcome];
    if (spoils.item && !this.trophies.includes(spoils.item)) this.trophies.push(spoils.item);
    if (dead.length) this.news.push(`Lost on the run: ${dead.map((p) => p.name).join(", ")}`);
    this.endRun(run, spoils.share);
    this.backfill();
  }

  /** Run for it instead of fighting: drop everything, and maybe get hurt getting away. */
  fleeAmbush(): void {
    const run = this.ambush;
    if (!run) throw new Error("No fight to run from");
    for (const id of run.team) {
      const p = this.person(id)!;
      if (this.rand() < 0.4) p.health = Math.max(1, p.health - Math.ceil(p.stats.health * (0.2 + this.rand() * 0.2)));
    }
    this.endRun(run, 0);
  }

  private person(id: number): Person | undefined {
    return this.staff.find((p) => p.id === id);
  }

  /** Brings a run home with a share of what it found. */
  private endRun(run: Run, share = 1) {
    const kept = emptySupplies();
    addSupplies(kept, run.loot, share);
    addSupplies(this.supplies, kept);
    for (const id of run.team) {
      const p = this.person(id);
      if (p) delete p.away;
    }
    this.runs.splice(this.runs.indexOf(run), 1);
    if (run.team.length) this.news.push(`Back from the ${SITES[run.site].name.toLowerCase()}: ${describeSupplies(kept)}`);
  }

  /** If everyone is gone, the council sends someone: losing people is never the end. */
  private backfill() {
    if (this.staff.length) return;
    this.staff.push({ ...LIAISON, stats: { ...LIAISON.stats }, id: this.nextPerson++, base: this.bases[0]?.id ?? null, job: "construction" });
    this.news.push("With nobody left, the council sends a liaison");
  }

  /** One day of a run: finds, or trouble. */
  private runDay(run: Run) {
    const size = run.team.length;
    if (this.rand() < dayRisk(run.site, size)) {
      if (this.rand() < 0.5) {
        // Someone gets hurt: a fall, a fight with other scavengers, a collapse. They come home now.
        const p = this.person(run.team[Math.floor(this.rand() * size)])!;
        p.health = Math.max(1, p.health - Math.ceil(p.stats.health * (0.25 + this.rand() * 0.25)));
        this.news.push(`${p.name} was hurt at the ${SITES[run.site].name.toLowerCase()}`);
        this.endRun(run);
      } else {
        run.ambush = true;
        this.news.push(`The run to the ${SITES[run.site].name.toLowerCase()} has run into an alien`);
      }
      return;
    }
    const rich = this.richness[run.site] ?? 1;
    addSupplies(run.loot, dayLoot(run.site, size, rich, this.rand));
    this.richness[run.site] = Math.max(MIN_RICHNESS, rich - PICKED_PER_DAY);
    if (--run.daysLeft <= 0) this.endRun(run);
  }

  /** Everyone eats; whoever can't goes hungry, and the long hungry start to leave. */
  private eat() {
    let food = this.supplies.food;
    for (const p of [...this.staff].sort((a, b) => a.id - b.id)) {
      if (food >= RATION) {
        food -= RATION;
        p.hunger = 0;
      } else p.hunger = (p.hunger ?? 0) + 1;
    }
    this.supplies.food = food;
    const hungry = this.staff.filter((p) => p.hunger);
    if (hungry.length) this.news.push(`${hungry.length} went hungry today`);
    for (const p of hungry) {
      if (this.staff.length <= 1 || p.away || (p.hunger ?? 0) < DESERT_AFTER || this.rand() >= DESERT_CHANCE) continue;
      this.staff.splice(this.staff.indexOf(p), 1);
      this.news.push(`${p.name} left to find food elsewhere`);
    }
  }

  /**
   * Takes on the people who walked out of the prologue, once. If nobody did, the council
   * sends a liaison, so there is always someone to do the work.
   */
  enlist(people: Omit<Person, "id" | "base" | "job">[]): void {
    if (this.staff.length) return;
    const base = this.bases[0]?.id ?? null;
    // One keeps the notes, everyone else digs. The first job is getting underground.
    (people.length ? people : [LIAISON]).forEach((p, i) => {
      this.staff.push({ ...p, stats: { ...p.stats }, id: this.nextPerson++, base, job: i === 0 ? "research" : "construction" });
    });
  }

  /** Everyone fit and on construction at a base. */
  builders(baseId: number): Builder[] {
    return this.staff
      .filter((p) => p.base === baseId && p.job === "construction" && !p.away && fitToWork(p))
      .map((p) => ({ id: p.id, skill: buildSkill(p) * workPace(p) }));
  }

  /** Moves someone to another base. They start work there the next day. */
  transfer(personId: number, baseId: number): void {
    const p = this.staff.find((x) => x.id === personId);
    if (!p || !this.bases.some((b) => b.id === baseId)) throw new Error("No such person or base");
    p.base = baseId;
  }

  /** Days until the council's next grant. */
  get nextGrant(): number {
    return GRANT_DAYS - (this.day % GRANT_DAYS);
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
      if (p.job !== "research" || p.base === null || p.away || !fitToWork(p)) continue;
      const base = this.bases.find((b) => b.id === p.base);
      if (!base) continue;
      const lab = base.layout.stats().capacity.science > 0 ? LAB_BONUS : 0;
      const sp = base.layout.specialism();
      rate += p.aptitude * workPace(p) * (1 + lab + (sp.role === "research" ? sp.bonus / 100 : 0));
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

  /** One day of everyone's work: healing, research and the building sites. `day` is the day it ends on. */
  private workDay(day: number): Completion[] {
    this.eat();
    for (const p of this.staff) {
      if (p.hunger) continue;
      let heal = 1;
      // Medicine goes to whoever is too hurt to work, while it lasts.
      if (!fitToWork(p) && !p.away && this.supplies.medicine > 0) {
        this.supplies.medicine--;
        heal += MEDICINE_HEAL;
      }
      p.health = Math.min(p.stats.health, p.health + heal);
    }
    for (const run of [...this.runs]) if (!run.ambush) this.runDay(run);
    for (const k of Object.keys(this.richness) as SiteId[]) this.richness[k] = Math.min(1, this.richness[k]! + RECOVER_PER_DAY);
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
    const done: Completion[] = [];
    for (const base of this.bases) {
      base.layout.setCrew(this.builders(base.id));
      for (const item of base.layout.workDay()) done.push({ base, item });
    }
    if (day > 0 && day % GRANT_DAYS === 0) {
      this.funds += GRANT;
      this.news.push(`The council sends $${(GRANT / 1e6).toFixed(1)}M`);
    }
    return done;
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
    base.layout.scrap = this.supplies.scrap;
    base.layout.setCrew(this.builders(base.id));
    return base.layout;
  }

  settle(base: BaseRecord): void {
    this.funds = base.layout.funds;
    this.supplies.scrap = base.layout.scrap;
  }

  /** Runs the clock to a new time; construction in every base moves on a day at a time. */
  advanceTo(time: number): Completion[] {
    if (this.ambush) return [];
    const before = this.day;
    this.time = Math.max(this.time, time);
    const days = this.day - before;
    if (days <= 0) return [];
    const done: Completion[] = [];
    for (let d = 1; d <= days; d++) {
      done.push(...this.workDay(before + d));
      // Everything waits while a run is in a fight.
      if (this.ambush) {
        this.time = CAMPAIGN_START + (before + d) * DAY_MS;
        break;
      }
    }
    for (const base of this.bases) base.layout.setCrew(this.builders(base.id));
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
      supplies: this.supplies,
      runs: this.runs,
      nextRun: this.nextRun,
      richness: this.richness,
      trophies: this.trophies,
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
    if (data.supplies) c.supplies = { ...data.supplies };
    if (data.runs) c.runs.push(...data.runs);
    c.nextRun = data.nextRun ?? 1;
    c.richness = { ...data.richness };
    if (data.trophies) c.trophies.push(...data.trophies);
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

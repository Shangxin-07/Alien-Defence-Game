import { BaseLayout, Builder, Item, SavedBase, Site } from "./base/layout";
import { CITIES, City } from "./geoscape/cities";
import { CAMPAIGN_START } from "./geoscape/clock";
import { DEG, LatLon } from "./geoscape/geo";
import {
  BROKEN_PENALTY, CANDIDATE_CHANCE, Candidate, DRIFTER_CHANCE, DRIFTER_LOYALTY, FAMILY_HUNGER_PENALTY, KEPT_BONUS, LEAVE_BELOW, LONG_PROMISE_DAYS,
  MEDICINE_DAYS, Pledge, RECRUIT_LOYALTY, STEAL_BELOW, rollCandidate, rollDrifter,
} from "./recruit";
import {
  MAX_RECRUITERS, DESERT_AFTER, DESERT_CHANCE, MAX_RUN_DAYS, MAX_TEAM, MEDICINE_HEAL, PICKED_PER_DAY, MIN_RICHNESS, RATION, RECOVER_PER_DAY, Run, SITES,
  MARKET_EASE, MARKET_RISE, START_SUPPLIES, SiteId, Supplies, Traded, addSupplies, marketCost, dayLoot, dayRisk, describeSupplies, emptySupplies,
} from "./scavenge";
import { ROOMS } from "./base/rooms";
import { LAB_BONUS, LIAISON, PROJECTS, Person, Project, ResearchState, blocker, buildSkill, fitToWork, project, workPace } from "./staff";
import type { Outcome } from "./tactical/battle";

export const DAY_MS = 86_400_000;
/** Nobody is paying you yet: the opening is built by hand. */
export const START_FUNDS = 0;
/** Until governments take notice, the council sends what it can scrape together, once a month. */
export const GRANT = 1_000_000;
export const GRANT_DAYS = 30;
/** Days a hydroponic farm has to run before its first crop comes in. */
export const CROP_DAYS = 12;
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
  candidates?: Candidate[];
  pledges?: Pledge[];
  kills?: number;
  nextCandidate?: number;
  market?: Record<Traded, number>;
  crops?: Record<string, number>;
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
  /** People recruiters have met, waiting for an answer. */
  readonly candidates: Candidate[] = [];
  /** Promises made to recruits. */
  readonly pledges: Pledge[] = [];
  /** Aliens killed or caught since the prologue. */
  kills = 0;
  /** How far each black-market price has been pushed up: 1 is the going rate. */
  market: Record<Traded, number> = { food: 1, medicine: 1 };
  /** Days each hydroponic farm has been running, by "base:uid". */
  crops: Record<string, number> = {};
  private nextCandidate = 1;
  /** The day being worked through, while the clock runs over several. */
  private today = 0;
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
    const mouths = this.mouths;
    return mouths ? Math.floor(this.supplies.food / (RATION * mouths)) : Infinity;
  }

  /** Everyone who eats: staff and the families that came with them. */
  get mouths(): number {
    return this.staff.reduce((n, p) => n + 1 + (p.dependants ?? 0), 0);
  }

  /** Sends one or two people out to find recruits. Works like a run, and can go wrong like one. */
  startRecruiting(team: number[], days: number): Run {
    if (team.length > MAX_RECRUITERS) throw new Error(`No more than ${MAX_RECRUITERS} recruiters at once`);
    const run = this.startRun("streets", team, days);
    run.recruit = true;
    return run;
  }

  /** Why this candidate can't be taken on, or null. */
  checkCandidate(id: number): string | null {
    const c = this.candidates.find((x) => x.id === id);
    if (!c) return "They've gone";
    if (c.wants === "food" && this.supplies.food < c.amount) return `Needs ${c.amount} food you don't have`;
    return null;
  }

  /** Takes a candidate on and makes them the promise they asked for. */
  accept(id: number): Person {
    const reason = this.checkCandidate(id);
    if (reason) throw new Error(reason);
    const c = this.candidates.find((x) => x.id === id)!;
    this.candidates.splice(this.candidates.indexOf(c), 1);
    const base = this.bases.some((b) => b.id === c.base) ? c.base : (this.bases[0]?.id ?? null);
    const p: Person = {
      id: this.nextPerson++, name: c.name, role: c.role, stats: { ...c.stats }, health: c.stats.health, aptitude: c.aptitude, build: c.build,
      base, job: "construction", loyalty: c.wants === "none" ? DRIFTER_LOYALTY : RECRUIT_LOYALTY,
    };
    if (c.wants === "food") this.supplies.food -= c.amount;
    if (c.wants === "family") p.dependants = c.amount;
    if (c.wants === "medicine") this.pledges.push({ person: p.id, wants: "medicine", amount: c.amount, due: this.day + MEDICINE_DAYS });
    if (c.wants === "revenge") this.pledges.push({ person: p.id, wants: "revenge", amount: 0, due: this.day + LONG_PROMISE_DAYS, kills: this.kills });
    if (c.wants === "bed") this.pledges.push({ person: p.id, wants: "bed", amount: 0, due: this.day + LONG_PROMISE_DAYS });
    this.staff.push(p);
    for (const b of this.bases) b.layout.setCrew(this.builders(b.id));
    return p;
  }

  turnAway(id: number): void {
    const i = this.candidates.findIndex((x) => x.id === id);
    if (i >= 0) this.candidates.splice(i, 1);
  }

  /** Checks promises: kept ones earn loyalty, broken ones cost it. */
  private keepPromises(day: number) {
    for (const pl of [...this.pledges]) {
      const p = this.person(pl.person);
      if (!p) {
        this.pledges.splice(this.pledges.indexOf(pl), 1);
        continue;
      }
      let kept = false;
      if (pl.wants === "medicine" && this.supplies.medicine >= pl.amount) {
        this.supplies.medicine -= pl.amount;
        kept = true;
      } else if (pl.wants === "revenge") kept = this.kills > (pl.kills ?? 0);
      else if (pl.wants === "bed") kept = this.bases.some((b) => b.layout.stats().capacity.crew > 0);
      if (kept) {
        p.loyalty = Math.min(100, (p.loyalty ?? 100) + KEPT_BONUS);
        this.news.push(`Promise kept to ${p.name}`);
      } else if (day > pl.due) {
        p.loyalty = Math.max(0, (p.loyalty ?? 100) - BROKEN_PENALTY);
        this.news.push(`Promise broken: ${p.name} was told ${pl.wants === "medicine" ? "there'd be medicine" : pl.wants === "bed" ? "there'd be a bed" : "they'd get their revenge"}`);
      } else continue;
      this.pledges.splice(this.pledges.indexOf(pl), 1);
    }
  }

  /** People whose loyalty has run out leave, and the bitterest take food with them. Never the last one. */
  private disloyal() {
    for (const p of [...this.staff]) {
      if (p.loyalty === undefined || p.loyalty >= LEAVE_BELOW || p.away || this.staff.length <= 1) continue;
      this.staff.splice(this.staff.indexOf(p), 1);
      let took = "";
      if (p.loyalty < STEAL_BELOW) {
        const food = Math.min(this.supplies.food, 5 * (1 + (p.dependants ?? 0)));
        this.supplies.food -= food;
        if (food) took = `, taking ${food} food`;
      }
      this.news.push(`${p.name} walked out${p.dependants ? " with their family" : ""}${took}`);
    }
  }

  /** A recruiter's day on the streets: maybe someone worth talking to, maybe someone desperate. */
  private recruitDay(run: Run) {
    const base = this.person(run.team[0])?.base ?? this.bases[0].id;
    for (let i = 0; i < run.team.length; i++) {
      if (this.rand() < CANDIDATE_CHANCE) this.candidates.push(rollCandidate(this.nextCandidate++, base, this.today, this.rand));
      if (this.rand() < DRIFTER_CHANCE) this.candidates.push(rollDrifter(this.nextCandidate++, base, this.today, this.rand));
    }
  }

  /** Who's free to go out: at a base, not already out, and not too hurt. */
  /** What the next lot of `n` costs on the black market. */
  buyCost(kind: Traded, n: number): number {
    return marketCost(kind, n, this.market[kind]);
  }

  checkBuy(kind: Traded, n: number): string | null {
    return this.buyCost(kind, n) > this.funds ? "Not enough money" : null;
  }

  buy(kind: Traded, n: number): void {
    const reason = this.checkBuy(kind, n);
    if (reason) throw new Error(reason);
    this.funds -= this.buyCost(kind, n);
    this.supplies[kind] += n;
    this.market[kind] *= MARKET_RISE ** n;
  }

  /** Farms that have run long enough bring in food; ones that stop running just wait. */
  private harvest() {
    for (const base of this.bases) {
      for (const it of base.layout.items.values()) {
        const food = ROOMS[it.type].provides.food;
        if (!food || base.layout.status(it.uid) !== "online") continue;
        const key = `${base.id}:${it.uid}`;
        const days = (this.crops[key] = (this.crops[key] ?? 0) + 1);
        if (days === CROP_DAYS) this.news.push(`First crop in at ${base.name}`);
        if (days >= CROP_DAYS) this.supplies.food += food;
      }
    }
  }

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
    if (spoils.item) this.kills++;
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
    if (!run.team.length) return;
    if (run.recruit) {
      const met = this.candidates.length;
      this.news.push(`Back from the streets${met ? `: ${met} ${met === 1 ? "person wants" : "people want"} to talk` : ", with nobody"}`);
    } else this.news.push(`Back from the ${SITES[run.site].name.toLowerCase()}: ${describeSupplies(kept)}`);
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
    if (run.recruit) {
      this.recruitDay(run);
      if (--run.daysLeft <= 0) this.endRun(run);
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
    // Families eat after the workers. When they go without, the one who brought them remembers.
    let unfed = 0;
    for (const p of this.staff) {
      for (let d = 0; d < (p.dependants ?? 0); d++) {
        if (food >= RATION) food -= RATION;
        else {
          unfed++;
          if (d === 0 && p.loyalty !== undefined) p.loyalty = Math.max(0, p.loyalty - FAMILY_HUNGER_PENALTY);
        }
      }
    }
    if (unfed) this.news.push(`${unfed} of the families went hungry`);
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
    this.today = day;
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
    this.keepPromises(day);
    this.disloyal();
    for (let i = this.candidates.length - 1; i >= 0; i--) if (this.candidates[i].until < day) this.candidates.splice(i, 1);
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
    this.harvest();
    for (const k of Object.keys(this.market) as Traded[]) this.market[k] = 1 + (this.market[k] - 1) * MARKET_EASE;
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
      candidates: this.candidates,
      pledges: this.pledges,
      kills: this.kills,
      nextCandidate: this.nextCandidate,
      market: this.market,
      crops: this.crops,
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
    if (data.candidates) c.candidates.push(...data.candidates);
    if (data.pledges) c.pledges.push(...data.pledges);
    c.kills = data.kills ?? 0;
    c.nextCandidate = data.nextCandidate ?? 1;
    if (data.market) c.market = { ...data.market };
    c.crops = { ...data.crops };
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

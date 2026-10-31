import { Duty, Hold, allowedJob, dutyClash, dutyOf, jobDuty } from "./allocation";
import {
  GEAR, GUNS, GearId, Kit, MEDIKIT_COST, MEDIKIT_RESTOCK, Quarters, Request, Stores, defaultRequest, arrivalKit, emptyStores, kitWarnings,
  legacyKit, noKit, outfit, rollArms, usable,
} from "./armoury";
import { BaseLayout, Builder, Item, Site } from "../base/layout";
import { CITIES, City, nearestCity } from "../geoscape/cities";
import { CAMPAIGN_START } from "../geoscape/clock";
import { LatLon, distanceKm } from "../geoscape/geo";
import {
  BROKEN_PENALTY, CANDIDATE_CHANCE, Candidate, DRIFTER_CHANCE, DRIFTER_LOYALTY, FAMILY_HUNGER_PENALTY, KEPT_BONUS, LEAVE_BELOW, LONG_PROMISE_DAYS,
  MEDICINE_DAYS, Pledge, RECRUIT_LOYALTY, STEAL_BELOW, rollCandidate, rollDrifter,
} from "./recruit";
import {
  MAX_RECRUITERS, MAX_SEARCHERS, DESERT_AFTER, DESERT_CHANCE, MAX_RUN_DAYS, MAX_TEAM, MEDICINE_HEAL, Place, RATION, Run, SEARCH_CHANCE,
  MARKET_EASE, MARKET_RISE, START_SUPPLIES, SiteId, Supplies, Traded, addSupplies, isEmpty, marketCost, placeless, rollPlace, runWhere, startPlaces, dayLoot, dayRisk, describeSupplies, emptySupplies,
} from "./scavenge";
import { ROOMS } from "../base/rooms";
import {
  CALL_CHANCE, CAR_SCRAP, CAR_SEATS, CAR_WORK, Call, HOUR_MS, MAX_MECHANICS, SIGHTING_LOYALTY, SIGHTING_SCRAP, TRAIL_HOURS, Travel, Vehicle,
  carName, freshness, rollCall, travelHours, tripFuel,
} from "./sightings";
import { Job, LAB_BONUS, LIAISON, PROJECTS, Person, Project, ResearchState, blocker, buildSkill, fitToWork, project, workPace } from "./staff";
import { Habits, adaptNews, learn, noHabits, observe } from "../tactical/adapt";
import type { RaceId } from "../tactical/aliens";
import type { Outcome, Tally } from "../tactical/battle";
import { hashText } from "../tactical/random";
import { SavedCampaign, restore, toSave } from "./save";

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
  /** One item per alien brought down. Missing means the old rule: one body or prisoner for a win. */
  recovered?: string[];
  /** Who you fought, so your people learn to read them. */
  race?: RaceId;
  /** Survivors by person id, with what health they have left and what they came out carrying. */
  people: { id: number; health: number; kit?: Kit }[];
  /** How your people fought, for the aliens to learn from. */
  tally?: Tally;
  /** Whether the one giving the orders went down: a race learns less from a fight it lost its commander in. */
  commanderDown?: boolean;
}

/** What a run brings home from a fight that went each way, beyond its finds. */
const AMBUSH_SPOILS: Record<Outcome, { share: number; item?: string }> = {
  captured: { share: 1, item: "Live alien" },
  killed: { share: 1, item: "Alien corpse" },
  fled: { share: 0.5 },
  wiped: { share: 0 },
};


/** The city a base hides under, or the nearest one to a remote base. */
function cityOf(b: BaseRecord | undefined): City {
  if (!b) return CITIES[0];
  return CITIES.find((c) => c.name === b.city) ?? CITIES.reduce((best, c) => (Math.hypot(c.lat - b.lat, c.lon - b.lon) < Math.hypot(best.lat - b.lat, best.lon - b.lon) ? c : best));
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
  /** Places the survivors know about, and what's left in each. Empty ones are forgotten. */
  places: Place[] = startPlaces();
  /** The next free id for each kind of record. Kept in the save. */
  readonly ids = { base: 1, person: 1, run: 1, place: this.places.length + 1, candidate: 1, call: 1, vehicle: 1 };
  /** Alien remains and prisoners brought back since the prologue. */
  readonly trophies: string[] = [];
  /** People recruiters have met, waiting for an answer. */
  readonly candidates: Candidate[] = [];
  /** Promises made to recruits. */
  readonly pledges: Pledge[] = [];
  /** Aliens killed or caught since the prologue. */
  kills = 0;
  /** Fights fought against each race. Experience is how your people learn to read them. */
  encounters: Partial<Record<RaceId, number>> = {};
  /** What each race has learned about how you fight. */
  learned: Partial<Record<RaceId, Habits>> = {};
  /** How far each black-market price has been pushed up: 1 is the going rate. */
  market: Record<Traded, number> = { food: 1, medicine: 1, fuel: 1, ammo: 1 };
  /** Guns, armour and kit on the shelves, not counting spare clips, which are in the supplies. */
  armoury: Stores = emptyStores();
  /** Part-used clips emptied back into the stores, in clips. Every whole one is repacked. */
  looseClips = 0;
  /** Days each hydroponic farm has been running, by "base:uid". */
  crops: Record<string, number> = {};
  /** Sightings people have called in, including ones not seen yet (they show from their `at`). */
  readonly calls: Call[] = [];
  readonly vehicles: Vehicle[] = [];
  /** The day being worked through, while the clock runs over several. */
  private today = 0;
  /** Dice for runs and hunger. Swappable so tests can fix them. */
  rand: () => number = Math.random;

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

  // ---------- Armoury ----------

  /** What someone has asked the quartermaster for: their own request, or their role's default. */
  requestOf(p: Person): Request {
    return p.request ?? defaultRequest(p.role);
  }

  /** The stores as the quartermaster sees them. Write them back with `stow` after any change. */
  private quarters(): Quarters {
    return { stores: this.armoury, ammo: this.supplies.ammo, loose: this.looseClips, medicine: this.supplies.medicine, researched: this.research.done };
  }

  private stow(q: Quarters) {
    this.supplies.ammo = q.ammo;
    this.looseClips = q.loose;
    this.supplies.medicine = q.medicine;
  }

  /** Fills everyone's request from the stores, in staff order. People who are out keep what they took. */
  quartermaster(): void {
    const q = this.quarters();
    for (const p of this.staff) {
      p.kit ??= legacyKit(p.role);
      if (!p.away) outfit(p.kit, this.requestOf(p), q);
    }
    this.stow(q);
  }

  /** Changes what someone asks for, and fills it at once if they're home. */
  setRequest(id: number, request: Request): void {
    const p = this.person(id);
    if (!p) return;
    p.request = { ...request };
    this.quartermaster();
  }

  /** Back to the role's default. */
  resetRequest(id: number): void {
    const p = this.person(id);
    if (!p) return;
    delete p.request;
    this.quartermaster();
  }

  /** What's wrong with someone's kit: no gun, no ammo, better kit left on the shelf. */
  kitWarnings(p: Person): string[] {
    return kitWarnings(p.kit ?? noKit(), this.requestOf(p), { ...this.quarters(), stores: { ...this.armoury } });
  }

  /** Warnings about the stores as a whole: alien guns nobody can use until they're researched. */
  armouryWarnings(): string[] {
    return GUNS.filter((g) => this.armoury[g] && !usable(g, this.quarters())).map((g) => `${GEAR[g].name} in the stores: research it before anyone can use it`);
  }

  checkMedikit(): string | null {
    return this.supplies.medicine < MEDIKIT_COST ? `Needs ${MEDIKIT_COST} medicine` : null;
  }

  /** Makes up a medikit out of the medicine stores. */
  makeMedikit(): void {
    const reason = this.checkMedikit();
    if (reason) throw new Error(reason);
    this.supplies.medicine -= MEDIKIT_COST;
    this.armoury.medkit++;
    this.quartermaster();
  }

  /** Puts gear into the stores. */
  stock(items: GearId[]): void {
    for (const g of items) this.armoury[g]++;
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
      id: this.ids.person++, name: c.name, role: c.role, stats: { ...c.stats }, health: c.stats.health, aptitude: c.aptitude, build: c.build,
      base, job: "construction", loyalty: c.wants === "none" ? DRIFTER_LOYALTY : RECRUIT_LOYALTY,
      kit: c.kit ? { ...c.kit } : arrivalKit(c.role, this.rand),
    };
    if (c.wants === "food") this.supplies.food -= c.amount;
    if (c.wants === "family") p.dependants = c.amount;
    if (c.wants === "medicine") this.pledges.push({ person: p.id, wants: "medicine", amount: c.amount, due: this.day + MEDICINE_DAYS });
    if (c.wants === "revenge") this.pledges.push({ person: p.id, wants: "revenge", amount: 0, due: this.day + LONG_PROMISE_DAYS, kills: this.kills });
    if (c.wants === "bed") this.pledges.push({ person: p.id, wants: "bed", amount: 0, due: this.day + LONG_PROMISE_DAYS });
    this.staff.push(p);
    this.quartermaster();
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
      if (this.rand() < CANDIDATE_CHANCE) this.candidates.push(rollCandidate(this.ids.candidate++, base, this.today, this.rand));
      if (this.rand() < DRIFTER_CHANCE) this.candidates.push(rollDrifter(this.ids.candidate++, base, this.today, this.rand));
    }
  }

  /** A searcher's day: maybe somewhere nobody has stripped yet. */
  private searchDay(run: Run) {
    for (let i = 0; i < run.team.length; i++) {
      if (this.rand() >= SEARCH_CHANCE) continue;
      const place = rollPlace(this.ids.place++, this.rand);
      this.places.push(place);
      run.found = (run.found ?? 0) + 1;
    }
  }

  /** Sends one or two people to look for new places to scavenge. Works like a run, and can go wrong like one. */
  startSearch(team: number[], days: number): Run {
    if (team.length > MAX_SEARCHERS) throw new Error(`No more than ${MAX_SEARCHERS} searching at once`);
    const run = this.startRun("search", team, days);
    run.search = true;
    return run;
  }

  /** Calls that have come in and haven't been answered or gone cold. */
  get openCalls(): Call[] {
    return this.calls.filter((c) => c.at <= this.time);
  }

  /** A car that's home and free. */
  get freeCar(): Vehicle | undefined {
    return this.vehicles.find((v) => !v.away);
  }

  /** Why this team can't answer the call this way, or null if it can. */
  checkResponse(callId: number, team: number[], by: Travel): string | null {
    const call = this.openCalls.find((c) => c.id === callId);
    if (!call) return "That call has gone cold";
    if (by === "car") {
      if (!this.freeCar) return this.vehicles.length ? "Every car is out" : "You have no car";
      if (team.length > CAR_SEATS) return `A car seats ${CAR_SEATS}`;
      if (this.supplies.fuel < tripFuel(call.km)) return `Not enough fuel: ${tripFuel(call.km)} for there and back`;
    }
    return this.checkRun("sighting", team, 1);
  }

  /** Sends a team to a sighting. They get there in hours, and the trail goes cold in hours. */
  respond(callId: number, team: number[], by: Travel): Run {
    const reason = this.checkResponse(callId, team, by);
    if (reason) throw new Error(reason);
    const call = this.calls.find((c) => c.id === callId)!;
    this.calls.splice(this.calls.indexOf(call), 1);
    const run = this.startRun("sighting", team, 1);
    run.call = call;
    run.where = call.place;
    run.by = by;
    run.arrive = this.time + travelHours(call.km, by) * HOUR_MS;
    if (by === "car") {
      const car = this.freeCar!;
      car.away = run.id;
      run.vehicle = car.id;
      this.supplies.fuel -= tripFuel(call.km);
    }
    return run;
  }

  /** Days for this team to get a car running. */
  repairDays(team: number[]): number {
    const skill = team.reduce((n, id) => n + (this.person(id) ? buildSkill(this.person(id)!) : 0), 0);
    return skill > 0 ? Math.ceil(CAR_WORK / skill) : Infinity;
  }

  checkRepair(team: number[]): string | null {
    if (this.supplies.scrap < CAR_SCRAP) return `Needs ${CAR_SCRAP} scrap for parts`;
    if (team.length > MAX_MECHANICS) return `No more than ${MAX_MECHANICS} on one car`;
    return this.checkRun("garage", team, 1);
  }

  /** Puts one or two people on fixing up an abandoned car. They're busy until it runs. */
  startRepair(team: number[]): Run {
    const reason = this.checkRepair(team);
    if (reason) throw new Error(reason);
    this.supplies.scrap -= CAR_SCRAP;
    const run = this.startRun("garage", team, 1);
    run.repair = true;
    run.daysLeft = this.repairDays(team);
    return run;
  }

  /**
   * Moves sighting responses on to `until`: arrivals, trails gone cold, teams home. Returns true,
   * with the clock set to the moment, when a team finds the alien still there.
   */
  private travel(until: number): boolean {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const call = this.calls[i];
      if (until - call.at > TRAIL_HOURS * HOUR_MS) this.calls.splice(i, 1);
      else if (!call.heard && call.at <= until) {
        call.heard = true;
        this.news.push(`${call.caller} has seen something ${call.place}, ${call.km} km away`);
      }
    }
    const out = this.runs.filter((r) => r.call && !r.ambush).sort((a, b) => (a.arrived ? a.back! : a.arrive!) - (b.arrived ? b.back! : b.arrive!));
    for (const run of out) {
      if (!run.arrived && run.arrive! <= until) {
        run.arrived = true;
        if (this.rand() < freshness(run.call!, run.arrive!)) {
          run.ambush = true;
          this.time = Math.max(this.time, run.arrive!);
          this.news.push(`It's still there, ${run.call!.place}`);
          return true;
        }
        run.back = run.arrive! + travelHours(run.call!.km, run.by!) * HOUR_MS;
        this.news.push(`Nothing ${run.call!.place} by the time they got there`);
      }
      if (run.arrived && run.back! <= until) this.endRun(run);
    }
    return false;
  }

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

  /** Who's free to go out: at a base, not already out, and not too hurt. */
  canScavenge(p: Person): boolean {
    return p.base !== null && !p.away && fitToWork(p);
  }

  /** A known place by id; for a kind of place, the first known one of that kind. */
  findPlace(where: number | SiteId): Place | undefined {
    return this.places.find((p) => (typeof where === "number" ? p.id === where : p.kind === where));
  }

  /**
   * Why this run can't go, or null if it can. `where` is a known place by id (or the first of a
   * kind), or a placeless kind of run: recruiting, searching, a call or the garage.
   */
  checkRun(where: number | SiteId, team: number[], days: number): string | null {
    if (!this.bases.length) return "You need a base to go out from";
    if (!placeless(where) && !this.findPlace(where)) return "Nobody knows a place like that any more";
    if (!team.length) return "Pick who goes";
    if (team.length > MAX_TEAM) return `No more than ${MAX_TEAM} on a run`;
    if (!Number.isInteger(days) || days < 1 || days > MAX_RUN_DAYS) return `Runs last 1 to ${MAX_RUN_DAYS} days`;
    for (const id of team) {
      const p = this.staff.find((x) => x.id === id);
      if (!p || !this.canScavenge(p)) return `${p?.name ?? "Someone"} can't go`;
      const clash = dutyClash(p, dutyOf(this.findPlace(where)?.kind ?? (where as SiteId)));
      if (clash?.locked) return clash.text;
    }
    return null;
  }

  /** Warnings for sending this team on this kind of run: people meant for something else. Locks are refused by `checkRun`. */
  dutyWarnings(where: number | SiteId, team: number[]): string[] {
    const duty = dutyOf(this.findPlace(where)?.kind ?? (where as SiteId));
    return team.flatMap((id) => {
      const p = this.person(id);
      const clash = p && dutyClash(p, duty);
      return clash && !clash.locked ? [clash.text] : [];
    });
  }

  /**
   * Sets what someone is kept for, and how firmly. A lock that rules out their job at home moves
   * them to one it allows, or to rest if it allows none.
   */
  allocate(personId: number, duties: Duty[], hold: Hold): void {
    const p = this.person(personId);
    if (!p) throw new Error("No such person");
    const set = [...new Set(duties)];
    if (hold === "any" || !set.length) {
      delete p.duties;
      delete p.locked;
      return;
    }
    p.duties = set;
    if (hold === "lock") p.locked = true;
    else delete p.locked;
    p.job = allowedJob(p);
    for (const base of this.bases) base.layout.setCrew(this.builders(base.id));
  }

  /** Puts someone on a job at home. A lock refuses jobs outside it; resting is always allowed. */
  setJob(personId: number, job: Job): void {
    const p = this.person(personId);
    if (!p) throw new Error("No such person");
    const duty = jobDuty(job);
    const clash = duty && dutyClash(p, duty);
    if (clash?.locked) throw new Error(clash.text);
    p.job = job;
    for (const base of this.bases) base.layout.setCrew(this.builders(base.id));
  }

  /** Sends people out. They stop their other work until they're back. */
  startRun(where: number | SiteId, team: number[], days: number): Run {
    const reason = this.checkRun(where, team, days);
    if (reason) throw new Error(reason);
    // Everyone takes what they asked for before they go.
    this.quartermaster();
    const place = placeless(where) ? undefined : this.findPlace(where)!;
    const site = place?.kind ?? (where as SiteId);
    const run: Run = { id: this.ids.run++, site, team: [...new Set(team)], daysLeft: days, loot: emptySupplies() };
    if (place) {
      run.place = place.id;
      run.where = place.name;
    }
    for (const id of run.team) this.person(id)!.away = run.id;
    this.runs.push(run);
    for (const base of this.bases) base.layout.setCrew(this.builders(base.id));
    return run;
  }

  /** The fight is over: the dead stay behind, the living come home with whatever they kept. */
  resolveAmbush(result: AmbushResult): void {
    const run = this.ambush;
    if (!run) throw new Error("No fight to resolve");
    const alive = new Map(result.people.map((p) => [p.id, p]));
    const dead = run.team.filter((id) => !alive.has(id)).map((id) => this.person(id)!);
    const won = result.outcome === "captured" || result.outcome === "killed";
    for (const p of dead) {
      this.staff.splice(this.staff.indexOf(p), 1);
      // Hold the ground and you can bring their kit home. What was in their gun is gone.
      const k = p.kit;
      if (won && k) this.stock([k.gun, k.armour, k.baton ? "stunBaton" : null, k.medkit !== null ? "medkit" : null].filter((g): g is GearId => !!g));
    }
    for (const [id, r] of alive) {
      const p = this.person(id);
      if (!p) continue;
      p.health = Math.max(1, Math.min(p.stats.health, r.health));
      if (r.kit) p.kit = r.kit;
    }
    run.team = run.team.filter((id) => alive.has(id));
    const spoils = AMBUSH_SPOILS[result.outcome];
    const items = result.recovered ?? (spoils.item ? [spoils.item] : []);
    for (const item of items) if (!this.trophies.includes(item)) this.trophies.push(item);
    // Their guns go on the shelf; the bodies and prisoners are what count as kills.
    const guns = items.map((i) => GUNS.find((g) => GEAR[g].name === i)).filter((g): g is (typeof GUNS)[number] => !!g);
    this.stock(guns);
    this.kills += items.length - guns.length;
    if (result.race) this.encounters[result.race] = (this.encounters[result.race] ?? 0) + 1;
    if (result.race && result.tally) this.learnFrom(result.race, result.tally, result.outcome, !!result.commanderDown);
    if (items.some((i) => i.includes("ommander"))) this.news.push("You brought down one of their leaders");
    if (items.length && run.call) {
      run.loot.scrap += SIGHTING_SCRAP;
      for (const p of this.staff) if (p.loyalty !== undefined) p.loyalty = Math.min(100, p.loyalty + SIGHTING_LOYALTY);
      this.news.push("Word gets round that you came when called");
    }
    if (dead.length) this.news.push(`Lost on the run: ${dead.map((p) => p.name).join(", ")}`);
    this.endRun(run, spoils.share);
    this.backfill();
  }

  /**
   * How well your people can read a race before a fight: one step for each fight against it,
   * and two more once research has opened up one of their leaders.
   */
  knowledge(race: RaceId): number {
    const leaders = ["commanderAutopsy", "commanderInterrogation"].some((id) => this.research.done.includes(id));
    return (this.encounters[race] ?? 0) + (race === "strider" && this.prologue && prologueWon(this.prologue) ? 1 : 0) + (leaders ? 2 : 0);
  }

  /**
   * The aliens learn from a fight how you fought it. Any that got away spread it faster; losing
   * their commander, or your having worked out how their leaders think, slows it down.
   */
  learnFrom(race: RaceId, tally: Tally, outcome: Outcome, commanderDown: boolean): void {
    const before = this.learned[race] ?? noHabits();
    const researched = ["commanderAutopsy", "commanderInterrogation"].some((id) => this.research.done.includes(id));
    const after = learn(before, observe(tally), { escaped: outcome === "fled" || outcome === "wiped", commanderDown, researched });
    this.learned[race] = after;
    this.news.push(...adaptNews(race, before, after));
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
    // Arms are sorted onto the armoury shelves.
    const arms = Array.from({ length: kept.arms }, () => rollArms(this.rand));
    this.stock(arms);
    addSupplies(this.supplies, kept);
    this.supplies.arms = 0;
    for (const id of run.team) {
      const p = this.person(id);
      if (p) delete p.away;
    }
    const car = this.vehicles.find((v) => v.id === run.vehicle);
    if (car) delete car.away;
    this.runs.splice(this.runs.indexOf(run), 1);
    this.quartermaster();
    if (!run.team.length) return;
    if (run.repair) {
      const name = carName(this.ids.vehicle - 1);
      this.vehicles.push({ id: this.ids.vehicle++, name });
      this.news.push(`${name[0].toUpperCase()}${name.slice(1)} is running`);
      return;
    }
    if (run.call) {
      this.news.push(`Back from ${run.call.place}${kept.scrap ? `, with ${kept.scrap} scrap off its kit` : ""}`);
      return;
    }
    if (run.recruit) {
      const met = this.candidates.length;
      this.news.push(`Back from the streets${met ? `: ${met} ${met === 1 ? "person wants" : "people want"} to talk` : ", with nobody"}`);
    } else if (run.search) {
      const n = run.found ?? 0;
      this.news.push(`Back from searching${n ? `: ${n} new place${n === 1 ? "" : "s"} to scavenge` : ", with nowhere new"}`);
    } else {
      const found = arms.length ? ` (${arms.map((g) => GEAR[g].name.toLowerCase()).join(", ")})` : "";
      this.news.push(`Back from ${runWhere(run)}: ${describeSupplies(kept)}${found}`);
    }
  }

  /** If everyone is gone, the council sends someone: losing people is never the end. */
  private backfill() {
    if (this.staff.length) return;
    this.staff.push({ ...LIAISON, stats: { ...LIAISON.stats }, id: this.ids.person++, base: this.bases[0]?.id ?? null, job: "construction", kit: legacyKit(LIAISON.role) });
    this.quartermaster();
    this.news.push("With nobody left, the council sends a liaison");
  }

  /** One day of a run: finds, or trouble. */
  private runDay(run: Run) {
    // Answering a call runs by the hour, not the day; see `travel`.
    if (run.call) return;
    const size = run.team.length;
    if (this.rand() < dayRisk(run.site, size)) {
      if (this.rand() < 0.5) {
        // Someone gets hurt: a fall, a fight with other scavengers, a collapse. They come home now.
        const p = this.person(run.team[Math.floor(this.rand() * size)])!;
        p.health = Math.max(1, p.health - Math.ceil(p.stats.health * (0.25 + this.rand() * 0.25)));
        this.news.push(`${p.name} was hurt at ${runWhere(run)}`);
        this.endRun(run);
      } else {
        run.ambush = true;
        this.news.push(`The run to ${runWhere(run)} has run into an alien`);
      }
      return;
    }
    if (run.recruit) {
      this.recruitDay(run);
      if (--run.daysLeft <= 0) this.endRun(run);
      return;
    }
    if (run.repair) {
      if (--run.daysLeft <= 0) this.endRun(run);
      return;
    }
    if (run.search) {
      this.searchDay(run);
      if (--run.daysLeft <= 0) this.endRun(run);
      return;
    }
    // Runs saved before places had stock just went to a kind of place.
    const place = run.place ? this.places.find((p) => p.id === run.place) : this.findPlace(run.site);
    if (place) addSupplies(run.loot, dayLoot(place, size, this.rand));
    if (!place || isEmpty(place)) {
      if (place) {
        this.places.splice(this.places.indexOf(place), 1);
        this.news.push(`${place.name} is picked clean`);
      }
      this.endRun(run);
    } else if (--run.daysLeft <= 0) this.endRun(run);
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
      this.staff.push({ ...p, stats: { ...p.stats }, id: this.ids.person++, base, job: i === 0 ? "research" : "construction", kit: p.kit ? { ...p.kit } : legacyKit(p.role) });
    });
    // The Hunter's gun, if it came home.
    if (this.prologue?.recovered.includes(GEAR.plasmaPistol.name)) this.stock(["plasmaPistol"]);
    this.quartermaster();
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
    // Used medikits get restocked at home, after the wounded have had their share.
    for (const p of this.staff) {
      const k = p.kit;
      if (p.away || !k || k.medkit === null || k.medkit >= GEAR.medkit.tool!.uses || this.supplies.medicine < MEDIKIT_RESTOCK) continue;
      this.supplies.medicine -= MEDIKIT_RESTOCK;
      k.medkit = GEAR.medkit.tool!.uses;
    }
    this.keepPromises(day);
    this.disloyal();
    for (let i = this.candidates.length - 1; i >= 0; i--) if (this.candidates[i].until < day) this.candidates.splice(i, 1);
    for (const run of [...this.runs]) if (!run.ambush) this.runDay(run);
    const id = this.research.active;
    const armed = id ? GUNS.filter((g) => GEAR[g].research === id) : [];
    if (id) {
      const done = (this.research.progress[id] ?? 0) + this.researchRate();
      this.research.progress[id] = done;
      if (done >= project(id).points) {
        this.research.done.push(id);
        this.research.active = null;
        this.news.push(`Research complete: ${project(id).name}`);
        // Alien guns on the shelf can be handed out now.
        if (armed.some((g) => this.armoury[g])) this.quartermaster();
      }
    }
    const done: Completion[] = [];
    for (const base of this.bases) {
      base.layout.setCrew(this.builders(base.id));
      for (const item of base.layout.workDay()) done.push({ base, item });
    }
    this.harvest();
    if (this.bases.length && this.rand() < CALL_CHANCE) {
      const base = this.bases[Math.floor(this.rand() * this.bases.length)];
      this.calls.push(rollCall(this.ids.call++, base.id, this.time + this.rand() * DAY_MS, this.rand));
    }
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
    const seed = hashText(s.city?.name ?? `${ll.lat.toFixed(1)},${ll.lon.toFixed(1)}`);
    const layout = BaseLayout.starter(s.site!, seed);
    layout.day = this.day;
    this.funds -= s.cost;
    // A covert base sits under the city itself.
    if (s.city) ll = { lat: s.city.lat, lon: s.city.lon };
    const id = this.ids.base++;
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
    const done: Completion[] = [];
    // Everything waits while a run is in a fight.
    while (this.time < time && !this.ambush) {
      const boundary = CAMPAIGN_START + (this.day + 1) * DAY_MS;
      const step = Math.min(time, boundary);
      if (this.travel(step)) break;
      this.time = step;
      if (step === boundary) done.push(...this.workDay(this.day));
    }
    for (const base of this.bases) base.layout.setCrew(this.builders(base.id));
    return done;
  }

  advanceDays(days: number): Completion[] {
    // Land just after the day boundary so a partial day already elapsed isn't lost or double counted.
    const target = CAMPAIGN_START + (this.day + days) * DAY_MS;
    return this.advanceTo(Math.max(target, this.time));
  }

  /** Where a team's fight happens: the city their base hides under, or the nearest one. */
  fightCity(team: number[]): City {
    return cityOf(this.bases.find((b) => b.id === this.person(team[0])?.base) ?? this.bases[0]);
  }

  /** Radar cover of each base, for drawing on the globe. */
  radar(): { lat: number; lon: number; nmi: number }[] {
    return this.bases.map((b) => ({ lat: b.lat, lon: b.lon, nmi: b.layout.stats().radar })).filter((r) => r.nmi > 0);
  }

  save(): SavedCampaign {
    return toSave(this);
  }

  static load(data: SavedCampaign): Campaign {
    const c = new Campaign();
    restore(c, data);
    return c;
  }
}

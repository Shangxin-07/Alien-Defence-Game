import type { Call, Travel } from "./sightings";

/**
 * Supplies and scavenging: what keeps everyone alive before anyone is paying for it.
 * People eat every day. Food, medicine and scrap come from runs into the city, and any run
 * can go wrong.
 */

/** Ammo is spare clips. Arms are guns and armour, sorted into the armoury when a run gets home. */
export type Supply = "food" | "medicine" | "scrap" | "fuel" | "ammo" | "arms";
export type Supplies = Record<Supply, number>;

export const SUPPLY_NAMES: Record<Supply, string> = { food: "Food", medicine: "Medicine", scrap: "Scrap", fuel: "Fuel", ammo: "Ammo", arms: "Arms" };

/** What the survivors scraped together on the first night: about a week of food for four, and two spare clips. */
export const START_SUPPLIES: Supplies = { food: 30, medicine: 3, scrap: 0, fuel: 0, ammo: 2, arms: 0 };

/** Everyone eats this much a day, at a base or out on a run. */
export const RATION = 1;
/** Days without food before hungry people start to walk out. */
export const DESERT_AFTER = 5;
/** Chance each day that someone who has gone hungry too long leaves. */
export const DESERT_CHANCE = 0.2;
/** Extra health a day for someone wounded who gets a dose of medicine. */
export const MEDICINE_HEAL = 2;
/** Scrap stands in for money on rooms: what one unit is worth. */
export const SCRAP_VALUE = 10_000;
/** Most people on one run: more than this and the whole street hears you. */
export const MAX_TEAM = 4;
export const MAX_RUN_DAYS = 3;
/** Most people out recruiting together: it's talk, not muscle. */
export const MAX_RECRUITERS = 2;

export type SiteId = "homes" | "grocery" | "pharmacy" | "hardware" | "industrial" | "police" | "streets" | "search" | "sighting" | "garage";

export interface Site {
  id: SiteId;
  name: string;
  blurb: string;
  /** What one person finds in a day, as a range, while the place has it. */
  yields: Partial<Record<Supply, [number, number]>>;
  /** Chance a day that something goes wrong, for a team of three. */
  danger: number;
}

export const SITES: Record<SiteId, Site> = {
  homes: {
    id: "homes", name: "Abandoned homes", danger: 0.04,
    yields: { food: [1, 3], medicine: [0, 1], scrap: [0, 2], fuel: [0, 1] },
    blurb: "Flats left in a hurry. A bit of everything, and nobody watching.",
  },
  grocery: {
    id: "grocery", name: "Supermarkets", danger: 0.08,
    yields: { food: [3, 6] },
    blurb: "Tins and dry goods, if you get there before everyone else.",
  },
  pharmacy: {
    id: "pharmacy", name: "Pharmacies and clinics", danger: 0.12,
    yields: { medicine: [1, 3], food: [0, 1] },
    blurb: "Dressings, antibiotics, painkillers. Others want them too.",
  },
  hardware: {
    id: "hardware", name: "Hardware stores", danger: 0.06,
    yields: { scrap: [2, 5] },
    blurb: "Cable, pipe, timber and tools. Scrap builds what money can't buy yet.",
  },
  streets: {
    id: "streets", name: "Streets", danger: 0.05, yields: {},
    blurb: "Talking people into joining. Nothing to carry home but promises.",
  },
  search: {
    id: "search", name: "Unknown streets", danger: 0.08, yields: {},
    blurb: "Looking for somewhere nobody has stripped yet. Nothing to carry home but directions.",
  },
  sighting: {
    id: "sighting", name: "Sighting", danger: 0, yields: {},
    blurb: "Answering a call. The danger is what's waiting at the other end.",
  },
  garage: {
    id: "garage", name: "Garage", danger: 0, yields: {},
    blurb: "Fixing up an abandoned car in the yard.",
  },
  police: {
    id: "police", name: "Police stations and gun shops", danger: 0.14,
    yields: { ammo: [0, 2], arms: [0, 1] },
    blurb: "Ammunition, guns and vests, if the armoury wasn't emptied on the first night. Everyone with a gun has thought of it.",
  },
  industrial: {
    id: "industrial", name: "Industrial estate", danger: 0.15,
    yields: { scrap: [4, 8], fuel: [0, 3], food: [0, 1] },
    blurb: "Rich pickings in steel and machinery, out where it's open and dark.",
  },
};

/** Runs that go somewhere other than a known place: recruiting, searching, calls, the garage. */
export const placeless = (where: number | SiteId): where is SiteId => typeof where === "string" && !(where in STOCK);

export const SITE_ORDER: ScavengeKind[] = ["homes", "grocery", "pharmacy", "hardware", "industrial", "police"];

/**
 * Every place holds a fixed amount. Each person takes what they can find and carry out of what's
 * left, so a big team empties a place faster but never gets more out of it than is there. Once
 * it's empty, it's gone; finding new places is a job of its own.
 */
export const STOCK: Record<ScavengeKind, Partial<Supplies>> = {
  homes: { food: 40, medicine: 6, scrap: 25, fuel: 10 },
  grocery: { food: 70 },
  pharmacy: { medicine: 20, food: 6 },
  hardware: { scrap: 50 },
  industrial: { scrap: 90, fuel: 30, food: 5 },
  police: { ammo: 14, arms: 5 },
};

export type ScavengeKind = Exclude<SiteId, "streets" | "search" | "sighting" | "garage">;

/** A known place to scavenge, and what's still there. */
export interface Place {
  id: number;
  kind: ScavengeKind;
  name: string;
  stock: Supplies;
}

const STARTERS: Record<ScavengeKind, string> = {
  homes: "Flats on Mill Street",
  grocery: "Supermarket by the ring road",
  pharmacy: "Health centre on Church Lane",
  hardware: "DIY superstore",
  industrial: "Riverside industrial estate",
  police: "Police station on Bridge Street",
};

/** The places the survivors already know about on the first night: one of each kind. */
export const startPlaces = (): Place[] =>
  SITE_ORDER.map((kind, i) => ({ id: i + 1, kind, name: STARTERS[kind], stock: { ...emptySupplies(), ...STOCK[kind] } }));

/** Most people searching together: it's walking and looking, not carrying. */
export const MAX_SEARCHERS = 2;
/** Chance each searcher finds somewhere new on a day out. */
export const SEARCH_CHANCE = 0.3;
/** How often a new find is each kind of place. */
const FIND_WEIGHTS: [ScavengeKind, number][] = [["homes", 0.33], ["grocery", 0.19], ["pharmacy", 0.14], ["hardware", 0.14], ["industrial", 0.13], ["police", 0.07]];

export const STREETS = ["Albert Road", "Station Road", "Victoria Street", "the high street", "Park Lane", "Queen's Road", "the canal", "Hill Street", "the old docks", "North Road", "the bypass", "Chapel Street", "Market Square", "the railway arches"];
const KIND_NAMES: Record<ScavengeKind, string[]> = {
  homes: ["Terraced houses on", "Tower block by", "Flats off", "Bungalows near"],
  grocery: ["Corner shop on", "Supermarket on", "Cash and carry by", "Petrol station on"],
  pharmacy: ["Chemist on", "Vet's surgery off", "Dental practice on", "Care home near"],
  hardware: ["Builders' merchant by", "Garden centre off", "Tool hire on", "Garage on"],
  industrial: ["Depot by", "Factory units off", "Scrapyard near", "Works on"],
  police: ["Police station on", "Gun shop off", "Shooting club by", "Army surplus store on"],
};

/** Somewhere new that a searcher turned up. Most places have already been picked at by someone. */
export function rollPlace(id: number, rand: () => number): Place {
  let r = rand();
  let kind: ScavengeKind = "homes";
  for (const [k, w] of FIND_WEIGHTS) {
    kind = k;
    if ((r -= w) < 0) break;
  }
  const scale = 0.4 + rand() * 0.8;
  const stock = emptySupplies();
  for (const [k, n] of Object.entries(STOCK[kind]) as [Supply, number][]) stock[k] = Math.max(1, Math.round(n * scale));
  const names = KIND_NAMES[kind];
  const name = `${names[Math.floor(rand() * names.length)]} ${STREETS[Math.floor(rand() * STREETS.length)]}`;
  return { id, kind, name, stock };
}

export const isEmpty = (p: Place) => !Object.values(p.stock).some((n) => n > 0);

/** Small teams are quieter; big teams are noticed. */
export const teamRisk = (size: number) => 0.55 + 0.15 * size;

/** Chance something goes wrong on one day of a run. */
export const dayRisk = (site: SiteId, size: number) => Math.min(0.9, SITES[site].danger * teamRisk(size));

/** Chance a whole run gets home without trouble. */
export const cleanChance = (site: SiteId, size: number, days: number) => (1 - dayRisk(site, size)) ** days;

export interface Run {
  id: number;
  site: SiteId;
  team: number[];
  /** Days still to go. */
  daysLeft: number;
  /** What they've found so far. */
  loot: Supplies;
  /** Waiting on the player: they ran into an alien. */
  ambush?: boolean;
  /** Seeds the fight, so who's out there is settled before the player chooses. */
  fightSeed?: number;
  /** The place being scavenged, and its name in case it's gone by the time they're back. */
  place?: number;
  where?: string;
  /** New places a search has turned up so far. */
  found?: number;
  /** Out recruiting rather than scavenging. */
  recruit?: boolean;
  /** Out looking for new places to scavenge. */
  search?: boolean;
  /** Answering a sighting call: how they went, in which car, and when they get there and back. */
  call?: Call;
  by?: Travel;
  vehicle?: number;
  arrive?: number;
  back?: number;
  arrived?: boolean;
  /** Fixing up a car. */
  repair?: boolean;
}

/** Where a run went, for the news: the place's name, or the kind of place. */
export const runWhere = (run: Run) => run.where ?? `the ${SITES[run.site].name.toLowerCase()}`;

export const emptySupplies = (): Supplies => ({ food: 0, medicine: 0, scrap: 0, fuel: 0, ammo: 0, arms: 0 });

/** One day of finds for a team of `size`, taken out of what's left at the place. */
export function dayLoot(place: Place, size: number, rand: () => number): Supplies {
  const out = emptySupplies();
  for (const [k, [lo, hi]] of Object.entries(SITES[place.kind].yields) as [Supply, [number, number]][]) {
    for (let i = 0; i < size; i++) out[k] += Math.floor(lo + rand() * (hi - lo + 1));
    out[k] = Math.min(out[k], place.stock[k]);
    place.stock[k] -= out[k];
  }
  return out;
}

export function addSupplies(to: Supplies, from: Supplies, share = 1): void {
  for (const k of Object.keys(to) as Supply[]) to[k] += Math.floor(from[k] * share);
}

export const describeSupplies = (s: Supplies) =>
  (Object.keys(s) as Supply[])
    .filter((k) => s[k])
    .map((k) => `${s[k]} ${SUPPLY_NAMES[k].toLowerCase()}`)
    .join(", ") || "nothing";

/**
 * The black market: money buys what scavenging can't find, at a price. Every unit bought pushes
 * the price up, and it only eases back slowly, so it's a way out of a famine, not a way to live.
 */
export type Traded = "food" | "medicine" | "fuel" | "ammo";
export const MARKET_PRICE: Record<Traded, number> = { food: 8_000, medicine: 25_000, fuel: 4_000, ammo: 15_000 };
/** How much each unit bought pushes the price up. */
export const MARKET_RISE = 1.012;
/** Share of the markup that's still there the next day. */
export const MARKET_EASE = 0.97;
/** What one purchase buys. */
export const MARKET_LOT: Record<Traded, number> = { food: 10, medicine: 2, fuel: 10, ammo: 4 };

/** What `n` units cost with the price pushed up by `heat` (1 is the going rate), to the nearest $1k. */
export function marketCost(kind: Traded, n: number, heat: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += MARKET_PRICE[kind] * heat * MARKET_RISE ** i;
  return Math.round(total / 1000) * 1000;
}

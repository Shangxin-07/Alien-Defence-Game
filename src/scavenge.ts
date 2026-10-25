/**
 * Supplies and scavenging: what keeps everyone alive before anyone is paying for it.
 * People eat every day. Food, medicine and scrap come from runs into the city, and any run
 * can go wrong.
 */

export type Supply = "food" | "medicine" | "scrap";
export type Supplies = Record<Supply, number>;

export const SUPPLY_NAMES: Record<Supply, string> = { food: "Food", medicine: "Medicine", scrap: "Scrap" };

/** What the survivors scraped together on the first night: about a week of food for four. */
export const START_SUPPLIES: Supplies = { food: 30, medicine: 3, scrap: 0 };

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

export type SiteId = "homes" | "grocery" | "pharmacy" | "hardware" | "industrial" | "streets";

export interface Site {
  id: SiteId;
  name: string;
  blurb: string;
  /** What one person finds in a day, as a range, before the place gets picked over. */
  yields: Partial<Record<Supply, [number, number]>>;
  /** Chance a day that something goes wrong, for a team of three. */
  danger: number;
}

export const SITES: Record<SiteId, Site> = {
  homes: {
    id: "homes", name: "Abandoned homes", danger: 0.04,
    yields: { food: [1, 3], medicine: [0, 1], scrap: [0, 2] },
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
  industrial: {
    id: "industrial", name: "Industrial estate", danger: 0.15,
    yields: { scrap: [4, 8], food: [0, 1] },
    blurb: "Rich pickings in steel and machinery, out where it's open and dark.",
  },
};

export const SITE_ORDER: SiteId[] = ["homes", "grocery", "pharmacy", "hardware", "industrial"];

/** Each day a team works a kind of place, there's less left there. It slowly fills up again. */
export const PICKED_PER_DAY = 0.1;
export const RECOVER_PER_DAY = 0.02;
/** Even a stripped place gives something to whoever looks hard enough. */
export const MIN_RICHNESS = 0.3;

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
  /** Out recruiting rather than scavenging. */
  recruit?: boolean;
}

export const emptySupplies = (): Supplies => ({ food: 0, medicine: 0, scrap: 0 });

/** One day of finds for a team of `size` at a place this rich. */
export function dayLoot(site: SiteId, size: number, richness: number, rand: () => number): Supplies {
  const out = emptySupplies();
  for (const [k, [lo, hi]] of Object.entries(SITES[site].yields) as [Supply, [number, number]][]) {
    for (let i = 0; i < size; i++) out[k] += Math.floor((lo + rand() * (hi - lo + 1)) * richness);
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

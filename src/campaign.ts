import { BaseLayout, Item, SavedBase, Site } from "./base/layout";
import { CITIES, City } from "./geoscape/cities";
import { CAMPAIGN_START } from "./geoscape/clock";
import { DEG, LatLon } from "./geoscape/geo";

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

interface SavedCampaign {
  version: 1;
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
  private nextId = 1;

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
    for (const base of this.bases) for (const item of base.layout.advance(days)) done.push({ base, item });
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
      bases: this.bases.map((b) => ({ ...b, layout: b.layout.save() })),
    };
  }

  static load(data: SavedCampaign): Campaign {
    if (data.version !== 1) throw new Error("Unknown save version");
    const c = new Campaign();
    c.time = data.time;
    c.funds = data.funds;
    c.nextId = data.nextId;
    for (const b of data.bases) c.bases.push({ ...b, layout: BaseLayout.load(b.layout) });
    return c;
  }
}

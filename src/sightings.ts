import { STREETS } from "./scavenge";

/**
 * Sighting calls: before there's any radar, aliens are found because someone saw one and got word
 * to you. You go yourselves, on foot or by car, and the longer it takes to get there the colder
 * the trail. Cars are the first real machine you own, and they run on fuel.
 */

export const HOUR_MS = 3_600_000;

/** Someone saw something. */
export interface Call {
  id: number;
  /** Where, in words. */
  place: string;
  /** Who called it in. */
  caller: string;
  /** Distance from the base it was reported to, in km. */
  km: number;
  base: number;
  /** When it was seen. The call shows up from then. */
  at: number;
  /** Already in the news. */
  heard?: boolean;
}

export interface Vehicle {
  id: number;
  name: string;
  /** The run it's out on. */
  away?: number;
}

/** Chance a day that somebody calls in a sighting. */
export const CALL_CHANCE = 0.3;
/** How far away calls come from, in km. */
export const CALL_KM: [number, number] = [2, 25];
/** Hours until an alien has moved on from where it was seen. */
export const TRAIL_HOURS = 8;
/** Walking pace through a broken city, and driving pace round the wrecks, in km/h. */
export const FOOT_KMH = 5;
export const CAR_KMH = 40;
/** Seats in a car. */
export const CAR_SEATS = 4;
/** Kilometres a unit of fuel takes a car. */
export const KM_PER_FUEL = 8;
/** Fixing up an abandoned car: scrap for parts, and person-days of work at build skill 1. */
export const CAR_SCRAP = 15;
export const CAR_WORK = 8;
/** Most people on one car repair. */
export const MAX_MECHANICS = 2;
/** Scrap stripped from an alien's kit after a sighting is won. */
export const SIGHTING_SCRAP = 6;
/** Loyalty everyone with a score gains when word gets round that you went and dealt with it. */
export const SIGHTING_LOYALTY = 5;

export type Travel = "foot" | "car";

/** Hours to get somewhere. */
export const travelHours = (km: number, by: Travel) => km / (by === "car" ? CAR_KMH : FOOT_KMH);

/** Fuel for a car to get there and back. */
export const tripFuel = (km: number) => Math.ceil((2 * km) / KM_PER_FUEL);

/** Chance the alien is still there, arriving at `when`. */
export const freshness = (call: Call, when: number) => Math.max(0, 1 - (when - call.at) / (TRAIL_HOURS * HOUR_MS));

const CALLERS = [
  "A taxi driver", "Someone in a tower block", "A night-shift nurse", "Two kids on bikes", "A man walking his dog",
  "A shopkeeper", "A bus driver", "Someone who wouldn't give a name", "An old woman", "A delivery rider",
];
const SEEN = ["near", "behind", "under", "on the roof by", "in the alleys off", "down by"];

/** A new sighting, somewhere between `CALL_KM` from the base, seen at `at`. */
export function rollCall(id: number, base: number, at: number, rand: () => number): Call {
  const [lo, hi] = CALL_KM;
  return {
    id,
    base,
    at,
    km: Math.round((lo + rand() * (hi - lo)) * 10) / 10,
    caller: CALLERS[Math.floor(rand() * CALLERS.length)],
    place: `${SEEN[Math.floor(rand() * SEEN.length)]} ${STREETS[Math.floor(rand() * STREETS.length)]}`,
  };
}

const CAR_NAMES = ["the estate car", "the van", "the old saloon", "the pickup", "the hatchback", "the minibus"];
export const carName = (n: number) => CAR_NAMES[n % CAR_NAMES.length];

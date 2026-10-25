/** Base facilities. Costs and build times follow the original's where a match exists. */

export type RoomId =
  | "lift"
  | "tunnel"
  | "hangar"
  | "radar"
  | "largeRadar"
  | "defence"
  | "quarters"
  | "lab"
  | "workshop"
  | "stores"
  | "medbay"
  | "generator"
  | "containment"
  // City buildings already standing on the site. They can't be built, only cleared.
  | "tower"
  | "apartments"
  | "warehouse"
  | "shops";

/** Where a facility may be dug: hangars and radar need open sky, some rooms need rock overhead. */
export type Siting = "surface" | "underground" | "any";

/** What a facility counts towards when the base's specialism is worked out. */
export type Role = "research" | "manufacturing" | "surveillance" | "military";

export type Capacity = "crew" | "science" | "engineering" | "storage" | "beds" | "hangars" | "containment" | "defence";

export interface RoomDef {
  id: RoomId;
  name: string;
  /** Label painted on the room in the base view. */
  short: string;
  w: number;
  h: number;
  cost: number;
  days: number;
  /** Power drawn per day of operation. Generators supply power instead, see `powerSupply`. */
  power: number;
  siting: Siting;
  provides: Partial<Record<Capacity, number>>;
  /** Radar range in nautical miles; the base uses its best radar, ranges don't add up. */
  radar?: number;
  /** Tunnels and lifts carry people between rooms. Rooms only open onto them, never onto each other. */
  conductor?: boolean;
  role?: Role;
  /**
   * How much a city base's cover suffers when this stands on the surface.
   * Underground rooms are never seen.
   */
  exposure?: number;
  /** A city building that was here first. Clearing it costs `cost` and some cover. */
  detritus?: boolean;
  color: string;
  /** Height of the room's block in the base view, in cells. */
  height: number;
  blurb: string;
}

export const ROOMS: Record<RoomId, RoomDef> = {
  lift: {
    id: "lift", name: "Access lift", short: "LIFT", w: 1, h: 1, cost: 120_000, days: 6, power: 1, siting: "any",
    provides: {}, conductor: true, color: "#9fb3bb", height: 0.75,
    blurb: "Connects to lifts directly above and below. The lift on the surface is the base entrance.",
  },
  tunnel: {
    id: "tunnel", name: "Tunnel", short: "", w: 1, h: 1, cost: 20_000, days: 2, power: 0, siting: "any",
    provides: {}, conductor: true, color: "#5d6f78", height: 0.22,
    blurb: "Joins rooms together. A room works only if tunnels link it back to the entrance.",
  },
  hangar: {
    id: "hangar", name: "Hangar", short: "HANGAR", w: 3, h: 3, cost: 200_000, days: 25, power: 3, siting: "surface",
    provides: { hangars: 1 }, role: "military", exposure: 35, color: "#6f8d99", height: 0.9,
    blurb: "Houses one interceptor or transport. Surface only.",
  },
  radar: {
    id: "radar", name: "Radar", short: "RADAR", w: 1, h: 1, cost: 500_000, days: 12, power: 2, siting: "surface",
    provides: {}, radar: 300, role: "surveillance", exposure: 12, color: "#8fd1a2", height: 0.7,
    blurb: "Detects craft within 300 nmi. Surface only.",
  },
  largeRadar: {
    id: "largeRadar", name: "Large radar", short: "L-RADAR", w: 2, h: 2, cost: 800_000, days: 25, power: 4, siting: "surface",
    provides: {}, radar: 450, role: "surveillance", exposure: 20, color: "#6cc58a", height: 0.85,
    blurb: "Detects craft within 450 nmi. Surface only.",
  },
  defence: {
    id: "defence", name: "Missile battery", short: "SAM", w: 1, h: 1, cost: 200_000, days: 16, power: 2, siting: "surface",
    provides: { defence: 500 }, role: "military", exposure: 15, color: "#e2553f", height: 0.6,
    blurb: "Fires on craft attacking the base. Surface only.",
  },
  quarters: {
    id: "quarters", name: "Living quarters", short: "QUARTERS", w: 2, h: 2, cost: 400_000, days: 16, power: 2, siting: "any",
    provides: { crew: 50 }, color: "#c9b37e", height: 0.6,
    blurb: "Beds for 50 personnel: soldiers, scientists and engineers all need one.",
  },
  lab: {
    id: "lab", name: "Laboratory", short: "LAB", w: 2, h: 2, cost: 750_000, days: 26, power: 4, siting: "any",
    provides: { science: 50 }, role: "research", color: "#5fa8d3", height: 0.65,
    blurb: "Space for 50 scientists.",
  },
  workshop: {
    id: "workshop", name: "Workshop", short: "WORKSHOP", w: 2, h: 2, cost: 800_000, days: 32, power: 5, siting: "any",
    provides: { engineering: 50 }, role: "manufacturing", color: "#d98b3a", height: 0.65,
    blurb: "Space for 50 engineers.",
  },
  stores: {
    id: "stores", name: "General stores", short: "STORES", w: 2, h: 1, cost: 150_000, days: 10, power: 1, siting: "any",
    provides: { storage: 50 }, role: "manufacturing", color: "#8a7f6b", height: 0.5,
    blurb: "Holds 50 units of equipment, ammunition and salvage.",
  },
  medbay: {
    id: "medbay", name: "Medical bay", short: "MED", w: 2, h: 1, cost: 350_000, days: 14, power: 2, siting: "any",
    provides: { beds: 10 }, role: "military", color: "#e8e1d0", height: 0.5,
    blurb: "Ten beds. Wounded soldiers recover twice as fast.",
  },
  generator: {
    id: "generator", name: "Geothermal plant", short: "POWER", w: 2, h: 2, cost: 600_000, days: 20, power: 0, siting: "underground",
    provides: {}, color: "#e8a93b", height: 0.7,
    blurb: "Supplies power. Hotter rock deeper down: each level lower adds 4 power.",
  },
  containment: {
    id: "containment", name: "Alien containment", short: "CONTAIN", w: 2, h: 2, cost: 400_000, days: 18, power: 4, siting: "underground",
    provides: { containment: 10 }, role: "research", color: "#b05cc7", height: 0.6,
    blurb: "Holds 10 live aliens. Underground only, and only a fool keeps it near the quarters.",
  },
  tower: {
    id: "tower", name: "Office tower", short: "", w: 2, h: 2, cost: 450_000, days: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, exposure: 10, color: "#4a5761", height: 1.9,
    blurb: "Glass and concrete. Pulling one down makes the news.",
  },
  apartments: {
    id: "apartments", name: "Apartment block", short: "", w: 2, h: 1, cost: 220_000, days: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, exposure: 8, color: "#6b625a", height: 1.15,
    blurb: "People live here. Moving them out is slow and noticed.",
  },
  warehouse: {
    id: "warehouse", name: "Warehouse", short: "", w: 2, h: 2, cost: 120_000, days: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, exposure: 3, color: "#57534a", height: 0.8,
    blurb: "Cheap to buy out and nobody asks why.",
  },
  shops: {
    id: "shops", name: "Shopfronts", short: "", w: 1, h: 1, cost: 60_000, days: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, exposure: 4, color: "#5e5560", height: 0.55,
    blurb: "A row of small businesses.",
  },
};

export const ROLE_NAMES: Record<Role, string> = {
  research: "Research",
  manufacturing: "Manufacturing",
  surveillance: "Surveillance",
  military: "Military",
};

/** What a specialist base of each kind gets better at. */
export const ROLE_BONUS: Record<Role, string> = {
  research: "research speed",
  manufacturing: "production speed",
  surveillance: "detection range and chance",
  military: "interception, base defence and recovery",
};

/** Build menu order. */
export const ROOM_ORDER: RoomId[] = [
  "tunnel", "lift", "quarters", "lab", "workshop", "stores", "medbay", "generator",
  "containment", "hangar", "radar", "largeRadar", "defence",
];

/** Power a geothermal plant supplies on a given level (0 is the surface). */
export function powerSupply(level: number): number {
  return 12 + 4 * Math.max(0, level - 1);
}

/** Digging gets dearer the deeper you go. */
export const DEPTH_COST = [1, 1.1, 1.25, 1.5];

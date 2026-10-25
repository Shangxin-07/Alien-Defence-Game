/**
 * Base facilities. Money costs follow the original's where a match exists. Building takes work in
 * person-days instead of fixed days: roughly four times the original's build time, since the opening
 * leaves you about four pairs of hands.
 */

export type RoomId =
  | "shaft"
  | "stairs"
  | "lift"
  | "accessPoint"
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
  | "frontBuilding"
  | "tower"
  | "apartments"
  | "warehouse"
  | "shops";

/** Where a facility may be dug: hangars and radar need open sky, some rooms need rock overhead. */
export type Siting = "surface" | "underground" | "any";

/** What a facility counts towards when the base's specialism is worked out. */
export type Role = "research" | "manufacturing" | "surveillance" | "military";

/** How good a vertical link is: builders can climb a bare shaft, people can live below stairs, heavy kit needs a lift. */
export type Tier = "shaft" | "stairs" | "lift";
export const TIER_RANK: Record<Tier, number> = { shaft: 0, stairs: 1, lift: 2 };

export type Capacity = "crew" | "science" | "engineering" | "storage" | "beds" | "hangars" | "containment" | "defence";

export interface RoomDef {
  id: RoomId;
  name: string;
  /** Label painted on the room in the base view. */
  short: string;
  w: number;
  h: number;
  /** Money for bought equipment. Digging and building with your own hands is free. */
  cost: number;
  /** Person-days of work at skill 1.0, before depth. */
  work: number;
  /** Power drawn per day of operation. Generators supply power instead, see `powerSupply`. */
  power: number;
  siting: Siting;
  provides: Partial<Record<Capacity, number>>;
  /** Radar range in nautical miles; the base uses its best radar, ranges don't add up. */
  radar?: number;
  /** Tunnels and lifts carry people between rooms. Rooms only open onto them, never onto each other. */
  conductor?: boolean;
  /** Carries a lift shaft: links to shafts directly above and below, and on the surface it's an entrance. */
  shaft?: boolean;
  /** For shafts: what can get up and down it. Unset means anything (lifts, the surface entrance). */
  tier?: Tier;
  /** Machinery too big for stairs: work can only start once a lift route reaches it. */
  heavy?: boolean;
  /** Built by converting this existing building in place, rather than on open ground. */
  convertsFrom?: RoomId;
  role?: Role;
  /**
   * How much a city base's cover suffers when this stands on the surface.
   * Underground rooms are never seen.
   */
  exposure?: number;
  /** A city building that was here first. Clearing it costs `cost` and some cover. */
  detritus?: boolean;
  /** One of ours: can't be cleared, only converted. */
  owned?: boolean;
  color: string;
  /** Height of the room's block in the base view, in cells. */
  height: number;
  blurb: string;
}

export const ROOMS: Record<RoomId, RoomDef> = {
  shaft: {
    id: "shaft", name: "Shaft", short: "SHAFT", w: 1, h: 1, cost: 0, work: 10, power: 0, siting: "any",
    provides: {}, conductor: true, shaft: true, tier: "shaft", color: "#4f5c62", height: 0.3,
    blurb: "A hole with rope ladders. Builders can climb down and dig, but nothing below runs until it has stairs.",
  },
  stairs: {
    id: "stairs", name: "Stairs", short: "STAIRS", w: 1, h: 1, cost: 0, work: 6, power: 0, siting: "any",
    provides: {}, conductor: true, shaft: true, tier: "stairs", convertsFrom: "shaft", color: "#7d8d94", height: 0.55,
    blurb: "A staircase down the shaft. People can live and work below, but heavy machinery won't fit.",
  },
  lift: {
    id: "lift", name: "Lift", short: "LIFT", w: 1, h: 1, cost: 120_000, work: 12, power: 0, siting: "any",
    provides: {}, conductor: true, shaft: true, convertsFrom: "stairs", color: "#9fb3bb", height: 0.75,
    blurb: "A lift in the stairwell. Generators, workshops and containment can only be built with a lift route.",
  },
  accessPoint: {
    id: "accessPoint", name: "Access point", short: "ACCESS", w: 2, h: 2, cost: 0, work: 16, power: 0, siting: "surface",
    provides: {}, conductor: true, shaft: true, convertsFrom: "frontBuilding", exposure: 0, color: "#7f939c", height: 1,
    blurb: "Your front building with its basement floor broken through. Dig a shaft under it to go down. From outside nothing has changed.",
  },
  tunnel: {
    id: "tunnel", name: "Tunnel", short: "", w: 1, h: 1, cost: 0, work: 6, power: 0, siting: "any",
    provides: {}, conductor: true, color: "#5d6f78", height: 0.22,
    blurb: "Joins rooms together. A room works only if tunnels link it back to the entrance.",
  },
  hangar: {
    id: "hangar", name: "Hangar", short: "HANGAR", w: 3, h: 3, cost: 200_000, work: 100, power: 3, siting: "surface",
    provides: { hangars: 1 }, role: "military", exposure: 35, color: "#6f8d99", height: 0.9,
    blurb: "Houses one interceptor or transport. Surface only.",
  },
  radar: {
    id: "radar", name: "Radar", short: "RADAR", w: 1, h: 1, cost: 500_000, work: 48, power: 2, siting: "surface",
    provides: {}, radar: 300, role: "surveillance", exposure: 12, color: "#8fd1a2", height: 0.7,
    blurb: "Detects craft within 300 nmi. Surface only.",
  },
  largeRadar: {
    id: "largeRadar", name: "Large radar", short: "L-RADAR", w: 2, h: 2, cost: 800_000, work: 100, power: 4, siting: "surface",
    provides: {}, radar: 450, role: "surveillance", exposure: 20, color: "#6cc58a", height: 0.85,
    blurb: "Detects craft within 450 nmi. Surface only.",
  },
  defence: {
    id: "defence", name: "Missile battery", short: "SAM", w: 1, h: 1, cost: 200_000, work: 64, power: 2, siting: "surface",
    provides: { defence: 500 }, role: "military", exposure: 15, color: "#e2553f", height: 0.6,
    blurb: "Fires on craft attacking the base. Surface only.",
  },
  quarters: {
    id: "quarters", name: "Living quarters", short: "QUARTERS", w: 2, h: 2, cost: 400_000, work: 64, power: 2, siting: "any",
    provides: { crew: 50 }, color: "#c9b37e", height: 0.6,
    blurb: "Beds for 50 personnel: soldiers, scientists and engineers all need one.",
  },
  lab: {
    id: "lab", name: "Laboratory", short: "LAB", w: 2, h: 2, cost: 750_000, work: 104, power: 4, siting: "any",
    provides: { science: 50 }, role: "research", color: "#5fa8d3", height: 0.65,
    blurb: "Space for 50 scientists.",
  },
  workshop: {
    id: "workshop", name: "Workshop", short: "WORKSHOP", w: 2, h: 2, cost: 800_000, work: 128, power: 5, siting: "any",
    provides: { engineering: 50 }, heavy: true, role: "manufacturing", color: "#d98b3a", height: 0.65,
    blurb: "Space for 50 engineers.",
  },
  stores: {
    id: "stores", name: "General stores", short: "STORES", w: 2, h: 1, cost: 150_000, work: 40, power: 1, siting: "any",
    provides: { storage: 50 }, role: "manufacturing", color: "#8a7f6b", height: 0.5,
    blurb: "Holds 50 units of equipment, ammunition and salvage.",
  },
  medbay: {
    id: "medbay", name: "Medical bay", short: "MED", w: 2, h: 1, cost: 350_000, work: 56, power: 2, siting: "any",
    provides: { beds: 10 }, role: "military", color: "#e8e1d0", height: 0.5,
    blurb: "Ten beds. Wounded soldiers recover twice as fast.",
  },
  generator: {
    id: "generator", name: "Geothermal plant", short: "POWER", w: 2, h: 2, cost: 600_000, work: 80, power: 0, siting: "underground",
    provides: {}, heavy: true, color: "#e8a93b", height: 0.7,
    blurb: "Supplies power. Hotter rock deeper down: each level lower adds 4 power.",
  },
  containment: {
    id: "containment", name: "Alien containment", short: "CONTAIN", w: 2, h: 2, cost: 400_000, work: 72, power: 4, siting: "underground",
    provides: { containment: 10 }, heavy: true, role: "research", color: "#b05cc7", height: 0.6,
    blurb: "Holds 10 live aliens. Underground only, and only a fool keeps it near the quarters.",
  },
  frontBuilding: {
    id: "frontBuilding", name: "Front building", short: "FRONT", w: 2, h: 2, cost: 0, work: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, owned: true, exposure: 0, color: "#55636e", height: 1,
    blurb: "Bought through a shell company. Convert it into an access point to start digging.",
  },
  tower: {
    id: "tower", name: "Office tower", short: "", w: 2, h: 2, cost: 450_000, work: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, exposure: 10, color: "#4a5761", height: 1.9,
    blurb: "Glass and concrete. Pulling one down makes the news.",
  },
  apartments: {
    id: "apartments", name: "Apartment block", short: "", w: 2, h: 1, cost: 220_000, work: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, exposure: 8, color: "#6b625a", height: 1.15,
    blurb: "People live here. Moving them out is slow and noticed.",
  },
  warehouse: {
    id: "warehouse", name: "Warehouse", short: "", w: 2, h: 2, cost: 120_000, work: 0, power: 0, siting: "surface",
    provides: {}, detritus: true, exposure: 3, color: "#57534a", height: 0.8,
    blurb: "Cheap to buy out and nobody asks why.",
  },
  shops: {
    id: "shops", name: "Shopfronts", short: "", w: 1, h: 1, cost: 60_000, work: 0, power: 0, siting: "surface",
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
  "accessPoint", "shaft", "stairs", "lift", "tunnel", "quarters", "lab", "workshop", "stores", "medbay", "generator",
  "containment", "hangar", "radar", "largeRadar", "defence",
];

/** Power a geothermal plant supplies on a given level (0 is the surface). */
export function powerSupply(level: number): number {
  return 12 + 4 * Math.max(0, level - 1);
}

/** Digging gets dearer and slower the deeper you go. */
export const DEPTH_COST = [1, 1.1, 1.25, 1.5];

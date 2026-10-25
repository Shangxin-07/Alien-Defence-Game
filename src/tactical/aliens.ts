import { Stats, WEAPONS, Weapon } from "./rules";

/**
 * Who the aliens are and how each one thinks. Every race has norms; before each fight the squad
 * rolls its personality inside them, so the same race never plays the same way twice.
 */

/** The four ways an alien's mind can lean, each 0 to 100. */
export interface Personality {
  /** Charge (high) or hold (low). Takes worse shots, keeps less back for reflexes, retreats later. */
  aggression: number;
  /** Values cover and breaks off early when hurt. */
  caution: number;
  /** Packs together and leans on its leader. A tight squad falls harder when the leader dies. */
  cohesion: number;
  /** Flanks, waits in ambush, stays out of sight. */
  cunning: number;
}

export const AXES: (keyof Personality)[] = ["aggression", "caution", "cohesion", "cunning"];

export type RaceId = "strider" | "brute" | "shade";
/** Leaders give the orders; a second steps up when the leader falls; a lone alien answers to nobody. */
export type Rank = "leader" | "second" | "soldier" | "lone";
/** What a frightened alien does this turn. */
export type AlienState = "steady" | "berserk" | "cowering" | "frozen";

export interface Race {
  id: RaceId;
  name: string;
  plural: string;
  /** What the survivors make of them, for briefings. */
  blurb: string;
  /** A rank-and-file soldier. Leaders and stragglers are built from it. */
  stats: Stats;
  weapon: Weapon;
  /** The range each personality axis can roll in. */
  norms: Record<keyof Personality, [number, number]>;
  /** Tiles it can sense a heartbeat through walls; 0 for none. */
  tracker: number;
  /** Health it grows back each turn. */
  regen: number;
  /** Name colour on the map. */
  look: string;
  /** Model size: overall and across the shoulders. */
  size: number;
  width: number;
}

export const RACES: Record<RaceId, Race> = {
  strider: {
    id: "strider",
    name: "Strider",
    plural: "Striders",
    blurb: "Tall, thin and patient. The kind that hunted you the first night.",
    stats: { tu: 60, health: 38, bravery: 80, reactions: 70, accuracy: 62, melee: 50, armour: 6 },
    weapon: WEAPONS.plasmaPistol,
    norms: { aggression: [35, 75], caution: [35, 75], cohesion: [45, 90], cunning: [40, 80] },
    tracker: 12,
    regen: 2,
    look: "#b5e655",
    size: 1,
    width: 1,
  },
  brute: {
    id: "brute",
    name: "Brute",
    plural: "Brutes",
    blurb: "Big, slow and armoured. They walk through things rather than round them.",
    stats: { tu: 52, health: 70, bravery: 95, reactions: 40, accuracy: 52, melee: 85, armour: 12 },
    weapon: WEAPONS.plasmaScatter,
    norms: { aggression: [60, 100], caution: [0, 35], cohesion: [20, 65], cunning: [0, 30] },
    tracker: 6,
    regen: 3,
    look: "#d98a4e",
    size: 1.2,
    width: 1.5,
  },
  shade: {
    id: "shade",
    name: "Shade",
    plural: "Shades",
    blurb: "Small and quick, and you rarely see one until it has already fired.",
    stats: { tu: 72, health: 28, bravery: 60, reactions: 95, accuracy: 78, melee: 40, armour: 3 },
    weapon: WEAPONS.needleRifle,
    norms: { aggression: [10, 45], caution: [55, 100], cohesion: [10, 55], cunning: [60, 100] },
    tracker: 0,
    regen: 1,
    look: "#8fb8e8",
    size: 0.85,
    width: 0.8,
  },
};

/** What the battle knows about an alien's mind. */
export interface AlienMind {
  race: RaceId;
  rank: Rank;
  /** What it rolled before the fight. */
  nature: Personality;
  /** How it leans right now: its nature, pushed around by what's happened. */
  mind: Personality;
  state: AlienState;
  /** A personal nudge big enough to stand out from the pack: the hothead in a cautious squad. */
  maverick: boolean;
  /** Turns spent lying in wait in a row; it gives up and moves after a couple. */
  waited: number;
}

/** The squad's shared doctrine, rolled by its leader, and each member's mind. */
export interface Squad {
  race: RaceId;
  doctrine: Personality;
  members: AlienMind[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const between = ([lo, hi]: [number, number], rand: () => number) => lo + (hi - lo) * rand();

/**
 * Rolls a squad: the leader picks a doctrine inside the race's norms, and everyone gets a small
 * personal nudge. About one in eight is a maverick whose nudge is big enough to notice.
 * `norms` overrides the race's, for set pieces like the prologue's Hunter.
 */
export function rollSquad(race: RaceId, size: number, rand: () => number, norms = RACES[race].norms): Squad {
  const doctrine = {} as Personality;
  for (const k of AXES) doctrine[k] = Math.round(between(norms[k], rand));
  const members: AlienMind[] = [];
  for (let i = 0; i < size; i++) {
    const rank: Rank = size === 1 ? "lone" : i === 0 ? "leader" : i === 1 && size >= 3 ? "second" : "soldier";
    // The leader is the doctrine; the rest drift from it.
    const maverick = rank !== "leader" && rank !== "lone" && rand() < 0.125;
    const nature = {} as Personality;
    for (const k of AXES) {
      const spread = rank === "leader" || rank === "lone" ? 0 : maverick ? 35 : 12;
      const [lo, hi] = norms[k];
      // A maverick can step outside its race's norms; nobody else can.
      const room = maverick ? 20 : 0;
      nature[k] = Math.round(clamp(doctrine[k] + (rand() * 2 - 1) * spread, Math.max(0, lo - room), Math.min(100, hi + room)));
    }
    members.push({ race, rank, nature, mind: { ...nature }, state: "steady", maverick, waited: 0 });
  }
  return { race, doctrine, members };
}

/** Stats for one alien by rank. Leaders are tougher and sharper; stragglers are worn down. */
export function alienStats(race: RaceId, rank: Rank, straggler = false): Stats {
  const s = { ...RACES[race].stats };
  if (rank === "leader") {
    s.health = Math.round(s.health * 1.2);
    s.accuracy += 8;
    s.reactions += 8;
    s.bravery = Math.min(100, s.bravery + 10);
    s.armour += 2;
  }
  if (straggler) {
    s.health = Math.round(s.health * 0.9);
    s.tu = Math.round(s.tu * 0.95);
    s.accuracy -= 2;
  }
  return s;
}

/** The name it shows on the field. */
export function alienName(race: RaceId, rank: Rank): string {
  const r = RACES[race].name;
  return rank === "leader" ? `${r} leader` : rank === "lone" ? r : rank === "second" ? `${r} (2)` : r;
}

// ---------- Reading them ----------

/** What a soldier might say about each axis, high and low. Hints, never numbers. */
const READS: Record<keyof Personality, { high: string; low: string }> = {
  aggression: { high: "They're moving fast and loud. They won't wait for us.", low: "Whatever's out there is in no hurry." },
  caution: { high: "It keeps to cover. Every time we look, it's behind something.", low: "It isn't bothering with cover. It wants to be seen." },
  cohesion: { high: "They move together, like they've drilled it.", low: "They're spread out, each one doing its own thing." },
  cunning: { high: "Something's been watching us.", low: "It isn't trying to hide." },
};

/**
 * What your people can tell about a squad before the fight. How much they can read grows with
 * `knowledge`: how many times you've met this race, and what research has worked out.
 */
export function readSquad(squad: Squad, knowledge: number): string[] {
  const race = RACES[squad.race];
  const n = squad.members.length;
  const lines: string[] = [];
  if (knowledge > 0) lines.push(`${n === 1 ? `A ${race.name}` : `${race.plural}`}. ${race.blurb}`);
  if (n > 1) lines.push(knowledge > 0 ? `${n === 2 ? "Two" : n === 3 ? "Three" : n} of them.` : "More than one. Nobody got a proper count.");
  const reads = AXES.map((k) => ({ k, off: squad.doctrine[k] - 50 }))
    .filter((r) => Math.abs(r.off) >= 18)
    .sort((a, b) => Math.abs(b.off) - Math.abs(a.off));
  const depth = Math.min(3, 1 + knowledge);
  for (const r of reads.slice(0, depth)) lines.push(`"${r.off > 0 ? READS[r.k].high : READS[r.k].low}"`);
  if (!reads.length) lines.push(`"Hard to read. It's gone quiet out there."`);
  if (knowledge >= 3 && n > 1) lines.push("Kill the one giving orders and the rest will come apart, for a while.");
  return lines;
}

/** What a soldier says on first seeing one that doesn't fit the pack, or the one in charge. */
export function firstLook(m: AlienMind): string | null {
  if (m.rank === "leader") return "That one hangs back. The others keep looking at it.";
  if (!m.maverick) return null;
  const k = AXES.reduce((a, b) => (Math.abs(m.nature[b] - 50) > Math.abs(m.nature[a] - 50) ? b : a));
  if (k === "aggression") return m.nature.aggression > 50 ? "That one's not waiting for the others." : "That one's hanging back.";
  if (k === "caution") return m.nature.caution > 50 ? "That one's hugging cover." : "That one's walking right out in the open.";
  if (k === "cunning") return m.nature.cunning > 50 ? "That one's trying to get round us." : "That one doesn't care if we see it.";
  return m.nature.cohesion > 50 ? "That one's sticking close to the rest." : "That one's off on its own.";
}

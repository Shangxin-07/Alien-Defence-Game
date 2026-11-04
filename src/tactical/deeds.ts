/**
 * What one person did in one fight, counted as it happens. Nothing here changes how a fight goes:
 * it only keeps what used to be thrown away, so the campaign can add it to their service record
 * (and, later, so people can learn by doing). Every field is a plain count, so records add up.
 */
export interface Deeds {
  /** Turns of yours they started on their feet. */
  turns: number;
  /** Time units they had to spend across those turns, and what they left unspent. Frozen turns don't count. */
  tuHad: number;
  tuLeft: number;
  /** Tiles walked, storeys climbed or dropped, doors opened, times they knelt. */
  tiles: number;
  storeys: number;
  doors: number;
  kneels: number;
  /** Trigger pulls by fire mode, rounds fired, rounds that hit an enemy, and the longest of those hits in tiles. */
  snapShots: number;
  aimedShots: number;
  autoShots: number;
  rounds: number;
  hits: number;
  longest: number;
  /** Rounds that hit one of your own. */
  friendlyHits: number;
  /** Shots fired on reflex, and the rounds of those that hit. */
  reflexShots: number;
  reflexHits: number;
  /** Aliens they finished off, and ones they knocked out with the baton. */
  kills: number;
  takedowns: number;
  /** Baton swings and the ones that landed. */
  swings: number;
  stunHits: number;
  /** Damage they did to the enemy, and scenery they brought down. */
  damageDealt: number;
  wrecked: number;
  /** Aliens they were first to spot. */
  spotted: number;
  /** Times hit (grazes too), damage taken from hits and from bleeding, wounds opened. */
  timesHit: number;
  damageTaken: number;
  bled: number;
  wounds: number;
  /** Turns they had to hold their nerve (morale under 50), and the ones they froze on. */
  nerveHeld: number;
  froze: number;
  /** Friends who died while they were still standing. */
  friendsLost: number;
  /** Medikit uses on others or themselves, health given back, wounds closed. */
  heals: number;
  healed: number;
  bleedsStopped: number;
  /** Fights they led the squad in. */
  led: number;
}

export type DeedKey = keyof Deeds;

export function emptyDeeds(): Deeds {
  return {
    turns: 0, tuHad: 0, tuLeft: 0, tiles: 0, storeys: 0, doors: 0, kneels: 0,
    snapShots: 0, aimedShots: 0, autoShots: 0, rounds: 0, hits: 0, longest: 0, friendlyHits: 0, reflexShots: 0, reflexHits: 0,
    kills: 0, takedowns: 0, swings: 0, stunHits: 0, damageDealt: 0, wrecked: 0, spotted: 0,
    timesHit: 0, damageTaken: 0, bled: 0, wounds: 0, nerveHeld: 0, froze: 0, friendsLost: 0,
    heals: 0, healed: 0, bleedsStopped: 0, led: 0,
  };
}

/** Fields that keep the best rather than a running total. */
const BEST: DeedKey[] = ["longest"];

/** Adds one fight's deeds into a running total. Missing fields (older saves) count as nothing. */
export function addDeeds(into: Deeds, from: Partial<Deeds>): Deeds {
  for (const k of Object.keys(emptyDeeds()) as DeedKey[]) {
    const v = from[k] ?? 0;
    into[k] = BEST.includes(k) ? Math.max(into[k] ?? 0, v) : (into[k] ?? 0) + v;
  }
  return into;
}

/** Time units spent across a record. */
export const tuSpent = (d: Deeds) => Math.max(0, d.tuHad - d.tuLeft);

/** Shots of any mode. */
export const shotsTaken = (d: Deeds) => d.snapShots + d.aimedShots + d.autoShots;

/** A short line about one fight, for the results screen. Empty if they did nothing worth saying. */
export function fightLine(d: Deeds): string {
  const bits: string[] = [];
  if (d.rounds) bits.push(`${d.hits}/${d.rounds} hits`);
  if (d.kills) bits.push(`${d.kills} kill${d.kills === 1 ? "" : "s"}`);
  if (d.takedowns) bits.push(`${d.takedowns} taken down`);
  if (d.healed || d.bleedsStopped) bits.push(`patched up ${d.healed} HP`);
  if (d.damageTaken + d.bled) bits.push(`took ${d.damageTaken + d.bled} damage`);
  if (d.froze) bits.push(`froze ${d.froze}×`);
  if (d.tiles) bits.push(`${d.tiles} tiles`);
  return bits.join(" · ");
}

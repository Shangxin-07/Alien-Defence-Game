import { AlienMind, RACES, RaceId, Squad } from "./aliens";
import type { Tally } from "./battle";

/**
 * The aliens learn how you fight. Each race keeps track of your habits across battles and shifts
 * its squads to counter them: slowly, readably, and only for as long as you keep doing it.
 */

/** The habits they pick up on: sitting tight on reflex fire, pushing in close, going in with the baton. */
export type Habit = "holding" | "pushing" | "takedowns";
export const HABITS: Habit[] = ["holding", "pushing", "takedowns"];
export type Habits = Record<Habit, number>;

export const noHabits = (): Habits => ({ holding: 0, pushing: 0, takedowns: 0 });

/** Share of the way a race moves toward what it saw in one fight. */
export const LEARN_RATE = 0.25;
/** Survivors who got away tell the rest: they learn faster. */
export const ESCAPED_RATE = 1.5;
/** Losing a commander loses what it knew: they learn more slowly from that fight. */
export const COMMANDER_RATE = 0.5;
/** Once research has opened up one of their leaders, you know how they pass things on, and can feed them less. */
export const RESEARCHED_RATE = 0.75;
/** Your people notice once a counter is this far along. */
export const NOTICED = 0.35;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * What one fight showed of how you fight, each 0 to 1. Holding is time left unspent at the end of
 * your turns; pushing is the opposite, plus how many of your shots were close; takedowns are swings
 * of the baton.
 */
export function observe(t: Tally): Habits {
  const idle = t.humanTurns ? t.idleTu / t.humanTurns : 0.5;
  const close = t.shots >= 2 ? t.closeShots / t.shots : 0;
  return {
    holding: clamp01((idle - 0.45) / 0.25),
    pushing: clamp01(Math.max((0.6 - idle) / 0.3, close * 1.5)),
    takedowns: clamp01(t.stunTries / 1.5),
  };
}

/** How a race's picture of you moves after a fight. */
export function learn(known: Habits, seen: Habits, opts: { escaped?: boolean; commanderDown?: boolean; researched?: boolean } = {}): Habits {
  let rate = LEARN_RATE;
  if (opts.escaped) rate *= ESCAPED_RATE;
  if (opts.commanderDown) rate *= COMMANDER_RATE;
  if (opts.researched) rate *= RESEARCHED_RATE;
  const out = noHabits();
  for (const h of HABITS) out[h] = Math.round((known[h] + (seen[h] - known[h]) * rate) * 1000) / 1000;
  return out;
}

/**
 * Gives a squad what its race has learned. Each counter beats one habit and leaves an opening for
 * another, so changing how you fight is always the way out:
 * - you sit tight on reflex fire: they shoot from the dark instead of walking into it, and keep
 *   nothing back, so a rush catches them;
 * - you rush them: they hold their ground and keep time back to fire as you come, so they're slow
 *   to come to you;
 * - you go in with the baton: they shoot whoever carries one first.
 */
export function adaptSquad(squad: Squad, known: Habits | undefined): Squad {
  if (!known || HABITS.every((h) => known[h] <= 0)) return squad;
  for (const m of squad.members) m.counters = { ...known };
  return squad;
}

/** How much more a squad that's learned about the baton wants to shoot whoever carries one. */
export const batonGrudge = (m: AlienMind | undefined) => (m?.counters?.takedowns ?? 0) * 0.35;

const SIGNS: Record<Habit, { on: string; off: string }> = {
  holding: { on: "They've stopped walking into our sights. They wait us out, or come round the side.", off: "they've stopped expecting us to sit tight" },
  pushing: { on: "They don't let us close in any more. They hang back in cover and cover each other.", off: "they've stopped bracing for us to rush them" },
  takedowns: { on: "They watch for the baton now. Whoever carries one draws their fire.", off: "they've stopped watching for the baton" },
};

/** What your people have noticed about how a race has adapted. */
export function adaptReads(known: Habits | undefined): string[] {
  if (!known) return [];
  return HABITS.filter((h) => known[h] >= NOTICED).map((h) => `"${SIGNS[h].on}"`);
}

/** News when a race picks up a habit of yours, or lets one go. */
export function adaptNews(race: RaceId, before: Habits, after: Habits): string[] {
  const name = RACES[race].plural;
  const out: string[] = [];
  for (const h of HABITS) {
    if (before[h] < NOTICED && after[h] >= NOTICED) out.push(`${name} are learning how you fight: ${SIGNS[h].on.split(".")[0].toLowerCase()}`);
    if (before[h] >= NOTICED && after[h] < NOTICED) out.push(`${name} have adapted back: ${SIGNS[h].off}`);
  }
  return out;
}

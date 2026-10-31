import { Kit, arrivalKit } from "./armoury";
import type { Stats } from "../tactical/rules";

/**
 * Recruitment: someone walks the streets and talks people into joining. Most want something in
 * return, a fulfillment, and the better they are the more they ask. Keep the promise and they
 * stay loyal; break it and they may walk, or worse. Anyone desperate enough joins for nothing,
 * but they bring little with them.
 */

export type Fulfillment = "food" | "medicine" | "family" | "revenge" | "bed" | "none";

export interface Candidate {
  id: number;
  name: string;
  role: string;
  stats: Stats;
  aptitude: number;
  build: number;
  /** What they want for joining. */
  wants: Fulfillment;
  /** How much: units of food or medicine, or dependants for family. */
  amount: number;
  /** Base the recruiter came from; they'd live there. */
  base: number;
  /** Last day they'll wait for an answer. */
  until: number;
  /** What they'd bring with them. Missing in saves from before the armoury. */
  kit?: Kit;
}

/** A promise made to get someone on board, and when it falls due. */
export interface Pledge {
  person: number;
  wants: Exclude<Fulfillment, "food" | "family" | "none">;
  amount: number;
  /** Day the promise falls due. */
  due: number;
  /** Count of alien kills and captures when it was made, for revenge. */
  kills?: number;
}

/** Days a candidate waits for an answer before moving on. */
export const CANDIDATE_WAIT = 3;
/** Days to keep a promise of medicine. */
export const MEDICINE_DAYS = 10;
/** Days to keep a promise of revenge or a bed. */
export const LONG_PROMISE_DAYS = 30;
/** Loyalty of someone new who was promised something, and of a drifter who wasn't. */
export const RECRUIT_LOYALTY = 60;
export const DRIFTER_LOYALTY = 45;
export const KEPT_BONUS = 20;
export const BROKEN_PENALTY = 40;
/** Loyalty lost when someone's family goes hungry. */
export const FAMILY_HUNGER_PENALTY = 10;
/** Below this, people leave. Below the second, they take food with them. */
export const LEAVE_BELOW = 30;
export const STEAL_BELOW = 10;
/** Chance a day that one recruiter turns up someone worth talking to, and someone desperate. */
export const CANDIDATE_CHANCE = 0.45;
export const DRIFTER_CHANCE = 0.25;

export const WANT_TEXT: Record<Fulfillment, (amount: number) => string> = {
  food: (n) => `${n} food for their family, up front`,
  medicine: (n) => `${n} medicine for a sick parent, within ${MEDICINE_DAYS} days`,
  family: (n) => `room for ${n === 1 ? "their partner" : `their family of ${n}`}: ${n} more mouth${n === 1 ? "" : "s"} to feed, every day`,
  revenge: () => `to see an alien dead or caught within ${LONG_PROMISE_DAYS} days`,
  bed: () => `a real bed: living quarters working in a base within ${LONG_PROMISE_DAYS} days`,
  none: () => "nothing. They're just hungry",
};

interface Trade {
  role: string;
  /** Construction and research at quality 0 and 1. */
  build: [number, number];
  research: [number, number];
  /** Better at fighting than most. */
  fighter?: boolean;
}

const TRADES: Trade[] = [
  { role: "Builder", build: [1, 1.4], research: [0.7, 0.9] },
  { role: "Electrician", build: [0.95, 1.25], research: [0.85, 1.1] },
  { role: "Mechanic", build: [0.9, 1.2], research: [0.8, 1] },
  { role: "Nurse", build: [0.7, 0.9], research: [0.9, 1.2] },
  { role: "Chemist", build: [0.6, 0.8], research: [1, 1.4] },
  { role: "Teacher", build: [0.7, 0.9], research: [0.95, 1.25] },
  { role: "Soldier", build: [0.85, 1.1], research: [0.7, 0.9], fighter: true },
  { role: "Shop worker", build: [0.75, 1], research: [0.8, 1] },
];

const FIRST = ["Aiko", "Bram", "Carmen", "Dev", "Esra", "Femi", "Gita", "Hugo", "Iris", "Joon", "Kemal", "Lucia", "Musa", "Nell", "Oskar", "Pita", "Rosa", "Sami", "Tariq", "Vera", "Wen", "Yara"];
const LAST = ["Abara", "Berg", "Castillo", "Dube", "Engel", "Farouk", "Grant", "Hosseini", "Ito", "Jovanovic", "Kaur", "Lindqvist", "Mwangi", "Nakamura", "Oduya", "Popescu", "Quinn", "Rossi", "Tan", "Volkov"];

const lerp = ([a, b]: [number, number], t: number) => Math.round((a + (b - a) * t) * 100) / 100;

function civilianStats(rand: () => number, fighter: boolean): Stats {
  const v = (n: number) => Math.round(n * (0.85 + rand() * 0.3));
  return fighter
    ? { tu: v(58), health: v(36), bravery: v(55), reactions: v(55), accuracy: v(62), melee: v(55), armour: 0 }
    : { tu: v(52), health: v(32), bravery: v(40), reactions: v(42), accuracy: v(42), melee: v(38), armour: 0 };
}

/** Someone a recruiter met, with what they want. The better they are, the more they ask. */
export function rollCandidate(id: number, base: number, day: number, rand: () => number): Candidate {
  const trade = TRADES[Math.floor(rand() * TRADES.length)];
  const q = rand();
  const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
  const wants = (["food", "medicine", "family", "revenge", "bed"] as const)[Math.floor(rand() * 5)];
  const amount = wants === "food" ? Math.round(6 + 12 * q) : wants === "medicine" ? Math.round(2 + 3 * q) : wants === "family" ? 1 + Math.round(2 * q) : 0;
  const stats = civilianStats(rand, !!trade.fighter);
  return { id, name, role: trade.role, stats, aptitude: lerp(trade.research, q), build: lerp(trade.build, q), wants, amount, base, until: day + CANDIDATE_WAIT, kit: arrivalKit(trade.role, rand) };
}

/** Someone desperate who'll work for a roof and nothing else. */
export function rollDrifter(id: number, base: number, day: number, rand: () => number): Candidate {
  const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
  const stats = civilianStats(rand, false);
  stats.health = Math.round(stats.health * 0.8);
  return {
    id, name, role: "Drifter", stats, base, until: day + CANDIDATE_WAIT,
    aptitude: Math.round((0.7 + rand() * 0.15) * 100) / 100,
    build: Math.round((0.6 + rand() * 0.2) * 100) / 100,
    wants: "none", amount: 0, kit: arrivalKit("Drifter", rand),
  };
}

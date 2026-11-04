import { Kit, arrivalKit } from "./armoury";
import type { Stats } from "../tactical/rules";
import { Attributes, CIVILIAN, FIGHTER, Profile, Skills, Template, buildRate, deriveStats, researchAptitude, rollProfile, setWorkSkills } from "../tactical/attributes";

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
  /** Who they are. Missing in saves from before attributes; the campaign works them out on joining. */
  attributes?: Attributes;
  skills?: Skills;
  /** What those come to, for the recruitment screen. */
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
  kit?: Kit;  /** Who found them, for that person's record. */
  by?: number;
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
  /** Intelligence they lean towards, if not the usual 40. */
  int?: number;
  /** Skills their trade gives them, at quality 0 and 1. */
  extra?: Partial<Record<keyof Skills, [number, number]>>;
}

const TRADES: Trade[] = [
  { role: "Builder", build: [1, 1.4], research: [0.7, 0.9], int: 30 },
  { role: "Electrician", build: [0.95, 1.25], research: [0.85, 1.1] },
  { role: "Mechanic", build: [0.9, 1.2], research: [0.8, 1], extra: { scrounging: [10, 30] } },
  { role: "Nurse", build: [0.7, 0.9], research: [0.9, 1.2], extra: { medicine: [30, 60] } },
  { role: "Chemist", build: [0.6, 0.8], research: [1, 1.4], int: 50 },
  { role: "Teacher", build: [0.7, 0.9], research: [0.95, 1.25], extra: { persuasion: [10, 40] } },
  { role: "Soldier", build: [0.85, 1.1], research: [0.7, 0.9], fighter: true, int: 30 },
  { role: "Shop worker", build: [0.75, 1], research: [0.8, 1], extra: { persuasion: [20, 50] } },
];

const FIRST = ["Aiko", "Bram", "Carmen", "Dev", "Esra", "Femi", "Gita", "Hugo", "Iris", "Joon", "Kemal", "Lucia", "Musa", "Nell", "Oskar", "Pita", "Rosa", "Sami", "Tariq", "Vera", "Wen", "Yara"];
const LAST = ["Abara", "Berg", "Castillo", "Dube", "Engel", "Farouk", "Grant", "Hosseini", "Ito", "Jovanovic", "Kaur", "Lindqvist", "Mwangi", "Nakamura", "Oduya", "Popescu", "Quinn", "Rossi", "Tan", "Volkov"];

const lerp = ([a, b]: [number, number], t: number) => Math.round((a + (b - a) * t) * 100) / 100;

/** How far a recruit's attributes and skills stray from their kind, either way. */
const SPREAD = 0.3;

/** What a candidate's attributes and skills come to. */
function worked(p: Profile): Pick<Candidate, "attributes" | "skills" | "stats" | "aptitude" | "build"> {
  return { ...p, stats: deriveStats(p), aptitude: researchAptitude(p), build: buildRate(p) };
}

/** Rolls someone of this trade at quality `q`: the better they are at their trade, the more they ask. */
function tradesman(trade: Trade, q: number, rand: () => number): Profile {
  const base: Template = trade.fighter ? FIGHTER : CIVILIAN;
  const t: Template = { attributes: { ...base.attributes, int: trade.int ?? base.attributes.int }, skills: base.skills };
  const p = rollProfile(t, SPREAD, rand);
  for (const [k, range] of Object.entries(trade.extra ?? {}) as [keyof Skills, [number, number]][]) p.skills[k] = Math.round(lerp(range, q));
  return setWorkSkills(p, lerp(trade.research, q), lerp(trade.build, q));
}

/** Someone a recruiter met, with what they want. The better they are, the more they ask. */
export function rollCandidate(id: number, base: number, day: number, rand: () => number): Candidate {
  const trade = TRADES[Math.floor(rand() * TRADES.length)];
  const q = rand();
  const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
  const wants = (["food", "medicine", "family", "revenge", "bed"] as const)[Math.floor(rand() * 5)];
  const amount = wants === "food" ? Math.round(6 + 12 * q) : wants === "medicine" ? Math.round(2 + 3 * q) : wants === "family" ? 1 + Math.round(2 * q) : 0;
  const who = worked(tradesman(trade, q, rand));
  return { id, name, role: trade.role, ...who, wants, amount, base, until: day + CANDIDATE_WAIT, kit: arrivalKit(trade.role, rand) };
}

/** Someone desperate who'll work for a roof and nothing else. */
export function rollDrifter(id: number, base: number, day: number, rand: () => number): Candidate {
  const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
  // Worn down by living rough: less to them, and their work skills are rusty.
  const p = rollProfile(CIVILIAN, SPREAD, rand);
  p.attributes.end = Math.max(1, Math.round(p.attributes.end * 0.7));
  p.attributes.str = Math.max(1, Math.round(p.attributes.str * 0.85));
  p.attributes.int = Math.max(1, Math.round(p.attributes.int * 0.85));
  p.skills.scrounging = Math.round(20 + rand() * 20);
  setWorkSkills(p, 0.7 + rand() * 0.15, 0.6 + rand() * 0.2);
  return { id, name, role: "Drifter", ...worked(p), base, until: day + CANDIDATE_WAIT, wants: "none", amount: 0, kit: arrivalKit("Drifter", rand) };
}

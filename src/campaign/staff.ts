import type { Gender } from "../tactical/gender";
import type { Duty } from "./allocation";
import type { Kit, Request } from "./armoury";
import type { Stats } from "../tactical/rules";
import { Attributes, Profile, ROLE_TEMPLATES, Skills, buildRate, deriveStats, inferProfile, noSkills, researchAptitude } from "../tactical/attributes";
import type { PerkId } from "../tactical/perks";
import type { ServiceRecord } from "./record";

/**
 * The people who work for you between battles. What they can research is in tech.ts.
 * Nothing here depends on who in particular survived the prologue: anyone can do any job,
 * so losing people makes the work slower, never impossible.
 */

export type Job = "research" | "construction" | "rest";

export const JOB_NAMES: Record<Job, string> = {
  research: "Research",
  construction: "Construction",
  rest: "Resting",
};

export interface Person {
  id: number;
  name: string;
  role: string;
  /** Woman or man, for their portrait. Missing in old saves; `restore` works it out from the name. */
  gender?: Gender;
  /** Who they are and what they've learned. Missing in saves from before attributes; see `settle`. */
  attributes?: Attributes;
  skills?: Skills;
  /** How high each attribute can ever be trained. Hidden; rolled the first time they learn anything. */
  ceiling?: Attributes;
  /** Knacks they've picked (tactical/perks.ts), and three on offer waiting for the player to choose. */
  perks?: PerkId[];
  perkOffer?: PerkId[];
  /** Their fight numbers, worked out from attributes and skills by `settle`. Armour is always 0: it's worn. */
  stats: Stats;
  health: number;
  /** Research points a day, worked out from Intelligence and Science. */
  aptitude: number;
  /**
   * Person-days of construction they get done in a day, worked out from Strength, Endurance and
   * Engineering. Missing in saves from before construction took work; see `buildSkill`.
   */
  build?: number;
  /** Base they live and work at, or null while there's no base yet. */
  base: number | null;
  job: Job;
  /** The scavenging run they're out on, if any. */
  away?: number;
  /** Days in a row without enough to eat. */
  hunger?: number;
  /**
   * 0–100. Unset for the people who were there from the first night, who aren't going anywhere.
   * Recruits who fall below 30 leave.
   */
  loyalty?: number;
  /** Family who came with them: they eat, but don't work. */
  dependants?: number;
  /** What they carry. Missing in saves from before the armoury; see `legacyKit`. */
  kit?: Kit;
  /** What they've asked the quartermaster for. Missing means their role's default. */
  request?: Request;
  /** What they're set aside for on the allocation page. Missing or empty means anything. */
  duties?: Duty[];
  /** Whether those duties are a lock (they can't be sent elsewhere) or only a preference (a warning). */
  locked?: boolean;  /** Everything they've done for you. Missing in saves from before records were kept. */
  record?: ServiceRecord;
}

/** Hungry people work at half pace. */
export const workPace = (p: Person) => (p.hunger ? 0.5 : 1);

/** Someone too badly hurt to work: under half health. They heal a point a day. */
export const fitToWork = (p: Person) => p.health >= p.stats.health / 2;

/** How handy each old job leaves someone with a shovel. Anyone else counts as 1. */
export const BUILD_BY_ROLE: Record<string, number> = {
  "Army reservist": 1.15,
  "Security guard": 1,
  "Police officer": 0.95,
  Paramedic: 0.85,
  Liaison: 0.8,
};

/** Construction skill, falling back on their old job for people from older saves. */
export const buildSkill = (p: Person) => p.build ?? BUILD_BY_ROLE[p.role] ?? 1;
/** Labs multiply research done at their base. */
export const LAB_BONUS = 0.5;

/** Someone's attributes and skills together. Only for people `settle` has seen to. */
export const profileOf = (p: Person): Profile => ({ attributes: p.attributes!, skills: p.skills!, perks: p.perks });

/**
 * Makes sure someone has attributes, then works out everything that comes from them: fight
 * numbers, research and building. People from before attributes get ones that fit the numbers
 * they had. Returns the armour they had as part of themselves, which from now on has to be worn.
 */
export function settle(p: Person): number {
  const innate = p.stats.armour;
  if (!p.attributes || !p.skills) {
    const inferred = inferProfile(p.stats, p.aptitude, buildSkill(p), p.role);
    p.attributes = inferred.attributes;
    p.skills = inferred.skills;
  }
  // Their own copies: nobody shares a mind with whoever they were copied from.
  p.attributes = { ...p.attributes };
  p.skills = { ...noSkills(), ...p.skills };
  const wasFull = p.health >= p.stats.health;
  const profile = profileOf(p);
  p.stats = deriveStats(profile);
  p.aptitude = researchAptitude(profile);
  p.build = buildRate(profile);
  p.health = wasFull ? p.stats.health : Math.max(1, Math.min(p.health, p.stats.health));
  return innate;
}

const LIAISON_PROFILE: Profile = { attributes: { ...ROLE_TEMPLATES.Liaison.attributes }, skills: { ...noSkills(), ...ROLE_TEMPLATES.Liaison.skills } };

/** Stands in for nobody: the council sends one person if no one walked out of the city. */
export const LIAISON: Omit<Person, "id" | "base" | "job"> = {
  name: "Council liaison",
  role: "Liaison",
  ...LIAISON_PROFILE,
  stats: deriveStats(LIAISON_PROFILE),
  health: deriveStats(LIAISON_PROFILE).health,
  aptitude: researchAptitude(LIAISON_PROFILE),
  build: buildRate(LIAISON_PROFILE),
};


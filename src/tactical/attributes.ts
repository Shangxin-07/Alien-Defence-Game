import type { Stats } from "./rules";

/**
 * Who someone is, and what they've learned. Seven attributes, each 1–100 (an average adult is
 * about 40, a fit trained soldier 50–60, around 80 is as good as people get), and seven skills,
 * 0–100. Every number the game uses about a person is worked out from these: time units, health,
 * aim and the rest in a fight, research and building at home. Nothing is stored twice.
 *
 * The formulas are set so that an ordinary civilian (40 in everything, no skills) comes out with
 * the same numbers people had before attributes existed. The game gets deeper, not easier.
 */

export interface Attributes {
  /** Muscle: lifting, carrying, hitting. */
  str: number;
  /** Hands and footwork. */
  dex: number;
  /** Stamina and toughness. */
  end: number;
  /** Eyes, ears, noticing things. */
  per: number;
  /** Learning and reasoning. */
  int: number;
  /** Nerve under pressure. */
  wil: number;
  /** Getting people to listen. */
  cha: number;
}

export interface Skills {
  firearms: number;
  close: number;
  medicine: number;
  persuasion: number;
  engineering: number;
  science: number;
  scrounging: number;
}

export interface Profile {
  attributes: Attributes;
  skills: Skills;
}

export const ATTRIBUTES: (keyof Attributes)[] = ["str", "dex", "end", "per", "int", "wil", "cha"];
export const SKILLS: (keyof Skills)[] = ["firearms", "close", "medicine", "persuasion", "engineering", "science", "scrounging"];

export const ATTRIBUTE_NAMES: Record<keyof Attributes, string> = {
  str: "Strength", dex: "Dexterity", end: "Endurance", per: "Perception", int: "Intelligence", wil: "Willpower", cha: "Charisma",
};
export const ATTRIBUTE_SHORT: Record<keyof Attributes, string> = { str: "Str", dex: "Dex", end: "End", per: "Per", int: "Int", wil: "Wil", cha: "Cha" };
export const SKILL_NAMES: Record<keyof Skills, string> = {
  firearms: "Firearms", close: "Close combat", medicine: "Medicine", persuasion: "Persuasion", engineering: "Engineering", science: "Science", scrounging: "Scrounging",
};

export const noSkills = (): Skills => ({ firearms: 0, close: 0, medicine: 0, persuasion: 0, engineering: 0, science: 0, scrounging: 0 });
const attrs = (str: number, dex: number, end: number, per: number, int: number, wil: number, cha: number): Attributes => ({ str, dex, end, per, int, wil, cha });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ---------- What they work out to ----------

/** A person's numbers in a fight. Armour is never theirs: it comes from what they wear. */
export function deriveStats({ attributes: a, skills: s }: Profile): Stats {
  return {
    tu: Math.round(28 + 0.35 * a.dex + 0.25 * a.end),
    health: Math.round(12 + 0.4 * a.end + 0.1 * a.str),
    bravery: Math.round(0.8 * a.wil + 0.2 * a.cha),
    reactions: Math.round(10 + 0.4 * a.per + 0.4 * a.dex + 0.1 * s.firearms),
    accuracy: Math.round(18 + 0.3 * a.per + 0.3 * a.dex + 0.7 * s.firearms),
    melee: Math.round(14 + 0.3 * a.str + 0.3 * a.dex + 0.6 * s.close),
    armour: 0,
  };
}

const twoPlaces = (n: number) => Math.round(n * 100) / 100;

/** Research points a day at a bench, before labs and hunger. */
export const researchAptitude = ({ attributes: a, skills: s }: Profile) => twoPlaces(0.4 + a.int / 100 + s.science / 100);

/** Strength and Endurance's share of building, in hundredths, so a whole Engineering point can hit any rate. */
const brawn = (a: Attributes) => Math.round((a.str + a.end) / 2);

/** Person-days of construction a day. */
export const buildRate = ({ attributes: a, skills: s }: Profile) => twoPlaces(0.2 + (brawn(a) + s.engineering) / 100);

/** The Science that gives this aptitude with these attributes, never below 0. */
const scienceFor = (aptitude: number, a: Attributes) => clamp(Math.round((aptitude - 0.4) * 100) - a.int, 0, 100);
/** The Engineering that gives this build rate with these attributes, never below 0. */
const engineeringFor = (build: number, a: Attributes) => clamp(Math.round((build - 0.2) * 100) - brawn(a), 0, 100);

// ---------- Where people start ----------

/** What a kind of person tends to be like before the dice. */
export interface Template {
  attributes: Attributes;
  skills: Partial<Skills>;
}

/** The first night's people, by their old job. Fitted to the numbers they had before attributes. */
export const ROLE_TEMPLATES: Record<string, Template> = {
  "Police officer": { attributes: attrs(60, 47, 43, 48, 50, 50, 48), skills: { firearms: 20, close: 42, persuasion: 15, engineering: 22, science: 10 } },
  "Army reservist": { attributes: attrs(60, 54, 52, 48, 50, 64, 42), skills: { firearms: 28, close: 3, engineering: 38, science: 10, scrounging: 10 } },
  "Security guard": { attributes: attrs(65, 32, 54, 38, 50, 40, 40), skills: { firearms: 22, close: 27, engineering: 19, science: 10 } },
  Paramedic: { attributes: attrs(36, 55, 41, 20, 52, 46, 41), skills: { firearms: 6, medicine: 40, engineering: 20, science: 8 } },
  Liaison: { attributes: attrs(35, 35, 39, 40, 50, 37, 54), skills: { persuasion: 30, engineering: 22, science: 10 } },
};

/** Anyone off the street with nothing special about them. */
export const CIVILIAN: Template = { attributes: attrs(45, 40, 40, 40, 40, 40, 40), skills: {} };
/** Someone who was a soldier before all this. */
export const FIGHTER: Template = { attributes: attrs(59, 52, 47, 51, 40, 58, 42), skills: { firearms: 20, close: 13 } };

/** Rolls a person from a template: each attribute and skill moved up or down by as much as `spread`. */
export function rollProfile(t: Template, spread: number, rand: () => number): Profile {
  const v = (n: number, lo: number) => clamp(Math.round(n * (1 - spread + rand() * 2 * spread)), lo, 100);
  const attributes = {} as Attributes;
  for (const k of ATTRIBUTES) attributes[k] = v(t.attributes[k], 1);
  const skills = noSkills();
  for (const k of SKILLS) if (t.skills[k]) skills[k] = v(t.skills[k]!, 0);
  return { attributes, skills };
}

/**
 * Sets the work skills so research and building come out at these rates: a trade's numbers, rolled
 * the way they were before attributes, become the Science and Engineering that give them.
 */
export function setWorkSkills(p: Profile, aptitude: number, build: number): Profile {
  p.skills.science = scienceFor(aptitude, p.attributes);
  p.skills.engineering = engineeringFor(build, p.attributes);
  return p;
}

/**
 * Works out a profile that gives someone the numbers they already had, for people from saves made
 * before attributes. Starts from their old job's template and moves each attribute and skill to
 * fit, so their fight numbers come out within a point or so.
 */
export function inferProfile(stats: Stats, aptitude: number, build: number, role: string): Profile {
  const t = ROLE_TEMPLATES[role] ?? CIVILIAN;
  const a = { ...t.attributes };
  const s: Skills = { ...noSkills(), ...t.skills };
  a.wil = clamp(Math.round((stats.bravery - 0.2 * a.cha) / 0.8), 1, 100);
  a.end = clamp(Math.round((stats.health - 12 - 0.1 * a.str) / 0.4), 1, 100);
  a.dex = clamp(Math.round((stats.tu - 28 - 0.25 * a.end) / 0.35), 1, 100);
  // Reactions and accuracy share Perception and Firearms: solve the two together.
  const r = stats.reactions - 10 - 0.4 * a.dex;
  const q = stats.accuracy - 18 - 0.3 * a.dex;
  let fire = (0.4 * q - 0.3 * r) / 0.25;
  let per = (0.7 * r - 0.1 * q) / 0.25;
  if (fire < 0) {
    fire = 0;
    per = r / 0.4;
  }
  a.per = clamp(Math.round(per), 1, 100);
  s.firearms = clamp(Math.round(fire), 0, 100);
  s.close = clamp(Math.round((stats.melee - 14 - 0.3 * a.str - 0.3 * a.dex) / 0.6), 0, 100);
  a.int = clamp(Math.round((aptitude - 0.4) * 100 - s.science), 1, 100);
  s.science = scienceFor(aptitude, a);
  s.engineering = engineeringFor(build, a);
  return { attributes: a, skills: s };
}

/** One line of attributes, for a person's card. */
export const attributeLine = (a: Attributes) => ATTRIBUTES.map((k) => `${ATTRIBUTE_SHORT[k]} ${a[k]}`).join(" · ");

/** Their skills worth mentioning, best first. Empty if they have none. */
export function skillLine(s: Skills): string {
  return SKILLS.filter((k) => s[k] >= 5)
    .sort((x, y) => s[y] - s[x])
    .map((k) => `${SKILL_NAMES[k]} ${s[k]}`)
    .join(" · ");
}

// ---------- Off the field, and the hands-on bits of a fight ----------
//
// Each of these is pinned so the first night's people come out about where everyone was before
// skills counted here: a liaison or a medic is better than that, an ordinary civilian a little
// worse. The defaults never get easier; the right person for the job is how you claw it back.

/** How well someone talks people round: half their Charisma plus their Persuasion. A civilian is 20, a police officer about 40, the liaison about 57. */
export const talk = ({ attributes: a, skills: s }: Profile) => Math.round(a.cha / 2 + s.persuasion);
/** The talk that gets the same deals as before. */
export const TALK_PIVOT = 40;

/** How many people a recruiter turns up next to before. */
export const recruitOdds = (p: Profile) => clamp(1 + (talk(p) - TALK_PIVOT) / 100, 0.5, 1.6);

/** Share of what a candidate first asks for that they settle on with this recruiter. */
export const askShare = (p: Profile) => clamp(1 + (TALK_PIVOT - talk(p)) / 200, 0.6, 1.2);

/** What the black market charges this haggler, as a share of the going rate. */
export const priceShare = (p: Profile) => clamp(1 + (TALK_PIVOT - talk(p)) / 400, 0.85, 1.1);

/** How well someone keeps a team out of trouble: half their Perception plus their Scrounging. A civilian is 20, a reservist about 34. */
export const lookout = ({ attributes: a, skills: s }: Profile) => Math.round(a.per / 2 + s.scrounging);
export const LOOKOUT_PIVOT = 30;

/** How much trouble a run gets into with this lookout, as a share of before. */
export const riskShare = (lookoutScore: number) => clamp(1 + (LOOKOUT_PIVOT - lookoutScore) / 200, 0.7, 1.2);

/** How much someone finds next to before: a little less with no Scrounging, more with a lot. */
export const findShare = ({ skills: s }: Profile) => 1 + (s.scrounging - 10) / 200;

/** Health a dose of medicine adds at home with this person looking after the wounded (before, always 2). */
export const nursing = ({ skills: s }: Profile) => Math.max(1, 2 + Math.round((s.medicine - 20) / 20));

/** Health one medikit use adds in this person's hands, on top of or off the kit's own (a medic about +3, nobody trained −2). */
export const fieldMedicine = ({ skills: s }: Profile) => Math.round((s.medicine - 20) / 8);

/** Extra stun a baton blow does with this much muscle behind it: none for a police officer, less for anyone weaker. */
export const batonWeight = ({ attributes: a }: Profile) => Math.round((a.str - 60) / 3);

import type { Duty } from "./allocation";
import type { Kit, Request } from "./armoury";
import type { Stats } from "./tactical/rules";

/**
 * The people who work for you between battles, and the first research they can do.
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
  stats: Stats;
  health: number;
  /** How quickly they pick up research, 0.8–1.2. Random, not tied to their old job. */
  aptitude: number;
  /**
   * Person-days of construction they get done in a day, around 0.6–1.4. Missing in saves from
   * before construction took work; see `buildSkill`.
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
  locked?: boolean;
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

/** A new recruit's construction skill: their old job, give or take 15%. */
export const rollBuild = (role: string, rand: () => number) => Math.round((BUILD_BY_ROLE[role] ?? 1) * (0.85 + rand() * 0.3) * 100) / 100;

/** Construction skill, falling back on their old job for people from older saves. */
export const buildSkill = (p: Person) => p.build ?? BUILD_BY_ROLE[p.role] ?? 1;
/** Labs multiply research done at their base. */
export const LAB_BONUS = 0.5;

/** Stands in for nobody: the council sends one person if no one walked out of the city. */
export const LIAISON: Omit<Person, "id" | "base" | "job"> = {
  name: "Council liaison",
  role: "Liaison",
  stats: { tu: 50, health: 30, bravery: 40, reactions: 40, accuracy: 40, melee: 30, armour: 0 },
  health: 30,
  aptitude: 1,
  build: 0.8,
};

export interface Project {
  id: string;
  name: string;
  /** Person-days of work at aptitude 1. */
  points: number;
  /** Recovered items it needs on hand, any one of. */
  items?: string[];
  /** Projects that must be done first, any one of. */
  after?: string[];
  /** Needs an alien containment room working in some base. */
  containment?: boolean;
  blurb: string;
  /** What you learn. */
  result: string;
}

export const PROJECTS: Project[] = [
  {
    id: "debrief",
    name: "Debrief the survivors",
    points: 4,
    blurb: "Write down everything about the night while it's fresh.",
    result: "It moved like it knew the streets, and it went for the armed ones first. It wasn't scouting. It was hunting, and it had done this before.",
  },
  {
    id: "crashSite",
    name: "Survey the crash site",
    points: 10,
    after: ["debrief"],
    blurb: "Go back to the junction before the clean-up crews take everything.",
    result: "The craft is gone: something lifted it out before dawn. What's left are scorched fragments of a hull alloy nobody can cut.",
  },
  {
    id: "alloys",
    name: "Alien alloys",
    points: 20,
    after: ["crashSite"],
    blurb: "Find out what the hull fragments are made of, and whether we can work them.",
    result: "Light, absurdly strong, and it can be shaped with enough heat. Armour is possible, eventually.",
  },
  {
    id: "plasmaPistol",
    name: "Plasma pistol",
    points: 20,
    items: ["Plasma pistol"],
    blurb: "Take the Hunter's weapon apart without it taking us apart.",
    result: "It fires bolts of contained plasma from a power cell we can't yet make. We can use the ones we have: it needs no clips, but every shot heats it, and fired too fast it shuts itself down to cool.",
  },
  {
    id: "plasmaScatter",
    name: "Plasma scattergun",
    points: 20,
    items: ["Plasma scattergun"],
    blurb: "The Brutes' gun. Work out how to fire it without losing a hand.",
    result: "A wide spray of plasma that empties a room at close range. In our hands it runs hot fast: two shots and it needs a rest.",
  },
  {
    id: "needleRifle",
    name: "Needle rifle",
    points: 24,
    items: ["Needle rifle"],
    blurb: "The Shades' long gun. Quiet, and it never seems to miss.",
    result: "It throws charged slivers further and straighter than anything we make. It runs cooler than their pistols, but it still has to rest.",
  },
  {
    id: "autopsy",
    name: "Hunter autopsy",
    points: 16,
    items: ["Alien corpse"],
    blurb: "Open up the body before it rots.",
    result: "Two hearts, dense bone, eyes built for the dark. Its wounds were already closing when it died.",
  },
  {
    id: "interrogation",
    name: "Interrogate the captive",
    points: 24,
    items: ["Live alien"],
    containment: true,
    blurb: "It's alive, and it has to be kept that way somewhere it can't get out of.",
    result: "It doesn't speak, but it reacts. Shown a map, it touched one place over and over: somewhere they're gathering.",
  },
  {
    id: "implant",
    name: "Tracking implant",
    points: 18,
    items: ["Tracking implant"],
    blurb: "Work out how it followed you through walls.",
    result: "It picks up heartbeats at short range. Reverse it, and we could hear them coming.",
  },
  {
    id: "biology",
    name: "Hunter biology",
    points: 20,
    after: ["autopsy", "interrogation"],
    blurb: "Put together what we know about how they live, heal and die.",
    result: "They heal fast but not instantly. Hit one hard and keep hitting it, or it will be back.",
  },
  {
    id: "commanderAutopsy",
    name: "Commander autopsy",
    points: 22,
    items: ["Commander corpse"],
    blurb: "The one the others kept looking at. Find out what made it different.",
    result: "An extra organ at the base of the skull, wired into the others' through something we can't see. When it died, they lost more than an officer. Our people now know what to look for in a squad.",
  },
  {
    id: "commanderInterrogation",
    name: "Interrogate the commander",
    points: 30,
    items: ["Live commander"],
    containment: true,
    blurb: "A live one that gave orders. The others would never let us take one.",
    result: "It knows who it was speaking to, and it doesn't stop trying. Watching it, we've learned how their squads hold together, and how they come apart.",
  },
];

export const project = (id: string) => PROJECTS.find((p) => p.id === id)!;

export interface ResearchState {
  active: string | null;
  progress: Record<string, number>;
  done: string[];
}

/** Why a project can't be started yet, or null if it can. */
export function blocker(p: Project, r: ResearchState, recovered: string[], containment: boolean): string | null {
  if (r.done.includes(p.id)) return "Done";
  if (p.items && !p.items.some((i) => recovered.includes(i))) return `Needs ${p.items.join(" or ").toLowerCase()}`;
  if (p.after && !p.after.some((a) => r.done.includes(a))) return `After ${p.after.map((a) => project(a).name.toLowerCase()).join(" or ")}`;
  if (p.containment && !containment) return "Needs alien containment in a base";
  return null;
}

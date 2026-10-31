import type { SiteId } from "./scavenge";
import type { Job, Person } from "./staff";

/**
 * Who you mean to use for what. Each person can be given a set of duties. With nothing set they go
 * wherever they're sent. A preference only warns when they're sent somewhere else; a lock refuses.
 * Fights aren't a duty of their own: they find whoever is out on a run or answering a call.
 */

export type Duty = "scavenge" | "search" | "recruit" | "hunt" | "garage" | "research" | "construction";

export const DUTIES: Duty[] = ["scavenge", "search", "recruit", "hunt", "garage", "research", "construction"];

export const DUTY_NAMES: Record<Duty, string> = {
  scavenge: "Supply runs",
  search: "Searching",
  recruit: "Recruiting",
  hunt: "Sighting calls",
  garage: "Fixing cars",
  research: "Research",
  construction: "Construction",
};

/** Short column headings for the allocation grid. */
export const DUTY_SHORT: Record<Duty, string> = {
  scavenge: "Supply",
  search: "Search",
  recruit: "Recruit",
  hunt: "Calls",
  garage: "Cars",
  research: "Lab",
  construction: "Build",
};

/** How firmly a person's duties hold. */
export type Hold = "any" | "prefer" | "lock";

export const HOLD_NAMES: Record<Hold, string> = {
  any: "Any job",
  prefer: "Preferred",
  lock: "Locked",
};

/** The duty a kind of run counts as. Every place you scavenge from is a supply run. */
export function dutyOf(site: SiteId): Duty {
  if (site === "search") return "search";
  if (site === "streets") return "recruit";
  if (site === "sighting") return "hunt";
  if (site === "garage") return "garage";
  return "scavenge";
}

/** The duty a job at home counts as. Resting is always allowed. */
export const jobDuty = (job: Job): Duty | null => (job === "rest" ? null : job);

export const holdOf = (p: Person): Hold => (p.duties?.length ? (p.locked ? "lock" : "prefer") : "any");

/** Whether this would take them away from what they're assigned to. False for anyone unassigned. */
export const offDuty = (p: Person, duty: Duty): boolean => !!p.duties?.length && !p.duties.includes(duty);

/** Their duties as a phrase: "research and construction". */
export function dutyList(p: Person): string {
  const names = (p.duties ?? []).map((d) => DUTY_NAMES[d].toLowerCase());
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What's wrong with giving them this duty, or null if nothing. Locked people are refused; people
 * with a preference get a warning the player can ignore.
 */
export function dutyClash(p: Person, duty: Duty): { locked: boolean; text: string } | null {
  if (!offDuty(p, duty)) return null;
  return p.locked
    ? { locked: true, text: `${p.name} is locked to ${dutyList(p)}` }
    : { locked: false, text: `${p.name} is meant for ${dutyList(p)}` };
}

/** The job at home someone locked to these duties falls back on: the first one they're allowed, or rest. */
export function allowedJob(p: Person): Job {
  const duty = jobDuty(p.job);
  if (!p.locked || !duty || !offDuty(p, duty)) return p.job;
  return (p.duties!.find((d) => d === "research" || d === "construction") as Job | undefined) ?? "rest";
}

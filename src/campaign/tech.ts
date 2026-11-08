import type { GearId } from "./armoury";
import type { Material } from "./scavenge";

/**
 * The tech tree: every research project, in three families and nine levels, from what a city
 * leaves lying about to what only the aliens know. The design is docs/design/tech-tree.md.
 *
 * Projects whose kit isn't in the game yet are in the tree too, marked `planned`, so the player
 * can see where it leads. They can't be started until what they give exists.
 */

export type Family = "today" | "hybrid" | "alien";
export type Level = "T1" | "T2" | "T3" | "H1" | "H2" | "H3" | "A1" | "A2" | "A3";

export const FAMILIES: { id: Family; name: string; blurb: string; levels: Level[] }[] = [
  { id: "today", name: "Today", blurb: "Our own kit. Anyone can use it; research is for making it.", levels: ["T1", "T2", "T3"] },
  { id: "hybrid", name: "Hybrid", blurb: "Our things made better with what we take from them.", levels: ["H1", "H2", "H3"] },
  { id: "alien", name: "Alien", blurb: "Theirs. We close the gap; we never pass them.", levels: ["A1", "A2", "A3"] },
];

export const LEVELS: Record<Level, { name: string; blurb: string }> = {
  T1: { name: "Street", blurb: "What a city leaves lying about." },
  T2: { name: "Surplus", blurb: "Police and army issue." },
  T3: { name: "Front line", blurb: "Heavy army kit." },
  H1: { name: "Alloy-worked", blurb: "Our things, hardened with their hull alloy." },
  H2: { name: "Cell-fed", blurb: "Our designs running on their power cells." },
  H3: { name: "Integrated", blurb: "Their parts built into whole systems." },
  A1: { name: "Captured", blurb: "Their kit used as it comes: hot, and on a draining cell." },
  A2: { name: "Understood", blurb: "We learn to vent, recharge and copy them." },
  A3: { name: "Mastered", blurb: "Their heavy weapons, their armour, their flight." },
};

export const familyOf = (l: Level): Family => (l[0] === "T" ? "today" : l[0] === "H" ? "hybrid" : "alien");

/**
 * What kind of work a project is. A study learns to use something and keeps it; reverse-engineering
 * learns to make it and takes one apart for good; theory needs no item, only other projects.
 */
export type Kind = "study" | "reverse" | "theory" | "autopsy" | "interrogation";

export const KIND_NAMES: Record<Kind, string> = {
  study: "Study",
  reverse: "Reverse-engineer",
  theory: "Theory",
  autopsy: "Autopsy",
  interrogation: "Interrogation",
};

/**
 * Working labs a project needs, across all your bases, by level. The first rung of hybrid and alien
 * work can be done on a kitchen table; the deeper rungs can't.
 */
export const LABS_BY_LEVEL: Record<Level, number> = { T1: 0, T2: 0, T3: 0, H1: 0, H2: 1, H3: 1, A1: 0, A2: 2, A3: 2 };

export interface Project {
  id: string;
  name: string;
  level: Level;
  kind: Kind;
  /** Person-days of work at aptitude 1. */
  points: number;
  /** Recovered items it needs on hand, any one of. */
  items?: string[];
  /** Projects that must be done first, any one of. */
  after?: string[];
  /** Projects that must all be done first. */
  allOf?: string[];
  /** A piece of gear from the stores that the work takes apart for good, when it starts. */
  consumes?: GearId;
  /** Needs an alien containment room working in some base. */
  containment?: boolean;
  /** Materials it brings home when it's done. */
  grants?: Partial<Record<Material, number>>;
  /** Set when what it gives isn't in the game yet: it shows in the tree, but can't be started. */
  planned?: boolean;
  blurb: string;
  /** What it gives you, in a few words, for the tree. */
  gives: string;
  /** What you learn. */
  result: string;
}

export const PROJECTS: Project[] = [
  // ── Today ────────────────────────────────────────────────────────────────────────────────
  {
    id: "debrief",
    name: "Debrief the survivors",
    level: "T1",
    kind: "theory",
    points: 4,
    blurb: "Write down everything about the night while it's fresh.",
    gives: "Where the crash site was",
    result: "It moved like it knew the streets, and it went for the armed ones first. It wasn't scouting. It was hunting, and it had done this before.",
  },
  {
    id: "crashSite",
    name: "Survey the crash site",
    level: "T1",
    kind: "theory",
    points: 10,
    after: ["debrief"],
    grants: { alloy: 3 },
    blurb: "Go back to the junction before the clean-up crews take everything.",
    gives: "3 alien alloy",
    result: "The craft is gone: something lifted it out before dawn. What's left are scorched fragments of a hull alloy nobody can cut. We brought back what we could carry.",
  },
  {
    id: "pipeBombs",
    name: "Pipe bombs",
    level: "T1",
    kind: "theory",
    points: 6,
    planned: true,
    blurb: "Hardware-store chemistry, done carefully enough to keep our fingers.",
    gives: "Pipe bombs on the bench",
    result: "Scrap pipe, chemicals and a fuse. One in ten won't go off, and that's the good news.",
  },
  {
    id: "reloading",
    name: "Reloading",
    level: "T1",
    kind: "theory",
    points: 8,
    planned: true,
    blurb: "Spent cases, scrap lead and propellant: make our own rounds.",
    gives: "Standard rounds from scrap and chemicals",
    result: "Slow work on a bench, but every clip we pack is one we didn't have to find.",
  },
  {
    id: "fragGrenades",
    name: "Frag grenades",
    level: "T2",
    kind: "theory",
    points: 10,
    allOf: ["pipeBombs"],
    planned: true,
    blurb: "A proper casing that breaks up evenly, and a fuse you can trust.",
    gives: "Frag grenades on the bench",
    result: "Power 60 across two tiles, and it brings brick down. Throw it, don't drop it.",
  },
  {
    id: "apRounds",
    name: "Armour-piercing rounds",
    level: "T2",
    kind: "theory",
    points: 12,
    allOf: ["reloading"],
    planned: true,
    blurb: "Hardened cores, for the things that shrug off ordinary bullets.",
    gives: "Armour-piercing loads, in a workshop",
    result: "Their armour counts for half. The rounds hit a little lighter, and nothing breaks that wouldn't have anyway.",
  },
  {
    id: "demolition",
    name: "Demolition charges",
    level: "T3",
    kind: "theory",
    points: 15,
    allOf: ["fragGrenades"],
    planned: true,
    blurb: "Shaped charges that put a hole in a wall exactly where you want one.",
    gives: "Charges that breach reinforced walls",
    result: "Placed, then set off: a bunker door or a vault wall is now a way in.",
  },
  // ── Hybrid ───────────────────────────────────────────────────────────────────────────────
  {
    id: "alloys",
    name: "Alien alloys",
    level: "H1",
    kind: "theory",
    points: 20,
    after: ["crashSite"],
    blurb: "Find out what the hull fragments are made of, and whether we can work them.",
    gives: "Opens alloy-worked kit",
    result: "Light, absurdly strong, and it can be shaped with enough heat. Armour is possible, eventually.",
  },
  {
    id: "alloyRounds",
    name: "Alloy-tipped rounds",
    level: "H1",
    kind: "theory",
    points: 30,
    allOf: ["alloys"],
    planned: true,
    blurb: "Tip ordinary rounds with slivers of hull.",
    gives: "+6 power, +1 breach on any bullet",
    result: "A sliver of their own hull on the end of our bullets. It goes through what they wear.",
  },
  {
    id: "alloyArmour",
    name: "Alloy armour",
    level: "H1",
    kind: "theory",
    points: 40,
    allOf: ["alloys"],
    planned: true,
    blurb: "Plates cut from hull fragments, in a vest our people can still run in.",
    gives: "Alloy vest 12, alloy plate 16",
    result: "Lighter than ceramic and harder than anything we make. A plasma bolt still hurts, but it doesn't go through.",
  },
  {
    id: "alloyShield",
    name: "Alloy shield",
    level: "H1",
    kind: "theory",
    points: 30,
    allOf: ["alloys"],
    planned: true,
    blurb: "A riot shield with a hull plate in it.",
    gives: "+14 armour from the front",
    result: "It stops a bolt. The person behind it has to be brave enough to stand there.",
  },
  {
    id: "cellCarbine",
    name: "Cell carbine",
    level: "H2",
    kind: "theory",
    points: 60,
    allOf: ["plasmaPistol", "alloys"],
    planned: true,
    blurb: "Our gun body, their power cell, and an alloy barrel that can take the heat.",
    gives: "Power 46, runs cooler than theirs",
    result: "Thirty shots a cell, and it heats slower than the pistol it came from. Every one we build needs a cell we took off a body.",
  },
  {
    id: "heartbeat",
    name: "Heartbeat scanner",
    level: "H2",
    kind: "theory",
    points: 45,
    allOf: ["implant"],
    planned: true,
    blurb: "Turn the tracking implant round, so we hear them coming.",
    gives: "Senses heartbeats 8 tiles through walls",
    result: "It hears what the Striders hear. The Shades still don't show: whatever they have instead of a heart, it's quiet.",
  },
  {
    id: "regenMedikit",
    name: "Regen medikit",
    level: "H2",
    kind: "theory",
    points: 40,
    allOf: ["biology"],
    planned: true,
    blurb: "Borrow a little of how they heal.",
    gives: "Heals 18, stops wounds worsening",
    result: "What closes their wounds can be coaxed into closing ours. Not as fast, and it itches like nothing else.",
  },
  {
    id: "shapedCharge",
    name: "Shaped plasma charge",
    level: "H2",
    kind: "theory",
    points: 70,
    allOf: ["cellCarbine"],
    planned: true,
    blurb: "Dump a whole cell into one point on a hull.",
    gives: "Breaches an alien hull",
    result: "The only way through their hull we have. One cell per charge, and it has to be placed by hand.",
  },
  {
    id: "poweredSuit",
    name: "Powered alloy suit",
    level: "H3",
    kind: "theory",
    points: 80,
    allOf: ["alloyArmour", "coreStudy"],
    planned: true,
    blurb: "Alloy plate on a frame that carries itself, powered from a cell.",
    gives: "Armour 22, +10 TU",
    result: "Whoever wears it is faster in it than out of it. A cell lasts three fights.",
  },
  {
    id: "linkHeadset",
    name: "Link headset",
    level: "H3",
    kind: "theory",
    points: 70,
    allOf: ["commanderAutopsy", "commanderInterrogation"],
    planned: true,
    blurb: "What holds their squads together, built into ours.",
    gives: "The squad holds when its leader falls",
    result: "Everyone sees what anyone sees, and nobody panics because the voice in their ear went quiet.",
  },
  {
    id: "cellTruck",
    name: "Cell truck",
    level: "H3",
    kind: "theory",
    points: 60,
    allOf: ["coreStudy"],
    planned: true,
    blurb: "A van with a core in the back instead of an engine.",
    gives: "A quiet vehicle that needs no fuel",
    result: "Silent, and it never needs a petrol station again. Losing it means losing a core.",
  },
  // ── Alien ────────────────────────────────────────────────────────────────────────────────
  {
    id: "plasmaPistol",
    name: "Plasma pistol",
    level: "A1",
    kind: "study",
    points: 20,
    items: ["Plasma pistol"],
    blurb: "Take the Hunter's weapon apart without it taking us apart.",
    gives: "Use captured plasma pistols",
    result: "It fires bolts of contained plasma from a power cell we can't yet make. We can use the ones we have: it needs no clips, but every shot heats it, and fired too fast it shuts itself down to cool.",
  },
  {
    id: "plasmaScatter",
    name: "Plasma scattergun",
    level: "A1",
    kind: "study",
    points: 20,
    items: ["Plasma scattergun"],
    blurb: "The Brutes' gun. Work out how to fire it without losing a hand.",
    gives: "Use captured scatterguns",
    result: "A wide spray of plasma that empties a room at close range. In our hands it runs hot fast: two shots and it needs a rest.",
  },
  {
    id: "needleRifle",
    name: "Needle rifle",
    level: "A1",
    kind: "study",
    points: 24,
    items: ["Needle rifle"],
    blurb: "The Shades' long gun. Quiet, and it never seems to miss.",
    gives: "Use captured needle rifles",
    result: "It throws charged slivers further and straighter than anything we make. It runs cooler than their pistols, but it still has to rest.",
  },
  {
    id: "autopsy",
    name: "Hunter autopsy",
    level: "A1",
    kind: "autopsy",
    points: 16,
    items: ["Alien corpse"],
    blurb: "Open up the body before it rots.",
    gives: "How they're built",
    result: "Two hearts, dense bone, eyes built for the dark. Its wounds were already closing when it died.",
  },
  {
    id: "interrogation",
    name: "Interrogate the captive",
    level: "A1",
    kind: "interrogation",
    points: 24,
    items: ["Live alien"],
    containment: true,
    blurb: "It's alive, and it has to be kept that way somewhere it can't get out of.",
    gives: "Where they gather",
    result: "It doesn't speak, but it reacts. Shown a map, it touched one place over and over: somewhere they're gathering.",
  },
  {
    id: "implant",
    name: "Tracking implant",
    level: "A1",
    kind: "study",
    points: 18,
    items: ["Tracking implant"],
    blurb: "Work out how it followed you through walls.",
    gives: "How they track us",
    result: "It picks up heartbeats at short range. Reverse it, and we could hear them coming.",
  },
  {
    id: "biology",
    name: "Hunter biology",
    level: "A1",
    kind: "theory",
    points: 20,
    after: ["autopsy", "interrogation"],
    blurb: "Put together what we know about how they live, heal and die.",
    gives: "How they heal",
    result: "They heal fast but not instantly. Hit one hard and keep hitting it, or it will be back.",
  },
  {
    id: "commanderAutopsy",
    name: "Commander autopsy",
    level: "A1",
    kind: "autopsy",
    points: 22,
    items: ["Commander corpse"],
    blurb: "The one the others kept looking at. Find out what made it different.",
    gives: "Read their leaders in a fight",
    result: "An extra organ at the base of the skull, wired into the others' through something we can't see. When it died, they lost more than an officer. Our people now know what to look for in a squad.",
  },
  {
    id: "commanderInterrogation",
    name: "Interrogate the commander",
    level: "A1",
    kind: "interrogation",
    points: 30,
    items: ["Live commander"],
    containment: true,
    blurb: "A live one that gave orders. The others would never let us take one.",
    gives: "Read their leaders in a fight",
    result: "It knows who it was speaking to, and it doesn't stop trying. Watching it, we've learned how their squads hold together, and how they come apart.",
  },
  {
    id: "ventPistol",
    name: "Vent the plasma pistol",
    level: "A2",
    kind: "study",
    points: 100,
    allOf: ["plasmaPistol"],
    items: ["Live alien", "Live commander"],
    containment: true,
    blurb: "Watch a live one handle a pistol, and learn how it keeps it cool.",
    gives: "Plasma pistol heats a third less",
    result: "There's a rhythm to it: a half-squeeze that bleeds the heat between shots. Ours still run hotter than theirs. Theirs never overheat at all.",
  },
  {
    id: "ventScatter",
    name: "Vent the scattergun",
    level: "A2",
    kind: "study",
    points: 100,
    allOf: ["plasmaScatter"],
    items: ["Live alien", "Live commander"],
    containment: true,
    blurb: "Find out how a Brute fires that thing all day.",
    gives: "Scattergun heats a third less",
    result: "The stock is a heat sink, and it only works held the way they hold it. We've cut ours to fit.",
  },
  {
    id: "ventNeedle",
    name: "Vent the needle rifle",
    level: "A2",
    kind: "study",
    points: 100,
    allOf: ["needleRifle"],
    items: ["Live alien", "Live commander"],
    containment: true,
    blurb: "The Shades fire it without a pause. We have to rest it every other shot.",
    gives: "Needle rifle heats a third less",
    result: "A charge-bleed we'd been switching off as a fault. Left on, the rifle cools as it fires.",
  },
  {
    id: "coreStudy",
    name: "Craft core",
    level: "A2",
    kind: "study",
    points: 120,
    items: ["Craft core"],
    planned: true,
    blurb: "What powers their ships. Handle with care, and from a distance.",
    gives: "Opens cores: recharging, suits, the truck",
    result: "A sealed sphere that's warm to the touch and never cools. It holds more power than a city uses in a year.",
  },
  {
    id: "cellRecharge",
    name: "Cell recharging",
    level: "A2",
    kind: "theory",
    points: 140,
    allOf: ["coreStudy"],
    planned: true,
    blurb: "Fill spent cells from a core.",
    gives: "5 cells per core",
    result: "A core fills five spent cells before it's dead itself. Cores are never made, only taken.",
  },
  {
    id: "plasmaCopies",
    name: "Copy the plasma guns",
    level: "A2",
    kind: "reverse",
    points: 150,
    allOf: ["ventPistol"],
    consumes: "plasmaPistol",
    planned: true,
    blurb: "Take a pistol apart for good, and build our own.",
    gives: "Build plasma guns in the workshop",
    result: "Four alloy and a cell each. They're ours now, as near as we can make them.",
  },
  {
    id: "shellArmour",
    name: "Shell armour",
    level: "A2",
    kind: "theory",
    points: 110,
    allOf: ["autopsy", "alloys"],
    planned: true,
    blurb: "Recut a Brute's or a Strider's shell to fit one of us.",
    gives: "Armour 18–20",
    result: "It was grown to fit something else. Cut down and strapped on, it fits us well enough.",
  },
  {
    id: "coldRecharge",
    name: "Cold recharge",
    level: "A3",
    kind: "theory",
    points: 200,
    allOf: ["cellRecharge", "commanderInterrogation"],
    planned: true,
    blurb: "Bring a spent cell back without a core.",
    gives: "A spent cell or core back to a third",
    result: "We finally understand part of it. A spent cell comes back to a third on the bench, slowly and at a cost. So does a spent core.",
  },
  {
    id: "siegeCaster",
    name: "Siege caster",
    level: "A3",
    kind: "study",
    points: 160,
    items: ["Siege caster"],
    planned: true,
    blurb: "The Brutes' heavy gun, once they start carrying it.",
    gives: "Power 70, breaks reinforced walls",
    result: "It throws a bolt that brings a building down. In our hands it needs a long rest between shots.",
  },
  {
    id: "lance",
    name: "Lance",
    level: "A3",
    kind: "study",
    points: 180,
    items: ["Lance"],
    planned: true,
    blurb: "Only ever seen in one of their bases.",
    gives: "Power 85, cuts through hull",
    result: "One shot a turn, and nothing stands in front of it.",
  },
  {
    id: "flight",
    name: "Their flight",
    level: "A3",
    kind: "reverse",
    points: 200,
    allOf: ["coreStudy"],
    items: ["Alien craft"],
    planned: true,
    blurb: "A craft taken nearly whole, and two cores to fly it.",
    gives: "A craft of our own",
    result: "It flies. We don't understand why, but it flies, and now we can go to them.",
  },
];

export const project = (id: string) => PROJECTS.find((p) => p.id === id)!;

/** Projects that need this one done first. */
export const leadsTo = (id: string) => PROJECTS.filter((p) => p.after?.includes(id) || p.allOf?.includes(id));

/** Venting: an A2 project that makes one captured gun heat a third less a shot. */
export const VENTS: Record<string, GearId> = { ventPistol: "plasmaPistol", ventScatter: "plasmaScatter", ventNeedle: "needleRifle" };
export const VENT_HEAT = 2 / 3;

export interface ResearchState {
  active: string | null;
  progress: Record<string, number>;
  done: string[];
  /** Projects whose item has already been taken apart, so starting them again costs nothing more. */
  stripped?: string[];
}

/** What a project's start depends on, outside the research itself. */
export interface Lab {
  /** Items brought home, by name. */
  recovered: string[];
  /** Whether some base can hold a live alien. */
  containment: boolean;
  /** Working labs across every base. */
  labs: number;
  /** How many of each piece of gear are in the stores. */
  stores: Partial<Record<GearId, number>>;
}

/** Why a project can't be started yet, or null if it can. */
export function blocker(p: Project, r: ResearchState, lab: Lab): string | null {
  if (r.done.includes(p.id)) return "Done";
  if (p.planned) return "Not in the game yet";
  if (p.allOf) {
    const missing = p.allOf.filter((a) => !r.done.includes(a));
    if (missing.length) return `After ${missing.map((a) => project(a).name.toLowerCase()).join(" and ")}`;
  }
  if (p.after && !p.after.some((a) => r.done.includes(a))) return `After ${p.after.map((a) => project(a).name.toLowerCase()).join(" or ")}`;
  if (p.items && !p.items.some((i) => lab.recovered.includes(i))) return `Needs ${p.items.join(" or ").toLowerCase()}`;
  if (p.consumes && !r.stripped?.includes(p.id) && !(lab.stores[p.consumes] ?? 0)) return `Needs one to take apart`;
  if (p.containment && !lab.containment) return "Needs alien containment in a base";
  const labs = LABS_BY_LEVEL[p.level];
  if (lab.labs < labs) return `Needs ${labs === 1 ? "a working lab" : `${labs} working labs`}`;
  return null;
}

/** Everything a project asks for, in one line, whether or not you have it yet. */
export function needs(p: Project): string {
  const parts: string[] = [];
  if (p.allOf) parts.push(`after ${p.allOf.map((a) => project(a).name.toLowerCase()).join(" and ")}`);
  if (p.after) parts.push(`after ${p.after.map((a) => project(a).name.toLowerCase()).join(" or ")}`);
  if (p.items) parts.push(`needs ${p.items.join(" or ").toLowerCase()}`);
  if (p.consumes) parts.push("uses one up");
  if (p.containment) parts.push("containment");
  const labs = LABS_BY_LEVEL[p.level];
  if (labs) parts.push(labs === 1 ? "a lab" : `${labs} labs`);
  const s = parts.join(", ");
  return s ? s[0].toUpperCase() + s.slice(1) : "Nothing";
}

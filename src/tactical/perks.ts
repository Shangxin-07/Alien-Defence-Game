/**
 * Perks: a knack someone has picked up, on top of what their attributes and skills give them.
 * The campaign offers three that fit what a person has been doing and the player picks one
 * (campaign/perks.ts). What each one does is worked out where the number it changes is: their
 * stats and work rates in attributes.ts, shots, morale and medikits in battle.ts.
 */

export type PerkId =
  | "marksman" | "quickDraw" | "steady" | "ironNerve" | "tough" | "runner" | "fieldMedic" | "brawler"
  | "silverTongue" | "scavenger" | "pathfinder" | "greaseMonkey" | "bookworm" | "bedside";

export interface Perk {
  id: PerkId;
  name: string;
  /** What it does, in a few words, for the offer card. */
  does: string;
  /** Fights or home. */
  field: boolean;
}

const perk = (id: PerkId, name: string, does: string, field: boolean): Perk => ({ id, name, does, field });

export const PERKS: Record<PerkId, Perk> = {
  marksman: perk("marksman", "Marksman", "+10 accuracy on aimed shots", true),
  quickDraw: perk("quickDraw", "Quick draw", "Snap shots take a quarter less time", true),
  steady: perk("steady", "Steady hands", "+8 reactions", true),
  ironNerve: perk("ironNerve", "Iron nerve", "Loses half as much morale", true),
  tough: perk("tough", "Tough", "+4 health", true),
  runner: perk("runner", "Runner", "+4 time units", true),
  fieldMedic: perk("fieldMedic", "Field medic", "Medikits heal 5 more in their hands", true),
  brawler: perk("brawler", "Brawler", "+10 melee, and 10 more stun a baton blow", true),
  silverTongue: perk("silverTongue", "Silver tongue", "+15 talk: more recruits, smaller asks, better prices", false),
  scavenger: perk("scavenger", "Scavenger", "Finds 15% more on runs", false),
  pathfinder: perk("pathfinder", "Pathfinder", "+20 lookout: keeps runs out of trouble", false),
  greaseMonkey: perk("greaseMonkey", "Handy", "+0.1 building a day", false),
  bookworm: perk("bookworm", "Bookworm", "+0.1 research a day", false),
  bedside: perk("bedside", "Bedside manner", "Medicine they hand out heals 1 more", false),
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** Whether someone has a perk. Takes anything that might carry a list of them. */
export const hasPerk = (who: { perks?: PerkId[] } | undefined, id: PerkId) => !!who?.perks?.includes(id);

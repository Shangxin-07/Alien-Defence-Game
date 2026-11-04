import { ATTRIBUTES, ATTRIBUTE_NAMES, Attributes, Profile, SKILLS, SKILL_NAMES, Skills } from "../tactical/attributes";
import { Deeds, tuSpent } from "../tactical/deeds";
import { hashText, mulberry32 } from "../tactical/random";

/**
 * Learning by doing. What someone does trains what they used to do it: hits train Firearms,
 * walking trains Endurance, holding their nerve trains Willpower. Skills move quickly at first and
 * slowly later; attributes move rarely and stop at a ceiling each person was born with. A bad
 * night can also leave a mark. Gains are small: a veteran is better, never a superhero.
 *
 * The dice here are their own, drawn from who and when, so growth never shifts any other roll.
 */

export type Trait = keyof Attributes | keyof Skills;

/** Chances at a point of growth, per trait. Fractions are a chance at one more. */
export type Practice = Partial<Record<Trait, number>>;

/** One change to one trait. */
export interface Change {
  trait: Trait;
  by: number;
}

const isAttribute = (t: Trait): t is keyof Attributes => (ATTRIBUTES as string[]).includes(t);

export const traitName = (t: Trait) => (isAttribute(t) ? ATTRIBUTE_NAMES[t] : SKILL_NAMES[t as keyof Skills]);

/** Chance an attribute chance turns into a point, while it's under their ceiling. */
export const ATTRIBUTE_ODDS = 0.5;
/** How far above where they started anyone can grow an attribute: rolled once, between these. */
export const CEILING_ROOM: [number, number] = [5, 20];
/** Chance a frozen turn costs a point of Willpower, and a fight that leaves them on a quarter of their health a point of Endurance. */
export const PANIC_SCAR = 0.25;
export const WOUND_SCAR = 0.3;
export const WOUND_SCAR_BELOW = 0.25;

/** Dice for one person on one day for one reason, the same every time. */
export const growthDice = (person: number, day: number, why: string) => mulberry32(hashText(`${person}:${day}:${why}`));

/** How high each of someone's attributes can ever be trained. Hidden from the player. */
export function rollCeiling(a: Attributes, rand: () => number): Attributes {
  const [lo, hi] = CEILING_ROOM;
  const out = {} as Attributes;
  for (const k of ATTRIBUTES) out[k] = Math.min(100, a[k] + lo + Math.floor(rand() * (hi - lo + 1)));
  return out;
}

/** What one fight gave someone a chance to get better at. Only for those who walked away. */
export function fightPractice(d: Deeds): Practice {
  return {
    firearms: d.hits * 0.35 + d.reflexShots * 0.2 + Math.max(0, d.rounds - d.hits) * 0.05,
    close: d.stunHits * 0.6 + d.takedowns + d.swings * 0.1,
    medicine: d.heals * 0.5,
    dex: tuSpent(d) / 400,
    end: d.tiles / 120 + d.wounds * 0.3,
    per: d.spotted * 0.3 + (d.longest >= 12 ? 0.2 : 0),
    wil: d.nerveHeld * 0.3 + d.friendsLost * 0.2 + d.turns * 0.02,
    str: d.swings * 0.15 + d.storeys * 0.05,
  };
}

/** A day at a job at home. */
export const DAY_PRACTICE: Record<"research" | "construction", Practice> = {
  research: { science: 0.08, int: 0.01 },
  construction: { engineering: 0.08, str: 0.01, end: 0.01 },
};
/** A day out scavenging or searching. */
export const RUN_DAY: Practice = { scrounging: 0.1, per: 0.01 };
/** Someone met on the streets, someone who joined, a place found, a car got running. */
export const MET: Practice = { persuasion: 0.5, cha: 0.1 };
export const RECRUITED: Practice = { persuasion: 1, cha: 0.2 };
export const PLACE_FOUND: Practice = { scrounging: 1, per: 0.1 };
export const CAR_FIXED: Practice = { engineering: 1 };
/** A deal done on the black market, and a day looking after someone wounded with a dose of medicine. */
export const HAGGLED: Practice = { persuasion: 0.3, cha: 0.03 };
export const NURSED: Practice = { medicine: 0.15 };

/** Whole chances, and maybe one more for what's left over. */
const attempts = (n: number, rand: () => number) => Math.floor(n) + (rand() < n - Math.floor(n) ? 1 : 0);

/**
 * Rolls what practice teaches. A skill point is likelier the lower the skill and the sharper the
 * mind; an attribute point is a coin toss, and only below their ceiling. Changes `p` in place and
 * returns what changed.
 */
export function grow(p: Profile, ceiling: Attributes, practice: Practice, rand: () => number): Change[] {
  const out: Change[] = [];
  const learning = 0.75 + p.attributes.int / 160;
  for (const t of [...ATTRIBUTES, ...SKILLS] as Trait[]) {
    const n = attempts(practice[t] ?? 0, rand);
    let by = 0;
    for (let i = 0; i < n; i++) {
      if (isAttribute(t)) {
        if (p.attributes[t] >= ceiling[t] || rand() >= ATTRIBUTE_ODDS) continue;
        p.attributes[t]++;
      } else {
        const s = t as keyof Skills;
        if (p.skills[s] >= 100 || rand() >= ((100 - p.skills[s]) / 100) * learning) continue;
        p.skills[s]++;
      }
      by++;
    }
    if (by) out.push({ trait: t, by });
  }
  return out;
}

/** What a fight takes out of someone who survived it: their nerve after freezing, their body after nearly dying. */
export function scars(p: Profile, d: Deeds, healthLeft: number, rand: () => number): Change[] {
  const out: Change[] = [];
  if (d.froze && rand() < PANIC_SCAR && p.attributes.wil > 1) {
    p.attributes.wil--;
    out.push({ trait: "wil", by: -1 });
  }
  if (healthLeft <= WOUND_SCAR_BELOW && rand() < WOUND_SCAR && p.attributes.end > 1) {
    p.attributes.end--;
    out.push({ trait: "end", by: -1 });
  }
  return out;
}

/** "Firearms +1, Dexterity +1", or "Willpower −1". */
export const describeChanges = (cs: Change[]) => cs.map((c) => `${traitName(c.trait)} ${c.by > 0 ? "+" : "−"}${Math.abs(c.by)}`).join(", ");

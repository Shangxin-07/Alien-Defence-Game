import { PERK_IDS, PerkId } from "../tactical/perks";
import type { Skills } from "../tactical/attributes";
import type { ServiceRecord } from "./record";

/**
 * When someone has learned enough by doing, they're offered three perks that fit what they've
 * done, and the player picks one. The offer is weighted by their service record, so a medic is
 * mostly offered medic things, but anything can turn up.
 */

/** Points learned by doing before each perk: 8, 24, 48, 80, ... (the gaps grow by 8 each time). */
export const perkThreshold = (k: number) => 4 * k * (k + 1);

/** How many perks someone has earned with this many points learned. */
export function perksEarned(learned: number): number {
  let k = 0;
  while (perkThreshold(k + 1) <= learned) k++;
  return k;
}

/** Points learned by doing so far (scars don't take them away). */
export const learnedPoints = (r: ServiceRecord) => Object.values(r.grown ?? {}).reduce((n, v) => n + Math.max(0, v ?? 0), 0);

/** Every perk has some chance of being offered; what someone has done makes some far likelier. */
const BASE = 0.3;

/** How well each perk fits what someone has done. */
export function perkFit(r: ServiceRecord, s: Skills): Record<PerkId, number> {
  const d = r.deeds;
  const days = (j: string) => (r.days as Record<string, number | undefined>)[j] ?? 0;
  const fit: Record<PerkId, number> = {
    marksman: d.aimedShots * 0.5 + d.longest / 4,
    quickDraw: d.snapShots * 0.3 + d.reflexShots,
    steady: d.reflexShots + d.reflexHits,
    ironNerve: d.nerveHeld + d.friendsLost * 2 + d.froze,
    tough: d.wounds * 2 + d.damageTaken / 10,
    runner: d.tiles / 40,
    fieldMedic: d.heals * 2,
    brawler: d.swings + d.takedowns * 3,
    silverTongue: r.met + r.recruited * 2,
    scavenger: r.found / 10 + r.runs,
    pathfinder: r.daysOut / 2 + r.ranFrom * 2 + r.injuries,
    greaseMonkey: days("construction") / 10 + r.carsFixed * 3,
    bookworm: days("research") / 10,
    bedside: s.medicine / 10,
  };
  for (const k of PERK_IDS) fit[k] += BASE;
  return fit;
}

/** Three perks they haven't got, drawn by fit without repeats. Fewer if there aren't three left. */
export function rollOffer(r: ServiceRecord, s: Skills, have: PerkId[], rand: () => number): PerkId[] {
  const fit = perkFit(r, s);
  const pool = PERK_IDS.filter((k) => !have.includes(k));
  const out: PerkId[] = [];
  while (out.length < 3 && pool.length) {
    const total = pool.reduce((n, k) => n + fit[k], 0);
    let x = rand() * total;
    let i = 0;
    while (i < pool.length - 1 && (x -= fit[pool[i]]) >= 0) i++;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

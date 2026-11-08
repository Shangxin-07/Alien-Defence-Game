/**
 * Painted portraits for the battle screen: a face for each of your people and a picture for each
 * alien. Pictures only; nothing here touches the rules or the dice. The full-size originals live in
 * the project's art folder; these are shrunk copies (people 256 px square, aliens 400×600).
 */
import type { Unit } from "./battle";
import type { RaceId } from "./aliens";
import { Gender, genderFor } from "./gender";

import policeA from "../art/person-police-1.webp";
import policeB from "../art/person-police-2.webp";
import reservistA from "../art/person-reservist-1.webp";
import reservistB from "../art/person-reservist-2.webp";
import guardA from "../art/person-guard-1.webp";
import guardB from "../art/person-guard-2.webp";
import medicA from "../art/person-medic-1.webp";
import medicB from "../art/person-medic-2.webp";
import drifterA from "../art/person-drifter-1.webp";
import drifterB from "../art/person-drifter-2.webp";
import drifterC from "../art/person-drifter-3.webp";
import drifterD from "../art/person-drifter-4.webp";
import strider from "../art/alien-strider.webp";
import striderLeader from "../art/alien-strider-commander.webp";
import brute from "../art/alien-brute.webp";
import bruteLeader from "../art/alien-brute-commander.webp";
import shade from "../art/alien-shade.webp";
import shadeLeader from "../art/alien-shade-commander.webp";

/** Every face, in a fixed order. */
export const FACES = [policeA, policeB, reservistA, reservistB, guardA, guardB, medicA, medicB, drifterA, drifterB, drifterC, drifterD];

/** Who is in each picture. */
const WOMEN = [policeA, reservistB, guardB, medicB, drifterB, drifterD];
const MEN = [policeB, reservistA, guardA, medicA, drifterA, drifterC];

/** Which faces suit a job, best first, by gender. Anyone else draws from the drifters. */
const BY_ROLE: Record<string, Record<Gender, string[]>> = {
  "Police officer": { female: [policeA], male: [policeB] },
  "Army reservist": { female: [reservistB], male: [reservistA] },
  Soldier: { female: [reservistB], male: [reservistA] },
  "Security guard": { female: [guardB], male: [guardA] },
  Paramedic: { female: [medicB], male: [medicA] },
  Nurse: { female: [medicB], male: [medicA] },
  Mechanic: { female: [drifterB, drifterD], male: [drifterC] },
};
const DRIFTERS: Record<Gender, string[]> = { female: [drifterB, drifterD], male: [drifterA, drifterC] };

/** A small, steady hash, so a person keeps the same face from fight to fight. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** `list` rotated to start at a place picked by `key`. */
function rotate<T>(list: T[], key: number): T[] {
  const k = key % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/**
 * Faces for a squad, by unit id. Each person gets a face of their own gender that suits their job,
 * picked by their name so it doesn't change between fights. Nobody in a squad shares a face while
 * there's a spare one of the right gender; past that, faces repeat rather than cross over.
 */
export function assignFaces(humans: readonly Pick<Unit, "id" | "name" | "role" | "gender">[]): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  for (const u of humans) {
    const h = hash(u.name);
    const g = u.gender ?? genderFor(u.name);
    const job = BY_ROLE[u.role]?.[g] ?? [];
    const preferred = [...rotate(job.length ? job : DRIFTERS[g], h), ...rotate(DRIFTERS[g], h), ...rotate(g === "female" ? WOMEN : MEN, h)];
    const face = preferred.find((f) => !used.has(f)) ?? preferred[0];
    used.add(face);
    out.set(u.id, face);
  }
  return out;
}

/** Which gender a face shows, for the tests. */
export const faceGender = (face: string): Gender => (WOMEN.includes(face) ? "female" : "male");

const ALIENS: Record<RaceId, { plain: string; leader: string }> = {
  strider: { plain: strider, leader: striderLeader },
  brute: { plain: brute, leader: bruteLeader },
  shade: { plain: shade, leader: shadeLeader },
};

/** The picture for an alien: its race, and the commander's version for a squad leader. */
export function alienPortrait(u: Pick<Unit, "mind">): string {
  const art = ALIENS[u.mind?.race ?? "strider"];
  return u.mind?.rank === "leader" ? art.leader : art.plain;
}

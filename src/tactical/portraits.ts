/**
 * Painted portraits for the battle screen: a face for each of your people and a picture for each
 * alien. Pictures only; nothing here touches the rules or the dice. The full-size originals live in
 * the project's art folder; these are shrunk copies (people 256 px square, aliens 400×600).
 */
import type { Unit } from "./battle";
import type { RaceId } from "./aliens";

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

/** Which faces suit a job, best first. Anyone else draws from the drifters. */
const BY_ROLE: Record<string, string[]> = {
  "Police officer": [policeA, policeB],
  "Army reservist": [reservistA, reservistB],
  Soldier: [reservistA, reservistB],
  "Security guard": [guardA, guardB],
  Paramedic: [medicA, medicB],
  Nurse: [medicA, medicB],
  Mechanic: [drifterC],
};
const DRIFTERS = [drifterA, drifterB, drifterC, drifterD];

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
 * Faces for a squad, by unit id. Each person gets a face that suits their job, picked by their name
 * so it doesn't change between fights, and no two people in one squad share a face while there are
 * faces to spare.
 */
export function assignFaces(humans: readonly Pick<Unit, "id" | "name" | "role">[]): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  for (const u of humans) {
    const h = hash(u.name);
    const job = BY_ROLE[u.role] ?? [];
    const preferred = [...rotate(job.length ? job : DRIFTERS, h), ...rotate(DRIFTERS, h), ...rotate(FACES, h)];
    const face = preferred.find((f) => !used.has(f)) ?? preferred[0];
    used.add(face);
    out.set(u.id, face);
  }
  return out;
}

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

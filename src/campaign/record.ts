import { Deeds, addDeeds, emptyDeeds } from "../tactical/deeds";
import type { Job } from "./staff";
import { Trait, traitName } from "./growth";

/**
 * Everything a person has done for you, kept for as long as they're with you and after. Nothing in
 * the rules reads it yet: it's the memory the game used to throw away, for the service record and
 * memorial today and for learning by doing later. Every count only ever goes up.
 */
export interface ServiceRecord {
  /** Day they joined, and how. */
  joined: number;
  how: string;
  /** Fights fought, and how they ended for the squad. */
  fights: number;
  won: number;
  fled: number;
  /** Ambushes on runs that the team ran from instead of fighting. */
  ranFrom: number;
  /** Everything they did across all their fights. */
  deeds: Deeds;
  /** Days spent on each job at home. Days away or hungry are counted separately. */
  days: Partial<Record<Job, number>>;
  /** Research points they put in. */
  research: number;
  /** Days out on runs of any kind, and runs they came home from. */
  daysOut: number;
  runs: number;
  /** Supplies a run found, their share of it (food, medicine, ammo, scrap and the rest, one each). */
  found: number;
  /** New places found on searches, people met recruiting, recruits who joined because of them. */
  placesFound: number;
  met: number;
  recruited: number;
  /** Sighting calls they went out on, cars they got running, times they were hurt out there. */
  calls: number;
  carsFixed: number;
  injuries: number;
  /** Days they went without food. */
  hungryDays: number;
  /** Promises made to them, kept and broken. */
  kept: number;
  broken: number;
  /** What they've learned by doing, and lost to scars, by trait. Missing in records from before learning. */
  grown?: Partial<Record<Trait, number>>;
}

export function newRecord(day: number, how: string): ServiceRecord {
  return {
    joined: day, how, fights: 0, won: 0, fled: 0, ranFrom: 0, deeds: emptyDeeds(), days: {}, research: 0,
    daysOut: 0, runs: 0, found: 0, placesFound: 0, met: 0, recruited: 0, calls: 0, carsFixed: 0, injuries: 0,
    hungryDays: 0, kept: 0, broken: 0,
  };
}

/** A record with every field present, for one saved before a field existed. */
export function fillRecord(r: Partial<ServiceRecord> | undefined, day: number, how: string): ServiceRecord {
  const base = newRecord(r?.joined ?? day, r?.how ?? how);
  return { ...base, ...r, deeds: addDeeds(emptyDeeds(), r?.deeds ?? {}), days: { ...r?.days } };
}

/** Someone who is no longer with you, and why. Their record stays. */
export interface Departed {
  id: number;
  name: string;
  role: string;
  /** Day they went. */
  day: number;
  /** Died, or walked away. */
  died: boolean;
  /** How it happened, in a few words. */
  how: string;
  record: ServiceRecord;
}

/** Short lines for a record, best first, for a person's card. */
export function recordLines(r: ServiceRecord, today: number): string[] {
  const d = r.deeds;
  const lines: string[] = [];
  const served = Math.max(0, today - r.joined);
  lines.push(`${r.how}, day ${r.joined + 1}.${served ? ` ${served} day${served === 1 ? "" : "s"} of service.` : ""}`);
  if (r.fights) {
    const shots = d.rounds ? `, ${d.hits} of ${d.rounds} rounds on target${d.longest ? ` (best ${d.longest} tiles)` : ""}` : "";
    const ends = [r.won && `${r.won} won`, r.fled && `${r.fled} pulled out of`].filter(Boolean).join(", ");
    lines.push(`${r.fights} fight${r.fights === 1 ? "" : "s"}${ends ? ` (${ends})` : ""}${shots}.`);
    const tallies = [
      d.kills && `${d.kills} kill${d.kills === 1 ? "" : "s"}`,
      d.takedowns && `${d.takedowns} taken alive`,
      d.reflexShots && `${d.reflexShots} reflex shot${d.reflexShots === 1 ? "" : "s"} (${d.reflexHits} hit)`,
      d.spotted && `first to spot ${d.spotted}`,
      d.swings && `${d.stunHits}/${d.swings} baton hits`,
      d.wrecked && `${d.wrecked} thing${d.wrecked === 1 ? "" : "s"} smashed`,
    ].filter(Boolean);
    if (tallies.length) lines.push(`${tallies.join(", ")}.`);
    const body = [
      `${d.tiles} tiles walked`,
      d.storeys && `${d.storeys} flights of stairs`,
      d.turns && `${Math.round((100 * Math.max(0, d.tuHad - d.tuLeft)) / Math.max(1, d.tuHad))}% of their time used`,
      (d.damageTaken || d.bled) && `${d.damageTaken + d.bled} damage taken`,
      d.wounds && `${d.wounds} wound${d.wounds === 1 ? "" : "s"}`,
      d.froze && `froze ${d.froze} time${d.froze === 1 ? "" : "s"}`,
      d.nerveHeld && `held their nerve ${d.nerveHeld} time${d.nerveHeld === 1 ? "" : "s"}`,
      d.friendsLost && `saw ${d.friendsLost} friend${d.friendsLost === 1 ? "" : "s"} die`,
      d.heals && `${d.heals} medikit use${d.heals === 1 ? "" : "s"} (${d.healed} HP)`,
      d.led && `led the squad ${d.led} time${d.led === 1 ? "" : "s"}`,
    ].filter(Boolean);
    lines.push(`${body.join(", ")}.`);
  }
  const jobs = (Object.entries(r.days) as [Job, number][]).filter(([, n]) => n).map(([j, n]) => `${n} day${n === 1 ? "" : "s"} ${j === "rest" ? "resting" : `on ${j}`}`);
  if (r.research) jobs.push(`${Math.round(r.research)} research points`);
  if (jobs.length) lines.push(`${jobs.join(", ")}.`);
  const out = [
    r.runs && `${r.runs} run${r.runs === 1 ? "" : "s"} (${r.daysOut} days out)`,
    r.found && `${Math.round(r.found)} supplies found`,
    r.placesFound && `${r.placesFound} new place${r.placesFound === 1 ? "" : "s"}`,
    r.met && `talked to ${r.met} (${r.recruited} joined)`,
    r.calls && `${r.calls} sighting call${r.calls === 1 ? "" : "s"}`,
    r.carsFixed && `${r.carsFixed} car${r.carsFixed === 1 ? "" : "s"} fixed`,
    r.ranFrom && `ran from ${r.ranFrom} ambush${r.ranFrom === 1 ? "" : "es"}`,
    r.injuries && `hurt ${r.injuries} time${r.injuries === 1 ? "" : "s"} out there`,
  ].filter(Boolean);
  if (out.length) lines.push(`${out.join(", ")}.`);
  const grown = Object.entries(r.grown ?? {}).filter(([, n]) => n);
  const up = grown.filter(([, n]) => n! > 0).map(([t, n]) => `${traitName(t as Trait)} +${n}`);
  const down = grown.filter(([, n]) => n! < 0).map(([t, n]) => `${traitName(t as Trait)} −${-n!}`);
  if (up.length) lines.push(`Learned by doing: ${up.join(", ")}.`);
  if (down.length) lines.push(`Scarred: ${down.join(", ")}.`);
  const life = [r.hungryDays && `${r.hungryDays} day${r.hungryDays === 1 ? "" : "s"} hungry`, (r.kept || r.broken) && `promises kept ${r.kept}, broken ${r.broken}`].filter(Boolean);
  if (life.length) lines.push(`${life.join(", ")}.`);
  return lines;
}

/** One line for a list of people: the headline numbers only. */
export function recordSummary(r: ServiceRecord): string {
  const d = r.deeds;
  const bits = [
    `${r.fights} fight${r.fights === 1 ? "" : "s"}`,
    d.kills + d.takedowns ? `${d.kills} kill${d.kills === 1 ? "" : "s"}${d.takedowns ? `, ${d.takedowns} caught` : ""}` : "",
    d.rounds ? `${Math.round((100 * d.hits) / d.rounds)}% on target` : "",
    r.runs ? `${r.runs} run${r.runs === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

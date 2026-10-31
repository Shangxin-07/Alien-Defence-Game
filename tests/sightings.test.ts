import { describe, expect, it } from "vitest";
import { Campaign, DAY_MS } from "../src/campaign/campaign";
import { CAR_KMH, CAR_SCRAP, CAR_WORK, FOOT_KMH, HOUR_MS, SIGHTING_SCRAP, TRAIL_HOURS, freshness, rollCall, travelHours, tripFuel } from "../src/campaign/sightings";
import { START_SUPPLIES } from "../src/campaign/scavenge";

const LONDON = { lat: 51.51, lon: -0.13 };

const person = (name: string, build = 1) => ({
  name,
  role: "Army reservist",
  stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
  health: 30,
  aptitude: 1,
  build,
});

/** Four people in a London base, dice fixed at `roll`, and one call 10 km away seen just now. */
function camp(roll = 0.99) {
  const c = new Campaign();
  c.rand = () => roll;
  c.enlist([person("A"), person("B"), person("C"), person("D")]);
  c.found(LONDON, true);
  c.supplies.food = 500;
  const call = { ...rollCall(99, c.bases[0].id, c.time, () => 0.5), km: 10 };
  c.calls.push(call);
  return { c, call };
}

const ids = (c: Campaign, n: number) => c.staff.slice(0, n).map((p) => p.id);

describe("sighting calls", () => {
  it("come in now and then, and go cold after a few hours", () => {
    const c = new Campaign();
    c.rand = () => 0.1;
    c.enlist([person("A")]);
    c.found(LONDON, true);
    c.supplies.food = 500;
    c.advanceDays(1);
    expect(c.calls.length).toBe(1);
    const call = c.calls[0];
    expect(call.km).toBeGreaterThanOrEqual(2);
    expect(c.openCalls).toHaveLength(0);
    c.advanceTo(call.at + 1);
    expect(c.openCalls).toHaveLength(1);
    expect(c.news.some((n) => n.includes(call.place))).toBe(true);
    c.advanceTo(call.at + (TRAIL_HOURS + 1) * HOUR_MS);
    expect(c.calls.find((x) => x.id === call.id)).toBeUndefined();
  });

  it("lose freshness by the hour", () => {
    const { call } = camp();
    expect(freshness(call, call.at)).toBe(1);
    expect(freshness(call, call.at + (TRAIL_HOURS / 2) * HOUR_MS)).toBeCloseTo(0.5);
    expect(freshness(call, call.at + TRAIL_HOURS * 2 * HOUR_MS)).toBe(0);
  });

  it("work out travel and fuel", () => {
    expect(travelHours(10, "foot")).toBeCloseTo(10 / FOOT_KMH);
    expect(travelHours(10, "car")).toBeCloseTo(10 / CAR_KMH);
    expect(tripFuel(10)).toBe(3);
  });
});

describe("answering a call", () => {
  it("finds the alien still there and holds the clock for the fight", () => {
    const { c, call } = camp(0.5);
    const run = c.respond(call.id, ids(c, 2), "foot");
    expect(c.openCalls).toHaveLength(0);
    expect(c.staff[0].away).toBe(run.id);
    // Two hours on foot, so the trail is 75% fresh: a roll of 0.5 finds it.
    c.advanceTo(c.time + 6 * HOUR_MS);
    expect(c.ambush).toBe(run);
    expect(c.time).toBe(run.arrive);
    const t = c.time;
    c.advanceDays(2);
    expect(c.time).toBe(t);
  });

  it("brings home a body, scrap off its kit and goodwill when the fight is won", () => {
    const { c, call } = camp(0.5);
    c.staff[3].loyalty = 50;
    c.respond(call.id, ids(c, 2), "foot");
    c.advanceTo(c.time + 6 * HOUR_MS);
    c.resolveAmbush({ outcome: "killed", people: ids(c, 2).map((id) => ({ id, health: 20 })) });
    expect(c.runs).toHaveLength(0);
    expect(c.trophies).toContain("Alien corpse");
    expect(c.kills).toBe(1);
    expect(c.supplies.scrap).toBe(START_SUPPLIES.scrap + SIGHTING_SCRAP);
    expect(c.staff[3].loyalty).toBe(55);
  });

  it("can arrive to a cold trail, and walks home again", () => {
    const { c, call } = camp(0.9);
    const run = c.respond(call.id, ids(c, 1), "foot");
    c.advanceTo(c.time + 3 * HOUR_MS);
    expect(c.ambush).toBeUndefined();
    expect(run.arrived).toBe(true);
    expect(c.runs).toContain(run);
    c.advanceTo(c.time + 2 * HOUR_MS);
    expect(c.runs).not.toContain(run);
    expect(c.staff[0].away).toBeUndefined();
    expect(c.news.some((n) => n.startsWith("Nothing"))).toBe(true);
  });

  it("gets there much fresher by car, for fuel", () => {
    const { c, call } = camp(0.9);
    expect(c.checkResponse(call.id, ids(c, 2), "car")).toMatch(/no car/);
    c.vehicles.push({ id: 1, name: "the van" });
    expect(c.checkResponse(call.id, ids(c, 2), "car")).toMatch(/fuel/);
    c.supplies.fuel = 10;
    expect(c.checkResponse(call.id, ids(c, 4), "car")).toBeNull();
    const run = c.respond(call.id, ids(c, 2), "car");
    expect(c.supplies.fuel).toBe(10 - tripFuel(10));
    expect(c.vehicles[0].away).toBe(run.id);
    // 15 minutes by car: about 97% fresh, so even a roll of 0.9 finds it.
    c.advanceTo(c.time + HOUR_MS);
    expect(c.ambush).toBe(run);
    c.fleeAmbush();
    expect(c.vehicles[0].away).toBeUndefined();
  });

  it("can't be answered once it's gone cold or someone's gone", () => {
    const { c, call } = camp();
    c.respond(call.id, ids(c, 1), "foot");
    expect(c.checkResponse(call.id, [c.staff[1].id], "foot")).toMatch(/cold/);
  });
});

describe("cars", () => {
  it("take scrap and days of work to get running", () => {
    const { c } = camp();
    expect(c.checkRepair(ids(c, 1))).toMatch(/scrap/);
    c.supplies.scrap = CAR_SCRAP + 2;
    expect(c.checkRepair(ids(c, 3))).toMatch(/2/);
    const run = c.startRepair(ids(c, 2));
    expect(c.supplies.scrap).toBe(2);
    expect(run.daysLeft).toBe(Math.ceil(CAR_WORK / 2));
    expect(c.canScavenge(c.staff[0])).toBe(false);
    c.advanceDays(run.daysLeft);
    expect(c.vehicles).toHaveLength(1);
    expect(c.staff[0].away).toBeUndefined();
  });

  it("are saved, along with calls and fuel", () => {
    const { c } = camp();
    c.vehicles.push({ id: 1, name: "the van" });
    c.supplies.fuel = 7;
    const back = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(back.vehicles).toEqual(c.vehicles);
    expect(back.calls).toEqual(c.calls);
    expect(back.supplies.fuel).toBe(7);
  });

  it("keeps old saves without fuel working", () => {
    const { c } = camp();
    const data = JSON.parse(JSON.stringify(c.save()));
    delete data.supplies.fuel;
    for (const p of data.places) delete p.stock.fuel;
    const back = Campaign.load(data);
    expect(back.supplies.fuel).toBe(0);
    expect(back.places[0].stock.fuel).toBe(0);
    expect(DAY_MS).toBeGreaterThan(0);
  });
});

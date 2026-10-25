import { describe, expect, it } from "vitest";
import { BaseLayout } from "../src/base/layout";
import { Campaign, DAY_MS } from "../src/campaign";
import { CAMPAIGN_START } from "../src/geoscape/clock";
import { DESERT_AFTER, MAX_TEAM, SCRAP_VALUE, START_SUPPLIES, cleanChance, dayLoot, dayRisk } from "../src/scavenge";
import { startAmbush } from "../src/tactical/prologue";
import { CITIES } from "../src/geoscape/cities";

const LONDON = { lat: 51.51, lon: -0.13 };

const person = (name: string) => ({
  name,
  role: "Army reservist",
  stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
  health: 30,
  aptitude: 1,
  build: 1,
});

/** A campaign with four people in a London base and dice that always come up `roll`. */
function camp(roll = 0.99): Campaign {
  const c = new Campaign();
  c.rand = () => roll;
  c.enlist([person("A"), person("B"), person("C"), person("D")]);
  c.found(LONDON, true);
  return c;
}

describe("food", () => {
  it("starts with about a week for four, and everyone eats every day", () => {
    const c = camp();
    expect(c.supplies).toEqual(START_SUPPLIES);
    expect(c.foodDays).toBe(7);
    c.advanceDays(2);
    expect(c.supplies.food).toBe(START_SUPPLIES.food - 8);
  });

  it("slows the hungry, and the long hungry leave, but never the last one", () => {
    const c = camp(0);
    c.supplies.food = 0;
    for (const p of c.staff) p.job = "construction";
    c.advanceDays(1);
    expect(c.staff.every((p) => p.hunger === 1)).toBe(true);
    expect(c.builders(c.bases[0].id).every((b) => b.skill === 0.5)).toBe(true);
    c.advanceDays(DESERT_AFTER + 5);
    expect(c.staff).toHaveLength(1);
    expect(c.news.some((n) => n.includes("left to find food"))).toBe(true);
  });

  it("feeds people again as soon as there's food", () => {
    const c = camp();
    c.supplies.food = 0;
    c.advanceDays(1);
    c.supplies.food = 10;
    c.advanceDays(1);
    expect(c.staff.every((p) => p.hunger === 0)).toBe(true);
  });
});

describe("medicine", () => {
  it("goes to whoever is too hurt to work, and heals them faster", () => {
    const c = camp();
    c.staff[0].health = 5;
    c.staff[1].health = 25;
    c.advanceDays(1);
    expect(c.staff[0].health).toBe(8);
    expect(c.staff[1].health).toBe(26);
    expect(c.supplies.medicine).toBe(START_SUPPLIES.medicine - 1);
  });
});

describe("scavenging runs", () => {
  it("checks who can go", () => {
    const c = camp();
    const ids = c.staff.map((p) => p.id);
    expect(c.checkRun("grocery", [], 1)).toMatch(/Pick/);
    expect(c.checkRun("grocery", ids, 4)).toMatch(/1 to 3/);
    c.enlist([]);
    c.staff.push({ ...c.staff[0], id: 99, name: "E" });
    expect(c.checkRun("grocery", [...ids, 99], 1)).toMatch(new RegExp(`${MAX_TEAM}`));
    c.staff[0].health = 1;
    expect(c.checkRun("grocery", [ids[0]], 1)).toMatch(/can't go/);
  });

  it("takes people off their work and brings them home with what they found", () => {
    const c = camp();
    for (const p of c.staff) p.job = "construction";
    const run = c.startRun("hardware", [c.staff[0].id, c.staff[1].id], 2);
    expect(c.builders(c.bases[0].id)).toHaveLength(2);
    expect(c.checkRun("homes", [c.staff[0].id], 1)).toMatch(/can't go/);
    c.advanceDays(1);
    expect(run.loot.scrap).toBeGreaterThan(0);
    c.advanceDays(1);
    expect(c.runs).toHaveLength(0);
    expect(c.supplies.scrap).toBe(run.loot.scrap);
    expect(c.staff.every((p) => !p.away)).toBe(true);
    expect(c.news.some((n) => n.startsWith("Back from the hardware stores"))).toBe(true);
  });

  it("picks places over, and they fill up again slowly", () => {
    const c = camp();
    c.startRun("grocery", [c.staff[0].id], 3);
    c.advanceDays(3);
    const rich = c.richness.grocery!;
    expect(rich).toBeLessThan(1);
    c.advanceDays(5);
    expect(c.richness.grocery).toBeGreaterThan(rich);
  });

  it("finds less in a picked-over place", () => {
    const rand = () => 0.5;
    expect(dayLoot("grocery", 2, 0.4, rand).food).toBeLessThan(dayLoot("grocery", 2, 1, rand).food);
  });

  it("is riskier with a bigger team, a longer stay and a worse place", () => {
    expect(dayRisk("homes", 1)).toBeLessThan(dayRisk("homes", 4));
    expect(dayRisk("homes", 2)).toBeLessThan(dayRisk("industrial", 2));
    expect(cleanChance("grocery", 2, 3)).toBeLessThan(cleanChance("grocery", 2, 1));
  });
});

describe("runs that go wrong", () => {
  /** Dice that roll trouble first, then the given kind of trouble, then whatever else. */
  function trouble(c: Campaign, kind: number) {
    const rolls = [0, kind];
    c.rand = () => rolls.shift() ?? 0.99;
  }

  it("can hurt someone and send the run home early", () => {
    const c = camp();
    c.startRun("pharmacy", [c.staff[0].id], 3);
    trouble(c, 0.1);
    c.advanceDays(1);
    expect(c.staff[0].health).toBeLessThan(30);
    expect(c.runs).toHaveLength(0);
  });

  it("can run into an alien, which holds the clock until it's dealt with", () => {
    const c = camp();
    const run = c.startRun("industrial", [c.staff[0].id, c.staff[1].id], 2);
    trouble(c, 0.9);
    c.advanceDays(5);
    expect(c.ambush).toBe(run);
    expect(c.day).toBe(1);
    expect(c.advanceTo(CAMPAIGN_START + 10 * DAY_MS)).toEqual([]);
    expect(c.day).toBe(1);
  });

  it("keeps everything and a corpse after a win, and loses the fallen", () => {
    const c = camp();
    const [a, b] = c.staff;
    const run = c.startRun("industrial", [a.id, b.id], 2);
    run.loot.scrap = 10;
    run.ambush = true;
    c.resolveAmbush({ outcome: "killed", people: [{ id: a.id, health: 12 }] });
    expect(c.staff.map((p) => p.id)).not.toContain(b.id);
    expect(a.health).toBe(12);
    expect(c.supplies.scrap).toBe(10);
    expect(c.recovered).toContain("Alien corpse");
    expect(c.runs).toHaveLength(0);
    expect(c.projects().some((p) => p.project.id === "autopsy")).toBe(true);
  });

  it("keeps half after fleeing the fight, and nothing after running before it", () => {
    const c = camp();
    const run = c.startRun("hardware", [c.staff[0].id], 2);
    run.loot.scrap = 10;
    run.ambush = true;
    c.resolveAmbush({ outcome: "fled", people: [{ id: c.staff[0].id, health: 30 }] });
    expect(c.supplies.scrap).toBe(5);
    const again = c.startRun("hardware", [c.staff[1].id], 2);
    again.loot.scrap = 10;
    again.ambush = true;
    c.fleeAmbush();
    expect(c.supplies.scrap).toBe(5);
    expect(c.ambush).toBeUndefined();
  });

  it("sends a liaison if the last of them dies out there", () => {
    const c = new Campaign();
    c.enlist([person("Solo")]);
    c.found(LONDON, true);
    const run = c.startRun("homes", [c.staff[0].id], 1);
    run.ambush = true;
    c.resolveAmbush({ outcome: "wiped", people: [] });
    expect(c.staff.map((p) => p.name)).toEqual(["Council liaison"]);
  });

  it("puts the run's own people on the battlefield", () => {
    const c = camp();
    const team = c.staff.slice(0, 2);
    team[1].health = 11;
    const fight = startAmbush(CITIES.find((x) => x.name === "London")!, 5, team, "Supermarkets");
    expect(fight.battle.humans.map((u) => [u.id, u.name, u.health])).toEqual(team.map((p) => [p.id, p.name, p.health]));
    expect(fight.battle.humans[0].weapon?.name).toBeTruthy();
    expect(fight.mission?.spoils.captured).toContain("Live alien");
  });

  it("survives a save and load mid-run", () => {
    const c = camp();
    c.startRun("homes", [c.staff[0].id], 3);
    c.advanceDays(1);
    const copy = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(copy.runs).toHaveLength(1);
    expect(copy.staff[0].away).toBe(copy.runs[0].id);
    expect(copy.supplies).toEqual(c.supplies);
  });
});

describe("scrap", () => {
  it("pays for rooms before money does", () => {
    const b = BaseLayout.starter("remote");
    b.funds = 1_000_000;
    b.scrap = 20;
    b.place("shaft", 1, 4, 4, false, { free: true, instant: true });
    b.place("stairs", 1, 4, 4, false, { free: true, instant: true });
    const cost = b.cost("lift", 1);
    b.place("lift", 1, 4, 4);
    expect(b.scrap).toBe(20 - Math.ceil(cost / SCRAP_VALUE));
    expect(b.funds).toBe(1_000_000);
  });

  it("tops up with money when scrap runs short, and refuses when both do", () => {
    const b = BaseLayout.starter("remote");
    b.funds = 50_000;
    b.scrap = 3;
    expect(b.payment(120_000)).toEqual({ scrap: 3, money: 90_000 });
    expect(b.canAfford(120_000)).toBe(false);
    expect(b.canAfford(80_000)).toBe(true);
  });

  it("is lent to bases with the funds and comes back after building", () => {
    const c = camp();
    c.supplies.scrap = 30;
    const layout = c.open(c.bases[0]);
    expect(layout.scrap).toBe(30);
    layout.scrap -= 12;
    c.settle(c.bases[0]);
    expect(c.supplies.scrap).toBe(18);
  });
});

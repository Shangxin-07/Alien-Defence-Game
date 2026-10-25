import { describe, expect, it } from "vitest";
import { BaseLayout } from "../src/base/layout";
import { CROP_DAYS, Campaign, DAY_MS } from "../src/campaign";
import { ROOMS, RoomId } from "../src/base/rooms";
import { CAMPAIGN_START } from "../src/geoscape/clock";
import { DESERT_AFTER, MARKET_PRICE, STOCK, rollPlace, MAX_TEAM, SCRAP_VALUE, START_SUPPLIES, cleanChance, dayLoot, dayRisk, marketCost } from "../src/scavenge";
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
    expect(c.news.some((n) => n.startsWith("Back from DIY superstore"))).toBe(true);
  });

  it("takes what it finds out of what's left, and a big team only empties a place faster", () => {
    const rand = () => 0.5;
    const small = { ...camp().findPlace("grocery")! };
    small.stock = { ...small.stock };
    const big = { ...small, stock: { ...small.stock } };
    let fromSmall = 0;
    let fromBig = 0;
    let smallDays = 0;
    let bigDays = 0;
    while (small.stock.food > 0) {
      fromSmall += dayLoot(small, 1, rand).food;
      smallDays++;
    }
    while (big.stock.food > 0) {
      fromBig += dayLoot(big, 4, rand).food;
      bigDays++;
    }
    expect(fromSmall).toBe(STOCK.grocery.food);
    expect(fromBig).toBe(STOCK.grocery.food);
    expect(bigDays).toBeLessThan(smallDays);
  });

  it("forgets a place once it's picked clean, and says so", () => {
    const c = camp(0.5);
    const shop = c.findPlace("grocery")!;
    shop.stock.food = 5;
    const run = c.startRun(shop.id, c.staff.slice(0, 2).map((p) => p.id), 3);
    c.advanceDays(1);
    expect(c.runs).not.toContain(run);
    expect(c.supplies.food).toBe(START_SUPPLIES.food - 4 + 5);
    expect(c.findPlace(shop.id)).toBeUndefined();
    expect(c.news.some((n) => n === `${shop.name} is picked clean`)).toBe(true);
    expect(c.checkRun(shop.id, [c.staff[0].id], 1)).toMatch(/any more/);
  });

  it("starts out knowing one place of each kind, with a fixed stock", () => {
    const c = camp();
    expect(c.places.map((p) => p.kind)).toEqual(["homes", "grocery", "pharmacy", "hardware", "industrial"]);
    expect(c.findPlace("homes")!.stock).toEqual({ food: 40, medicine: 6, scrap: 25, fuel: 10 });
  });
});

describe("searching for new places", () => {
  it("turns up new places with their own stock", () => {
    const c = camp(0.1);
    const before = c.places.length;
    c.startSearch(c.staff.slice(0, 2).map((p) => p.id), 2);
    c.advanceDays(2);
    expect(c.places.length).toBe(before + 4);
    const found = c.places.slice(before);
    expect(new Set(found.map((p) => p.id)).size).toBe(4);
    for (const p of found) expect(Object.values(p.stock).some((n) => n > 0)).toBe(true);
    expect(c.news.some((n) => /4 new places/.test(n))).toBe(true);
  });

  it("can come back with nothing, and takes no more than two", () => {
    const c = camp(0.99);
    const ids = c.staff.map((p) => p.id);
    expect(() => c.startSearch(ids.slice(0, 3), 1)).toThrow(/2/);
    c.startSearch(ids.slice(0, 1), 1);
    c.advanceDays(1);
    expect(c.places.length).toBe(5);
    expect(c.news.some((n) => /nowhere new/.test(n))).toBe(true);
  });

  it("rolls smaller places than the ones everyone knew about", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
      const p = rollPlace(i, rand);
      for (const [k, n] of Object.entries(STOCK[p.kind])) expect(p.stock[k as "food"]).toBeLessThanOrEqual(Math.round(n * 1.2));
      expect(p.name.length).toBeGreaterThan(5);
    }
  });

  it("keeps places and their stock in the save", () => {
    const c = camp(0.1);
    c.startSearch([c.staff[0].id], 1);
    c.advanceDays(1);
    c.places[0].stock.food = 3;
    const back = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(back.places).toEqual(c.places);
    back.startSearch([back.staff[0].id], 1);
    back.rand = () => 0.1;
    back.advanceDays(1);
    expect(new Set(back.places.map((p) => p.id)).size).toBe(back.places.length);
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

describe("black market", () => {
  it("does nothing for you with no money", () => {
    const c = camp();
    expect(c.funds).toBe(0);
    expect(c.checkBuy("food", 10)).toMatch(/money/);
    expect(() => c.buy("food", 10)).toThrow();
  });

  it("sells food for cash, and every lot pushes the price up", () => {
    const c = camp();
    c.funds = 1_000_000;
    const first = c.buyCost("food", 10);
    expect(first).toBeGreaterThanOrEqual(10 * MARKET_PRICE.food);
    c.buy("food", 10);
    expect(c.supplies.food).toBe(START_SUPPLIES.food + 10);
    expect(c.funds).toBe(1_000_000 - first);
    expect(c.buyCost("food", 10)).toBeGreaterThan(first);
  });

  it("makes a whole grant feed four for under three weeks", () => {
    let bought = 0;
    let heat = 1;
    let money = 1_000_000;
    while (marketCost("food", 10, heat) <= money) {
      money -= marketCost("food", 10, heat);
      heat *= 1.012 ** 10;
      bought += 10;
    }
    expect(bought / 4).toBeLessThan(21);
    expect(bought / 4).toBeGreaterThan(10);
  });

  it("eases back slowly", () => {
    const c = camp();
    c.funds = 1_000_000;
    c.supplies.food = 1000;
    const rate = c.buyCost("food", 10);
    for (let i = 0; i < 5; i++) c.buy("food", 10);
    const pushed = c.buyCost("food", 10);
    c.advanceDays(10);
    const later = c.buyCost("food", 10);
    expect(later).toBeLessThan(pushed);
    expect(later).toBeGreaterThan(rate);
    c.advanceDays(150);
    expect(c.buyCost("food", 10)).toBeLessThanOrEqual(rate + 1000);
  });

  it("is saved", () => {
    const c = camp();
    c.funds = 1_000_000;
    c.buy("medicine", 2);
    const back = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(back.market.medicine).toBeCloseTo(c.market.medicine);
    expect(back.supplies.medicine).toBe(START_SUPPLIES.medicine + 2);
  });
});

describe("hydroponic farm", () => {
  /** The London base swapped for a working one: lift, power and a farm on level -1. */
  function farm(c: Campaign) {
    const b = BaseLayout.starter("remote");
    const put = (type: RoomId, level: number, x: number, y: number) => b.place(type, level, x, y, false, { free: true, instant: true });
    put("tunnel", 0, 4, 3);
    put("shaft", 1, 4, 4);
    put("stairs", 1, 4, 4);
    put("lift", 1, 4, 4);
    for (const [x, y] of [[4, 3], [4, 5], [3, 4], [5, 4]]) put("tunnel", 1, x, y);
    put("generator", 1, 5, 2);
    const it = put("hydroponics", 1, 2, 5);
    c.bases[0].layout = b;
    return it;
  }

  it("needs a lift and power, and costs real money", () => {
    const def = ROOMS.hydroponics;
    expect(def.heavy).toBe(true);
    expect(def.power).toBeGreaterThan(0);
    expect(def.cost).toBeGreaterThanOrEqual(300_000);
  });

  it("brings in food once the first crop is grown, and not before", () => {
    const c = camp();
    c.supplies.food = 1000;
    const it = farm(c);
    expect(c.bases[0].layout.status(it.uid)).toBe("online");
    c.advanceDays(CROP_DAYS - 1);
    expect(c.supplies.food).toBe(1000 - 4 * (CROP_DAYS - 1));
    c.advanceDays(1);
    expect(c.supplies.food).toBe(1000 - 4 * CROP_DAYS + 5);
    expect(c.news.some((n) => /First crop/.test(n))).toBe(true);
    c.advanceDays(10);
    expect(c.supplies.food).toBe(1000 - 4 * (CROP_DAYS + 10) + 5 * 11);
  });

  it("waits while it has no power, and keeps its progress", () => {
    const c = camp();
    c.supplies.food = 1000;
    const it = farm(c);
    const layout = c.bases[0].layout;
    c.advanceDays(5);
    const gen = [...layout.items.values()].find((x) => x.type === "generator")!;
    layout.demolish(gen.uid);
    expect(layout.status(it.uid)).not.toBe("online");
    c.advanceDays(20);
    expect(c.crops[`${c.bases[0].id}:${it.uid}`]).toBe(5);
    const back = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(back.crops).toEqual(c.crops);
  });
});

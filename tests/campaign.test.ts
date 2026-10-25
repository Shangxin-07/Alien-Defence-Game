import { describe, expect, it } from "vitest";
import { BaseLayout } from "../src/base/layout";
import { ROOMS } from "../src/base/rooms";
import { CITY_RADIUS_KM, Campaign, DAY_MS, FOUNDING_COST, MAX_BASES, START_FUNDS, distanceKm, nearestCity } from "../src/campaign";
import { CITIES } from "../src/geoscape/cities";
import { CAMPAIGN_START } from "../src/geoscape/clock";

const LONDON = { lat: 51.51, lon: -0.13 };
const LAGOS = { lat: 6.52, lon: 3.38 };
const SAHARA = { lat: 23, lon: 12 };
const MID_ATLANTIC = { lat: 0, lon: -30 };

describe("distances", () => {
  it("measures great circles", () => {
    expect(distanceKm(LONDON, { lat: 48.86, lon: 2.35 })).toBeCloseTo(343, -1);
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6371, 0);
  });

  it("finds the nearest city", () => {
    expect(nearestCity({ lat: 51.6, lon: 0 }).city.name).toBe("London");
  });
});

describe("surveying sites", () => {
  it("makes a covert base in a city and a remote one elsewhere on land", () => {
    const c = new Campaign();
    expect(c.survey(LONDON, true)).toMatchObject({ site: "city", reason: null, cost: 0 });
    expect(c.survey(LONDON, true).city?.name).toBe("London");
    expect(c.survey(MID_ATLANTIC, false)).toMatchObject({ site: null, reason: "Bases need dry land" });
    // A click that lands in the Thames estuary still means London, and the base goes under the city.
    expect(c.survey({ lat: 51.5, lon: 0.6 }, false).city?.name).toBe("London");
    expect(c.found({ lat: 51.5, lon: 0.6 }, false)).toMatchObject({ lat: 51.51, lon: -0.13 });
    // Just outside the city limits counts as open country.
    const edge = { lat: LONDON.lat + (CITY_RADIUS_KM + 30) / 111, lon: LONDON.lon };
    expect(c.survey(edge, true).site).toBe("remote");
  });

  it("hides the first base in a city and pays for it", () => {
    const c = new Campaign();
    expect(c.survey(SAHARA, true).reason).toMatch(/first base/);
    expect(c.survey(SAHARA, true).cost).toBe(0);
    const hq = c.found(LONDON, true);
    expect(hq).toMatchObject({ name: "Base Alpha", site: "city", city: "London" });
    expect(c.funds).toBe(START_FUNDS);
  });

  it("charges for later bases and keeps them apart", () => {
    const c = new Campaign();
    c.found(LONDON, true);
    expect(c.survey({ lat: 48.86, lon: 2.35 }, true).reason).toMatch(/Too close to Base Alpha/);
    const second = c.found(SAHARA, true);
    expect(second).toMatchObject({ name: "Base Bravo", site: "remote" });
    expect(c.funds).toBe(START_FUNDS - FOUNDING_COST.remote);
    c.found(LAGOS, true);
    expect(c.funds).toBe(START_FUNDS - FOUNDING_COST.remote - FOUNDING_COST.city);
    c.funds = 0;
    expect(c.survey({ lat: -33.87, lon: 151.21 }, true).reason).toMatch(/funds/);
  });

  it("caps the number of bases", () => {
    const c = new Campaign();
    c.funds = 1e9;
    // Megacities spread far enough apart.
    const names = ["Tokyo", "Delhi", "Cairo", "New York", "Moscow", "London", "Lagos", "Sydney", "Lima"];
    const sites = names.map((n) => CITIES.find((city) => city.name === n)!);
    for (const s of sites.slice(0, MAX_BASES)) c.found(s, true);
    expect(c.survey(sites[MAX_BASES], true).reason).toMatch(/more than/);
  });
});

describe("the shared clock", () => {
  /** A base with one lift still being dug, independent of how starter bases look. */
  function digging(c: Campaign) {
    const base = c.found(LONDON, true);
    base.layout = new BaseLayout(1e7, "remote");
    base.layout.place("lift", 0, 0, 0);
    return base;
  }

  it("moves construction on at each day boundary", () => {
    const c = new Campaign();
    const base = digging(c);
    const days = ROOMS.lift.days;
    expect(c.advanceTo(CAMPAIGN_START + DAY_MS - 1)).toEqual([]);
    expect(base.layout.items.get(1)!.daysLeft).toBe(days);
    c.advanceTo(CAMPAIGN_START + DAY_MS);
    expect(base.layout.items.get(1)!.daysLeft).toBe(days - 1);
    const done = c.advanceTo(CAMPAIGN_START + days * DAY_MS + 5000);
    expect(done.map((d) => [d.base.name, d.item.type])).toEqual([["Base Alpha", "lift"]]);
  });

  it("skips whole days without losing the part of a day already gone", () => {
    const c = new Campaign();
    digging(c);
    c.advanceTo(CAMPAIGN_START + DAY_MS / 2);
    c.advanceDays(1);
    expect(c.day).toBe(1);
    expect(c.time).toBe(CAMPAIGN_START + DAY_MS);
  });

  it("shares one purse between bases", () => {
    const c = new Campaign();
    const a = c.found(LONDON, true);
    const b = c.found(SAHARA, true);
    const la = c.open(a);
    la.funds -= 100_000;
    c.settle(a);
    expect(c.open(b).funds).toBe(START_FUNDS - FOUNDING_COST.remote - 100_000);
  });
});

describe("saving", () => {
  it("round-trips the campaign", () => {
    const c = new Campaign();
    c.found(LONDON, true);
    c.found(SAHARA, true);
    c.advanceDays(3);
    const copy = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(copy.time).toBe(c.time);
    expect(copy.funds).toBe(c.funds);
    expect(copy.bases.map((b) => [b.name, b.site, b.city, b.layout.items.size])).toEqual(
      c.bases.map((b) => [b.name, b.site, b.city, b.layout.items.size]),
    );
    expect(copy.found(LAGOS, true).name).toBe("Base Charlie");
  });
});

describe("the prologue", () => {
  it("is remembered with the campaign, and older saves load without it", () => {
    const c = new Campaign();
    expect(c.prologue).toBeNull();
    c.recordPrologue({ city: "Lagos", outcome: "captured", recovered: ["Live alien"], survivors: 2, turns: 7 });
    const copy = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(copy.prologue).toMatchObject({ city: "Lagos", outcome: "captured" });
    const old = c.save();
    delete old.prologue;
    expect(Campaign.load(old).prologue).toBeNull();
  });

  it("never swaps a better result for a worse replay", () => {
    const c = new Campaign();
    c.recordPrologue({ city: "Lagos", outcome: "fled", recovered: [], survivors: 4, turns: 2 });
    c.recordPrologue({ city: "Cairo", outcome: "killed", recovered: ["Alien corpse"], survivors: 3, turns: 9 });
    expect(c.prologue?.city).toBe("Cairo");
    c.recordPrologue({ city: "Paris", outcome: "wiped", recovered: [], survivors: 0, turns: 4 });
    expect(c.prologue?.city).toBe("Cairo");
    c.recordPrologue({ city: "Tokyo", outcome: "captured", recovered: ["Live alien"], survivors: 1, turns: 12 });
    expect(c.prologue?.outcome).toBe("captured");
    c.recordPrologue({ city: "Delhi", outcome: "killed", recovered: ["Alien corpse"], survivors: 4, turns: 5 });
    expect(c.prologue?.city).toBe("Tokyo");
  });
});

describe("staff and research", () => {
  const person = (name: string) => ({
    name,
    role: "Test",
    stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
    health: 30,
    aptitude: 1,
  });

  it("sends a liaison when nobody survived, and moves everyone into the first base", () => {
    const c = new Campaign();
    c.enlist([]);
    expect(c.staff.map((p) => p.name)).toEqual(["Council liaison"]);
    expect(c.staff[0].base).toBeNull();
    const b = c.found(LONDON, true);
    expect(c.staff[0].base).toBe(b.id);
    // Only once: a replay doesn't add more people.
    c.enlist([person("A")]);
    expect(c.staff).toHaveLength(1);
  });

  it("researches faster with more people, and a lone liaison still gets there", () => {
    const run = (n: number) => {
      const c = new Campaign();
      c.recordPrologue({ city: "Lagos", outcome: n ? "killed" : "wiped", recovered: n ? ["Alien corpse", "Plasma pistol"] : [], survivors: n, turns: 5 });
      c.enlist(Array.from({ length: n }, (_, i) => person(`P${i}`)));
      c.found(LONDON, true);
      c.setResearch("debrief");
      let days = 0;
      while (!c.research.done.includes("debrief") && days < 100) {
        c.advanceDays(1);
        days++;
      }
      return { c, days };
    };
    expect(run(4).days).toBeLessThan(run(1).days);
    const alone = run(0);
    expect(alone.c.research.done).toContain("debrief");
    expect(alone.c.news.some((n) => n.includes("Debrief"))).toBe(true);
    // With nothing recovered, the alien-tech projects stay hidden but the crash site opens up.
    const ids = alone.c.projects().map((p) => p.project.id);
    expect(ids).not.toContain("plasmaPistol");
    expect(alone.c.projects().find((p) => p.project.id === "crashSite")?.blocker).toBeNull();
  });

  it("gates projects on what came home and on containment", () => {
    const c = new Campaign();
    c.recordPrologue({ city: "Lagos", outcome: "captured", recovered: ["Live alien", "Plasma pistol", "Tracking implant"], survivors: 1, turns: 5 });
    c.enlist([person("A")]);
    c.found(LONDON, true);
    const p = (id: string) => c.projects().find((x) => x.project.id === id);
    expect(p("interrogation")?.blocker).toMatch(/containment/);
    expect(p("plasmaPistol")?.blocker).toBeNull();
    expect(p("autopsy")).toBeUndefined();
    expect(() => c.setResearch("interrogation")).toThrow();
  });

  it("lets builders bring construction forward, and the badly hurt rest", () => {
    const c = new Campaign();
    c.enlist([person("A"), person("B"), person("C"), person("D")]);
    const b = c.found(LONDON, true);
    b.layout.funds = 10_000_000;
    const shaft = b.layout.place("accessPoint", 0, 3, 3, false);
    expect(shaft.daysLeft).toBe(ROOMS.accessPoint.days);
    for (const s of c.staff) s.job = "construction";
    // One of them is too hurt to work: three builders bring it forward three quarters of a day a day.
    c.staff[3].health = 5;
    expect(c.researchRate()).toBe(0);
    c.advanceDays(4);
    expect(shaft.daysLeft).toBe(ROOMS.accessPoint.days - 4 - 3);
    expect(c.staff[3].health).toBe(9);
  });

  it("gives saves from before staff existed their survivors", () => {
    const c = new Campaign();
    c.recordPrologue({ city: "Lagos", outcome: "killed", recovered: ["Alien corpse"], survivors: 3, turns: 5 });
    c.found(LONDON, true);
    const old = c.save();
    delete old.staff;
    const copy = Campaign.load(old);
    expect(copy.staff).toHaveLength(3);
    expect(copy.staff.every((p) => p.base === copy.bases[0].id)).toBe(true);
  });
});

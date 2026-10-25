import { describe, expect, it } from "vitest";
import { BaseLayout } from "../src/base/layout";
import { ROOMS } from "../src/base/rooms";
import { CITY_RADIUS_KM, Campaign, DAY_MS, FOUNDING_COST, GRANT, GRANT_DAYS, MAX_BASES, START_FUNDS, distanceKm, nearestCity } from "../src/campaign";
import { CITIES } from "../src/geoscape/cities";
import { LIAISON, buildSkill } from "../src/staff";
import { CAMPAIGN_START } from "../src/geoscape/clock";

const LONDON = { lat: 51.51, lon: -0.13 };
const LAGOS = { lat: 6.52, lon: 3.38 };
const SAHARA = { lat: 23, lon: 12 };
const MID_ATLANTIC = { lat: 0, lon: -30 };
const FUNDED = 10_000_000;

/** A campaign with money to spend, as if the council had come through. */
function funded(): Campaign {
  const c = new Campaign();
  c.funds = FUNDED;
  return c;
}

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

  it("starts with no money at all", () => {
    expect(START_FUNDS).toBe(0);
    const c = new Campaign();
    c.found(LONDON, true);
    expect(c.survey(SAHARA, true).reason).toMatch(/funds/);
  });

  it("charges for later bases and keeps them apart", () => {
    const c = funded();
    c.found(LONDON, true);
    expect(c.survey({ lat: 48.86, lon: 2.35 }, true).reason).toMatch(/Too close to Base Alpha/);
    const second = c.found(SAHARA, true);
    expect(second).toMatchObject({ name: "Base Bravo", site: "remote" });
    expect(c.funds).toBe(FUNDED - FOUNDING_COST.remote);
    c.found(LAGOS, true);
    expect(c.funds).toBe(FUNDED - FOUNDING_COST.remote - FOUNDING_COST.city);
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
  /** A base with one shaft still being dug by one steady builder, independent of how starter bases look. */
  function digging(c: Campaign) {
    c.enlist([{ ...LIAISON, build: 1 }]);
    const base = c.found(LONDON, true);
    c.staff[0].job = "construction";
    base.layout = new BaseLayout(1e7, "remote");
    base.layout.place("shaft", 0, 0, 0);
    return base;
  }

  it("moves construction on at each day boundary", () => {
    const c = new Campaign();
    const base = digging(c);
    const work = ROOMS.shaft.work;
    expect(c.advanceTo(CAMPAIGN_START + DAY_MS - 1)).toEqual([]);
    expect(base.layout.items.get(1)!.workLeft).toBe(work);
    c.advanceTo(CAMPAIGN_START + DAY_MS);
    expect(base.layout.items.get(1)!.workLeft).toBe(work - 1);
    const done = c.advanceTo(CAMPAIGN_START + work * DAY_MS + 5000);
    expect(done.map((d) => [d.base.name, d.item.type])).toEqual([["Base Alpha", "shaft"]]);
  });

  it("skips whole days without losing the part of a day already gone", () => {
    const c = new Campaign();
    digging(c);
    c.advanceTo(CAMPAIGN_START + DAY_MS / 2);
    c.advanceDays(1);
    expect(c.day).toBe(1);
    expect(c.time).toBe(CAMPAIGN_START + DAY_MS);
  });

  it("pays the council grant once a month", () => {
    const c = new Campaign();
    c.found(LONDON, true);
    expect(c.nextGrant).toBe(GRANT_DAYS);
    c.advanceDays(GRANT_DAYS - 1);
    expect(c.funds).toBe(0);
    expect(c.nextGrant).toBe(1);
    c.advanceDays(1);
    expect(c.funds).toBe(GRANT);
    expect(c.news.some((n) => n.includes("council"))).toBe(true);
    c.advanceDays(GRANT_DAYS);
    expect(c.funds).toBe(2 * GRANT);
  });

  it("shares one purse between bases", () => {
    const c = funded();
    const a = c.found(LONDON, true);
    const b = c.found(SAHARA, true);
    const la = c.open(a);
    la.funds -= 100_000;
    c.settle(a);
    expect(c.open(b).funds).toBe(FUNDED - FOUNDING_COST.remote - 100_000);
  });
});

describe("saving", () => {
  it("round-trips the campaign", () => {
    const c = funded();
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
  const person = (name: string, build = 1) => ({
    name,
    role: "Test",
    stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
    health: 30,
    aptitude: 1,
    build,
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
      for (const s of c.staff) s.job = "research";
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

  it("puts one person on research and the rest on digging", () => {
    const c = new Campaign();
    c.enlist([person("A"), person("B"), person("C")]);
    expect(c.staff.map((p) => p.job)).toEqual(["research", "construction", "construction"]);
  });

  it("builds with the skill of whoever is fit to dig, and the badly hurt rest", () => {
    const c = new Campaign();
    c.enlist([person("A", 1.2), person("B", 1), person("C", 0.8), person("D", 1)]);
    const b = c.found(LONDON, true);
    const access = c.open(b).place("accessPoint", 0, 3, 3, false);
    expect(access.workLeft).toBe(ROOMS.accessPoint.work);
    for (const s of c.staff) s.job = "construction";
    // One of them is too hurt to work, so three builders get 3 person-days done a day. No medicine to speed them up.
    c.staff[3].health = 5;
    c.supplies.medicine = 0;
    expect(c.researchRate()).toBe(0);
    c.advanceDays(4);
    expect(access.workLeft).toBeCloseTo(ROOMS.accessPoint.work - 4 * 3);
    expect(c.staff[3].health).toBe(9);
  });

  it("moves people between bases, so a new base has someone to build it", () => {
    const c = funded();
    c.enlist([person("A"), person("B")]);
    const hq = c.found(LONDON, true);
    const far = c.found(SAHARA, true);
    for (const s of c.staff) s.job = "construction";
    c.open(far).place("tunnel", 0, 4, 3);
    expect(far.layout.crew).toHaveLength(0);
    c.transfer(c.staff[1].id, far.id);
    expect(c.builders(hq.id).map((x) => x.id)).toEqual([c.staff[0].id]);
    c.advanceDays(1);
    expect(far.layout.itemAt(0, 4, 3)?.workLeft).toBe(ROOMS.tunnel.work - 1);
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

describe("construction skill", () => {
  it("falls back on someone's old job in saves from before it existed", () => {
    const c = new Campaign();
    c.enlist([{ ...LIAISON, name: "R", role: "Army reservist", build: undefined }]);
    const copy = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(buildSkill(copy.staff[0])).toBe(1.15);
  });
});

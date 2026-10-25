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

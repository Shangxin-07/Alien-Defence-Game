import { describe, expect, it } from "vitest";
import { BaseLayout, GRID } from "../src/base/layout";
import { ROOMS, powerSupply } from "../src/base/rooms";

describe("starter base", () => {
  it("is fully online and within its power budget", () => {
    const b = BaseLayout.starter("remote");
    expect([...b.statuses().values()].every((s) => s === "online")).toBe(true);
    const s = b.stats();
    expect(s.supply).toBe(12);
    expect(s.demand).toBeLessThanOrEqual(s.supply);
    expect(s.capacity.hangars).toBe(1);
    expect(s.capacity.crew).toBe(50);
    expect(s.radar).toBe(300);
    expect(b.funds).toBe(4_000_000);
  });
});

describe("placement rules", () => {
  it("starts an empty base with a surface lift", () => {
    const b = new BaseLayout(1e7);
    expect(b.check("tunnel", 0, 0, 0)).toMatch(/access lift/);
    expect(b.check("lift", 1, 0, 0)).toMatch(/access lift/);
    expect(b.check("lift", 0, 0, 0)).toBeNull();
  });

  it("keeps hangars up top and containment below", () => {
    const b = BaseLayout.starter("remote");
    expect(b.check("hangar", 1, 5, 5)).toMatch(/surface/);
    expect(b.check("containment", 0, 5, 5)).toMatch(/underground/);
  });

  it("rejects overlaps, out-of-bounds and rooms not on a tunnel", () => {
    const b = BaseLayout.starter("remote");
    expect(b.check("quarters", 1, 3, 3)).toMatch(/taken/);
    expect(b.check("quarters", 1, 7, 7)).toMatch(/perimeter/);
    // Touches the quarters but no tunnel: rooms never open onto each other.
    expect(b.check("stores", 1, 0, 2, true)).toMatch(/tunnel or lift/);
    expect(b.check("stores", 1, 1, 0)).toMatch(/tunnel or lift/);
    // Next to the east tunnel.
    expect(b.check("lab", 1, 5, 5)).toBeNull();
  });

  it("rotates footprints", () => {
    const b = BaseLayout.starter("remote");
    expect(b.footprint("stores", true)).toEqual({ w: 1, h: 2 });
    expect(b.check("stores", 1, 7, 6)).toMatch(/perimeter/);
    expect(b.check("stores", 1, 7, 6, true)).not.toMatch(/perimeter/);
  });

  it("opens a new level from a lift stacked under a lift", () => {
    const b = BaseLayout.starter("remote");
    expect(b.check("tunnel", 2, 4, 4)).toMatch(/join/);
    expect(b.check("lift", 2, 3, 3)).toMatch(/join/);
    expect(b.check("lift", 2, 4, 4)).toBeNull();
  });

  it("charges more to dig deeper and refuses what you can't afford", () => {
    const b = BaseLayout.starter("remote");
    expect(b.cost("lab", 1)).toBeGreaterThan(ROOMS.lab.cost);
    expect(b.cost("lab", 3)).toBe(ROOMS.lab.cost * 1.5);
    b.funds = 10_000;
    expect(b.check("tunnel", 1, 4, 6)).toMatch(/funds/);
  });
});

describe("construction and connectivity", () => {
  it("builds over time and pays up front", () => {
    const b = BaseLayout.starter("remote");
    const lab = b.place("lab", 1, 5, 5);
    expect(b.funds).toBe(4_000_000 - b.cost("lab", 1));
    expect(b.status(lab.uid)).toBe("building");
    expect(b.nextCompletion()).toBe(ROOMS.lab.days);
    expect(b.advance(ROOMS.lab.days - 1)).toEqual([]);
    expect(b.advance(1)).toEqual([lab]);
    expect(b.nextCompletion()).toBe(0);
  });

  it("cuts off rooms when their tunnel is demolished", () => {
    const b = BaseLayout.starter("remote");
    const tunnel = b.itemAt(1, 4, 5)!;
    const stores = b.itemAt(1, 2, 5)!;
    expect(b.status(stores.uid)).toBe("online");
    // Stores also touch the west tunnel, so take both away.
    b.demolish(tunnel.uid);
    expect(b.status(stores.uid)).toBe("online");
    b.demolish(b.itemAt(1, 3, 4)!.uid);
    expect(b.status(stores.uid)).toBe("isolated");
    expect(b.stats().capacity.storage).toBe(0);
  });

  it("does not route through rooms or unfinished tunnels", () => {
    const b = BaseLayout.starter("remote");
    b.funds = 1e8;
    const t = b.place("tunnel", 1, 6, 4);
    // Only the unfinished tunnel reaches these stores.
    const stores = b.place("stores", 1, 6, 5, false, { instant: true });
    expect(b.status(stores.uid)).toBe("isolated");
    b.advance(t.daysLeft);
    expect(b.status(stores.uid)).toBe("online");
  });

  it("refuses to remove the only entrance", () => {
    const b = BaseLayout.starter("remote");
    expect(() => b.demolish(b.itemAt(0, 4, 4)!.uid)).toThrow(/entrance/);
  });
});

describe("power", () => {
  it("runs hotter deeper down", () => {
    expect(powerSupply(1)).toBe(12);
    expect(powerSupply(3)).toBe(20);
  });

  it("browns out the newest rooms first", () => {
    const b = BaseLayout.starter("remote");
    b.funds = 1e8;
    const lab = b.place("lab", 1, 5, 5, false, { instant: true });
    // 10 used of 12, the lab needs 4.
    expect(b.status(lab.uid)).toBe("unpowered");
    expect(b.stats().capacity.science).toBe(0);
    expect(b.stats().demand).toBe(14);
    b.place("lift", 2, 4, 4, false, { instant: true });
    b.place("tunnel", 2, 4, 3, false, { instant: true });
    b.place("generator", 2, 4, 1, false, { instant: true });
    expect(b.status(lab.uid)).toBe("online");
    expect(b.stats().supply).toBe(12 + 16);
  });
});

describe("saving", () => {
  it("round-trips a base", () => {
    const b = BaseLayout.starter("remote");
    b.place("lab", 1, 5, 5);
    b.advance(3);
    const copy = BaseLayout.load(JSON.parse(JSON.stringify(b.save())));
    expect(copy.funds).toBe(b.funds);
    expect(copy.day).toBe(3);
    expect(copy.items.size).toBe(b.items.size);
    expect(copy.itemAt(1, 6, 6)?.type).toBe("lab");
    expect(copy.itemAt(1, 6, 6)?.daysLeft).toBe(ROOMS.lab.days - 3);
    expect([...copy.statuses().values()]).toEqual([...b.statuses().values()]);
  });
});

describe("city bases", () => {
  it("start covert under a block of buildings", () => {
    const b = BaseLayout.starter("city");
    expect(b.site).toBe("city");
    expect(b.cover()).toBe(100);
    const buildings = [...b.items.values()].filter((it) => ROOMS[it.type].detritus);
    expect(buildings.length).toBeGreaterThan(4);
    expect(buildings.every((it) => it.level === 0)).toBe(true);
    // The entrance and the ground right around it stay clear.
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) expect(ROOMS[b.itemAt(0, x, y)?.type ?? "lift"].detritus).toBeFalsy();
    expect([...b.statuses().values()].every((s) => s === "online")).toBe(true);
    expect(b.stats().demand).toBeLessThanOrEqual(b.stats().supply);
  });

  it("lays out the same block for the same seed", () => {
    const a = JSON.stringify(BaseLayout.starter("city", 3).save());
    expect(JSON.stringify(BaseLayout.starter("city", 3).save())).toBe(a);
    expect(JSON.stringify(BaseLayout.starter("city", 4).save())).not.toBe(a);
  });

  it("charges money and cover to clear a building", () => {
    const b = BaseLayout.starter("city");
    const building = [...b.items.values()].find((it) => ROOMS[it.type].detritus)!;
    const def = ROOMS[building.type];
    expect(b.check(building.type, 0, 0, 0)).toMatch(/can't be built/);
    b.demolish(building.uid);
    expect(b.funds).toBe(4_000_000 - def.cost);
    expect(b.cover()).toBe(100 - def.exposure!);
    expect(b.itemAt(0, building.x, building.y)).toBeUndefined();
  });

  it("won't clear what you can't pay for", () => {
    const b = BaseLayout.starter("city");
    b.funds = 0;
    const building = [...b.items.values()].find((it) => ROOMS[it.type].detritus)!;
    expect(b.checkDemolish(building.uid)).toMatch(/funds/);
  });

  it("loses cover for anything put up in plain sight, but not underground", () => {
    const b = BaseLayout.starter("city");
    b.place("tunnel", 1, 4, 6);
    expect(b.cover()).toBe(100);
    b.place("radar", 0, 3, 4);
    expect(b.cover()).toBe(100 - ROOMS.radar.exposure!);
  });

  it("doesn't let buildings stand in for tunnels", () => {
    const b = BaseLayout.starter("city");
    const building = [...b.items.values()].find((it) => ROOMS[it.type].detritus && it.x + it.w < GRID)!;
    const x = building.x + building.w;
    const y = building.y;
    if (!b.itemAt(0, x, y) && !b.itemAt(0, x + 1, y) && Math.abs(x - 4) + Math.abs(y - 4) > 2) {
      expect(b.check("tunnel", 0, x, y)).toMatch(/join/);
    }
  });

  it("has no cover rating out in the wilds", () => {
    expect(BaseLayout.starter("remote").cover()).toBeNull();
  });

  it("saves the site and the cover already spent", () => {
    const b = BaseLayout.starter("city");
    b.demolish([...b.items.values()].find((it) => ROOMS[it.type].detritus)!.uid);
    const copy = BaseLayout.load(JSON.parse(JSON.stringify(b.save())));
    expect(copy.site).toBe("city");
    expect(copy.cover()).toBe(b.cover());
  });
});

describe("base specialism", () => {
  const empty = () => {
    const b = new BaseLayout(1e9);
    b.place("lift", 0, 0, 0, false, { instant: true });
    for (let x = 1; x < GRID; x++) b.place("tunnel", 0, x, 0, false, { instant: true });
    return b;
  };

  it("needs a few specialist rooms before it counts", () => {
    const b = empty();
    b.place("radar", 0, 1, 1, false, { instant: true });
    expect(b.specialism().role).toBeNull();
  });

  it("rewards a base that sticks to one job", () => {
    const b = empty();
    b.place("largeRadar", 0, 1, 1, false, { instant: true });
    b.place("radar", 0, 3, 1, false, { instant: true });
    const s = b.specialism();
    expect(s.role).toBe("surveillance");
    expect(s.share).toBe(1);
    expect(s.bonus).toBe(30);
  });

  it("gives a mixed base no bonus", () => {
    const b = empty();
    b.place("largeRadar", 0, 1, 1, false, { instant: true });
    b.place("lab", 0, 3, 1, false, { instant: true });
    b.place("workshop", 0, 5, 1, false, { instant: true });
    b.place("medbay", 0, 7, 1, true, { instant: true });
    expect(b.specialism()).toMatchObject({ role: null, bonus: 0 });
    // Tip it towards research and it starts to lean.
    b.place("tunnel", 0, 3, 3, false, { instant: true });
    b.place("lab", 0, 3, 4, false, { instant: true });
    expect(b.specialism()).toMatchObject({ role: "research", bonus: 10 });
  });

  it("ignores rooms still being built", () => {
    const b = empty();
    b.place("largeRadar", 0, 1, 1);
    expect(b.specialism().cells.surveillance).toBe(0);
  });
});

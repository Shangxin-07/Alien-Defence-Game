import { describe, expect, it } from "vitest";
import { BaseLayout } from "../src/base/layout";
import { ROOMS, powerSupply } from "../src/base/rooms";

describe("starter base", () => {
  it("is fully online and within its power budget", () => {
    const b = BaseLayout.starter();
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
    const b = BaseLayout.starter();
    expect(b.check("hangar", 1, 5, 5)).toMatch(/surface/);
    expect(b.check("containment", 0, 5, 5)).toMatch(/underground/);
  });

  it("rejects overlaps, out-of-bounds and rooms not on a tunnel", () => {
    const b = BaseLayout.starter();
    expect(b.check("quarters", 1, 3, 3)).toMatch(/taken/);
    expect(b.check("quarters", 1, 7, 7)).toMatch(/perimeter/);
    // Touches the quarters but no tunnel: rooms never open onto each other.
    expect(b.check("stores", 1, 0, 2, true)).toMatch(/tunnel or lift/);
    expect(b.check("stores", 1, 1, 0)).toMatch(/tunnel or lift/);
    // Next to the east tunnel.
    expect(b.check("lab", 1, 5, 5)).toBeNull();
  });

  it("rotates footprints", () => {
    const b = BaseLayout.starter();
    expect(b.footprint("stores", true)).toEqual({ w: 1, h: 2 });
    expect(b.check("stores", 1, 7, 6)).toMatch(/perimeter/);
    expect(b.check("stores", 1, 7, 6, true)).not.toMatch(/perimeter/);
  });

  it("opens a new level from a lift stacked under a lift", () => {
    const b = BaseLayout.starter();
    expect(b.check("tunnel", 2, 4, 4)).toMatch(/join/);
    expect(b.check("lift", 2, 3, 3)).toMatch(/join/);
    expect(b.check("lift", 2, 4, 4)).toBeNull();
  });

  it("charges more to dig deeper and refuses what you can't afford", () => {
    const b = BaseLayout.starter();
    expect(b.cost("lab", 1)).toBeGreaterThan(ROOMS.lab.cost);
    expect(b.cost("lab", 3)).toBe(ROOMS.lab.cost * 1.5);
    b.funds = 10_000;
    expect(b.check("tunnel", 1, 4, 6)).toMatch(/funds/);
  });
});

describe("construction and connectivity", () => {
  it("builds over time and pays up front", () => {
    const b = BaseLayout.starter();
    const lab = b.place("lab", 1, 5, 5);
    expect(b.funds).toBe(4_000_000 - b.cost("lab", 1));
    expect(b.status(lab.uid)).toBe("building");
    expect(b.nextCompletion()).toBe(ROOMS.lab.days);
    expect(b.advance(ROOMS.lab.days - 1)).toEqual([]);
    expect(b.advance(1)).toEqual([lab]);
    expect(b.nextCompletion()).toBe(0);
  });

  it("cuts off rooms when their tunnel is demolished", () => {
    const b = BaseLayout.starter();
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
    const b = BaseLayout.starter();
    b.funds = 1e8;
    const t = b.place("tunnel", 1, 6, 4);
    // Only the unfinished tunnel reaches these stores.
    const stores = b.place("stores", 1, 6, 5, false, { instant: true });
    expect(b.status(stores.uid)).toBe("isolated");
    b.advance(t.daysLeft);
    expect(b.status(stores.uid)).toBe("online");
  });

  it("refuses to remove the only entrance", () => {
    const b = BaseLayout.starter();
    expect(() => b.demolish(b.itemAt(0, 4, 4)!.uid)).toThrow(/entrance/);
  });
});

describe("power", () => {
  it("runs hotter deeper down", () => {
    expect(powerSupply(1)).toBe(12);
    expect(powerSupply(3)).toBe(20);
  });

  it("browns out the newest rooms first", () => {
    const b = BaseLayout.starter();
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
    const b = BaseLayout.starter();
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

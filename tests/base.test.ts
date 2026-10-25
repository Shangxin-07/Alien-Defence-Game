import { describe, expect, it } from "vitest";
import { BaseLayout, Builder, GRID } from "../src/base/layout";
import { ROOMS, RoomId, powerSupply } from "../src/base/rooms";

/** A finished way down at this spot: shaft, stairs, then a lift. */
function dig(b: BaseLayout, level: number, x: number, y: number, upTo: "shaft" | "stairs" | "lift" = "lift") {
  const put = (type: RoomId) => b.place(type, level, x, y, false, { free: true, instant: true });
  let it = put("shaft");
  if (upTo !== "shaft") it = put("stairs");
  if (upTo === "lift") it = put("lift");
  return it;
}

const crew = (...skills: number[]): Builder[] => skills.map((skill, i) => ({ id: i + 1, skill }));

/** Days of work until nothing is left to build (or the limit runs out). */
function build(b: BaseLayout, limit = 500): number {
  let days = 0;
  while ([...b.items.values()].some((it) => it.workLeft) && days < limit) {
    b.workDay();
    days++;
  }
  return days;
}

/** A small working remote base: hangar and radar up top, quarters, power and stores on level −1. */
function sample(): BaseLayout {
  const b = BaseLayout.starter("remote");
  const put = (type: RoomId, level: number, x: number, y: number) => b.place(type, level, x, y, false, { free: true, instant: true });
  put("tunnel", 0, 4, 3);
  put("hangar", 0, 1, 1);
  put("radar", 0, 5, 4);
  dig(b, 1, 4, 4);
  for (const [x, y] of [[4, 3], [4, 5], [3, 4], [5, 4]]) put("tunnel", 1, x, y);
  put("quarters", 1, 2, 2);
  put("generator", 1, 5, 2);
  put("stores", 1, 2, 5);
  return b;
}

describe("sample base", () => {
  it("is fully online and within its power budget", () => {
    const b = sample();
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
    expect(b.check("tunnel", 0, 0, 0)).toMatch(/way down/);
    expect(b.check("shaft", 1, 0, 0)).toMatch(/way down/);
    expect(b.check("shaft", 0, 0, 0)).toBeNull();
    // Lifts are fitted into stairs, never dug straight into the ground.
    expect(b.check("lift", 0, 0, 0)).toMatch(/finished stairs/);
  });

  it("keeps hangars up top and containment below", () => {
    const b = sample();
    expect(b.check("hangar", 1, 5, 5)).toMatch(/surface/);
    expect(b.check("containment", 0, 5, 5)).toMatch(/underground/);
  });

  it("rejects overlaps, out-of-bounds and rooms not on a tunnel", () => {
    const b = sample();
    expect(b.check("quarters", 1, 3, 3)).toMatch(/taken/);
    expect(b.check("quarters", 1, 7, 7)).toMatch(/perimeter/);
    // Touches the quarters but no tunnel: rooms never open onto each other.
    expect(b.check("stores", 1, 0, 2, true)).toMatch(/tunnel or lift/);
    expect(b.check("stores", 1, 1, 0)).toMatch(/tunnel or lift/);
    // Next to the east tunnel.
    expect(b.check("lab", 1, 5, 5)).toBeNull();
  });

  it("rotates footprints", () => {
    const b = sample();
    expect(b.footprint("stores", true)).toEqual({ w: 1, h: 2 });
    expect(b.check("stores", 1, 7, 6)).toMatch(/perimeter/);
    expect(b.check("stores", 1, 7, 6, true)).not.toMatch(/perimeter/);
  });

  it("opens a new level from a shaft stacked under a lift", () => {
    const b = sample();
    expect(b.check("tunnel", 2, 4, 4)).toMatch(/join/);
    expect(b.check("shaft", 2, 3, 3)).toMatch(/join/);
    expect(b.check("shaft", 2, 4, 4)).toBeNull();
  });

  it("charges more to dig deeper and refuses what you can't afford", () => {
    const b = sample();
    expect(b.cost("lab", 1)).toBeGreaterThan(ROOMS.lab.cost);
    expect(b.cost("lab", 3)).toBe(ROOMS.lab.cost * 1.5);
    expect(b.work("lab", 3)).toBe(ROOMS.lab.work * 1.5);
    b.funds = 10_000;
    expect(b.check("lab", 1, 5, 5)).toMatch(/funds/);
    // Digging with your own hands costs nothing.
    expect(b.check("tunnel", 1, 4, 6)).toBeNull();
  });
});

describe("construction and connectivity", () => {
  it("builds with the crew's work and pays for equipment up front", () => {
    const b = sample();
    const lab = b.place("lab", 1, 5, 5);
    expect(b.funds).toBe(4_000_000 - b.cost("lab", 1));
    expect(b.status(lab.uid)).toBe("building");
    // Nobody building, nothing happens.
    expect(b.nextCompletion()).toBe(0);
    b.workDay();
    expect(lab.workLeft).toBe(b.work("lab", 1));
    b.setCrew(crew(1, 1));
    const days = Math.ceil(b.work("lab", 1) / 2);
    expect(b.nextCompletion()).toBe(days);
    for (let d = 1; d < days; d++) expect(b.workDay()).toEqual([]);
    expect(b.workDay()).toEqual([lab]);
    expect(b.nextCompletion()).toBe(0);
  });

  it("cuts off rooms when their tunnel is demolished", () => {
    const b = sample();
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
    const b = sample();
    b.funds = 1e8;
    b.place("tunnel", 1, 6, 4);
    // Only the unfinished tunnel reaches these stores.
    const stores = b.place("stores", 1, 6, 5, false, { instant: true });
    expect(b.status(stores.uid)).toBe("isolated");
    b.setCrew(crew(1));
    build(b);
    expect(b.status(stores.uid)).toBe("online");
  });

  it("refuses to remove the only entrance", () => {
    const b = sample();
    expect(() => b.demolish(b.itemAt(0, 4, 4)!.uid)).toThrow(/entrance/);
  });
});

describe("power", () => {
  it("runs hotter deeper down", () => {
    expect(powerSupply(1)).toBe(12);
    expect(powerSupply(3)).toBe(20);
  });

  it("browns out the newest rooms first", () => {
    const b = sample();
    b.funds = 1e8;
    const shop = b.place("workshop", 1, 5, 5, false, { instant: true });
    // 8 used of 12, the workshop needs 5.
    expect(b.status(shop.uid)).toBe("unpowered");
    expect(b.stats().capacity.engineering).toBe(0);
    expect(b.stats().demand).toBe(13);
    dig(b, 2, 4, 4);
    b.place("tunnel", 2, 4, 3, false, { instant: true });
    b.place("generator", 2, 4, 1, false, { instant: true });
    expect(b.status(shop.uid)).toBe("online");
    expect(b.stats().supply).toBe(12 + 16);
  });
});

describe("saving", () => {
  it("round-trips a base", () => {
    const b = sample();
    b.place("lab", 1, 5, 5);
    b.setCrew(crew(1, 1));
    for (let d = 0; d < 3; d++) b.workDay();
    const copy = BaseLayout.load(JSON.parse(JSON.stringify(b.save())));
    expect(copy.funds).toBe(b.funds);
    expect(copy.day).toBe(3);
    expect(copy.items.size).toBe(b.items.size);
    expect(copy.itemAt(1, 6, 6)?.type).toBe("lab");
    expect(copy.itemAt(1, 6, 6)?.workLeft).toBe(b.work("lab", 1) - 6);
    expect([...copy.statuses().values()]).toEqual([...b.statuses().values()]);
  });

  it("turns days left in older saves into work for a crew of four", () => {
    const b = sample();
    b.place("lab", 1, 5, 5);
    const old = b.save();
    const lab = old.items.find((it) => it.type === "lab")!;
    delete lab.workLeft;
    lab.daysLeft = 10;
    expect(BaseLayout.load(old).itemAt(1, 5, 5)?.workLeft).toBe(40);
  });
});

describe("new bases", () => {
  it("start out remote as nothing but the access lift", () => {
    const b = BaseLayout.starter("remote");
    expect([...b.items.values()].map((it) => [it.type, it.level, it.x, it.y])).toEqual([["lift", 0, 4, 4]]);
    expect(b.status(1)).toBe("online");
    expect(b.check("shaft", 1, 4, 4)).toBeNull();
  });

  it("start in a city as one front building with no way down", () => {
    const b = BaseLayout.starter("city");
    const front = b.itemAt(0, 3, 3)!;
    expect(front.type).toBe("frontBuilding");
    expect([...b.items.values()].every((it) => it.level === 0)).toBe(true);
    expect(b.check("shaft", 1, 3, 3)).toMatch(/access point first/);
    expect(b.check("shaft", 0, 5, 5)).toMatch(/access point first/);
    expect(b.check("tunnel", 0, 5, 4)).toMatch(/access point first/);
    expect(b.checkDemolish(front.uid)).toMatch(/Convert/);
  });

  it("dig down once the front building is converted", () => {
    const b = BaseLayout.starter("city");
    expect(b.check("accessPoint", 0, 4, 4)).toMatch(/in place of/);
    const access = b.place("accessPoint", 0, 3, 3);
    // Breaking through your own basement floor costs sweat, not money.
    expect(b.funds).toBe(4_000_000);
    expect(b.itemAt(0, 4, 4)).toBe(access);
    expect(b.check("accessPoint", 0, 3, 3)).toMatch(/in place of/);
    // Any cell under the 2×2 access point takes a shaft, queued while the basement is still being broken into.
    const shaft = b.place("shaft", 1, 4, 3);
    expect(b.check("shaft", 1, 6, 6)).toMatch(/join/);
    b.setCrew(crew(1, 1, 1, 1));
    expect(b.plan().get(shaft.uid)?.blocked).toMatch(/reach/);
    expect(b.plan().get(access.uid)?.crew).toHaveLength(4);
    build(b);
    expect(b.status(access.uid)).toBe("online");
    // A bare shaft is a way down for builders, not somewhere anyone can work.
    expect(b.status(shaft.uid)).toBe("shaftOnly");
    expect(b.cover()).toBe(100);
    // The access point is the only way in, so it stays.
    expect(b.checkDemolish(access.uid)).toMatch(/entrance/);
  });
});

describe("city bases", () => {
  const city = () => {
    const b = BaseLayout.starter("city");
    b.place("accessPoint", 0, 3, 3, false, { instant: true });
    return b;
  };
  const someBuilding = (b: BaseLayout) => [...b.items.values()].find((it) => ROOMS[it.type].detritus && !ROOMS[it.type].owned)!;

  it("sit covert in a block of buildings", () => {
    const b = BaseLayout.starter("city");
    expect(b.site).toBe("city");
    expect(b.cover()).toBe(100);
    const buildings = [...b.items.values()].filter((it) => ROOMS[it.type].detritus && !ROOMS[it.type].owned);
    expect(buildings.length).toBeGreaterThan(4);
    // The ground right around the front building stays clear.
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) expect(buildings.some((it) => b.itemAt(0, x, y) === it)).toBe(false);
  });

  it("lays out the same block for the same seed", () => {
    const a = JSON.stringify(BaseLayout.starter("city", 3).save());
    expect(JSON.stringify(BaseLayout.starter("city", 3).save())).toBe(a);
    expect(JSON.stringify(BaseLayout.starter("city", 4).save())).not.toBe(a);
  });

  it("charges money and cover to clear a building", () => {
    const b = BaseLayout.starter("city");
    const building = someBuilding(b);
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
    expect(b.checkDemolish(someBuilding(b).uid)).toMatch(/funds/);
  });

  it("loses cover for anything put up in plain sight, but not underground", () => {
    const b = city();
    b.place("shaft", 1, 3, 3);
    b.place("tunnel", 1, 3, 4);
    expect(b.cover()).toBe(100);
    b.place("radar", 0, 5, 3);
    expect(b.cover()).toBe(100 - ROOMS.radar.exposure!);
  });

  it("doesn't let buildings stand in for tunnels", () => {
    const b = city();
    // A cell beside some other building, away from the access point.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (b.itemAt(0, x, y) || (x >= 2 && x <= 5 && y >= 2 && y <= 5)) continue;
        const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => b.itemAt(0, x + dx, y + dy));
        if (touches) {
          expect(b.check("tunnel", 0, x, y)).toMatch(/join/);
          return;
        }
      }
    }
  });

  it("has no cover rating out in the wilds", () => {
    expect(BaseLayout.starter("remote").cover()).toBeNull();
  });

  it("saves the site and the cover already spent", () => {
    const b = city();
    b.demolish(someBuilding(b).uid);
    const copy = BaseLayout.load(JSON.parse(JSON.stringify(b.save())));
    expect(copy.site).toBe("city");
    expect(copy.cover()).toBe(b.cover());
    expect(copy.itemAt(0, 3, 3)?.type).toBe("accessPoint");
  });
});

describe("base specialism", () => {
  const empty = () => {
    const b = new BaseLayout(1e9);
    b.place("shaft", 0, 0, 0, false, { instant: true });
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

describe("getting underground by hand", () => {
  /** A remote base with a shaft down to level −1 at (4,4), and a tunnel, power and quarters off it. */
  function below(upTo: "shaft" | "stairs" | "lift") {
    const b = BaseLayout.starter("remote");
    const shaft = dig(b, 1, 4, 4, upTo);
    b.place("tunnel", 1, 4, 5, false, { free: true, instant: true });
    b.place("generator", 1, 5, 3, false, { free: true, instant: true });
    const quarters = b.place("quarters", 1, 2, 5, false, { free: true, instant: true });
    return { b, shaft, quarters };
  }

  it("only brings rooms online once the shaft has stairs", () => {
    expect(below("shaft").b.status(below("shaft").quarters.uid)).toBe("shaftOnly");
    const { b, quarters } = below("stairs");
    expect(b.status(quarters.uid)).toBe("online");
    expect(b.stats().capacity.crew).toBe(50);
  });

  it("goes shaft, then stairs, then lift, each fitted into the last", () => {
    const b = BaseLayout.starter("remote");
    const shaft = b.place("shaft", 1, 4, 4);
    expect(b.check("stairs", 1, 4, 4)).toMatch(/Finish the shaft/);
    b.setCrew(crew(1, 1));
    build(b);
    expect(b.check("lift", 1, 4, 4)).toMatch(/finished stairs/);
    const stairs = b.place("stairs", 1, 4, 4);
    expect(b.itemAt(1, 4, 4)).toBe(stairs);
    expect(b.items.has(shaft.uid)).toBe(false);
    build(b);
    const funds = b.funds;
    b.place("lift", 1, 4, 4);
    expect(b.funds).toBe(funds - b.cost("lift", 1));
    build(b);
    expect(b.itemAt(1, 4, 4)?.type).toBe("lift");
  });

  it("keeps the stairs in use while a lift is fitted", () => {
    const { b, quarters } = below("stairs");
    const lift = b.place("lift", 1, 4, 4);
    expect(b.status(lift.uid)).toBe("building");
    expect(b.status(quarters.uid)).toBe("online");
  });

  it("won't start heavy machinery until a lift reaches it", () => {
    const { b } = below("stairs");
    const gen = b.place("generator", 1, 5, 5);
    b.setCrew(crew(1, 1));
    expect(b.plan().get(gen.uid)?.blocked).toMatch(/lift/);
    expect(b.nextCompletion()).toBe(0);
    b.place("lift", 1, 4, 4);
    build(b);
    expect(b.status(gen.uid)).toBe("online");
  });

  it("fits only so many builders on a job and sends the rest to the next one", () => {
    const b = BaseLayout.starter("remote");
    const shaft = b.place("shaft", 1, 4, 4);
    const tunnel = b.place("tunnel", 0, 4, 3);
    b.setCrew(crew(0.8, 1.3, 1, 1.1, 0.9));
    const plan = b.plan();
    // The most skilled pair digs the shaft, the next pair the tunnel; the fifth has nowhere to stand.
    expect(plan.get(shaft.uid)?.crew).toEqual([2, 4]);
    expect(plan.get(shaft.uid)?.rate).toBeCloseTo(2.4);
    expect(plan.get(tunnel.uid)?.crew).toEqual([3, 5]);
    expect(b.idleBuilders()).toBe(1);
  });

  it("gets there with one unskilled builder, just slowly", () => {
    const make = (skills: number[]) => {
      const b = BaseLayout.starter("remote");
      b.place("shaft", 1, 4, 4);
      b.setCrew(crew(...skills));
      return build(b);
    };
    const alone = make([0.6]);
    expect(alone).toBeLessThan(500);
    expect(make([1, 1])).toBeLessThan(alone);
  });
});

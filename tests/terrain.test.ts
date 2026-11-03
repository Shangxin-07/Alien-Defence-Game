import { describe, expect, it } from "vitest";
import { Battle, BattleEvent, Unit } from "../src/tactical/battle";
import { CITY_STYLES, buildCity } from "../src/tactical/cityMap";
import { TacMap } from "../src/tactical/map";
import { WEAPONS } from "../src/tactical/rules";
import { canBreach, hpLeft, materialAt, strike } from "../src/tactical/terrain";

function unit(id: number, side: "human" | "alien", x: number, y: number, weapon = WEAPONS.rifle): Unit {
  const stats = { tu: 200, health: 40, bravery: 50, reactions: 0, accuracy: 100, melee: 70, armour: 0 };
  return {
    id, side, name: `U${id}`, role: "Test", stats, x, y, facing: 2,
    tu: 200, health: 40, stun: 0, morale: 80, wounds: 0, kneeling: false,
    weapon, ammo: 99, tools: [], revealed: false,
  };
}

function openMap(w = 20, h = 20): TacMap {
  const m = new TacMap(w, h);
  m.lit.fill(1);
  return m;
}

describe("what breaks what", () => {
  it("a pistol never dents a wall, however long you shoot", () => {
    const m = openMap();
    const i = m.idx(5, 5);
    m.thing[i] = "wall";
    expect(canBreach(m, i, WEAPONS.pistol.breach)).toBe(false);
    for (let k = 0; k < 100; k++) expect(strike(m, i, 52, WEAPONS.pistol.breach)!.amount).toBe(0);
    expect(m.thing[i]).toBe("wall");
    expect(hpLeft(m, i)).toBe(100);
  });

  it("rifles and shotguns break doors and cars but not walls; plasma breaks walls", () => {
    const m = openMap();
    const door = m.idx(1, 1);
    const wall = m.idx(2, 2);
    m.thing[door] = "door";
    m.thing[wall] = "wall";
    for (const g of [WEAPONS.rifle, WEAPONS.shotgun]) {
      expect(canBreach(m, door, g.breach)).toBe(true);
      expect(canBreach(m, wall, g.breach)).toBe(false);
    }
    expect(canBreach(m, wall, WEAPONS.plasmaPistol.breach)).toBe(true);
  });

  it("a wall takes its hit points, then leaves rubble you can walk over", () => {
    const m = openMap();
    const i = m.idx(5, 5);
    m.thing[i] = "wall";
    m.ground[i] = "floor";
    expect(strike(m, i, 60, 2)!.broke).toBeNull();
    expect(hpLeft(m, i)).toBe(40);
    const r = strike(m, i, 60, 2)!;
    expect(r.broke?.name).toBe("Wall");
    expect(m.thing[i]).toBe("none");
    expect(m.ground[i]).toBe("rubble");
    expect(m.walkable(5, 5)).toBe(true);
    expect(m.wear[i]).toBe(0);
  });

  it("a car burns out to a wreck before it's gone; a window loses its glass before its sill", () => {
    const m = openMap();
    const car = m.idx(3, 3);
    m.thing[car] = "cover";
    m.look[car] = "car";
    strike(m, car, 200, 1);
    expect([m.thing[car], m.look[car]]).toEqual(["cover", "wreck"]);
    strike(m, car, 200, 1);
    expect(m.thing[car]).toBe("none");

    const win = m.idx(4, 4);
    m.thing[win] = "window";
    strike(m, win, 20, 0);
    expect(m.thing[win]).toBe("frame");
    // What's left still hides you, and needs plasma to knock through.
    expect(m.isCover(4, 4)).toBe(true);
    expect(canBreach(m, win, 1)).toBe(false);
    strike(m, win, 200, 2);
    expect(m.thing[win]).toBe("none");
  });

  it("stairs, lifts and the earth round a cellar can't be broken", () => {
    const m = new TacMap(6, 6, 2, -1);
    const earth = m.idx(0, 0, -1);
    expect(m.thing[earth]).toBe("wall");
    expect(materialAt(m, earth)).toBeNull();
    const s = m.idx(2, 2, 0);
    m.thing[s] = "stairs";
    expect(strike(m, s, 999, 99)).toBeNull();
    m.thing[s] = "lift";
    expect(strike(m, s, 999, 99)).toBeNull();
  });
});

describe("shooting the scenery", () => {
  it("a plasma pistol aimed at a wall blows a hole in it, and the rewind puts it back", () => {
    const m = openMap();
    for (let y = 0; y < 20; y++) m.thing[m.idx(10, y)] = "wall";
    const shooter = unit(1, "human", 5, 5, WEAPONS.plasmaPistol);
    const alien = unit(2, "alien", 18, 18, WEAPONS.plasmaPistol);
    const b = new Battle(m, [shooter, alien], 7);
    const before = b.snapshot();
    const events: BattleEvent[] = [];
    for (let k = 0; k < 20 && m.thing[m.idx(10, 5)] === "wall"; k++) {
      shooter.tu = 200;
      shooter.heat = 0;
      shooter.overheated = false;
      events.push(...b.shoot(1, { x: 10, y: 5 }, "aimed"));
    }
    expect(m.thing[m.idx(10, 5)]).toBe("none");
    expect(events.some((e) => e.kind === "wreck" && e.broke)).toBe(true);
    expect(events.some((e) => e.kind === "say" && e.text.includes("wall gives way"))).toBe(true);
    // Now there's a way through.
    expect(m.clearLine({ x: 5, y: 5 }, { x: 15, y: 5 })).toBe(true);
    b.restore(before, 3);
    expect(m.thing[m.idx(10, 5)]).toBe("wall");
    expect(m.wear[m.idx(10, 5)]).toBe(0);
  });

  it("a rifle aimed at a wall does nothing to it", () => {
    const m = openMap();
    m.thing[m.idx(10, 5)] = "wall";
    const shooter = unit(1, "human", 5, 5, WEAPONS.rifle);
    const b = new Battle(m, [shooter, unit(2, "alien", 18, 18, WEAPONS.plasmaPistol)], 7);
    const events = b.shoot(1, { x: 10, y: 5 }, "aimed");
    const hits = events.filter((e) => e.kind === "wreck");
    expect(hits.every((e) => e.kind === "wreck" && e.amount === 0 && !e.broke)).toBe(true);
    expect(m.thing[m.idx(10, 5)]).toBe("wall");
  });

  it("a forked fight knocks down its own walls, not the real one's", () => {
    const m = openMap();
    m.thing[m.idx(10, 5)] = "wall";
    m.wear[m.idx(10, 5)] = 30;
    const b = new Battle(m, [unit(1, "human", 5, 5, WEAPONS.plasmaPistol), unit(2, "alien", 18, 18)], 7);
    const f = b.fork(9);
    expect(f.map.wear[m.idx(10, 5)]).toBe(30);
    f.map.thing[m.idx(10, 5)] = "none";
    expect(m.thing[m.idx(10, 5)]).toBe("wall");
  });
});

describe("nothing falls so as to lock anyone out", () => {
  it("knocking things down in a city never cuts off a tile that could be reached before", () => {
    const biomes = Object.keys(CITY_STYLES) as (keyof typeof CITY_STYLES)[];
    for (let seed = 1; seed <= 60; seed++) {
      const { map, alienStart } = buildCity(seed * 104729, CITY_STYLES[biomes[seed % biomes.length]]);
      const reached = () => map.reach(alienStart, Infinity, new Set()).cost;
      const start = reached();
      expect(map.cutOff(alienStart)).toHaveLength(0);
      // Break a random share of what can be broken, then everything.
      let r = seed;
      const dice = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (const share of [0.1, 0.5, 1]) {
        for (let i = 0; i < map.ground.length; i++) {
          if (dice() < share) while (materialAt(map, i)) strike(map, i, 9999, 99);
        }
        const now = reached();
        for (let i = 0; i < start.length; i++) {
          if (Number.isFinite(start[i])) expect(Number.isFinite(now[i]), `seed ${seed * 104729} tile ${i}`).toBe(true);
        }
        // Whatever is still out of reach is a pocket inside rubble that used to be solid: a gap in a
        // wall corner, not somewhere anyone could ever have stood.
        for (const p of map.cutOff(alienStart)) expect(Number.isFinite(start[map.idx(p.x, p.y, p.z)])).toBe(false);
      }
    }
  });
});

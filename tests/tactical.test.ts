import { describe, expect, it } from "vitest";
import { Battle, Unit, alive, conscious } from "../src/tactical/battle";
import { CITY_BOTTOM, CITY_LEVELS, CITY_SIZE, CITY_STYLES, buildCity, connect } from "../src/tactical/cityMap";
import { TacMap, dist, facingTo, lvl } from "../src/tactical/map";
import { SPOILS, prologueCity, startPrologue } from "../src/tactical/prologue";
import { DIAGONAL_TU, STAIRS_TU, STEP_TU, TOOLS, WEAPONS, baseHitChance, tuCost } from "../src/tactical/rules";

function unit(id: number, side: "human" | "alien", x: number, y: number, facing = 2): Unit {
  const stats = { tu: 60, health: 40, bravery: 50, reactions: 50, accuracy: 60, melee: 70, armour: 0 };
  return {
    id, side, name: `U${id}`, role: side === "alien" ? "Alien" : "Test", stats, x, y, facing,
    tu: 60, health: 40, stun: 0, morale: 80, wounds: 0, kneeling: false,
    weapon: side === "alien" ? WEAPONS.plasmaPistol : WEAPONS.rifle, ammo: 20, tools: [], revealed: false,
  };
}

function openMap(w = 20, h = 20): TacMap {
  const m = new TacMap(w, h);
  m.lit.fill(1);
  return m;
}

describe("tactical map", () => {
  it("charges 4 TU a step, 6 diagonally, and won't cut corners", () => {
    const m = openMap();
    expect(m.stepCost({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(STEP_TU);
    expect(m.stepCost({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(DIAGONAL_TU);
    m.thing[m.idx(2, 1)] = "wall";
    expect(m.stepCost({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(Infinity);
  });

  it("walls block sight, windows and cover don't", () => {
    const m = openMap();
    expect(m.clearLine({ x: 0, y: 5 }, { x: 10, y: 5 })).toBe(true);
    m.thing[m.idx(5, 5)] = "window";
    expect(m.clearLine({ x: 0, y: 5 }, { x: 10, y: 5 })).toBe(true);
    m.thing[m.idx(5, 5)] = "wall";
    expect(m.clearLine({ x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  it("finds the cheapest routes within a budget", () => {
    const m = openMap();
    const { cost, prev } = m.reach({ x: 0, y: 0 }, 20, new Set());
    expect(cost[m.idx(5, 0)]).toBe(20);
    expect(cost[m.idx(6, 0)]).toBe(Infinity);
    expect(m.route(prev, { x: 3, y: 3 })).toHaveLength(3);
  });

  it("faces the right way", () => {
    expect(facingTo({ x: 5, y: 5 }, { x: 5, y: 0 })).toBe(0);
    expect(facingTo({ x: 5, y: 5 }, { x: 9, y: 5 })).toBe(2);
    expect(facingTo({ x: 5, y: 5 }, { x: 1, y: 9 })).toBe(5);
  });
});

describe("city battlefield", () => {
  for (const biome of Object.keys(CITY_STYLES) as (keyof typeof CITY_STYLES)[]) {
    it(`connects every open tile on every level in a ${biome} city`, () => {
      for (const seed of [1, 2, 3, 42, 1234]) {
        const { map, humanStart, alienStart } = buildCity(seed, CITY_STYLES[biome]);
        expect(map.w).toBe(CITY_SIZE);
        expect(humanStart).toHaveLength(4);
        const { cost } = map.reach(alienStart, Infinity, new Set());
        for (const p of humanStart) expect(cost[map.idx(p.x, p.y, p.z)]).toBeLessThan(Infinity);
        // No sealed rooms, no floor nobody can get up to, no cellar nobody can get down to.
        const lost = map.cutOff(alienStart);
        expect(lost, `seed ${seed}: ${lost.slice(0, 3).map((p) => `${p.x},${p.y},${p.z}`).join(" ")}`).toHaveLength(0);
      }
    });
  }

  it("never locks anyone out of a level, across hundreds of cities", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const biome = (Object.keys(CITY_STYLES) as (keyof typeof CITY_STYLES)[])[seed % 9];
      const { map, alienStart } = buildCity(seed * 7919, CITY_STYLES[biome]);
      expect(map.cutOff(alienStart), `seed ${seed * 7919}`).toHaveLength(0);
    }
  });

  it("builds four levels: a cellar, the street and two floors, joined by stairs and a lift", () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const { map } = buildCity(seed, CITY_STYLES.temperate);
      expect([map.bottom, map.top]).toEqual([CITY_BOTTOM, CITY_BOTTOM + CITY_LEVELS - 1]);
      expect(map.levels).toBe(4);
      for (let z = map.bottom; z <= map.top; z++) {
        let floor = 0;
        for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.walkable(x, y, z)) floor++;
        expect(floor, `level ${z}`).toBeGreaterThan(20);
      }
      // Off the street, there's only somewhere to stand inside a building or on its roof.
      for (let i = 0; i < map.thing.length; i++) {
        const p = map.at(i);
        if (p.z !== 0 && map.walkable(p.x, p.y, p.z)) expect(map.building[i], `${p.x},${p.y},${p.z}`).not.toBe(-1);
      }
      expect(map.thing.filter((t) => t === "stairs").length).toBeGreaterThan(6);
      expect(map.thing.filter((t) => t === "lift").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("puts stairs and lifts straight above one another", () => {
    const { map } = buildCity(42, CITY_STYLES.temperate);
    for (let i = 0; i < map.thing.length; i++) {
      const t = map.thing[i];
      if (t !== "stairs" && t !== "lift") continue;
      const p = map.at(i);
      // Every flight leads somewhere.
      expect(map.linked(p.x, p.y, p.z!, 1) || map.linked(p.x, p.y, p.z!, -1), `${t} at ${p.x},${p.y},${p.z}`).toBeTruthy();
    }
  });

  it("puts stairs in when a floor would be cut off", () => {
    const m = new TacMap(10, 10, 2, 0);
    m.lit.fill(1);
    // A room upstairs with no way up.
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) m.ground[m.idx(x, y, 1)] = "floor";
    expect(m.cutOff({ x: 0, y: 0 }).length).toBe(16);
    connect(m, { x: 0, y: 0 });
    expect(m.cutOff({ x: 0, y: 0 })).toHaveLength(0);
    expect(m.thing.filter((t) => t === "stairs")).toHaveLength(2);
  });
});

describe("levels", () => {
  /** Street with a two-storey building: ground floor room, stairs, upstairs room with a window on the street. */
  function house(): TacMap {
    const m = new TacMap(20, 20, 3, -1);
    m.lit.fill(1);
    for (let y = 2; y <= 8; y++) {
      for (let x = 2; x <= 8; x++) {
        const edge = x === 2 || y === 2 || x === 8 || y === 8;
        for (const z of [-1, 0, 1]) {
          m.ground[m.idx(x, y, z)] = "floor";
          m.thing[m.idx(x, y, z)] = edge ? "wall" : "none";
        }
      }
    }
    m.thing[m.idx(5, 8, 0)] = "door";
    m.thing[m.idx(5, 8, 1)] = "window";
    for (const z of [-1, 0, 1]) m.thing[m.idx(4, 4, z)] = "stairs";
    return m;
  }

  it("climbs stairs at 8 TU a storey and walks the floors", () => {
    const m = house();
    expect(m.stepCost({ x: 4, y: 4, z: 0 }, { x: 4, y: 4, z: 1 })).toBe(STAIRS_TU);
    expect(m.stepCost({ x: 4, y: 4, z: 0 }, { x: 4, y: 4, z: -1 })).toBe(STAIRS_TU);
    expect(m.stepCost({ x: 5, y: 5, z: 0 }, { x: 5, y: 5, z: 1 })).toBe(Infinity);
    const { cost, prev } = m.reach({ x: 5, y: 12 }, Infinity, new Set());
    expect(Number.isFinite(cost[m.idx(6, 6, 1)])).toBe(true);
    expect(Number.isFinite(cost[m.idx(6, 6, -1)])).toBe(true);
    // Nothing to stand on in the air over the street.
    expect(cost[m.idx(5, 12, 1)]).toBe(Infinity);
    const route = m.route(prev, { x: 6, y: 6, z: 1 });
    expect(route.some((p) => p.x === 4 && p.y === 4 && p.z === 1)).toBe(true);
    expect(m.cutOff({ x: 5, y: 12 })).toHaveLength(0);
  });

  it("sees out of an upstairs window to the street, but not through the floor", () => {
    const m = house();
    // From the window, down into the street.
    expect(m.clearLine({ x: 5, y: 7, z: 1 }, { x: 5, y: 16, z: 0 })).toBe(true);
    // Straight down through the floor to the room below.
    expect(m.clearLine({ x: 6, y: 6, z: 1 }, { x: 6, y: 7, z: 0 })).toBe(false);
    // Nobody sees the cellar from the street.
    expect(m.clearLine({ x: 5, y: 16, z: 0 }, { x: 5, y: 6, z: -1 })).toBe(false);
    // Up the stairwell.
    expect(m.clearLine({ x: 4, y: 4, z: 0 }, { x: 4, y: 4, z: 1 })).toBe(true);
  });

  it("goes upstairs to shoot, and the alien comes up after you", () => {
    const m = house();
    const h = unit(1, "human", 5, 5, 4);
    h.z = 1;
    const a = unit(2, "alien", 5, 17, 0);
    const b = new Battle(m, [h, a], 4);
    // Your rifle reaches it from the window.
    const p = b.previewShot(1, a, "snap");
    expect(p.reason).toBeNull();
    // The alien hunts up the stairs: after a few turns it is never stuck on the street below.
    for (let t = 0; t < 8 && !b.outcome; t++) {
      h.tu = 0;
      b.endTurn();
    }
    expect(b.outcome === "wiped" || lvl(a) !== 0 || dist(a, h) < 6).toBe(true);
  });

  it("can't stun or patch up through a floor", () => {
    const m = house();
    const h = { ...unit(1, "human", 6, 6), tools: [{ tool: TOOLS.stunBaton, uses: 99 }, { tool: TOOLS.medkit, uses: 2 }], wounds: 1 };
    const a = { ...unit(2, "alien", 6, 6), z: 1 };
    const b = new Battle(m, [h, a], 1);
    expect(b.previewStun(1, a).reason).toMatch(/another level/);
    a.z = 0;
    a.x = 7;
    expect(b.previewStun(1, a).reason).toBeNull();
  });
});

describe("rules", () => {
  it("gets less accurate with range and better kneeling", () => {
    const m = WEAPONS.pistol.modes.aimed!;
    const near = baseHitChance(60, m, WEAPONS.pistol, 5, false);
    const far = baseHitChance(60, m, WEAPONS.pistol, 20, false);
    expect(far).toBeLessThan(near);
    expect(baseHitChance(60, m, WEAPONS.pistol, 5, true)).toBeGreaterThan(near);
  });

  it("prices shots as a share of time units", () => {
    expect(tuCost(60, 25)).toBe(15);
    expect(tuCost(56, 18)).toBe(10);
  });
});

describe("battle", () => {
  it("spends time units to move and to shoot", () => {
    const m = openMap();
    const h = unit(1, "human", 2, 10);
    const a = unit(2, "alien", 15, 10, 6);
    a.tu = 0;
    const b = new Battle(m, [h, a], 3);
    b.move(1, { x: 5, y: 10 });
    expect(h.x).toBe(5);
    expect(h.tu).toBe(60 - 3 * STEP_TU);
    const before = h.tu;
    const ev = b.shoot(1, { x: 15, y: 10 }, "snap");
    expect(ev.some((e) => e.kind === "shot")).toBe(true);
    expect(h.tu).toBe(before - tuCost(60, 25));
  });

  it("can't shoot through walls", () => {
    const m = openMap();
    for (let y = 0; y < 20; y++) m.thing[m.idx(8, y)] = "wall";
    const b = new Battle(m, [unit(1, "human", 2, 10), unit(2, "alien", 15, 10, 6)], 1);
    expect(b.previewShot(1, { x: 15, y: 10 }, "snap").reason).toBe("No line of fire");
  });

  it("only sees in front, and not far in the dark", () => {
    const m = new TacMap(30, 30);
    const h = unit(1, "human", 5, 5, 2);
    const b = new Battle(m, [h, unit(2, "alien", 25, 25)], 1);
    expect(b.canSee(h, { x: 12, y: 5 })).toBe(true);
    expect(b.canSee(h, { x: 1, y: 5 })).toBe(false);
    expect(b.canSee(h, { x: 20, y: 5 })).toBe(false);
    m.lit[m.idx(20, 5)] = 1;
    expect(b.canSee(h, { x: 20, y: 5 })).toBe(true);
  });

  it("sees further as the light comes up", () => {
    const range = (light: "day" | "dusk" | "dawn" | "night") => {
      const m = new TacMap(30, 30);
      const h = unit(1, "human", 2, 5, 2);
      const b = new Battle(m, [h, unit(2, "alien", 25, 25)], 1, null, light);
      let far = 0;
      for (let x = 3; x < 30; x++) if (b.canSee(h, { x, y: 5 })) far = x - 2;
      return far;
    };
    expect(range("night")).toBe(9);
    expect(range("dusk")).toBe(14);
    expect(range("dawn")).toBe(14);
    expect(range("day")).toBe(20);
  });

  it("keeps the light when a fight is forked", () => {
    const b = new Battle(new TacMap(30, 30), [unit(1, "human", 2, 5), unit(2, "alien", 25, 25)], 1, null, "day");
    expect(b.fork(7).light).toBe("day");
  });

  it("fires on reflex at an enemy that walks into view", () => {
    const m = openMap();
    const h = unit(1, "human", 2, 10, 2);
    h.stats.reactions = 90;
    const a = unit(2, "alien", 18, 4, 6);
    const b = new Battle(m, [h, a], 5);
    b.endTurn();
    const shots = 20 - h.ammo;
    expect(shots).toBeGreaterThan(0);
  });

  it("captures an alien knocked out with a stun baton", () => {
    const m = openMap();
    const h = unit(1, "human", 5, 5, 2);
    h.tools.push({ tool: { id: "stun", name: "Baton", kind: "stun", power: 500, tuPct: 10, uses: 9 }, uses: 9 });
    h.stats.melee = 100;
    const a = unit(2, "alien", 6, 5, 6);
    a.tu = 0;
    const b = new Battle(m, [h, a], 1);
    const ev = b.stun(1, 2);
    expect(ev.find((e) => e.kind === "end")).toMatchObject({ outcome: "captured" });
    expect(b.outcome).toBe("captured");
    expect(SPOILS.captured).toContain("Live alien");
  });

  it("bleeds wounded units each turn", () => {
    const m = openMap();
    const h = unit(1, "human", 2, 2, 0);
    h.wounds = 2;
    const a = unit(2, "alien", 19, 19, 0);
    const b = new Battle(m, [h, a], 1);
    b.endTurn();
    expect(h.health).toBe(38);
  });
});

describe("prologue", () => {
  it("picks a megacity and sets up four survivors against one alien", () => {
    const city = prologueCity(7);
    expect(city.tier).toBe(1);
    const p = startPrologue(city, 7);
    expect(p.battle.humans).toHaveLength(4);
    expect(p.battle.alien.weapon?.alien).toBe(true);
    expect(p.battle.alienSeen).toBe(false);
  });

  it("always ends: the alien hunts down a squad that just waits", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const p = startPrologue(prologueCity(seed), seed);
      const b = p.battle;
      for (let t = 0; t < 60 && !b.outcome; t++) b.endTurn();
      expect(b.outcome, `seed ${seed}`).not.toBeNull();
      expect(["wiped", "killed", "captured"]).toContain(b.outcome);
      if (b.outcome === "wiped") expect(b.humans.some(alive)).toBe(false);
      else expect(conscious(b.alien)).toBe(false);
    }
  });
});

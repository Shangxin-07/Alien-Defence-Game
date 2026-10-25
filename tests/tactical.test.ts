import { describe, expect, it } from "vitest";
import { Battle, Unit, alive, conscious } from "../src/tactical/battle";
import { CITY_SIZE, CITY_STYLES, buildCity } from "../src/tactical/cityMap";
import { TacMap, facingTo } from "../src/tactical/map";
import { SPOILS, prologueCity, startPrologue } from "../src/tactical/prologue";
import { DIAGONAL_TU, STEP_TU, WEAPONS, baseHitChance, tuCost } from "../src/tactical/rules";

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
    it(`connects every open tile in a ${biome} city`, () => {
      for (const seed of [1, 2, 3, 42, 1234]) {
        const { map, humanStart, alienStart } = buildCity(seed, CITY_STYLES[biome]);
        expect(map.w).toBe(CITY_SIZE);
        expect(humanStart).toHaveLength(4);
        const { cost } = map.reach(alienStart, Infinity, new Set());
        for (const p of humanStart) expect(cost[map.idx(p.x, p.y)]).toBeLessThan(Infinity);
        // Every floor tile inside a building can be walked to: no sealed rooms.
        for (let i = 0; i < cost.length; i++) {
          if (map.building[i] !== -1 && map.walkable(i % map.w, Math.floor(i / map.w))) expect(cost[i], `seed ${seed} tile ${i % map.w},${Math.floor(i / map.w)}`).toBeLessThan(Infinity);
        }
      }
    });
  }
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

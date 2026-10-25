import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign";
import { AXES, AlienMind, RACES, RaceId, Rank, alienStats, readSquad, rollSquad } from "../src/tactical/aliens";
import { Battle, Unit } from "../src/tactical/battle";
import { TacMap } from "../src/tactical/map";
import { HUNTER_NORMS, battleSpoils, prologueCity, rollForce, startPrologue } from "../src/tactical/prologue";
import { mulberry32 } from "../src/tactical/random";
import { WEAPONS } from "../src/tactical/rules";
import { rollCall } from "../src/sightings";

function mind(rank: Rank, race: RaceId = "strider", over: Partial<AlienMind["mind"]> = {}): AlienMind {
  const m = { aggression: 50, caution: 50, cohesion: 80, cunning: 50, ...over };
  return { race, rank, nature: { ...m }, mind: { ...m }, state: "steady", maverick: false, waited: 0 };
}

function unit(id: number, side: "human" | "alien", x: number, y: number, extra: Partial<Unit> = {}): Unit {
  const stats = { tu: 60, health: 40, bravery: 50, reactions: 50, accuracy: 60, melee: 100, armour: 0 };
  return {
    id, side, name: `U${id}`, role: side === "alien" ? "Alien" : "Test", stats, x, y, facing: 2,
    tu: 60, health: 40, stun: 0, morale: side === "alien" ? 100 : 60, wounds: 0, kneeling: false,
    weapon: side === "alien" ? WEAPONS.plasmaPistol : WEAPONS.rifle, ammo: 20, tools: [], revealed: false,
    ...extra,
  };
}

const baton = { tool: { id: "stun", name: "Baton", kind: "stun" as const, power: 500, tuPct: 10, uses: 9 }, uses: 9 };

/** Two of you next to a leader, its soldier across the street. */
function squadFight() {
  const m = new TacMap(30, 30);
  m.lit.fill(1);
  const brave = unit(1, "human", 5, 5, { tools: [baton] });
  brave.stats = { ...brave.stats, bravery: 80 };
  const other = unit(2, "human", 4, 4);
  const leader = unit(10, "alien", 6, 5, { mind: mind("leader"), tu: 0 });
  const soldier = unit(11, "alien", 25, 25, { mind: mind("soldier") });
  const b = new Battle(m, [brave, other, leader, soldier], 1);
  return { b, brave, other, leader, soldier };
}

describe("alien personalities", () => {
  it("rolls a leader inside its race's norms, and gives the rest small nudges", () => {
    for (const race of Object.keys(RACES) as RaceId[]) {
      for (let seed = 1; seed < 40; seed++) {
        const s = rollSquad(race, 3, mulberry32(seed));
        expect(s.members.map((m) => m.rank)).toEqual(["leader", "second", "soldier"]);
        for (const k of AXES) {
          const [lo, hi] = RACES[race].norms[k];
          expect(s.members[0].nature[k]).toBeGreaterThanOrEqual(lo);
          expect(s.members[0].nature[k]).toBeLessThanOrEqual(hi);
          for (const m of s.members) if (!m.maverick) expect(Math.abs(m.nature[k] - s.doctrine[k])).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("makes Brutes charge and Shades lurk", () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 30; i++) {
      const brute = rollSquad("brute", 1, rand).doctrine;
      const shade = rollSquad("shade", 1, rand).doctrine;
      expect(brute.aggression).toBeGreaterThan(shade.aggression);
      expect(shade.cunning).toBeGreaterThan(brute.cunning);
    }
  });

  it("is the same squad for the same seed, so the choice to fight can show it first", () => {
    expect(rollForce(42, true)).toEqual(rollForce(42, true));
    for (let s = 1; s < 50; s++) expect(rollForce(s, false).squad.members).toHaveLength(1);
    const sizes = new Set(Array.from({ length: 200 }, (_, s) => rollForce(s, true).squad.members.length));
    expect([...sizes].sort()).toEqual([1, 2, 3]);
  });

  it("keeps the prologue Hunter a Strider with a tightly bounded personality", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const m = startPrologue(prologueCity(seed), seed).battle.alien.mind!;
      expect(m.race).toBe("strider");
      for (const k of AXES) {
        expect(m.nature[k]).toBeGreaterThanOrEqual(HUNTER_NORMS[k][0]);
        expect(m.nature[k]).toBeLessThanOrEqual(HUNTER_NORMS[k][1]);
      }
    }
  });

  it("makes leaders tougher than the rank and file", () => {
    expect(alienStats("strider", "leader").health).toBeGreaterThan(alienStats("strider", "soldier").health);
    expect(alienStats("brute", "soldier").armour).toBeGreaterThan(alienStats("shade", "soldier").armour);
  });

  it("gives hints, not numbers, and reads more with experience", () => {
    const squad = rollSquad("brute", 3, mulberry32(3));
    const green = readSquad(squad, 0);
    const old = readSquad(squad, 3);
    expect(green.join(" ")).toContain("More than one");
    expect(green.join(" ")).not.toContain("Brute");
    expect(old.join(" ")).toContain("Three of them");
    expect(old.length).toBeGreaterThan(green.length);
    for (const line of [...green, ...old]) expect(line).not.toMatch(/\d/);
  });
});

describe("commanders", () => {
  it("throws the rest into disarray when the one giving orders goes down", () => {
    const { b, leader, soldier, brave, other } = squadFight();
    expect(b.coordination()).toBe("full");
    const steadyAim = b.accuracyOf(soldier);
    const ev = b.stun(brave.id, leader.id);
    expect(b.outcome).toBeNull();
    expect(b.coordination()).toBe("none");
    expect(b.accuracyOf(soldier)).toBeLessThan(steadyAim);
    expect(b.reactionsOf(soldier)).toBeLessThan(soldier.stats.reactions);
    // A tight squad's soldier loses a lot of nerve; your people get some back and stay steadier.
    expect(soldier.morale).toBeLessThan(50);
    expect(other.morale).toBe(85);
    expect(b.steady).toBe(true);
    expect(ev.some((e) => e.kind === "say" && e.text.includes("giving the orders"))).toBe(true);
  });

  it("lets a second step up after a couple of turns, ending the worst of it", () => {
    const m = new TacMap(30, 30);
    const h = unit(1, "human", 5, 5, { tools: [baton] });
    const leader = unit(10, "alien", 6, 5, { mind: mind("leader"), tu: 0 });
    const second = unit(11, "alien", 28, 28, { mind: mind("second"), tu: 0 });
    const soldier = unit(12, "alien", 27, 28, { mind: mind("soldier"), tu: 0 });
    const b = new Battle(m, [h, leader, second, soldier], 1);
    b.stun(h.id, leader.id);
    expect(b.aliensReeling).toBe(true);
    b.endTurn();
    b.endTurn();
    expect(b.coordination()).toBe("none");
    b.endTurn();
    expect(b.inCharge).toBe(second.id);
    expect(b.coordination()).toBe("partial");
    expect(b.aliensReeling).toBe(false);
  });

  it("doesn't end the fight until every alien is down, and counts a leader's body apart", () => {
    const { b, brave, leader, soldier } = squadFight();
    b.stun(brave.id, leader.id);
    expect(b.outcome).toBeNull();
    soldier.health = 0;
    b.endTurn();
    expect(b.outcome).toBe("captured");
    expect(battleSpoils(b, "captured").sort()).toEqual(["Alien corpse", "Live commander"]);
    expect(battleSpoils(b, "fled")).toEqual([]);
  });

  it("shakes your people when whoever leads them dies", () => {
    const { b, brave, other, soldier } = squadFight();
    expect(b.humanLeader).toBe(brave.id);
    const aim = b.accuracyOf(other);
    brave.health = 0;
    b.endTurn();
    expect(b.humansShaken).toBe(true);
    expect(b.accuracyOf(other)).toBeLessThan(aim);
    expect(soldier.morale).toBe(100);
  });
});

describe("campaign", () => {
  it("brings home every body, learns the race, and reads it better after research", () => {
    const c = new Campaign();
    c.rand = () => 0.5;
    c.enlist([{ name: "A", role: "Army reservist", stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 }, health: 30, aptitude: 1, build: 1 }]);
    c.found({ lat: 51.5, lon: 0 }, true);
    const call = { ...rollCall(1, c.bases[0].id, c.time, () => 0.5), km: 2 };
    c.calls.push(call);
    c.respond(call.id, [c.staff[0].id], "foot");
    c.advanceTo(c.time + 2 * 3_600_000);
    expect(c.ambush).not.toBeNull();
    expect(c.knowledge("brute")).toBe(0);
    c.resolveAmbush({ outcome: "killed", race: "brute", recovered: ["Commander corpse", "Alien corpse"], people: [{ id: c.staff[0].id, health: 20 }] });
    expect(c.kills).toBe(2);
    expect(c.trophies).toEqual(expect.arrayContaining(["Commander corpse", "Alien corpse"]));
    expect(c.knowledge("brute")).toBe(1);
    c.research.done.push("commanderAutopsy");
    expect(c.knowledge("brute")).toBe(3);
    const saved = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(saved.encounters.brute).toBe(1);
  });
});

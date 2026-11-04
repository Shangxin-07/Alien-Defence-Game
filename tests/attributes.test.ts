import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign/campaign";
import { rollCandidate, rollDrifter } from "../src/campaign/recruit";
import { CIVILIAN, FIGHTER, ROLE_TEMPLATES, buildRate, deriveStats, inferProfile, noSkills, researchAptitude } from "../src/tactical/attributes";
import { prologueCity, startPrologue } from "../src/tactical/prologue";
import { mulberry32 } from "../src/tactical/random";
import type { Stats } from "../src/tactical/rules";

const profile = (t: (typeof ROLE_TEMPLATES)[string]) => ({ attributes: t.attributes, skills: { ...noSkills(), ...t.skills } });

/** What people were like before attributes, by kind. */
const BEFORE: Record<string, Omit<Stats, "armour">> = {
  "Police officer": { tu: 56, health: 34, bravery: 50, reactions: 50, accuracy: 60, melee: 72 },
  "Army reservist": { tu: 60, health: 38, bravery: 60, reactions: 55, accuracy: 68, melee: 50 },
  "Security guard": { tu: 52, health: 40, bravery: 40, reactions: 40, accuracy: 55, melee: 60 },
  Paramedic: { tu: 58, health: 32, bravery: 45, reactions: 40, accuracy: 45, melee: 40 },
};

describe("attributes", () => {
  it("make an ordinary civilian come out with the numbers civilians had before", () => {
    expect(deriveStats(profile(CIVILIAN))).toMatchObject({ tu: 52, bravery: 40, reactions: 42, accuracy: 42 });
    expect(Math.abs(deriveStats(profile(CIVILIAN)).health - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs(deriveStats(profile(FIGHTER)).accuracy - 62)).toBeLessThanOrEqual(1);
  });

  it("give each of the first night's jobs about the numbers it had, and no armour of their own", () => {
    for (const [role, before] of Object.entries(BEFORE)) {
      const s = deriveStats(profile(ROLE_TEMPLATES[role]));
      for (const k of Object.keys(before) as (keyof typeof before)[]) expect(Math.abs(s[k] - before[k]), `${role} ${k}`).toBeLessThanOrEqual(2);
      expect(s.armour).toBe(0);
    }
  });

  it("can be worked back from someone's old numbers, keeping research and building exact", () => {
    const old: Stats = { tu: 57, health: 35, bravery: 52, reactions: 48, accuracy: 63, melee: 70, armour: 0 };
    const p = inferProfile(old, 1.13, 0.97, "Police officer");
    const s = deriveStats(p);
    for (const k of ["tu", "health", "bravery", "reactions", "accuracy", "melee"] as const) expect(Math.abs(s[k] - old[k]), k).toBeLessThanOrEqual(1);
    expect(researchAptitude(p)).toBe(1.13);
    expect(buildRate(p)).toBe(0.97);
  });

  it("put armour on the first night's officer and guard as things they wear", () => {
    const p = startPrologue(prologueCity(3), 3);
    const by = (role: string) => p.battle.humans.find((u) => u.role === role)!;
    expect(by("Police officer").stats.armour).toBe(4);
    expect(by("Security guard").stats.armour).toBe(2);
    expect(by("Army reservist").stats.armour).toBe(0);
    expect(by("Paramedic").profile!.skills.medicine).toBeGreaterThan(20);
  });

  it("give recruits attributes, keeping their trade's research and building ranges", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const c = rollCandidate(i, 1, 0, rand);
      expect(c.attributes).toBeDefined();
      expect(deriveStats({ attributes: c.attributes!, skills: c.skills! })).toEqual(c.stats);
      if (c.role === "Chemist") expect(c.aptitude).toBeGreaterThanOrEqual(1);
      if (c.role === "Builder") expect(c.build).toBeGreaterThanOrEqual(1);
    }
    const d = rollDrifter(1, 1, 0, rand);
    expect(d.stats.health).toBeLessThan(32);
  });
});

describe("people from before attributes", () => {
  it("get attributes that fit, and the officer's own armour becomes a vest", () => {
    const c = new Campaign();
    c.enlist([
      { name: "A", role: "Police officer", stats: { tu: 56, health: 34, bravery: 50, reactions: 50, accuracy: 60, melee: 72, armour: 4 }, health: 34, aptitude: 1, build: 0.95 },
      { name: "B", role: "Security guard", stats: { tu: 52, health: 40, bravery: 40, reactions: 40, accuracy: 55, melee: 60, armour: 2 }, health: 40, aptitude: 1, build: 1 },
    ]);
    const data = JSON.parse(JSON.stringify(c.save()));
    // Make it look like a save from before attributes: innate armour, nothing worn, no attributes.
    for (const p of data.staff) {
      delete p.attributes;
      delete p.skills;
      p.kit.armour = null;
    }
    data.staff[0].stats.armour = 4;
    data.staff[1].stats.armour = 2;
    const back = Campaign.load(data);
    const [a, b] = back.staff;
    expect(a.attributes).toBeDefined();
    expect(a.stats.armour).toBe(0);
    expect(a.kit!.armour).toBe("stabVest");
    expect(b.kit!.armour).toBe("paddedJacket");
    expect(Math.abs(a.stats.melee - 72)).toBeLessThanOrEqual(1);
    expect(a.build).toBe(0.95);
    expect(a.health).toBe(a.stats.health);
  });
});

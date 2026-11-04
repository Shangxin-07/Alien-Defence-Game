import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign/campaign";
import { fightPractice, grow, growthDice, rollCeiling, scars } from "../src/campaign/growth";
import { recordLines } from "../src/campaign/record";
import { Profile, ROLE_TEMPLATES, noSkills } from "../src/tactical/attributes";
import { emptyDeeds } from "../src/tactical/deeds";

const LONDON = { lat: 51.51, lon: -0.13 };

const profile = (): Profile => ({ attributes: { ...ROLE_TEMPLATES["Army reservist"].attributes }, skills: noSkills() });

describe("learning by doing", () => {
  it("teaches a skill faster when it's low than when it's high", () => {
    const low = profile();
    const high = profile();
    high.skills.firearms = 80;
    const ceiling = { ...low.attributes };
    let lowGain = 0;
    let highGain = 0;
    for (let i = 0; i < 200; i++) {
      lowGain += grow(low, ceiling, { firearms: 1 }, growthDice(1, i, "t"))[0]?.by ?? 0;
      low.skills.firearms = 0;
      highGain += grow(high, ceiling, { firearms: 1 }, growthDice(1, i, "t"))[0]?.by ?? 0;
      high.skills.firearms = 80;
    }
    expect(lowGain).toBeGreaterThan(highGain * 3);
  });

  it("never trains an attribute past their ceiling", () => {
    const p = profile();
    const ceiling = { ...p.attributes, dex: p.attributes.dex + 3 };
    for (let i = 0; i < 50; i++) grow(p, ceiling, { dex: 5, str: 5 }, growthDice(1, i, "t"));
    expect(p.attributes.dex).toBe(ceiling.dex);
    expect(p.attributes.str).toBe(ceiling.str);
  });

  it("rolls a ceiling 5 to 20 above where they started, never past 100", () => {
    const a = { ...ROLE_TEMPLATES["Army reservist"].attributes, str: 95 };
    const c = rollCeiling(a, growthDice(7, -1, "ceiling"));
    expect(c.str).toBe(100);
    expect(c.dex - a.dex).toBeGreaterThanOrEqual(5);
    expect(c.dex - a.dex).toBeLessThanOrEqual(20);
  });

  it("turns hits into Firearms practice and walking into Endurance", () => {
    const pr = fightPractice({ ...emptyDeeds(), hits: 4, rounds: 6, tiles: 240 });
    expect(pr.firearms).toBeCloseTo(4 * 0.35 + 2 * 0.05);
    expect(pr.end).toBeCloseTo(2);
    expect(pr.close).toBe(0);
  });

  it("can scar someone who froze or nearly died, and never below 1", () => {
    let wil = 0;
    let end = 0;
    for (let i = 0; i < 200; i++) {
      const p = profile();
      for (const c of scars(p, { ...emptyDeeds(), froze: 1 }, 0.1, growthDice(1, i, "s"))) {
        if (c.trait === "wil") wil++;
        if (c.trait === "end") end++;
      }
    }
    expect(wil).toBeGreaterThan(20);
    expect(wil).toBeLessThan(80);
    expect(end).toBeGreaterThan(30);
    expect(end).toBeLessThan(90);
    const worn = profile();
    worn.attributes.wil = 1;
    worn.attributes.end = 1;
    for (let i = 0; i < 50; i++) scars(worn, { ...emptyDeeds(), froze: 1 }, 0, growthDice(1, i, "s"));
    expect(worn.attributes.wil).toBe(1);
    expect(worn.attributes.end).toBe(1);
  });

  it("rolls the same growth for the same person, day and reason", () => {
    const a = profile();
    const b = profile();
    const ceiling = { ...a.attributes, dex: 100 };
    const pr = { firearms: 3, dex: 2 };
    expect(grow(a, ceiling, pr, growthDice(3, 9, "fight"))).toEqual(grow(b, ceiling, pr, growthDice(3, 9, "fight")));
    expect(a).toEqual(b);
  });
});

describe("growth in the campaign", () => {
  const person = (name: string) => ({
    name,
    role: "Army reservist",
    stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
    health: 30,
    aptitude: 1,
    build: 1,
  });

  it("lets a fight teach the survivors, re-works their numbers, and keeps it on the record", () => {
    const c = new Campaign();
    c.rand = () => 0.99;
    c.enlist([person("A")]);
    c.found(LONDON, true);
    const a = c.staff[0];
    const before = { firearms: a.skills!.firearms, accuracy: a.stats.accuracy };
    const run = c.startRun("hardware", [a.id], 2);
    run.ambush = true;
    c.news.length = 0;
    c.resolveAmbush({
      outcome: "killed",
      recovered: [],
      people: [{ id: a.id, health: a.stats.health }],
      deeds: [{ id: a.id, deeds: { ...emptyDeeds(), hits: 30, rounds: 40, turns: 10 } }],
    });
    expect(a.skills!.firearms).toBeGreaterThan(before.firearms);
    expect(a.stats.accuracy).toBeGreaterThan(before.accuracy);
    expect(a.ceiling).toBeDefined();
    expect(c.rec(a).grown!.firearms).toBe(a.skills!.firearms - before.firearms);
    expect(c.news.some((n) => n.startsWith("A learned from it: Firearms +"))).toBe(true);
    expect(recordLines(c.rec(a), c.day).join(" ")).toContain("Learned by doing: Firearms +");
    // Growth survives a save.
    const back = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(back.staff[0].skills!.firearms).toBe(a.skills!.firearms);
    expect(back.staff[0].ceiling).toEqual(a.ceiling);
    expect(back.rec(back.staff[0]).grown).toEqual(c.rec(a).grown);
  });
});

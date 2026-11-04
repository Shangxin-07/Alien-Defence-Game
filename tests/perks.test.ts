import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign/campaign";
import { perkFit, perksEarned, rollOffer } from "../src/campaign/perks";
import { newRecord } from "../src/campaign/record";
import { CIVILIAN, Profile, buildRate, deriveStats, noSkills, talk } from "../src/tactical/attributes";
import { Battle, Unit } from "../src/tactical/battle";
import { emptyDeeds } from "../src/tactical/deeds";
import { TacMap } from "../src/tactical/map";
import { growthDice } from "../src/campaign/growth";
import { WEAPONS } from "../src/tactical/rules";

const LONDON = { lat: 51.51, lon: -0.13 };
const civilian = (): Profile => ({ attributes: { ...CIVILIAN.attributes }, skills: noSkills() });

describe("perk offers", () => {
  it("comes at 8, 24, 48 points learned", () => {
    expect([0, 7, 8, 23, 24, 47, 48, 80].map(perksEarned)).toEqual([0, 0, 1, 1, 2, 2, 3, 4]);
  });

  it("offers three different perks they haven't got, mostly ones that fit what they've done", () => {
    const r = newRecord(0, "test");
    r.deeds = { ...emptyDeeds(), heals: 20 };
    expect(perkFit(r, noSkills()).fieldMedic).toBeGreaterThan(perkFit(r, noSkills()).marksman * 10);
    let medic = 0;
    for (let i = 0; i < 100; i++) {
      const o = rollOffer(r, noSkills(), ["tough"], growthDice(1, i, "perk"));
      expect(new Set(o).size).toBe(3);
      expect(o).not.toContain("tough");
      if (o.includes("fieldMedic")) medic++;
    }
    expect(medic).toBeGreaterThan(90);
  });
});

describe("what perks do", () => {
  it("adds to stats, work and talk", () => {
    const p = civilian();
    const plain = deriveStats(p);
    p.perks = ["tough", "runner", "greaseMonkey", "silverTongue"];
    const better = deriveStats(p);
    expect(better.health).toBe(plain.health + 4);
    expect(better.tu).toBe(plain.tu + 4);
    expect(buildRate(p)).toBeCloseTo(buildRate(civilian()) + 0.1);
    expect(talk(p)).toBe(talk(civilian()) + 15);
  });

  it("makes a quick draw's snap shots cheaper and halves an iron nerve's morale loss", () => {
    const m = new TacMap(20, 20);
    m.lit.fill(1);
    const unit = (id: number, perks: Profile["perks"]): Unit => ({
      id, side: "human", name: `U${id}`, role: "Test", stats: { tu: 60, health: 40, bravery: 0, reactions: 50, accuracy: 60, melee: 50, armour: 0 },
      x: 2, y: 2 + id * 2, facing: 2, tu: 60, health: 40, stun: 0, morale: 80, wounds: 0, kneeling: false,
      weapon: WEAPONS.rifle, ammo: 20, tools: [], revealed: false, profile: { ...civilian(), perks },
    });
    const plain = unit(1, []);
    const quick = unit(2, ["quickDraw", "ironNerve"]);
    const alien: Unit = { ...unit(9, []), side: "alien", x: 18, y: 18, weapon: WEAPONS.plasmaPistol, profile: undefined };
    const b = new Battle(m, [plain, quick, alien], 1);
    const target = { x: 12, y: 2 };
    expect(b.previewShot(2, target, "snap").tu).toBeLessThan(b.previewShot(1, target, "snap").tu);
    const victim = unit(3, []);
    const b2 = new Battle(m, [plain, quick, victim, alien], 1);
    victim.health = 0;
    // A friend's death shakes them both; the iron nerve keeps more of it.
    (b2 as unknown as { loseFriend(h: Unit): void }).loseFriend(plain);
    (b2 as unknown as { loseFriend(h: Unit): void }).loseFriend(quick);
    expect(80 - quick.morale).toBe(Math.round((80 - plain.morale) / 2));
  });
});

describe("perks in the campaign", () => {
  it("offers a perk once enough is learned, takes the pick, and keeps it through a save", () => {
    const c = new Campaign();
    c.rand = () => 0.99;
    c.enlist([{ name: "A", role: "Army reservist", stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 }, health: 30, aptitude: 1, build: 1 }]);
    c.found(LONDON, true);
    const a = c.staff[0];
    const run = c.startRun("hardware", [a.id], 2);
    run.ambush = true;
    c.news.length = 0;
    c.resolveAmbush({
      outcome: "killed", recovered: [], people: [{ id: a.id, health: a.stats.health }],
      deeds: [{ id: a.id, deeds: { ...emptyDeeds(), hits: 40, rounds: 50, turns: 10, tiles: 300 } }],
    });
    expect(a.perkOffer).toHaveLength(3);
    expect(c.news.some((n) => n.includes("choose a perk"))).toBe(true);
    const pick = a.perkOffer![0];
    const back = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(back.staff[0].perkOffer).toEqual(a.perkOffer);
    c.pickPerk(a.id, pick);
    expect(a.perks).toEqual([pick]);
    expect(() => c.pickPerk(a.id, pick)).toThrow();
  });
});

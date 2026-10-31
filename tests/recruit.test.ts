import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign/campaign";
import { BROKEN_PENALTY, CANDIDATE_WAIT, Candidate, KEPT_BONUS, LONG_PROMISE_DAYS, MEDICINE_DAYS, RECRUIT_LOYALTY, rollCandidate, rollDrifter } from "../src/campaign/recruit";

const LONDON = { lat: 51.51, lon: -0.13 };

const person = (name: string) => ({
  name,
  role: "Army reservist",
  stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
  health: 30,
  aptitude: 1,
  build: 1,
});

function camp(roll = 0.99): Campaign {
  const c = new Campaign();
  c.rand = () => roll;
  c.enlist([person("A"), person("B")]);
  c.found(LONDON, true);
  c.supplies.food = 500;
  return c;
}

/** Puts a candidate who wants this in front of the campaign. */
function offer(c: Campaign, wants: Candidate["wants"], amount = 0): Candidate {
  const cand = { ...rollCandidate(100 + c.candidates.length, c.bases[0].id, c.day, () => 0.5), wants, amount };
  c.candidates.push(cand);
  return cand;
}

describe("candidates", () => {
  it("ask for more the better they are", () => {
    const seq = (q: number) => {
      // trade, quality, two name picks, what they want (food), then stats
      const rolls = [0, q, 0, 0, 0];
      return () => rolls.shift() ?? 0.5;
    };
    const poor = rollCandidate(1, 1, 0, seq(0));
    const good = rollCandidate(2, 1, 0, seq(1));
    expect(good.build).toBeGreaterThan(poor.build);
    expect(good.wants).toBe("food");
    expect(good.amount).toBeGreaterThan(poor.amount);
  });

  it("include drifters who want nothing and bring little", () => {
    const d = rollDrifter(1, 1, 0, () => 0.99);
    expect(d.wants).toBe("none");
    expect(d.build).toBeLessThan(0.85);
  });

  it("are met by recruiters out on the streets, and move on if kept waiting", () => {
    const c = camp(0.99);
    const run = c.startRecruiting([c.staff[0].id], 2);
    expect(run.recruit).toBe(true);
    // Too high for trouble on the streets, low enough to meet both a candidate and a drifter.
    c.rand = () => 0.1;
    c.advanceDays(1);
    expect(c.candidates.map((x) => x.wants === "none")).toEqual([false, true]);
    c.rand = () => 0.99;
    c.advanceDays(1 + CANDIDATE_WAIT + 1);
    expect(c.candidates).toHaveLength(0);
    expect(c.runs).toHaveLength(0);
  });

  it("limits recruiters to two", () => {
    const c = camp();
    c.enlist([]);
    c.staff.push({ ...c.staff[0], id: 50 });
    expect(() => c.startRecruiting([c.staff[0].id, c.staff[1].id, 50], 1)).toThrow(/two|2/);
  });
});

describe("fulfillments", () => {
  it("takes food up front, and won't if there isn't enough", () => {
    const c = camp();
    c.supplies.food = 5;
    const cand = offer(c, "food", 8);
    expect(c.checkCandidate(cand.id)).toMatch(/food/);
    c.supplies.food = 20;
    const p = c.accept(cand.id);
    expect(c.supplies.food).toBe(12);
    expect(p.loyalty).toBe(RECRUIT_LOYALTY);
    expect(p.job).toBe("construction");
    expect(c.candidates).toHaveLength(0);
  });

  it("brings families who eat every day", () => {
    const c = camp();
    const before = c.mouths;
    const p = c.accept(offer(c, "family", 2).id);
    expect(p.dependants).toBe(2);
    expect(c.mouths).toBe(before + 3);
    const food = c.supplies.food;
    c.advanceDays(1);
    expect(c.supplies.food).toBe(food - c.mouths);
  });

  it("costs loyalty when the family goes hungry", () => {
    const c = camp();
    const p = c.accept(offer(c, "family", 1).id);
    c.supplies.food = c.staff.length;
    c.advanceDays(1);
    expect(p.loyalty).toBeLessThan(RECRUIT_LOYALTY);
  });

  it("rewards a kept promise of medicine", () => {
    const c = camp();
    c.supplies.medicine = 0;
    const p = c.accept(offer(c, "medicine", 3).id);
    expect(c.pledges).toHaveLength(1);
    c.advanceDays(2);
    c.supplies.medicine = 5;
    c.advanceDays(1);
    expect(c.pledges).toHaveLength(0);
    expect(c.supplies.medicine).toBe(2);
    expect(p.loyalty).toBe(RECRUIT_LOYALTY + KEPT_BONUS);
  });

  it("punishes a broken promise, and the disloyal walk out", () => {
    const c = camp();
    c.supplies.medicine = 0;
    const p = c.accept(offer(c, "medicine", 3).id);
    c.advanceDays(MEDICINE_DAYS + 1);
    expect(c.news.some((n) => n.startsWith("Promise broken"))).toBe(true);
    expect(c.staff).not.toContain(p);
    expect(RECRUIT_LOYALTY - BROKEN_PENALTY).toBeLessThan(30);
  });

  it("counts a win in an ambush as revenge", () => {
    const c = camp();
    const p = c.accept(offer(c, "revenge").id);
    const run = c.startRun("homes", [c.staff[0].id], 2);
    run.ambush = true;
    c.resolveAmbush({ outcome: "killed", people: [{ id: c.staff[0].id, health: 20 }] });
    c.advanceDays(1);
    expect(c.pledges).toHaveLength(0);
    expect(p.loyalty).toBe(RECRUIT_LOYALTY + KEPT_BONUS);
  });

  it("expects a bed within a month", () => {
    const c = camp();
    const p = c.accept(offer(c, "bed").id);
    expect(c.pledges[0].due).toBe(c.day + LONG_PROMISE_DAYS);
    c.advanceDays(LONG_PROMISE_DAYS + 1);
    expect(c.staff).not.toContain(p);
  });

  it("never lets the last person walk out", () => {
    const c = new Campaign();
    c.found(LONDON, true);
    c.supplies.food = 100;
    c.supplies.medicine = 0;
    c.candidates.push({ ...rollCandidate(1, c.bases[0].id, 0, () => 0.5), wants: "medicine", amount: 3 });
    const p = c.accept(1);
    c.advanceDays(MEDICINE_DAYS + 2);
    expect(c.staff).toEqual([p]);
  });

  it("survives a save and load", () => {
    const c = camp();
    c.accept(offer(c, "medicine", 2).id);
    offer(c, "family", 1);
    const copy = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(copy.pledges).toEqual(c.pledges);
    expect(copy.candidates).toEqual(c.candidates);
  });
});

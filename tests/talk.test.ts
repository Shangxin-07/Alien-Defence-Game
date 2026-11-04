import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign/campaign";
import { dayLoot, emptySupplies, dayRisk, rollPlace } from "../src/campaign/scavenge";
import { CIVILIAN, Profile, ROLE_TEMPLATES, askShare, batonWeight, fieldMedicine, findShare, lookout, noSkills, nursing, priceShare, recruitOdds, riskShare, talk } from "../src/tactical/attributes";
import { mulberry32 } from "../src/tactical/random";

const LONDON = { lat: 51.51, lon: -0.13 };
const of = (role: string): Profile => ({ attributes: { ...ROLE_TEMPLATES[role].attributes }, skills: { ...noSkills(), ...ROLE_TEMPLATES[role].skills } });
const civilian = (): Profile => ({ attributes: { ...CIVILIAN.attributes }, skills: noSkills() });

describe("who does the talking", () => {
  it("leaves the first night's people about where everyone was, rewards the liaison and costs a civilian", () => {
    const police = of("Police officer");
    expect(recruitOdds(police)).toBeCloseTo(1, 1);
    expect(priceShare(police)).toBeCloseTo(1, 1);
    const liaison = of("Liaison");
    expect(talk(liaison)).toBeGreaterThan(talk(police));
    expect(recruitOdds(liaison)).toBeGreaterThan(1.1);
    expect(askShare(liaison)).toBeLessThan(0.95);
    expect(priceShare(liaison)).toBeLessThan(1);
    expect(recruitOdds(civilian())).toBeLessThan(1);
    expect(priceShare(civilian())).toBeGreaterThan(1);
  });

  it("puts the best talker at home on the black market, and their price on the button", () => {
    const c = new Campaign();
    c.rand = () => 0.99;
    const guard = { name: "G", role: "Security guard", stats: { tu: 50, health: 30, bravery: 40, reactions: 40, accuracy: 50, melee: 50, armour: 0 }, health: 30, aptitude: 1, build: 1 };
    c.enlist([guard]);
    c.found(LONDON, true);
    c.funds = 1_000_000;
    const g = c.staff[0];
    expect(c.haggler()).toBe(g);
    const plain = c.buyCost("food", 10);
    g.attributes!.cha = 90;
    g.skills!.persuasion = 60;
    expect(c.buyCost("food", 10)).toBeLessThan(plain);
  });
});

describe("who keeps watch, and who finds things", () => {
  it("cuts a run's risk with a sharp lookout and raises it with a dull one", () => {
    expect(riskShare(lookout(of("Army reservist")))).toBeCloseTo(1, 1);
    expect(riskShare(80)).toBeLessThan(0.8);
    expect(dayRisk("homes", 2, riskShare(80))).toBeLessThan(dayRisk("homes", 2));
    expect(dayRisk("homes", 2, riskShare(0))).toBeGreaterThan(dayRisk("homes", 2));
  });

  it("finds more with a good scrounger, and an ordinary team rolls exactly as before", () => {
    const place = () => ({ ...rollPlace(1, mulberry32(3)), kind: "grocery" as const, stock: { ...emptySupplies(), food: 10_000 } });
    expect(dayLoot(place(), [1, 1], mulberry32(9))).toEqual(dayLoot(place(), 2, mulberry32(9)));
    let plain = 0;
    let skilled = 0;
    const pro = civilian();
    pro.skills.scrounging = 70;
    for (let i = 0; i < 200; i++) {
      plain += dayLoot(place(), [1], mulberry32(i)).food;
      skilled += dayLoot(place(), [findShare(pro)], mulberry32(i)).food;
    }
    expect(skilled / plain).toBeGreaterThan(1.2);
  });
});

describe("hands and know-how", () => {
  it("heals more with a medic and less with nobody trained, never under 1", () => {
    const medic = of("Paramedic");
    expect(nursing(medic)).toBeGreaterThan(2);
    expect(nursing(civilian())).toBe(1);
    expect(fieldMedicine(medic)).toBeGreaterThan(0);
    expect(fieldMedicine(civilian())).toBeLessThan(0);
  });

  it("puts weight behind a baton for the strong, none for a police officer", () => {
    expect(batonWeight(of("Police officer"))).toBe(0);
    expect(batonWeight(of("Security guard"))).toBeGreaterThan(0);
    expect(batonWeight(of("Liaison"))).toBeLessThan(0);
  });
});

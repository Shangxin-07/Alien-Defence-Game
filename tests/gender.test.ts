import { describe, expect, it } from "vitest";
import { genderFor, namedGender } from "../src/tactical/gender";
import { FIRST as PROLOGUE_NAMES } from "../src/tactical/prologue";
import { FIRST as RECRUIT_NAMES, rollCandidate, rollDrifter } from "../src/campaign/recruit";
import { mulberry32 } from "../src/tactical/random";

describe("gender", () => {
  it("knows every first name the game can roll", () => {
    for (const n of [...PROLOGUE_NAMES, ...RECRUIT_NAMES]) expect(namedGender(n), n).toBeDefined();
  });

  it("goes with the first name", () => {
    expect(genderFor("Ben Khan")).toBe("male");
    expect(genderFor("Hana Ivanova")).toBe("female");
    expect(["female", "male"]).toContain(genderFor("Survivor 2"));
  });

  it("is given to recruits and drifters when they're rolled", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 20; i++) {
      const c = i % 2 ? rollCandidate(i, 1, 0, rand) : rollDrifter(i, 1, 0, rand);
      expect(c.gender).toBe(genderFor(c.name));
    }
  });
});

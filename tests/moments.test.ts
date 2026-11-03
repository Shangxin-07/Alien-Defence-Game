import { describe, expect, it } from "vitest";
import { playRound } from "../src/tactical/autoplay";
import { BattleEvent } from "../src/tactical/battle";
import { BREACH_HOLD, DEATH_HOLD, MomentContext, momentFor } from "../src/tactical/moments";
import { CITIES } from "../src/geoscape/cities";
import { prologueCity, startAmbush, startPrologue } from "../src/tactical/prologue";
import { mulberry32 } from "../src/tactical/random";

// Unit 1 is one of yours, 2 an alien in view, 3 an alien in the dark.
const ctx: MomentContext = {
  side: (id) => (id === 1 ? "human" : "alien"),
  name: (id) => ["", "Okafor", "Strider", "Shade"][id],
  seen: (id) => id !== 3,
};
const shot = (unit: number, hit: number | null, seen = true): Extract<BattleEvent, { kind: "shot" }> => ({
  kind: "shot",
  unit,
  from: { x: 1, y: 1 },
  to: { x: 9, y: 4 },
  hit,
  plasma: unit !== 1,
  seen,
});
const death = (unit: number): BattleEvent => ({ kind: "damage", unit, amount: 30, stun: false, dead: true, out: false });

describe("the action camera", () => {
  it("goes in close when a wall comes down, on 'key' too; lighter breaks only on 'all'; never one it didn't see", () => {
    const wreck = (was: string, tough: number, seen = true, broke = true): BattleEvent => ({
      kind: "wreck", at: { x: 5, y: 5, z: 0 }, amount: 120, broke, thing: "none", look: null, ground: "rubble", seen, was, tough,
    });
    const m = momentFor(wreck("Wall", 2), ctx, "key")!;
    expect(m.close).toBe(true);
    expect(m.hold).toBe(BREACH_HOLD);
    expect(m.at).toEqual([{ x: 5, y: 5, z: 0 }]);
    expect(m.caption).toBe("Wall breached");
    expect(momentFor(wreck("Concrete barrier", 2), ctx, "key")!.caption).toBe("Concrete barrier destroyed");
    expect(momentFor(wreck("Crate", 0), ctx, "key")).toBeNull();
    expect(momentFor(wreck("Crate", 0), ctx, "all")!.caption).toBeUndefined();
    expect(momentFor(wreck("Wall", 2, false), ctx, "all")).toBeNull();
    expect(momentFor(wreck("Wall", 2, true, false), ctx, "all")).toBeNull();
    expect(momentFor(wreck("Wall", 2), ctx, "off")).toBeNull();
  });

  it("lingers close on every death, saying who did it", () => {
    const m = momentFor(death(1), ctx, "key", shot(2, 1))!;
    expect(m.close).toBe(true);
    expect(m.hold).toBe(DEATH_HOLD);
    expect(m.at).toEqual([1]);
    expect(m.caption).toBe("Okafor killed by Strider");
    expect(m.tone).toBe("bad");
    expect(momentFor(death(2), ctx, "key", shot(1, 2))!.caption).toBe("Strider killed by Okafor");
  });

  it("doesn't give away a shooter in the dark", () => {
    const s = shot(3, 1, false);
    expect(momentFor(s, ctx, "all")!.at).toEqual([s.to]);
    expect(momentFor(death(1), ctx, "all", s)!.caption).toBe("Okafor killed from the dark");
    // A shooter in view gets both ends of the shot in frame.
    const seen = shot(2, 1);
    expect(momentFor(seen, ctx, "all")!.at).toEqual([seen.from, seen.to]);
  });

  it("shows first contact", () => {
    const m = momentFor({ kind: "spot", unit: 2 }, ctx, "key")!;
    expect(m.caption).toBe("Contact: Strider");
    expect(m.close).toBe(true);
  });

  it("follows every shot on 'all', only the ones that hit on 'key', nothing when off", () => {
    expect(momentFor(shot(1, null), ctx, "all")).not.toBeNull();
    expect(momentFor(shot(1, null), ctx, "key")).toBeNull();
    expect(momentFor(shot(2, 1), ctx, "key")).not.toBeNull();
    for (const e of [shot(2, 1), death(1), { kind: "spot", unit: 2 } as BattleEvent]) expect(momentFor(e, ctx, "off")).toBeNull();
  });

  it("stays put on a hit it already has in frame, but goes to one it doesn't", () => {
    const hurt: BattleEvent = { kind: "damage", unit: 1, amount: 8, stun: false, dead: false, out: false };
    expect(momentFor(hurt, ctx, "all", shot(2, 1))!.at).toEqual([]);
    expect(momentFor(hurt, ctx, "all", null)!.at).toEqual([1]);
    expect(momentFor(hurt, ctx, "key", null)).toBeNull();
    // An alien hurt out of sight stays out of sight.
    expect(momentFor({ ...hurt, unit: 3 }, ctx, "all", null)).toBeNull();
  });

  it("finds a moment for every death in real fights, and lingers about two seconds on each", () => {
    let deaths = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const team = startPrologue(prologueCity(seed), seed).battle.humans.map((u) => ({ id: u.id, name: u.name, role: u.role, stats: u.stats, health: u.stats.health }));
      const b = startAmbush(CITIES[seed % CITIES.length], seed, team, "Supermarket", { caller: "x", place: "here", hours: 1 }).battle;
      const real: MomentContext = { side: (id) => b.unit(id).side, name: (id) => b.unit(id).name, seen: (id) => b.unit(id).side === "human" || b.isSeen(b.unit(id)) };
      const rand = mulberry32(seed);
      for (let r = 0; r < 30 && !b.outcome; r++) {
        let last: Extract<BattleEvent, { kind: "shot" }> | null = null;
        for (const e of playRound(b, "aggressive", rand)) {
          const m = momentFor(e, real, "key", last);
          if (e.kind === "damage" && e.dead) {
            deaths++;
            expect(m?.close).toBe(true);
            expect(m!.hold).toBeGreaterThanOrEqual(1.5);
            expect(m!.caption).toContain(b.unit(e.unit).name);
          }
          if (e.kind === "shot") last = e;
        }
      }
    }
    expect(deaths).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign";
import { HABITS, Habits, NOTICED, adaptNews, adaptReads, adaptSquad, learn, noHabits, observe } from "../src/tactical/adapt";
import { rollSquad } from "../src/tactical/aliens";
import { MAX_ROUNDS, REWIND_WINDOW, Timeline, estimateRisk, lockoutFor, moraleFor, oddsText, playOut, playRound } from "../src/tactical/autoplay";
import { Battle, Tally, alive } from "../src/tactical/battle";
import { dist } from "../src/tactical/map";
import { CITIES } from "../src/geoscape/cities";
import { prologueCity, startAmbush, startPrologue } from "../src/tactical/prologue";
import { mulberry32 } from "../src/tactical/random";

/** A sighting fight with the prologue's four, against whatever the seed rolls. */
function fight(seed = 3): Battle {
  const team = startPrologue(prologueCity(seed), seed).battle.humans.map((u) => ({ id: u.id, name: u.name, role: u.role, stats: u.stats, health: u.stats.health }));
  return startAmbush(CITIES[seed % CITIES.length], seed, team, "Supermarket", { caller: "x", place: "here", hours: 1 }).battle;
}

const state = (b: Battle) => JSON.stringify({ turn: b.turn, side: b.side, outcome: b.outcome, units: b.units, tally: b.tally, things: b.map.thing });

const tally = (over: Partial<Tally> = {}): Tally => ({ humanTurns: 10, idleTu: 5, shots: 0, closeShots: 0, reflexShots: 0, stunTries: 0, panics: 0, contact: 0, ...over });

describe("rewinding a battle", () => {
  it("puts everything back as it was at a snapshot", () => {
    const b = fight();
    const snap = b.snapshot();
    const before = state(b);
    playRound(b, "aggressive", mulberry32(1));
    playRound(b, "aggressive", mulberry32(2));
    expect(state(b)).not.toBe(before);
    b.restore(snap, 99);
    expect(state(b)).toBe(before);
  });

  it("re-rolls the dice: the same seed replays the same, a new one doesn't", () => {
    const run = (seed: number) => {
      const b = fight(5);
      const snap = b.snapshot();
      playRound(b, "cautious", mulberry32(1));
      b.restore(snap, seed);
      playOut(b, "cautious", mulberry32(7));
      return state(b);
    };
    expect(run(11)).toBe(run(11));
    const outcomes = new Set([11, 12, 13, 14, 15].map(run));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("forks a copy that can be played out without touching the original", () => {
    const b = fight();
    const before = state(b);
    const f = b.fork(42);
    playOut(f, "aggressive", mulberry32(1));
    expect(f.outcome).not.toBeNull();
    expect(state(b)).toBe(before);
  });
});

describe("autoplay", () => {
  it("plays your turn and ends it, and always finishes a fight", () => {
    for (const d of ["cautious", "aggressive", "capture"] as const) {
      const b = fight(7);
      const events = playRound(b, d, mulberry32(1));
      expect(events.some((e) => e.kind === "turn" && e.side === "alien")).toBe(true);
      playOut(b, d, mulberry32(2));
      expect(b.outcome).not.toBeNull();
      expect(b.turn).toBeLessThanOrEqual(MAX_ROUNDS + 1);
    }
  });

  it("estimates the odds from simulated fights, wider the less you know them", () => {
    const b = fight();
    const before = state(b);
    const r = estimateRisk(b, "aggressive", 0, 6, 1);
    expect(r.clean + r.losses + r.disaster).toBeCloseTo(1);
    expect(state(b)).toBe(before);
    expect(estimateRisk(b, "aggressive", 3, 1, 1).spread).toBeLessThan(r.spread);
    expect(oddsText(0.5, 0.25)).toBe("25–75%");
    expect(oddsText(0.02, 0)).toBe("0%");
  });
});

describe("the rewind timeline", () => {
  /** Autoplays a few rounds, keeping the timeline as the screen does. */
  function played(rounds: number, brutal = false) {
    for (let seed = 1; seed < 50; seed++) {
      const b = fight(seed);
      const t = new Timeline(brutal);
      t.begin(b);
      const rand = mulberry32(seed);
      for (let i = 0; i < rounds && !b.outcome; i++) {
        const round = b.turn;
        playRound(b, "cautious", rand);
        t.played(b, round, true);
      }
      if (!b.outcome) return { b, t };
    }
    throw new Error("Every fight ended too soon");
  }

  it("prices a rewind by how far back it is from where the fight is now", () => {
    const { b, t } = played(4);
    expect(b.turn).toBe(5);
    expect(t.price(b, 5)).toMatchObject({ undone: 0, lockout: 1, morale: 0, reason: null });
    expect(t.price(b, 4)).toMatchObject({ undone: 1, lockout: 3, reason: null });
    expect(t.price(b, 1)).toMatchObject({ undone: 4, lockout: lockoutFor(4), morale: moraleFor(4), reason: null });
    expect(lockoutFor(1)).toBe(3);
    expect(lockoutFor(4)).toBeGreaterThan(lockoutFor(1));
  });

  it("can't go back further than the window, and not at all in brutal mode", () => {
    const { b, t } = played(REWIND_WINDOW + 2);
    expect(t.price(b, 1).reason).toMatch(/far/);
    expect(t.price(b, b.turn - REWIND_WINDOW).reason).toBeNull();
    const hard = played(3, true);
    expect(hard.t.price(hard.b, hard.b.turn - 1).reason).toMatch(/brutal/);
    expect(hard.t.price(hard.b, hard.b.turn).reason).toBeNull();
  });

  it("takes you back with new dice, a morale hit and a stretch of playing by hand", () => {
    const { b, t } = played(4);
    const startOf2 = JSON.stringify(t.record(2)!.start.units.filter((u) => u.side === "human").map((u) => u.health));
    const p = t.rewind(b, 2, 77);
    expect(p.reason).toBeNull();
    expect(b.turn).toBe(2);
    expect(JSON.stringify(b.humans.map((u) => u.health))).toBe(startOf2);
    expect(t.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(t.lockedUntil).toBe(2 + lockoutFor(3));
    expect(t.locked(b)).toBe(true);
    // Rounds you then play by hand can't be taken back.
    const round = b.turn;
    b.endTurn();
    t.played(b, round, false);
    expect(t.price(b, 2).reason).toMatch(/hand/);
  });

  it("marks what happened in each round", () => {
    const b = fight(3);
    const t = new Timeline();
    t.begin(b);
    const rand = mulberry32(3);
    while (!b.outcome) {
      const round = b.turn;
      playRound(b, "aggressive", rand);
      t.played(b, round, true);
    }
    const all = t.rounds.flatMap((r) => (r.marks ? [r.marks] : []));
    expect(all.filter((m) => m.contact)).toHaveLength(1);
    const dead = b.humans.filter((u) => !alive(u)).length;
    expect(all.reduce((n, m) => n + m.killed.length, 0)).toBe(dead);
    expect(t.autoRounds).toBe(t.rounds.length);
  });
});

describe("adaptive aliens", () => {
  it("reads your habits from how you fought", () => {
    expect(observe(tally({ idleTu: 8 })).holding).toBeGreaterThan(0.9);
    expect(observe(tally({ idleTu: 1 })).pushing).toBeGreaterThan(0.9);
    expect(observe(tally({ idleTu: 5, shots: 4, closeShots: 4 })).pushing).toBe(1);
    expect(observe(tally({ stunTries: 3 })).takedowns).toBe(1);
    for (const h of HABITS) expect(observe(tally())[h]).toBeLessThan(0.5);
  });

  it("learns slowly, faster when some got away, slower when it lost its commander", () => {
    const seen = { ...noHabits(), holding: 1 };
    const plain = learn(noHabits(), seen).holding;
    expect(plain).toBeGreaterThan(0);
    expect(plain).toBeLessThan(NOTICED);
    expect(learn(noHabits(), seen, { escaped: true }).holding).toBeGreaterThan(plain);
    expect(learn(noHabits(), seen, { commanderDown: true }).holding).toBeLessThan(plain);
    expect(learn(noHabits(), seen, { researched: true }).holding).toBeLessThan(plain);
    // Drop the habit and it wears off.
    expect(learn({ ...noHabits(), holding: 0.8 }, noHabits()).holding).toBeLessThan(0.8);
  });

  it("hands a squad what its race has learned, and says what your people have noticed", () => {
    const squad = rollSquad("strider", 2, mulberry32(4));
    const before = squad.members.map((m) => ({ ...m.nature }));
    adaptSquad(squad, { ...noHabits(), holding: 1 });
    // Their nature is their own; what changes is what they're ready for.
    expect(squad.members.map((m) => m.nature)).toEqual(before);
    expect(squad.members.every((m) => m.counters?.holding === 1)).toBe(true);
    expect(adaptReads({ ...noHabits(), holding: 1 })).toHaveLength(1);
    expect(adaptReads(noHabits())).toHaveLength(0);
  });

  it("makes a race that's learned you sit tight keep out of the dark, and one that's learned you rush quicker on the draw", () => {
    const seen = (learned: Habits, d: "cautious" | "aggressive") => {
      let close = 0;
      let n = 0;
      for (let s = 1; s <= 6; s++) {
        const b = fight(s);
        for (const a of b.aliens) a.mind!.counters = { ...learned };
        playOut(b, d, mulberry32(s));
        for (const h of b.humans) {
          const p = b.lastSeen.get(b.aliens[0].id);
          if (!p) continue;
          n++;
          if (dist(h, p) <= 9) close++;
        }
      }
      return n ? close / n : 0;
    };
    // Sniping from out in the dark: where you last saw them is further off.
    expect(seen({ ...noHabits(), holding: 1 }, "cautious")).toBeLessThan(seen(noHabits(), "cautious"));
    // Braced: a charging soldier draws reaction fire a steady one wouldn't.
    const b = fight(2);
    const alien = b.aliens[0];
    const victim = b.humans[0];
    alien.mind!.counters = { ...noHabits(), pushing: 1 };
    expect(b.reflex(alien, victim)).toBe(1);
    victim.tu = 1;
    expect(b.reflex(alien, victim)).toBeGreaterThan(1);
    expect(b.drill(alien, victim)).toBeGreaterThan(1);
  });

  it("tells you when a race picks up a habit, and when it lets it go", () => {
    expect(adaptNews("brute", noHabits(), { ...noHabits(), pushing: 0.5 })[0]).toMatch(/Brutes are learning/);
    expect(adaptNews("brute", { ...noHabits(), pushing: 0.5 }, noHabits())[0]).toMatch(/adapted back/);
  });

  it("is kept by the campaign, per race, across saves", () => {
    const c = new Campaign();
    for (let i = 0; i < 4; i++) c.learnFrom("shade", tally({ idleTu: 9 }), "killed", false);
    expect(c.learned.shade!.holding).toBeGreaterThan(NOTICED);
    expect(c.learned.strider).toBeUndefined();
    expect(c.news.some((n) => n.startsWith("Shades are learning"))).toBe(true);
    const again = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(again.learned.shade).toEqual(c.learned.shade);
  });

  it("counts what your people do in a fight", () => {
    const b = fight();
    playOut(b, "aggressive", mulberry32(9));
    expect(b.tally.humanTurns).toBeGreaterThan(0);
    expect(b.tally.shots).toBeGreaterThan(0);
    expect(b.tally.contact).toBeGreaterThan(0);
  });
});

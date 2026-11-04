import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign/campaign";
import { recordLines } from "../src/campaign/record";
import { Battle, Unit } from "../src/tactical/battle";
import { addDeeds, emptyDeeds } from "../src/tactical/deeds";
import { TacMap } from "../src/tactical/map";
import { WEAPONS } from "../src/tactical/rules";

const LONDON = { lat: 51.51, lon: -0.13 };

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

const person = (name: string) => ({
  name,
  role: "Army reservist",
  stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
  health: 30,
  aptitude: 1,
  build: 1,
});

describe("deeds in battle", () => {
  it("counts walking, shooting and time used for each of your people, and nothing for the aliens", () => {
    const h = unit(1, "human", 2, 10);
    const a = unit(9, "alien", 18, 18, 6);
    const b = new Battle(openMap(), [h, a], 3);
    b.move(1, { x: 5, y: 10 });
    expect(h.deeds!.tiles).toBe(3);
    // Shots at an empty corner of the street: rounds fired, nobody hit.
    for (let i = 0; i < 3; i++) b.shoot(1, { x: 12, y: 10 }, "snap");
    const d = h.deeds!;
    expect(d.snapShots).toBe(3);
    expect(d.rounds).toBe(3);
    expect(d.hits).toBe(0);
    b.endTurn();
    expect(d.turns).toBe(1);
    expect(d.tuHad).toBe(60);
    expect(d.tuLeft).toBe(60 - 12 - 3 * 15);
    expect(a.deeds).toBeUndefined();
  });

  it("credits the kill to whoever fired the shot that did it", () => {
    const h = unit(1, "human", 2, 10);
    const a = unit(9, "alien", 4, 10, 6);
    a.health = 1;
    a.weapon = null;
    const b = new Battle(openMap(), [h, a], 1);
    for (let i = 0; i < 4 && a.health > 0; i++) {
      h.tu = 60;
      b.shoot(1, { x: a.x, y: a.y }, "snap");
    }
    expect(a.health).toBe(0);
    expect(h.deeds!.kills).toBe(1);
    expect(h.deeds!.damageDealt).toBe(1);
  });

  it("survives a rewind with the rest of the fight", () => {
    const h = unit(1, "human", 2, 10);
    const b = new Battle(openMap(), [h, unit(9, "alien", 18, 18, 6)], 3);
    const snap = b.snapshot();
    b.move(1, { x: 6, y: 10 });
    expect(h.deeds!.tiles).toBe(4);
    b.restore(snap, 5);
    expect(h.deeds!.tiles).toBe(0);
  });

  it("adds fights together, keeping the best of the longest hit", () => {
    const t = addDeeds(emptyDeeds(), { hits: 2, longest: 9 });
    addDeeds(t, { hits: 1, longest: 4 });
    expect(t.hits).toBe(3);
    expect(t.longest).toBe(9);
  });
});

describe("service records", () => {
  function camp(): Campaign {
    const c = new Campaign();
    c.rand = () => 0.99;
    c.enlist([person("A"), person("B")]);
    c.found(LONDON, true);
    return c;
  }

  it("starts one for everyone, and counts days on each job", () => {
    const c = camp();
    c.setJob(c.staff[0].id, "research");
    c.setResearch("debrief");
    c.advanceDays(3);
    const r = c.rec(c.staff[0]);
    expect(r.days.research).toBe(3);
    expect(r.research).toBeGreaterThan(0);
    expect(recordLines(r, c.day).join(" ")).toContain("3 days on research");
  });

  it("adds a fight to everyone on the team, and remembers the dead", () => {
    const c = camp();
    const [a, b] = c.staff;
    const run = c.startRun("hardware", [a.id, b.id], 2);
    run.ambush = true;
    c.resolveAmbush({
      outcome: "killed",
      recovered: ["Alien corpse"],
      people: [{ id: a.id, health: 20 }],
      deeds: [
        { id: a.id, deeds: { ...emptyDeeds(), kills: 1, hits: 2, rounds: 5 } },
        { id: b.id, deeds: { ...emptyDeeds(), tiles: 12 } },
      ],
    });
    expect(c.rec(a).fights).toBe(1);
    expect(c.rec(a).won).toBe(1);
    expect(c.rec(a).deeds.kills).toBe(1);
    expect(c.gone).toHaveLength(1);
    expect(c.gone[0]).toMatchObject({ name: b.name, died: true });
    expect(c.gone[0].record.deeds.tiles).toBe(12);
  });

  it("keeps records and the roll of the gone through a save, and gives old saves clean records", () => {
    const c = camp();
    c.rec(c.staff[0]).deeds.kills = 2;
    c.gone.push({ id: 99, name: "Z", role: "Nurse", day: 1, died: true, how: "Killed", record: c.rec(c.staff[1]) });
    const data = JSON.parse(JSON.stringify(c.save()));
    const back = Campaign.load(data);
    expect(back.rec(back.staff[0]).deeds.kills).toBe(2);
    expect(back.gone[0].name).toBe("Z");
    delete data.gone;
    for (const p of data.staff) delete p.record;
    const old = Campaign.load(data);
    expect(old.gone).toHaveLength(0);
    expect(old.staff[0].record!.fights).toBe(0);
    expect(old.staff[0].record!.deeds.kills).toBe(0);
  });

  it("puts the first night on the survivors' records and remembers those who didn't make it", () => {
    const c = new Campaign();
    c.recordPrologue({ city: "Lagos", outcome: "killed", recovered: [], survivors: 1, turns: 6 });
    c.enlist([{ ...person("A"), deeds: { ...emptyDeeds(), kills: 1 } }], [{ name: "B", role: "Paramedic", deeds: emptyDeeds() }]);
    const r = c.rec(c.staff[0]);
    expect(r).toMatchObject({ fights: 1, won: 1, how: "Walked out of Lagos on the first night" });
    expect(r.deeds.kills).toBe(1);
    expect(c.gone[0]).toMatchObject({ name: "B", died: true, how: "Killed in Lagos on the first night" });
  });
});

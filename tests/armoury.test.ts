import { describe, expect, it } from "vitest";
import { Kit, Quarters, arrivalKit, defaultRequest, emptyStores, fightKit, kitAfter, kitWarnings, noKit, outfit } from "../src/armoury";
import { Campaign } from "../src/campaign";
import { CITIES } from "../src/geoscape/cities";
import { Battle, Unit } from "../src/tactical/battle";
import { TacMap } from "../src/tactical/map";
import { startAmbush } from "../src/tactical/prologue";
import { HEAT_MAX, RELOAD_PCT, WEAPONS, tuCost } from "../src/tactical/rules";

const LONDON = { lat: 51.51, lon: -0.13 };

function quarters(over: Partial<Quarters> = {}): Quarters {
  return { stores: emptyStores(), ammo: 0, loose: 0, medicine: 0, researched: [], ...over };
}

const person = (name: string, role = "Builder", kit?: Kit) => ({
  name,
  role,
  stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
  health: 30,
  aptitude: 1,
  build: 1,
  kit,
});

function camp(roll = 0.99, people = [person("A"), person("B")]): Campaign {
  const c = new Campaign();
  c.rand = () => roll;
  c.supplies.ammo = 0;
  c.enlist(people);
  c.found(LONDON, true);
  return c;
}

describe("loadout requests", () => {
  it("gives each kind of person a sensible default", () => {
    expect(defaultRequest("Soldier")).toMatchObject({ gun: "rifle", clips: 3, armour: true });
    expect(defaultRequest("Nurse")).toMatchObject({ gun: "pistol", medkit: true });
    expect(defaultRequest("Police officer")).toMatchObject({ gun: "pistol", baton: true });
    expect(defaultRequest("Teacher")).toMatchObject({ gun: "best", clips: 2, armour: true });
  });

  it("brings soldiers in armed and nurses with a medikit, and drifters with nothing", () => {
    expect(arrivalKit("Soldier", () => 0.5)).toMatchObject({ gun: "rifle", loaded: 20, clips: 2 });
    expect(arrivalKit("Nurse", () => 0.5).medkit).toBe(4);
    expect(arrivalKit("Drifter", () => 0)).toEqual(noKit());
  });

  it("fills a request from the stores, best gun first, and loads it", () => {
    const q = quarters({ ammo: 5 });
    q.stores.pistol = 1;
    q.stores.rifle = 1;
    q.stores.stabVest = 1;
    q.stores.bodyArmour = 1;
    const k = noKit();
    outfit(k, defaultRequest("Teacher"), q);
    expect(k).toMatchObject({ gun: "rifle", loaded: 20, clips: 2, armour: "bodyArmour" });
    expect(q.ammo).toBe(2);
    expect(q.stores).toMatchObject({ rifle: 0, pistol: 1, bodyArmour: 0, stabVest: 1 });
  });

  it("swaps a part-used magazine at home without wasting the rounds", () => {
    const q = quarters({ ammo: 1 });
    const k: Kit = { ...noKit(), gun: "rifle", loaded: 10, clips: 0 };
    outfit(k, { ...defaultRequest("Teacher"), clips: 0 }, q);
    expect(k.loaded).toBe(20);
    expect(q.ammo).toBe(0);
    expect(q.loose).toBeCloseTo(0.5);
    // Another half clip makes a whole one again.
    const k2: Kit = { ...noKit(), gun: "pistol", loaded: 6, clips: 0 };
    outfit(k2, { ...defaultRequest("Teacher"), gun: "none", clips: 0 }, q);
    expect(k2.gun).toBeNull();
    expect(q.ammo).toBe(1);
    expect(q.stores.pistol).toBe(1);
  });

  it("won't hand out an alien gun until it's been researched, then needs no clips", () => {
    const q = quarters({ ammo: 3 });
    q.stores.plasmaPistol = 1;
    const k: Kit = { ...noKit(), gun: "pistol", loaded: 12 };
    outfit(k, defaultRequest("Teacher"), q);
    expect(k.gun).toBe("pistol");
    q.researched = ["plasmaPistol"];
    outfit(k, defaultRequest("Teacher"), q);
    expect(k.gun).toBe("plasmaPistol");
    // Its spare clips and the rounds left in the pistol go back in the stores.
    expect(k.clips).toBe(0);
    expect(q.ammo).toBe(4);
  });

  it("warns about no gun, no ammo and better armour left on the shelf", () => {
    const q = quarters();
    expect(kitWarnings(noKit(), defaultRequest("Teacher"), q)).toContain("No gun: none in the stores");
    expect(kitWarnings({ ...noKit(), gun: "pistol" }, defaultRequest("Teacher"), q)).toContain("No ammo");
    q.stores.bodyArmour = 1;
    const vest: Kit = { ...noKit(), gun: "pistol", loaded: 12, clips: 2, armour: "stabVest" };
    expect(kitWarnings(vest, { ...defaultRequest("Teacher"), armour: false }, q)).toContain("Body armour in the stores, not worn");
    expect(kitWarnings({ ...vest, clips: 1 }, defaultRequest("Teacher"), quarters())).toContain("Only 1 of 2 spare clips");
  });
});

function unit(id: number, side: "human" | "alien", x: number, y: number): Unit {
  const stats = { tu: 60, health: 40, bravery: 100, reactions: 50, accuracy: 60, melee: 70, armour: 0 };
  return {
    id, side, name: `U${id}`, role: "Test", stats, x, y, facing: 2,
    tu: 60, health: 40, stun: 0, morale: 100, wounds: 0, kneeling: false,
    weapon: side === "alien" ? WEAPONS.plasmaPistol : WEAPONS.rifle, ammo: 20, tools: [], revealed: false,
  };
}

function field(): TacMap {
  const m = new TacMap(30, 10);
  m.lit.fill(1);
  return m;
}

describe("reloading and heat", () => {
  it("reloads from a spare clip, dropping what was left", () => {
    const h = { ...unit(1, "human", 2, 5), ammo: 3, clips: 1 };
    const b = new Battle(field(), [h, unit(2, "alien", 27, 5)], 1);
    const me = b.unit(1);
    expect(b.previewReload(1).reason).toBeNull();
    b.reload(1);
    expect(me.ammo).toBe(20);
    expect(me.clips).toBe(0);
    expect(me.tu).toBe(60 - tuCost(60, RELOAD_PCT));
    expect(b.previewReload(1).reason).toBe("No spare clips");
    me.clips = 1;
    expect(b.previewReload(1).reason).toBe("Already full");
    me.ammo = 0;
    me.clips = 0;
    expect(b.previewShot(1, { x: 27, y: 5 }, "snap").reason).toBe("Out of ammo");
  });

  it("shuts an energy weapon down when it's fired too fast, until it cools", () => {
    const h = { ...unit(1, "human", 2, 5), weapon: WEAPONS.plasmaPistol, ammo: 99, stats: { ...unit(1, "human", 0, 0).stats, tu: 200 } };
    h.tu = 200;
    const b = new Battle(field(), [h, { ...unit(2, "alien", 9, 5), health: 999, stats: { ...unit(2, "alien", 0, 0).stats, health: 999 } }], 3);
    const me = b.unit(1);
    for (let i = 0; i < 3; i++) b.shoot(1, { x: 9, y: 5 }, "snap");
    expect(me.heat).toBeGreaterThanOrEqual(HEAT_MAX);
    expect(me.overheated).toBe(true);
    expect(me.ammo).toBe(99);
    expect(b.previewShot(1, { x: 9, y: 5 }, "snap").reason).toMatch(/Overheated/);
    b.endTurn();
    b.endTurn();
    if (me.health > 0) expect(me.overheated).toBe(false);
  });

  it("leaves the aliens' own guns alone", () => {
    const a = unit(2, "alien", 9, 5);
    const b = new Battle(field(), [unit(1, "human", 2, 5), a], 3);
    expect(b.unit(2).heat ?? 0).toBe(0);
    b.endTurn();
    expect(b.unit(2).overheated).toBeFalsy();
  });
});

describe("kit in the campaign", () => {
  it("takes what people carry into a fight, armour included", () => {
    const c = camp(0.99, [person("A")]);
    c.staff[0].kit = { ...noKit(), gun: "shotgun", loaded: 5, clips: 1, armour: "stabVest" };
    const fight = startAmbush(CITIES.find((x) => x.name === "London")!, 5, c.staff, "Supermarkets");
    const u = fight.battle.humans[0];
    expect(u.weapon?.id).toBe("shotgun");
    expect(u.ammo).toBe(5);
    expect(u.clips).toBe(1);
    expect(u.stats.armour).toBe(4);
    expect(kitAfter(c.staff[0].kit!, { ...u, ammo: 2, clips: 0 })).toMatchObject({ gun: "shotgun", loaded: 2, clips: 0, armour: "stabVest" });
    expect(fightKit(noKit()).weapon).toBeNull();
  });

  it("sorts arms off a police station run into the armoury", () => {
    const c = camp(0.01);
    c.rand = () => 0.01;
    const station = c.places.find((p) => p.kind === "police")!;
    c.rand = () => 0.99;
    c.startRun(station.id, [c.staff[0].id], 1);
    c.advanceDays(1);
    const guns = c.armoury.pistol + c.armoury.shotgun + c.armoury.rifle + c.armoury.stabVest + c.armoury.bodyArmour + c.armoury.stunBaton;
    const carried = c.staff.filter((p) => p.kit?.gun || p.kit?.armour).length;
    expect(guns + carried).toBeGreaterThan(0);
    expect(c.supplies.arms).toBe(0);
    expect(c.news.some((n) => /Back from .*Police station/.test(n))).toBe(true);
  });

  it("brings the dead's kit home from a win, and an alien gun goes on the shelf without counting as a kill", () => {
    const c = camp(0.99, [person("A", "Builder", { ...noKit(), gun: "rifle", loaded: 20 }), person("B")]);
    const run = c.startRun("homes", c.staff.map((p) => p.id), 1);
    run.ambush = true;
    const [a] = c.staff;
    c.resolveAmbush({ outcome: "killed", recovered: ["Alien corpse", "Plasma pistol"], people: [{ id: a.id, health: 10, kit: { ...a.kit!, loaded: 4 } }] });
    expect(c.kills).toBe(1);
    expect(c.armoury.plasmaPistol).toBe(1);
    expect(c.trophies).toContain("Plasma pistol");
    expect(c.staff).toHaveLength(1);
    // B's pistol came home; the survivor's rifle got topped up from what was left.
    expect(c.armoury.pistol).toBe(1);
  });

  it("restocks a used medikit at home for a unit of medicine", () => {
    const c = camp(0.99, [person("N", "Nurse", { ...noKit(), medkit: 1 })]);
    c.supplies.medicine = 2;
    c.advanceDays(1);
    expect(c.staff[0].kit!.medkit).toBe(4);
    expect(c.supplies.medicine).toBe(1);
  });

  it("gives people in older saves the kit their old job gave them, and a police station to raid", () => {
    const c = camp();
    const data = JSON.parse(JSON.stringify(c.save()));
    delete data.armoury;
    for (const p of data.staff) delete p.kit;
    data.places = data.places.filter((p: { kind: string }) => p.kind !== "police");
    const copy = Campaign.load(data);
    expect(copy.staff.every((p) => p.kit?.gun === "pistol")).toBe(true);
    expect(copy.places.some((p) => p.kind === "police")).toBe(true);
  });
});

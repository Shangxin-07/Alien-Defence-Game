import { describe, expect, it } from "vitest";
import { Campaign } from "../src/campaign/campaign";
import { GEAR, fightKit, noKit } from "../src/campaign/armoury";
import { FAMILIES, LEVELS, Lab, PROJECTS, Project, ResearchState, blocker, familyOf, leadsTo, needs, project } from "../src/campaign/tech";

const LONDON = { lat: 51.51, lon: -0.13 };
const fresh = (): ResearchState => ({ active: null, progress: {}, done: [] });
const lab = (over: Partial<Lab> = {}): Lab => ({ recovered: [], containment: false, labs: 0, stores: {}, ...over });

describe("the tech tree", () => {
  it("is all one tree: every prerequisite exists, and nothing waits on itself", () => {
    const ids = new Set(PROJECTS.map((p) => p.id));
    expect(ids.size).toBe(PROJECTS.length);
    for (const p of PROJECTS) for (const a of [...(p.after ?? []), ...(p.allOf ?? [])]) expect(ids.has(a), `${p.id} needs ${a}`).toBe(true);
    const deep = (id: string, seen: string[]): void => {
      expect(seen, `cycle through ${id}`).not.toContain(id);
      const p = project(id);
      for (const a of [...(p.after ?? []), ...(p.allOf ?? [])]) deep(a, [...seen, id]);
    };
    for (const p of PROJECTS) deep(p.id, []);
  });

  it("has something at each of the nine levels, in the right family", () => {
    for (const f of FAMILIES) for (const l of f.levels) {
      expect(PROJECTS.some((p) => p.level === l), l).toBe(true);
      expect(familyOf(l)).toBe(f.id);
      expect(LEVELS[l].name).toBeTruthy();
    }
  });

  it("keeps the deep alien work big: a month or more for a small team", () => {
    for (const p of PROJECTS.filter((p) => p.level === "A2" || p.level === "A3")) expect(p.points).toBeGreaterThanOrEqual(100);
  });

  it("needs all of an all-of list, and any one of an after list", () => {
    const carbine = project("cellCarbine");
    const r = fresh();
    expect(blocker({ ...carbine, planned: false }, r, lab({ labs: 1 }))).toMatch(/plasma pistol and alien alloys/);
    r.done.push("plasmaPistol");
    expect(blocker({ ...carbine, planned: false }, r, lab({ labs: 1 }))).toBe("After alien alloys");
    r.done.push("alloys");
    expect(blocker({ ...carbine, planned: false }, r, lab({ labs: 1 }))).toBeNull();
    expect(blocker(project("biology"), { ...fresh(), done: ["interrogation"] }, lab())).toBeNull();
  });

  it("won't start anything that isn't in the game yet", () => {
    expect(blocker(project("pipeBombs"), fresh(), lab())).toBe("Not in the game yet");
  });

  it("needs working labs for the deeper rungs", () => {
    const vent = project("ventPistol");
    const r: ResearchState = { ...fresh(), done: ["plasmaPistol"] };
    const ready = lab({ recovered: ["Live alien"], containment: true });
    expect(blocker(vent, r, { ...ready, labs: 1 })).toBe("Needs 2 working labs");
    expect(blocker(vent, r, { ...ready, labs: 2 })).toBeNull();
    expect(needs(vent)).toMatch(/2 labs/);
  });

  it("knows what each project leads to", () => {
    expect(leadsTo("alloys").map((p) => p.id)).toEqual(expect.arrayContaining(["alloyRounds", "alloyArmour", "cellCarbine"]));
  });
});

describe("research in the campaign", () => {
  const person = () => ({
    name: "A",
    role: "Test",
    stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
    health: 30,
    aptitude: 1,
    build: 1,
  });

  it("brings home alloy from the crash site", () => {
    const c = new Campaign();
    c.enlist([person()]);
    c.found(LONDON, true);
    c.research.done.push("debrief");
    c.setResearch("crashSite");
    c.advanceDays(30);
    expect(c.research.done).toContain("crashSite");
    expect(c.supplies.alloy).toBe(3);
  });

  it("shows the whole tree, but only lists what can come into the game", () => {
    const c = new Campaign();
    expect(c.tree()).toHaveLength(PROJECTS.length);
    expect(c.projects().some((p) => p.project.planned)).toBe(false);
  });

  it("counts working labs across bases", () => {
    const c = new Campaign();
    c.enlist([person()]);
    const b = c.found(LONDON, true);
    expect(c.labs).toBe(0);
    // Two working labs' worth of science space.
    const stats = b.layout.stats.bind(b.layout);
    b.layout.stats = () => {
      const s = stats();
      return { ...s, capacity: { ...s.capacity, science: 100 } };
    };
    expect(c.labs).toBe(2);
  });

  it("takes a gun apart for good when reverse-engineering starts, and only once", () => {
    const fake: Project = { id: "testCopy", name: "Copy it", level: "A1", kind: "reverse", points: 5, consumes: "plasmaPistol", blurb: "", gives: "", result: "" };
    PROJECTS.push(fake);
    try {
      const c = new Campaign();
      expect(() => c.setResearch("testCopy")).toThrow();
      c.armoury.plasmaPistol = 1;
      c.setResearch("testCopy");
      expect(c.armoury.plasmaPistol).toBe(0);
      c.setResearch(null);
      // Picking it up again doesn't need another one.
      c.setResearch("testCopy");
      expect(c.research.stripped).toEqual(["testCopy"]);
    } finally {
      PROJECTS.pop();
    }
  });

  it("vents a captured gun once its project is done: a third less heat a shot", () => {
    const c = new Campaign();
    expect(c.vented()).toEqual([]);
    c.research.done.push("ventPistol");
    expect(c.vented()).toEqual(["plasmaPistol"]);
    const kit = { ...noKit(), gun: "plasmaPistol" as const };
    const plain = fightKit(kit).weapon!.heat!.shot;
    const vented = fightKit(kit, c.vented()).weapon!;
    expect(plain).toBe(GEAR.plasmaPistol.weapon!.heat!.shot);
    expect(vented.heat!.shot).toBe(Math.round(plain * (2 / 3)));
    expect(vented.id).toBe("plasmaPistol");
    // Venting one gun doesn't touch the others.
    expect(fightKit({ ...kit, gun: "needleRifle" }, c.vented()).weapon!.heat!.shot).toBe(GEAR.needleRifle.weapon!.heat!.shot);
  });

  it("cuts alloy off Brutes and takes cells off leaders", () => {
    const c = new Campaign();
    (c as unknown as { salvage(i: string[], g: number, r?: string): void }).salvage(["Alien corpse", "Commander corpse", "Plasma scattergun"], 1, "brute");
    expect(c.supplies.alloy).toBe(4);
    expect(c.supplies.cells).toBe(1);
  });
});

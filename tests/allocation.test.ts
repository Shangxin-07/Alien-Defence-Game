import { describe, expect, it } from "vitest";
import { dutyClash, dutyOf, holdOf } from "../src/campaign/allocation";
import { Campaign } from "../src/campaign/campaign";
import { rollCall } from "../src/campaign/sightings";

const LONDON = { lat: 51.51, lon: -0.13 };

const person = (name: string) => ({
  name,
  role: "Army reservist",
  stats: { tu: 50, health: 30, bravery: 50, reactions: 50, accuracy: 50, melee: 50, armour: 0 },
  health: 30,
  aptitude: 1,
  build: 1,
});

/** Three people in a London base: A on research, B and C building. */
function camp() {
  const c = new Campaign();
  c.rand = () => 0.99;
  c.enlist([person("A"), person("B"), person("C")]);
  c.found(LONDON, true);
  c.supplies.food = 500;
  const [a, b, cc] = c.staff;
  return { c, a, b, cc };
}

describe("unit allocation", () => {
  it("leaves everyone free to go anywhere by default", () => {
    const { c, a } = camp();
    expect(holdOf(a)).toBe("any");
    expect(dutyClash(a, "scavenge")).toBeNull();
    expect(c.checkRun("homes", [a.id], 1)).toBeNull();
    expect(c.dutyWarnings("homes", [a.id])).toEqual([]);
  });

  it("counts each kind of run as a duty", () => {
    expect(dutyOf("homes")).toBe("scavenge");
    expect(dutyOf("police")).toBe("scavenge");
    expect(dutyOf("search")).toBe("search");
    expect(dutyOf("streets")).toBe("recruit");
    expect(dutyOf("sighting")).toBe("hunt");
    expect(dutyOf("garage")).toBe("garage");
  });

  it("warns, but still sends, someone with a preference elsewhere", () => {
    const { c, a } = camp();
    c.allocate(a.id, ["research"], "prefer");
    expect(holdOf(a)).toBe("prefer");
    expect(c.checkRun("homes", [a.id], 1)).toBeNull();
    expect(c.dutyWarnings("homes", [a.id])).toEqual(["A is meant for research"]);
    c.startRun("homes", [a.id], 1);
    expect(a.away).toBeDefined();
  });

  it("refuses to send someone locked to other work", () => {
    const { c, a, b } = camp();
    c.allocate(a.id, ["research"], "lock");
    expect(c.checkRun("homes", [b.id, a.id], 1)).toBe("A is locked to research");
    expect(() => c.startRun("homes", [a.id], 1)).toThrow("locked");
    expect(() => c.startRecruiting([a.id], 1)).toThrow("locked");
    c.calls.push({ ...rollCall(99, c.bases[0].id, c.time, () => 0.5), km: 5 });
    expect(c.checkResponse(99, [a.id], "foot")).toBe("A is locked to research");
    // Someone locked to the job is sent without a word.
    c.allocate(b.id, ["scavenge", "hunt"], "lock");
    expect(c.checkRun("homes", [b.id], 1)).toBeNull();
    expect(c.dutyWarnings("homes", [b.id])).toEqual([]);
  });

  it("keeps a locked person's job at home inside the lock", () => {
    const { c, b, cc } = camp();
    expect(b.job).toBe("construction");
    c.allocate(b.id, ["scavenge"], "lock");
    expect(b.job).toBe("rest");
    expect(() => c.setJob(b.id, "construction")).toThrow("locked");
    c.setJob(b.id, "rest");
    c.allocate(cc.id, ["scavenge", "research"], "lock");
    expect(cc.job).toBe("research");
    // A preference only warns, so the job stays and can be changed.
    c.allocate(b.id, ["scavenge"], "prefer");
    c.setJob(b.id, "construction");
    expect(b.job).toBe("construction");
  });

  it("takes the builders a lock moves off construction out of the crew", () => {
    const { c, b } = camp();
    const crew = () => c.builders(c.bases[0].id).map((x) => x.id);
    expect(crew()).toContain(b.id);
    c.allocate(b.id, ["hunt"], "lock");
    expect(crew()).not.toContain(b.id);
  });

  it("clears back to any job, and survives a save", () => {
    const { c, a, b } = camp();
    c.allocate(a.id, ["research", "research"], "lock");
    c.allocate(b.id, ["garage"], "prefer");
    const loaded = Campaign.load(JSON.parse(JSON.stringify(c.save())));
    expect(loaded.staff[0].duties).toEqual(["research"]);
    expect(holdOf(loaded.staff[0])).toBe("lock");
    expect(holdOf(loaded.staff[1])).toBe("prefer");
    c.allocate(a.id, [], "lock");
    expect(holdOf(a)).toBe("any");
    expect(a.locked).toBeUndefined();
  });
});

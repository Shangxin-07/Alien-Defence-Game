import { describe, expect, it } from "vitest";
import { FACES, alienPortrait, assignFaces, faceGender } from "../src/tactical/portraits";
import type { Gender } from "../src/tactical/gender";

const person = (id: number, name: string, role: string, gender?: Gender) => ({ id, name, role, gender });

describe("portraits", () => {
  it("gives each person in a squad a different face that suits their job", () => {
    const squad = [person(1, "Ana Okafor", "Police officer"), person(2, "Ben Sato", "Police officer"), person(3, "Kofi Park", "Paramedic"), person(4, "Lena Weber", "Teacher")];
    const faces = assignFaces(squad);
    expect(new Set(faces.values()).size).toBe(4);
    expect([FACES[0], FACES[1]]).toContain(faces.get(1));
    expect([FACES[0], FACES[1]]).toContain(faces.get(2));
    expect([FACES[6], FACES[7]]).toContain(faces.get(3));
    expect(FACES.slice(8)).toContain(faces.get(4));
  });

  it("always matches a person's gender, even past the faces there are", () => {
    const roles = ["Police officer", "Army reservist", "Security guard", "Paramedic", "Builder", "Mechanic", "Drifter"];
    for (const g of ["female", "male"] as const) {
      const squad = Array.from({ length: 9 }, (_, i) => person(i, `Name ${i}`, roles[i % roles.length], g));
      const faces = assignFaces(squad);
      for (const f of faces.values()) expect(faceGender(f)).toBe(g);
      expect(new Set(faces.values()).size).toBe(6);
    }
  });

  it("keeps the same face for a person from fight to fight", () => {
    const a = assignFaces([person(1, "Mateo Silva", "Builder")]);
    const b = assignFaces([person(9, "Mateo Silva", "Builder")]);
    expect(b.get(9)).toBe(a.get(1));
  });

  it("still gives everyone a face when there are more people than faces", () => {
    const crowd = Array.from({ length: 15 }, (_, i) => person(i, `Person ${i}`, "Drifter"));
    const faces = assignFaces(crowd);
    expect(faces.size).toBe(15);
    expect(new Set(faces.values()).size).toBe(FACES.length);
  });

  it("shows a commander for a squad leader", () => {
    const plain = alienPortrait({ mind: { race: "brute", rank: "soldier" } as never });
    const leader = alienPortrait({ mind: { race: "brute", rank: "leader" } as never });
    expect(plain).not.toBe(leader);
    expect(alienPortrait({})).toBe(alienPortrait({ mind: { race: "strider", rank: "lone" } as never }));
  });
});

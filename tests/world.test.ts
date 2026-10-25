import { describe, expect, it } from "vitest";
import { BIOMES, BIOME_ORDER, biomeAt } from "../src/geoscape/biomes";
import { BLOCS, BORDER_LINES, blocAt } from "../src/geoscape/blocs";
import { CITIES } from "../src/geoscape/cities";

describe("biomes", () => {
  it.each([
    ["central Sahara", 24, 10, "desert"],
    ["Amazon", -4, -62, "jungle"],
    ["Congo basin", 0, 22, "jungle"],
    ["Tibet", 32, 88, "mountain"],
    ["Andes", -15, -71, "mountain"],
    ["Siberian taiga", 60, 100, "boreal"],
    ["northern Canada", 66, -100, "tundra"],
    ["Antarctica", -80, 0, "ice"],
    ["Greenland", 72, -40, "ice"],
    ["Kazakh steppe", 49, 68, "grassland"],
    ["Serengeti", -3, 35, "savanna"],
    ["northern France", 49, 2, "temperate"],
  ] as const)("%s is %s", (_, lat, lon, expected) => {
    expect(biomeAt(lat, lon)).toBe(expected);
  });

  it("lists every biome once in the key order", () => {
    expect([...BIOME_ORDER].sort()).toEqual(Object.keys(BIOMES).sort());
  });
});

describe("blocs", () => {
  it.each([
    ["Paris", 48.86, 2.35, "euf"],
    ["Kyiv", 50.45, 30.52, "euf"],
    ["Moscow", 55.76, 37.62, "eau"],
    ["Tokyo", 35.68, 139.69, "pra"],
    ["Beijing", 39.9, 116.4, "cdr"],
    ["Chicago", 41.88, -87.63, "nau"],
    ["Mexico City", 19.43, -99.13, "caf"],
    ["São Paulo", -23.55, -46.63, "scr"],
    ["Lagos", 6.52, 3.38, "wac"],
    ["Sydney", -33.87, 151.21, "ocw"],
  ] as const)("%s belongs to %s", (_, lat, lon, id) => {
    expect(blocAt(lat, lon)?.id).toBe(id);
  });

  it("leaves open ocean and Antarctica unclaimed", () => {
    expect(blocAt(-30, -30)).toBeNull();
    expect(blocAt(-82, 40)).toBeNull();
  });

  it("has sixteen blocs, each with a name and land borders between them", () => {
    expect(BLOCS).toHaveLength(16);
    expect(new Set(BLOCS.map((b) => b.id)).size).toBe(16);
    expect(BORDER_LINES.length).toBeGreaterThan(20);
  });

  it("places every major city inside a bloc", () => {
    const stray = CITIES.filter((c) => !blocAt(c.lat, c.lon)).map((c) => c.name);
    expect(stray).toEqual([]);
  });
});

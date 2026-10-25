import { describe, expect, it } from "vitest";
import { latLonToVector, lightingAt, subsolarPoint, sunElevation, vectorToLatLon, formatLatLon } from "../src/geoscape/geo";
import { GameClock, formatClock } from "../src/geoscape/clock";

describe("lat/lon conversion", () => {
  it("round-trips points across the globe", () => {
    for (const [lat, lon] of [[0, 0], [51.5, -0.13], [-33.9, 151.2], [64.1, -21.9], [-77.8, 166.7]]) {
      const back = vectorToLatLon(latLonToVector(lat, lon));
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lon).toBeCloseTo(lon, 6);
    }
  });

  it("puts 90°E on -Z to match SphereGeometry UVs", () => {
    const v = latLonToVector(0, 90);
    expect(v.z).toBeCloseTo(-1);
    expect(latLonToVector(90, 0).y).toBeCloseTo(1);
  });

  it("formats hemispheres", () => {
    expect(formatLatLon({ lat: -33.9, lon: -70.65 })).toBe("33.90°S 70.65°W");
  });
});

describe("sun position", () => {
  it("is overhead near the prime meridian at noon UTC on the March equinox", () => {
    const s = subsolarPoint(Date.UTC(2031, 2, 20, 12));
    expect(Math.abs(s.lat)).toBeLessThan(1.5);
    expect(s.lon).toBeCloseTo(0, 5);
  });

  it("follows the seasons", () => {
    expect(subsolarPoint(Date.UTC(2031, 5, 21, 12)).lat).toBeGreaterThan(23);
    expect(subsolarPoint(Date.UTC(2031, 11, 21, 12)).lat).toBeLessThan(-23);
  });

  it("gives day in London at noon and night at midnight", () => {
    const london = { lat: 51.5, lon: -0.13 };
    expect(lightingAt(london, Date.UTC(2031, 5, 21, 12))).toBe("day");
    expect(sunElevation(london, Date.UTC(2031, 5, 21, 12))).toBeGreaterThan(55);
    expect(lightingAt(london, Date.UTC(2031, 11, 21, 0))).toBe("night");
  });
});

describe("game clock", () => {
  it("advances by rate × real time", () => {
    const c = new GameClock(Date.UTC(2031, 0, 1), 3600);
    c.tick(2);
    expect(formatClock(c.time)).toEqual({ time: "02:00:00 UTC", date: "WED 01 JAN 2031" });
  });

  it("stands still when paused", () => {
    const c = new GameClock(0, 0);
    c.tick(10);
    expect(c.time).toBe(0);
  });
});

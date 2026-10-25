import { Vector3 } from "three";

export const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Converts latitude/longitude in degrees to a point on a sphere.
 * Matches three.js SphereGeometry's UV layout, so an equirectangular texture lines up:
 * lon 0 is +X, lon 90°E is -Z, the north pole is +Y.
 */
export function latLonToVector(lat: number, lon: number, radius = 1, target = new Vector3()): Vector3 {
  const a = lat * DEG;
  const b = lon * DEG;
  return target.set(radius * Math.cos(a) * Math.cos(b), radius * Math.sin(a), -radius * Math.cos(a) * Math.sin(b));
}

export function vectorToLatLon(v: Vector3): LatLon {
  const n = v.clone().normalize();
  return { lat: Math.asin(n.y) / DEG, lon: Math.atan2(-n.z, n.x) / DEG };
}

export function formatLatLon({ lat, lon }: LatLon): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** Approximate point where the sun is directly overhead at a UTC time (ms). Good to about a degree. */
export function subsolarPoint(utcMs: number): LatLon {
  const d = new Date(utcMs);
  const dayOfYear = (utcMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
  const declination = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let lon = (12 - hours) * 15;
  if (lon <= -180) lon += 360;
  return { lat: declination, lon };
}

/** Sun elevation above the horizon at a site, in degrees. */
export function sunElevation(site: LatLon, utcMs: number): number {
  const s = subsolarPoint(utcMs);
  const dot = latLonToVector(site.lat, site.lon).dot(latLonToVector(s.lat, s.lon));
  return Math.asin(Math.min(1, Math.max(-1, dot))) / DEG;
}

export type Lighting = "day" | "twilight" | "night";

export function lightingAt(site: LatLon, utcMs: number): Lighting {
  const e = sunElevation(site, utcMs);
  if (e > 0) return "day";
  return e > -12 ? "twilight" : "night";
}

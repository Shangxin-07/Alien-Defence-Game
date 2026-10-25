import BLOC_DATA from "../data/blocs.json";

/**
 * The sixteen post-war territorial blocs: the funding nations of the defence project.
 * Geometry comes from scripts/build-geo.mjs; ids must match it.
 */
export interface Bloc {
  id: string;
  name: string;
  /** Where the name label sits on the map. */
  label: { lat: number; lon: number };
}

export const BLOCS: Bloc[] = [
  { id: "nau", name: "North American Union", label: { lat: 52, lon: -100 } },
  { id: "caf", name: "Central American Federation", label: { lat: 21, lon: -95 } },
  { id: "gco", name: "Gran Colombia", label: { lat: 0, lon: -70 } },
  { id: "scr", name: "Southern Cone Republic", label: { lat: -18, lon: -54 } },
  { id: "euf", name: "European Federation", label: { lat: 50, lon: 14 } },
  { id: "eau", name: "Eurasian Union", label: { lat: 60, lon: 90 } },
  { id: "mec", name: "Middle East Compact", label: { lat: 27, lon: 46 } },
  { id: "mnu", name: "Maghreb–Nile Union", label: { lat: 24, lon: 16 } },
  { id: "wac", name: "West African Community", label: { lat: 15, lon: -4 } },
  { id: "eaf", name: "East African Federation", label: { lat: 2, lon: 30 } },
  { id: "sau", name: "Southern African Union", label: { lat: -20, lon: 24 } },
  { id: "inu", name: "Indian Union", label: { lat: 22, lon: 78 } },
  { id: "cdr", name: "Chinese Directorate", label: { lat: 34, lon: 103 } },
  { id: "pra", name: "Pacific Rim Alliance", label: { lat: 37, lon: 138 } },
  { id: "sef", name: "Southeast Asian Federation", label: { lat: 3, lon: 112 } },
  { id: "ocw", name: "Oceania Commonwealth", label: { lat: -26, lon: 134 } },
];

interface Ring {
  pts: number[]; // flat [lon*20, lat*20, ...]
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const data = BLOC_DATA as { blocs: { id: string; polys: number[][][] }[]; borders: number[][] };

/** Smoothed land borders between blocs, as flat [lon*20, lat*20, ...] lines. */
export const BORDER_LINES: number[][] = data.borders;

const shapes = data.blocs.map((b) => ({
  bloc: BLOCS.find((x) => x.id === b.id)!,
  polys: b.polys.map((poly) => poly.map(toRing)),
}));

function toRing(pts: number[]): Ring {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  return { pts, minX, maxX, minY, maxY };
}

function inRing(x: number, y: number, r: Ring): boolean {
  if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) return false;
  const p = r.pts;
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function containing(lat: number, lon: number): Bloc | null {
  const x = lon * 20;
  const y = lat * 20;
  for (const s of shapes) {
    for (const [outer, ...holes] of s.polys) {
      if (inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h))) return s.bloc;
    }
  }
  return null;
}

// Sample offsets for territorial waters, nearest first: about 50 km and 100 km out.
const NEARBY = [0.5, 1].flatMap((r) => Array.from({ length: 8 }, (_, i) => [r * Math.sin((i * Math.PI) / 4), r * Math.cos((i * Math.PI) / 4)]));

/**
 * The bloc that holds a point, including its coastal waters (about 100 km out),
 * or null for open sea, Antarctica and unclaimed land.
 */
export function blocAt(lat: number, lon: number): Bloc | null {
  const exact = containing(lat, lon);
  if (exact) return exact;
  for (const [dLat, dLon] of NEARBY) {
    const b = containing(lat + dLat, lon + dLon / Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    if (b) return b;
  }
  return null;
}

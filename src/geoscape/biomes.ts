/**
 * Terrain biomes. Each one is a tactical map family: when a battle happens, the
 * biome under the crash or landing site picks the tileset and generator.
 *
 * The world map is deliberately stylised: biomes come from latitude bands plus
 * hand-drawn regions (deserts, jungles, grasslands, mountain ranges), with a
 * little noise so edges look natural. Deterministic, so a site's biome never changes.
 */

export type BiomeId = "ice" | "tundra" | "boreal" | "temperate" | "grassland" | "desert" | "savanna" | "jungle" | "mountain";

export interface Biome {
  id: BiomeId;
  name: string;
  /** Map colour on the geoscape. */
  color: string;
  /** What a tactical map in this biome plays like. */
  tactical: string;
}

export const BIOMES: Record<BiomeId, Biome> = {
  ice: { id: "ice", name: "Polar ice", color: "#d5e3e8", tactical: "Open ice and snow. Almost no cover, whiteouts cut sight lines." },
  tundra: { id: "tundra", name: "Tundra", color: "#8c9c88", tactical: "Flat permafrost, rocks and scrub. Long sight lines, little cover." },
  boreal: { id: "boreal", name: "Boreal forest", color: "#2e5844", tactical: "Dense conifer forest and bog. Short sight lines, good cover." },
  temperate: { id: "temperate", name: "Temperate", color: "#4e7a3c", tactical: "Farmland, hedgerows, woods and villages. Mixed cover." },
  grassland: { id: "grassland", name: "Grassland", color: "#8f9b4b", tactical: "Steppe and prairie. Open ground, gullies and farm buildings." },
  desert: { id: "desert", name: "Desert", color: "#c9a35b", tactical: "Dunes and rock. Open ground, heat haze, sparse cover." },
  savanna: { id: "savanna", name: "Savanna", color: "#a08944", tactical: "Tall grass, scattered trees and kopjes. Concealment, little hard cover." },
  jungle: { id: "jungle", name: "Jungle", color: "#1d6a3a", tactical: "Thick rainforest and rivers. Very short sight lines, heavy cover." },
  mountain: { id: "mountain", name: "Mountains", color: "#7f756a", tactical: "Steep slopes, cliffs and passes. Height matters, movement is slow." },
};

export const BIOME_ORDER: BiomeId[] = ["ice", "tundra", "boreal", "temperate", "grassland", "savanna", "desert", "jungle", "mountain"];

type Pt = [number, number]; // [lon, lat]

const DESERTS: Pt[][] = [
  // Sahara
  [[-17, 21], [-16, 28], [-10, 30], [-2, 31], [10, 31.5], [20, 30.5], [30, 30.5], [34, 28], [36, 22], [35, 18], [25, 15.5], [15, 15.5], [5, 16], [-5, 15.5], [-16, 16]],
  // Arabia
  [[34, 29], [39, 32], [47, 31], [48, 29], [51, 25], [56, 24], [59, 22], [56, 18], [52, 17], [45, 14], [42, 16], [38, 22]],
  // Iranian plateau and Baluchistan
  [[50, 34], [56, 36], [62, 35], [66, 31], [68, 26], [62, 25], [57, 27], [52, 29]],
  // Thar
  [[68, 24], [69, 28], [72, 30], [75, 28], [73, 24]],
  // Karakum and Kyzylkum
  [[52, 38], [52, 44], [58, 46], [66, 44], [68, 40], [62, 37], [56, 37]],
  // Taklamakan
  [[75, 37], [77, 41], [84, 42.5], [90, 41], [89, 37], [82, 36.5]],
  // Gobi
  [[93, 41], [98, 44], [106, 45], [113, 44], [112, 41], [104, 38], [97, 39]],
  // Australian interior
  [[115, -22], [122, -19], [132, -18], [139, -20], [141, -26], [139, -30], [132, -32], [124, -31], [118, -28]],
  // Kalahari and Namib
  [[12, -17], [14, -26], [17, -30], [22, -28], [24, -24], [22, -19], [17, -17]],
  // Atacama
  [[-71.5, -17], [-71.5, -28], [-69.5, -28], [-69, -17]],
  // US Southwest and northern Mexico
  [[-120, 36], [-116, 38], [-112, 38], [-108, 33], [-104, 30], [-102, 27], [-106, 24], [-110, 26], [-115, 30], [-117, 32]],
  // Horn of Africa
  [[40, 3], [42, 12], [48, 11.5], [51, 11], [46, 5], [42, -1]],
];

const JUNGLES: Pt[][] = [
  // Amazon
  [[-79, 1], [-76, 6], [-67, 8], [-60, 8], [-52, 5], [-49, 0], [-46, -3], [-50, -7], [-58, -10], [-65, -12], [-72, -11], [-76, -7], [-78, -3]],
  // Congo basin
  [[8, 4], [10, 6], [16, 5], [24, 5], [30, 3], [30, -3], [26, -6], [20, -7], [14, -5], [9, -2]],
  // Guinea coast
  [[-13, 9], [-8, 9], [0, 8], [8, 7], [9, 4], [0, 4.5], [-8, 4], [-13, 7]],
  // Southeast Asia and New Guinea
  [[92, 20], [98, 22], [106, 22], [110, 18], [110, 8], [120, 10], [126, 8], [127, 1], [140, -2], [152, -5], [150, -11], [141, -9], [132, -4], [120, -9], [106, -8], [96, 4], [95, 12]],
  // Philippines
  [[117, 5], [120, 19], [123, 19], [127, 6]],
  // Central America
  [[-92, 16], [-88, 18], [-83, 15], [-77, 9], [-79, 7], [-83, 8], [-88, 13], [-92, 14]],
];

const GRASSLANDS: Pt[][] = [
  // Great Plains
  [[-105, 32], [-105, 50], [-112, 53], [-100, 54], [-96, 50], [-96, 38], [-98, 32]],
  // Pontic and Kazakh steppe
  [[28, 45], [30, 50], [40, 52], [55, 54], [70, 54], [80, 53], [85, 50], [80, 47], [70, 43], [58, 47], [50, 47], [40, 46]],
  // Mongolian steppe
  [[88, 47], [95, 50], [110, 50], [120, 48], [118, 44], [106, 46], [98, 45]],
  // Pampas and Patagonia
  [[-64, -30], [-58, -30], [-56, -36], [-62, -40], [-65, -45], [-68, -52], [-71, -50], [-70, -40], [-66, -34]],
  // Highveld
  [[17, -24], [20, -34], [28, -34], [32, -28], [31, -23], [25, -22]],
  // Anatolia
  [[30, 38], [32, 40], [40, 40], [42, 38], [36, 37]],
];

// Polar ice caps beyond the latitude rule.
const ICE: Pt[][] = [
  // Greenland
  [[-55, 60], [-48, 60.5], [-42, 61], [-36, 65], [-24, 70], [-20, 76], [-18, 81], [-30, 83.5], [-50, 83], [-62, 80], [-68, 77], [-58, 75], [-55, 71], [-52, 66]],
];

const PLATEAUS: Pt[][] = [
  // Tibet and the Himalaya
  [[73, 36], [78, 35.5], [86, 36.5], [96, 36], [102, 34], [103, 29], [99, 26], [94, 27.5], [88, 27], [82, 28.5], [78, 30.5], [74, 33]],
];

// Mountain ranges as ridge lines with a half-width in degrees.
const RANGES: [Pt[], number][] = [
  [[[-150, 62], [-140, 61], [-130, 57], [-123, 52], [-117, 48], [-112, 44], [-109, 40], [-106, 36], [-105, 32]], 3], // Rockies
  [[[-74, 11], [-76, 5], [-78, 0], [-78, -6], [-74, -13], [-69, -17], [-68, -23], [-69, -30], [-70, -36], [-71, -42], [-73, -48], [-73, -53]], 2], // Andes
  [[[-108, 30], [-104, 24], [-100, 20], [-97, 17]], 1.5], // Sierra Madre
  [[[-85, 34], [-80, 37], [-77, 40], [-73, 43], [-69, 46]], 1], // Appalachians
  [[[6, 44], [7, 46], [10, 46.5], [13, 47], [16, 47]], 1], // Alps
  [[[-2, 43], [3, 42.5]], 0.6], // Pyrenees
  [[[18, 49.5], [23, 48.5], [26, 46], [23, 45.5]], 0.8], // Carpathians
  [[[38, 44.5], [44, 43], [49, 41]], 1], // Caucasus
  [[[44, 37.5], [48, 34], [53, 30], [57, 27.5]], 1.4], // Zagros
  [[[62, 34], [68, 35], [73, 37.5], [77, 36]], 1.8], // Hindu Kush and Pamir
  [[[68, 41.5], [76, 42], [82, 43], [90, 43], [95, 43]], 1.5], // Tian Shan
  [[[85, 50], [90, 49], [96, 47]], 1.2], // Altai
  [[[58, 51], [59, 56], [60, 62], [64, 67]], 0.9], // Urals
  [[[6, 59], [9, 62], [14, 65.5], [18, 68.5], [22, 70]], 1.2], // Scandinavian mountains
  [[[-9, 30.5], [-5, 32.5], [0, 34], [5, 35.5], [9, 36]], 1], // Atlas
  [[[37, 8], [39, 11], [39, 14]], 2.5], // Ethiopian highlands
  [[[146, -38], [149, -34], [152, -28], [147, -20], [145, -15]], 0.9], // Great Dividing Range
  [[[137, -4], [142, -5.5], [146, -6.5]], 0.8], // New Guinea highlands
  [[[167, -46], [171, -43], [173, -41]], 0.6], // Southern Alps
  [[[-153, 63], [-147, 63]], 1], // Alaska Range
];

// Bounding boxes let most region tests bail out early: [minLon, minLat, maxLon, maxLat].
type Box = [number, number, number, number];
const boxes = new Map<Pt[], Box>();
function box(pts: Pt[], pad = 0): Box {
  let b = boxes.get(pts);
  if (!b) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    b = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    boxes.set(pts, b);
  }
  return b;
}
const outside = (lon: number, lat: number, b: Box) => lon < b[0] || lat < b[1] || lon > b[2] || lat > b[3];

function inPoly(lon: number, lat: number, poly: Pt[]): boolean {
  if (outside(lon, lat, box(poly))) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearLine(lon: number, lat: number, line: Pt[], width: number): boolean {
  if (outside(lon, lat, box(line, width))) return false;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(lon - ax - t * dx, lat - ay - t * dy) < width) return true;
  }
  return false;
}

// Smooth value noise in [-1, 1], used to wobble region edges.
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * u;
  const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * u;
  return a + (b - a) * v;
}

/** The biome at a point. Ignores whether the point is land; callers check that. */
export function biomeAt(lat: number, lon: number): BiomeId {
  // Wobble the sample point a little so region edges are not straight lines.
  const wLon = lon + 1.6 * noise(lon / 7 + 13, lat / 7) + 0.6 * noise(lon / 2.5, lat / 2.5 + 7);
  const wLat = lat + 1.2 * noise(lon / 7, lat / 7 + 29) + 0.5 * noise(lon / 2.5 + 3, lat / 2.5);
  const any = (polys: Pt[][]) => polys.some((p) => inPoly(wLon, wLat, p));

  if (wLat < -60 || wLat > 79 || any(ICE)) return "ice";
  if (any(PLATEAUS) || RANGES.some(([line, w]) => nearLine(wLon, wLat, line, w))) return "mountain";
  if (any(DESERTS)) return "desert";
  if (any(JUNGLES)) return "jungle";
  if (any(GRASSLANDS)) return "grassland";

  const americas = wLon < -50;
  const europe = wLon >= -30 && wLon < 40;
  if (wLat > 0) {
    const tundraLine = americas ? (wLon < -140 ? 64 : 60) : europe ? 70 : 68;
    const borealLine = americas ? 50 : europe ? 60 : wLon < 120 ? 56 : 50;
    if (wLon > -26 && wLon < -12 && wLat > 62 && wLat < 67) return "tundra"; // Iceland
    if (wLat >= tundraLine) return "tundra";
    if (wLat >= borealLine) return "boreal";
  }

  // Australia below the tropics: scrub inland, green on the south-east coast.
  if (wLon > 112 && wLon < 155 && wLat < -20 && wLat > -45) {
    return wLon > 145 || wLat < -36 ? "temperate" : "grassland";
  }
  if (Math.abs(wLat) < 23) return "savanna";
  return "temperate";
}

import { BiomeId } from "../geoscape/biomes";
import { CoverLook, Point, TacMap, dist } from "./map";
import { mulberry32 } from "./random";

export const CITY_SIZE = 40;
/** Levels in a city: a cellar level, the street, and two floors above it. */
export const CITY_LEVELS = 4;
export const CITY_BOTTOM = -1;
/** First and last row (and column) of the two main roads, pavements included. */
const ROAD_A = 17;
const ROAD_B = 22;

/** How a city looks in each biome. Same street plan, different dressing. */
export interface CityStyle {
  /** Ground between buildings: grass, sand, snow... */
  verge: string;
  road: string;
  pavement: string;
  wall: string;
  floor: string;
  tree: string;
  /** Tree shape on the map. */
  treeShape: "round" | "cone" | "palm";
  /** Chance a verge or park tile grows a tree. */
  trees: number;
  /** Shown in the briefing. */
  blurb: string;
}

export const CITY_STYLES: Record<BiomeId, CityStyle> = {
  ice: { verge: "#c9d6db", road: "#3a4046", pavement: "#6b7378", wall: "#8b939a", floor: "#4a4f55", tree: "#2c4a3c", treeShape: "cone", trees: 0.02, blurb: "Snow banks the streets." },
  tundra: { verge: "#a8b3a6", road: "#383c40", pavement: "#666d70", wall: "#7f8682", floor: "#474b4c", tree: "#2e4a3a", treeShape: "cone", trees: 0.04, blurb: "Frozen mud and dirty snow." },
  boreal: { verge: "#9fb0a6", road: "#363a3e", pavement: "#61686b", wall: "#806f62", floor: "#4a4542", tree: "#1f4434", treeShape: "cone", trees: 0.12, blurb: "Pines crowd the parks." },
  temperate: { verge: "#3d5a32", road: "#33363a", pavement: "#5f6366", wall: "#8a6f5a", floor: "#4b4540", tree: "#2f5a2a", treeShape: "round", trees: 0.1, blurb: "Wet streets and plane trees." },
  grassland: { verge: "#6c7440", road: "#3a3a36", pavement: "#6d6a5e", wall: "#9a8466", floor: "#544c42", tree: "#4a5e2c", treeShape: "round", trees: 0.06, blurb: "Dusty lots and wide roads." },
  savanna: { verge: "#8c7a40", road: "#3c3832", pavement: "#76695a", wall: "#a08060", floor: "#57493d", tree: "#4f5a26", treeShape: "round", trees: 0.07, blurb: "Red dust and acacias." },
  desert: { verge: "#c2a46a", road: "#4a4236", pavement: "#8a7a62", wall: "#b89a72", floor: "#62533f", tree: "#55682e", treeShape: "palm", trees: 0.05, blurb: "Sand drifts against the walls." },
  jungle: { verge: "#2c5a32", road: "#30332f", pavement: "#585c55", wall: "#7c7a62", floor: "#45453a", tree: "#1d5a2c", treeShape: "palm", trees: 0.2, blurb: "Vines and heavy, wet air." },
  mountain: { verge: "#6e6a5e", road: "#34363a", pavement: "#64666a", wall: "#7a7468", floor: "#47443f", tree: "#2f4a34", treeShape: "cone", trees: 0.08, blurb: "Steep streets under the peaks." },
};

export interface CityBattlefield {
  map: TacMap;
  /** Where the survivors are hiding. */
  humanStart: Point[];
  alienStart: Point;
  /** Working street lights, for drawing lamp posts. */
  lights: Point[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a building is, which decides how tall it is and whether it has a cellar. */
type BuildingKind = "block" | "pair" | "office" | "kiosk";

interface Built {
  r: Rect;
  id: number;
  kind: BuildingKind;
}

/**
 * A city crossroads: two main roads with pavements, four blocks around them filled with
 * buildings, alleys, car parks and parks. Deterministic for a seed.
 */
export function buildCity(seed: number, style: CityStyle): CityBattlefield {
  const rand = mulberry32(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const map = new TacMap(CITY_SIZE, CITY_SIZE, CITY_LEVELS, CITY_BOTTOM);
  const N = CITY_SIZE;
  let nextBuilding = 0;

  const set = (x: number, y: number, ground?: TacMap["ground"][number], thing?: TacMap["thing"][number], look?: CoverLook, z = 0) => {
    if (!map.inside(x, y, z)) return;
    const i = map.idx(x, y, z);
    if (ground) map.ground[i] = ground;
    if (thing) map.thing[i] = thing;
    if (look !== undefined) map.look[i] = look;
  };

  // Everything starts as open verge; roads and pavements cut through it.
  map.ground.fill("verge", map.idx(0, 0, 0), map.idx(0, 0, 0) + map.plane);
  for (let a = 0; a < N; a++) {
    for (let r = ROAD_A; r <= ROAD_B; r++) {
      const g = r === ROAD_A || r === ROAD_B ? "pavement" : "road";
      set(a, r, g);
      set(r, a, g);
    }
  }
  for (let r = ROAD_A + 1; r < ROAD_B; r++) for (let c = ROAD_A + 1; c < ROAD_B; c++) set(c, r, "road");

  // A pavement ring round each block.
  const quadrants: Rect[] = [
    { x: 0, y: 0, w: ROAD_A, h: ROAD_A },
    { x: ROAD_B + 1, y: 0, w: N - ROAD_B - 1, h: ROAD_A },
    { x: 0, y: ROAD_B + 1, w: ROAD_A, h: N - ROAD_B - 1 },
    { x: ROAD_B + 1, y: ROAD_B + 1, w: N - ROAD_B - 1, h: N - ROAD_B - 1 },
  ];

  const buildings: Rect[] = [];
  const built: Built[] = [];

  /** Walls round a building's footprint on one level, with its id and lights. */
  function shell(r: Rect, id: number, z: number, lit: boolean) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
        const i = map.idx(x, y, z);
        map.ground[i] = "floor";
        map.thing[i] = edge ? "wall" : "none";
        map.look[i] = null;
        map.building[i] = id;
        if (lit && !edge) map.lit[i] = 1;
      }
    }
    // Windows along the walls, not on corners. Cellars have none.
    if (z < 0) return;
    const walls: Point[] = [];
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) walls.push({ x, y: r.y }, { x, y: r.y + r.h - 1 });
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) walls.push({ x: r.x, y }, { x: r.x + r.w - 1, y });
    for (const p of walls) if ((p.x + p.y + z) % 3 === 0 && rand() < 0.7) set(p.x, p.y, undefined, "window", undefined, z);
  }

  /** Splits a bigger floor into rooms with a gap to walk through. */
  function rooms(r: Rect, z: number) {
    if (r.w >= 9) {
      const cx = r.x + 3 + Math.floor(rand() * (r.w - 6));
      const gap = r.y + 1 + Math.floor(rand() * (r.h - 2));
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) if (y !== gap) set(cx, y, undefined, rand() < 0.15 ? "door" : "wall", undefined, z);
    }
    if (r.h >= 9) {
      const cy = r.y + 3 + Math.floor(rand() * (r.h - 6));
      const gap = r.x + 1 + Math.floor(rand() * (r.w - 2));
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (x === gap || map.thingAt(x, cy, z) !== "none") continue;
        set(x, cy, undefined, "wall", undefined, z);
      }
      // Never seal a room: the crossing wall gets a second gap either side of any split.
      set(r.x + r.w - 2, cy, undefined, "none", undefined, z);
      set(r.x + 1, cy, undefined, "none", undefined, z);
    }
  }

  /** Furniture to hide behind. */
  function furnish(r: Rect, z: number) {
    for (let k = 0; k < Math.floor((r.w * r.h) / 14); k++) {
      const x = r.x + 2 + Math.floor(rand() * Math.max(1, r.w - 4));
      const y = r.y + 2 + Math.floor(rand() * Math.max(1, r.h - 4));
      if (map.thingAt(x, y, z) === "none" && openAround(x, y, z)) set(x, y, undefined, "cover", pick<CoverLook>(["crate", "bench", "crate"]), z);
    }
  }

  function building(r: Rect, doorsTo: ("n" | "s" | "e" | "w")[], kind: BuildingKind) {
    const id = nextBuilding++;
    shell(r, id, 0, rand() < 0.45);
    rooms(r, 0);
    // Doors on the sides facing streets, roughly in the middle, never opening onto an inside wall.
    for (const side of doorsTo) {
      const along = side === "n" || side === "s";
      const span = along ? r.w : r.h;
      for (let attempt = 0; attempt < 12; attempt++) {
        const off = 1 + Math.floor(span / 2 - 1 + (rand() - 0.5) * (span - 4));
        const [p, inner] =
          side === "n"
            ? [{ x: r.x + off, y: r.y }, { x: r.x + off, y: r.y + 1 }]
            : side === "s"
              ? [{ x: r.x + off, y: r.y + r.h - 1 }, { x: r.x + off, y: r.y + r.h - 2 }]
              : side === "w"
                ? [{ x: r.x, y: r.y + off }, { x: r.x + 1, y: r.y + off }]
                : [{ x: r.x + r.w - 1, y: r.y + off }, { x: r.x + r.w - 2, y: r.y + off }];
        if (map.thingAt(inner.x, inner.y) !== "none" && attempt < 11) continue;
        set(p.x, p.y, "floor", "door");
        break;
      }
    }
    furnish(r, 0);
    buildings.push(r);
    built.push({ r, id, kind });
  }

  /**
   * Floors above, a cellar below and a flat roof on top, joined by a stairwell from the lowest level
   * to the roof. The biggest building also has a lift from its cellar to its top floor.
   */
  function raise(b: Built) {
    const { r, id, kind } = b;
    const storeys = kind === "block" ? 3 : kind === "pair" ? (rand() < 0.5 ? 3 : 2) : kind === "office" ? (rand() < 0.5 ? 2 : 1) : 1;
    const cellar = kind === "block" || (kind === "pair" && rand() < 0.4) || (kind === "office" && rand() < 0.3);
    const top = Math.min(map.top, storeys - 1);
    for (let z = 1; z <= top; z++) {
      shell(r, id, z, rand() < 0.45);
      rooms(r, z);
      furnish(r, z);
    }
    if (cellar && map.bottom < 0) {
      shell(r, id, -1, false);
      rooms(r, -1);
      furnish(r, -1);
    }
    // The roof, ringed by a low parapet, if it's under the top of the map.
    const roof = top + 1 <= map.top ? top + 1 : null;
    if (roof !== null) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
          const i = map.idx(x, y, roof);
          map.ground[i] = "roof";
          map.thing[i] = edge ? "cover" : "none";
          map.look[i] = edge ? "parapet" : null;
          map.building[i] = id;
        }
      }
    }
    const low = cellar && map.bottom < 0 ? -1 : 0;
    const high = roof ?? top;
    if (high === low) return;
    const stairs = shaft(r, low, high, "stairs", []);
    if (kind === "block" && top > low && stairs) shaft(r, low, top, "lift", [stairs]);
  }

  /** A stairwell or lift shaft through a building, clear of its doors and away from other shafts. */
  function shaft(r: Rect, low: number, high: number, kind: "stairs" | "lift", avoid: Point[]): Point | null {
    const spots: Point[] = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (map.thingAt(x, y, 0) !== "none" || avoid.some((q) => dist(q, { x, y }) < 3)) continue;
        let byDoor = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let z = low; z <= high; z++) if (map.thingAt(x + dx, y + dy, z) === "door") byDoor = true;
        if (!byDoor) spots.push({ x, y });
      }
    }
    if (!spots.length) return null;
    const p = pick(spots);
    for (let z = low; z <= high; z++) {
      set(p.x, p.y, undefined, kind, undefined, z);
      map.look[map.idx(p.x, p.y, z)] = null;
      // Nothing piled round the landing.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const i = map.idx(p.x + dx, p.y + dy, z);
        if (map.inside(p.x + dx, p.y + dy, z) && map.thing[i] === "cover" && map.look[i] !== "parapet") {
          map.thing[i] = "none";
          map.look[i] = null;
        }
      }
    }
    return p;
  }

  /** Keeps clutter from plugging a doorway or a corridor. */
  function openAround(x: number, y: number, z = 0): boolean {
    let open = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.walkable(x + dx, y + dy, z)) open++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.thingAt(x + dx, y + dy, z) === "door") return false;
    return open >= 3;
  }

  function sidesFacingRoad(q: Rect): ("n" | "s" | "e" | "w")[] {
    const out: ("n" | "s" | "e" | "w")[] = [];
    if (q.y + q.h === ROAD_A) out.push("s");
    if (q.y === ROAD_B + 1) out.push("n");
    if (q.x + q.w === ROAD_A) out.push("e");
    if (q.x === ROAD_B + 1) out.push("w");
    return out;
  }

  const kinds = ["block", "pair", "park", "lot"];
  // Shuffle so every city mixes them differently, but always has one of each.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  // The survivors hide in a building, so their block is never the park.
  if (kinds[0] === "park") [kinds[0], kinds[1]] = [kinds[1], kinds[0]];

  quadrants.forEach((q, qi) => {
    const kind = kinds[qi];
    const face = sidesFacingRoad(q);
    // A one-tile yard strip between the block and the pavement.
    const inner: Rect = { x: q.x + 1, y: q.y + 1, w: q.w - 2, h: q.h - 2 };
    if (kind === "block") {
      building(inner, [...face, pick(["n", "s", "e", "w"] as const)], "block");
    } else if (kind === "pair") {
      const split = 6 + Math.floor(rand() * 4);
      if (rand() < 0.5) {
        building({ x: inner.x, y: inner.y, w: split, h: inner.h }, [...face, "e"], "pair");
        building({ x: inner.x + split + 2, y: inner.y, w: inner.w - split - 2, h: inner.h }, [...face, "w"], "pair");
        for (let y = inner.y; y < inner.y + inner.h; y++) for (const x of [inner.x + split, inner.x + split + 1]) set(x, y, "yard");
      } else {
        building({ x: inner.x, y: inner.y, w: inner.w, h: split }, [...face, "s"], "pair");
        building({ x: inner.x, y: inner.y + split + 2, w: inner.w, h: inner.h - split - 2 }, [...face, "n"], "pair");
        for (let x = inner.x; x < inner.x + inner.w; x++) for (const y of [inner.y + split, inner.y + split + 1]) set(x, y, "yard");
      }
      // Bins down the alley.
      for (let k = 0; k < 3; k++) {
        const x = inner.x + Math.floor(rand() * inner.w);
        const y = inner.y + Math.floor(rand() * inner.h);
        if (map.ground[map.idx(x, y)] === "yard" && map.thingAt(x, y) === "none") set(x, y, undefined, "cover", "bin");
      }
    } else if (kind === "park") {
      for (let y = inner.y; y < inner.y + inner.h; y++) {
        for (let x = inner.x; x < inner.x + inner.w; x++) {
          const path = x === inner.x + (inner.w >> 1) || y === inner.y + (inner.h >> 1);
          set(x, y, path ? "pavement" : "verge");
          if (path) continue;
          const r = rand();
          if (r < style.trees * 2 + 0.06) set(x, y, undefined, "tree");
          else if (r < style.trees * 2 + 0.1) set(x, y, undefined, "cover", pick<CoverLook>(["bench", "planter"]));
        }
      }
      // A kiosk in one corner.
      const kx = rand() < 0.5 ? inner.x + 1 : inner.x + inner.w - 6;
      const ky = rand() < 0.5 ? inner.y + 1 : inner.y + inner.h - 5;
      building({ x: kx, y: ky, w: 5, h: 4 }, [kx < inner.x + 3 ? "e" : "w", ky < inner.y + 3 ? "s" : "n"], "kiosk");
    } else {
      // Car park and a small office at the back.
      for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) set(x, y, "yard");
      const back: Rect = face.includes("s")
        ? { x: inner.x + 2, y: inner.y, w: inner.w - 4, h: 6 }
        : face.includes("n")
          ? { x: inner.x + 2, y: inner.y + inner.h - 6, w: inner.w - 4, h: 6 }
          : { x: inner.x, y: inner.y + 2, w: 6, h: inner.h - 4 };
      const doors = face.includes("s") ? (["s"] as const) : face.includes("n") ? (["n"] as const) : (["e"] as const);
      building(back, [...doors], "office");
      for (let y = inner.y; y < inner.y + inner.h; y += 3) {
        for (let x = inner.x + 1; x < inner.x + inner.w - 1; x += 2) {
          if (map.building[map.idx(x, y)] !== -1 || map.thingAt(x, y) !== "none") continue;
          if (rand() < 0.45) set(x, y, undefined, "cover", rand() < 0.15 ? "wreck" : "car");
        }
      }
    }
  });

  // Cars along the kerbs, a burnt-out wreck and torn-up road where it came down.
  for (let a = 1; a < N - 1; a++) {
    for (const lane of [ROAD_A + 1, ROAD_B - 1]) {
      if (a >= ROAD_A - 1 && a <= ROAD_B + 1) continue;
      if (rand() < 0.16) set(a, lane, undefined, "cover", rand() < 0.2 ? "wreck" : "car");
      if (rand() < 0.16) set(lane, a, undefined, "cover", rand() < 0.2 ? "wreck" : "car");
    }
  }
  const crater = { x: ROAD_A + 2 + Math.floor(rand() * 2), y: ROAD_A + 2 + Math.floor(rand() * 2) };
  for (let y = crater.y - 3; y <= crater.y + 3; y++) {
    for (let x = crater.x - 3; x <= crater.x + 3; x++) {
      if (!map.inside(x, y) || Math.hypot(x - crater.x, y - crater.y) > 3.2) continue;
      if (map.building[map.idx(x, y)] !== -1) continue;
      set(x, y, "rubble");
      if (rand() < 0.15 && map.thingAt(x, y) === "none") set(x, y, undefined, "cover", "wreck");
    }
  }
  // Police barriers abandoned at the junction.
  for (let k = 0; k < 4; k++) {
    const x = ROAD_A + 1 + Math.floor(rand() * 4);
    const y = rand() < 0.5 ? ROAD_A - 1 : ROAD_B + 1;
    if (map.thingAt(x, y) === "none") set(x, y, undefined, "cover", "barrier");
  }
  // Street trees on the pavements and verges.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = map.idx(x, y);
      if (map.thing[i] !== "none" || map.building[i] !== -1) continue;
      if (map.ground[i] === "verge" && rand() < style.trees) map.thing[i] = "tree";
    }
  }

  // Street lights every few tiles along the pavements: they light a small pool.
  const lights: Point[] = [];
  for (let a = 2; a < N; a += 7) {
    lights.push({ x: a, y: ROAD_A }, { x: a + 3 < N ? a + 3 : a, y: ROAD_B }, { x: ROAD_A, y: a + 3 < N ? a + 3 : a }, { x: ROAD_B, y: a });
  }
  // Some lights are out.
  const working = lights.filter(() => rand() < 0.7);
  for (const l of working) {
    for (let y = l.y - 3; y <= l.y + 3; y++) {
      for (let x = l.x - 3; x <= l.x + 3; x++) {
        if (!map.inside(x, y) || Math.hypot(x - l.x, y - l.y) > 3.2) continue;
        if (map.clearLine(l, { x, y }) || (x === l.x && y === l.y)) map.lit[map.idx(x, y)] = 1;
      }
    }
  }

  // Floors, cellars and roofs go on once the streets are laid out.
  for (const b of built) raise(b);

  // Everything is joined up from the junction, so nothing may stand on it.
  const junction = { x: ROAD_A + 1, y: ROAD_A + 1 };
  map.thing[map.idx(junction.x, junction.y)] = "none";
  map.look[map.idx(junction.x, junction.y)] = null;
  connect(map, junction);

  // The survivors hide in the first building of the first block; the alien starts across the junction.
  const home = buildings.find((b) => b.x < ROAD_A && b.y < ROAD_A) ?? buildings[0];
  const humanStart: Point[] = [];
  for (let y = home.y + home.h - 2; y > home.y && humanStart.length < 4; y--) {
    for (let x = home.x + home.w - 2; x > home.x && humanStart.length < 4; x--) {
      if (map.thingAt(x, y) === "none") humanStart.push({ x, y });
    }
  }
  let alienStart = { x: N - 4, y: N - 4 };
  for (let r = 0; r < 10; r++) {
    const p = { x: N - 4 - r, y: N - 4 };
    if (map.thingAt(p.x, p.y) === "none" && map.building[map.idx(p.x, p.y)] === -1) {
      alienStart = p;
      break;
    }
  }
  if (map.thingAt(alienStart.x, alienStart.y) !== "none") {
    // Fall back to the road, which is always clear in the middle.
    alienStart = { x: ROAD_B - 2, y: N - 3 };
    map.thing[map.idx(alienStart.x, alienStart.y)] = "none";
  }
  return { map, humanStart, alienStart, lights: working };
}

/**
 * Makes sure every open tile on every level can be walked to from the junction: clears a tree or a
 * piece of clutter that seals a gap, or knocks a door through a wall, until nothing is cut off.
 * A floor that can't be reached from its own level gets stairs up or down from one that can.
 */
export function connect(map: TacMap, from: Point): void {
  const four = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let guard = 0; guard < 400; guard++) {
    const { cost } = map.reach(from, Infinity, new Set());
    const reached = (x: number, y: number, z: number) => map.inside(x, y, z) && Number.isFinite(cost[map.idx(x, y, z)]);
    let fix: { i: number; score: number } | null = null;
    let lost = false;
    for (let z = map.bottom; z <= map.top; z++) {
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          if (map.walkable(x, y, z)) {
            if (!reached(x, y, z)) lost = true;
            continue;
          }
          const t = map.thingAt(x, y, z);
          if (t === "none" || t === "door" || t === "open" || t === "stairs" || t === "lift") continue;
          if (map.groundAt(x, y, z) === "earth" || map.look[map.idx(x, y, z)] === "parapet") continue;
          let cut = false;
          let ok = false;
          for (const [dx, dy] of four) {
            if (!map.walkable(x + dx, y + dy, z)) continue;
            if (reached(x + dx, y + dy, z)) ok = true;
            else cut = true;
          }
          if (!cut || !ok) continue;
          // Clutter goes first, then plain wall; windows and corners stay.
          const score = t === "tree" || t === "cover" ? 3 : t === "wall" ? 2 : 1;
          if (!fix || score > fix.score) fix = { i: map.idx(x, y, z), score };
        }
      }
    }
    if (!lost) return;
    if (fix) {
      const t = map.thing[fix.i];
      map.thing[fix.i] = t === "tree" || t === "cover" ? "none" : "door";
      map.look[fix.i] = null;
      continue;
    }
    // Nothing on the level to knock through: run stairs to it from a level that's reached.
    let stairs: [number, number] | null = null;
    for (let i = 0; i < cost.length && !stairs; i++) {
      const p = map.at(i);
      if (Number.isFinite(cost[i]) || !map.walkable(p.x, p.y, p.z) || map.thing[i] !== "none") continue;
      for (const dz of [-1, 1]) {
        const j = map.idx(p.x, p.y, p.z! + dz);
        if (reached(p.x, p.y, p.z! + dz) && map.thing[j] === "none") {
          stairs = [i, j];
          break;
        }
      }
    }
    if (stairs) {
      for (const i of stairs) map.thing[i] = "stairs";
      continue;
    }
    // Walled in by more than one tile, say a row of trees: dig toward the nearest open ground.
    const dig = tunnel(map, cost);
    if (dig < 0) return;
    map.thing[dig] = map.thing[dig] === "wall" ? "door" : "none";
    map.look[dig] = null;
  }
}

/** The blocker next to a cut-off tile that's closest to somewhere already reached, or −1. */
function tunnel(map: TacMap, cost: Float32Array): number {
  const reached: Point[] = [];
  for (let i = 0; i < cost.length; i++) if (Number.isFinite(cost[i])) reached.push(map.at(i));
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < cost.length; i++) {
    const p = map.at(i);
    const t = map.thing[i];
    if (t !== "tree" && t !== "cover" && t !== "wall") continue;
    if (map.ground[i] === "earth" || map.look[i] === "parapet") continue;
    let beside = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z };
      if (map.walkable(q.x, q.y, q.z) && !Number.isFinite(cost[map.idx(q.x, q.y, q.z)])) beside = true;
    }
    if (!beside) continue;
    for (const r of reached) {
      if (r.z !== p.z) continue;
      const d = dist(p, r);
      if (d < bestD) [best, bestD] = [i, d];
    }
  }
  return best;
}

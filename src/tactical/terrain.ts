import type { CoverLook, Ground, TacMap, Thing } from "./map";

/**
 * What the battlefield is made of, and what it takes to break it.
 *
 * Every solid thing on a tile has hit points and a toughness. A weapon has a breach level: what it
 * can hurt. A shot from a weapon whose breach is below a thing's toughness just chips it, however
 * many you fire, so a pistol never takes down a wall. At or above it, the shot's damage roll comes
 * off the thing's hit points, and at zero it gives way.
 *
 * Breaking things only ever opens the map up: a wall becomes a gap, a door a doorway, a car a
 * burnt-out shell. Nothing that falls can block a route or cut a tile off. Stairs, lifts, floors
 * and the earth round the cellars can't be broken at all, so nobody is ever stranded on a floor.
 */

/** How tough a thing is, and the breach a weapon needs to hurt it. */
export const Tough = {
  /** Glass, bins, crates, benches: anything gets through. */
  Flimsy: 0,
  /** Doors, trees, car bodies: a rifle or shotgun chews through, a pistol doesn't. */
  Solid: 1,
  /** Brick and concrete: walls, barriers, parapets. Only plasma, or explosives one day. */
  Masonry: 2,
} as const;
export type Tough = (typeof Tough)[keyof typeof Tough];

/** How a toughness reads on screen. */
export const TOUGH_NAMES: Record<Tough, string> = { 0: "flimsy", 1: "solid", 2: "masonry" };

/** What a broken thing leaves behind. */
export interface Remains {
  thing: Thing;
  look?: CoverLook | null;
  /** Debris on the floor, slow to cross. Left out, the floor stays as it was. */
  rubble?: boolean;
}

export interface Material {
  name: string;
  tough: Tough;
  hp: number;
  becomes: Remains;
}

const DEBRIS: Remains = { thing: "none", rubble: true };

/** Every kind of cover by its look. */
const COVER: Record<CoverLook, Material> = {
  crate: { name: "Crate", tough: Tough.Flimsy, hp: 15, becomes: DEBRIS },
  bin: { name: "Bin", tough: Tough.Flimsy, hp: 12, becomes: DEBRIS },
  bench: { name: "Bench", tough: Tough.Flimsy, hp: 18, becomes: DEBRIS },
  car: { name: "Car", tough: Tough.Solid, hp: 45, becomes: { thing: "cover", look: "wreck" } },
  wreck: { name: "Burnt-out wreck", tough: Tough.Solid, hp: 70, becomes: DEBRIS },
  planter: { name: "Concrete planter", tough: Tough.Masonry, hp: 60, becomes: DEBRIS },
  barrier: { name: "Concrete barrier", tough: Tough.Masonry, hp: 80, becomes: DEBRIS },
  parapet: { name: "Parapet", tough: Tough.Masonry, hp: 60, becomes: { thing: "none" } },
};

const MATERIALS: Partial<Record<Thing, Material>> = {
  wall: { name: "Wall", tough: Tough.Masonry, hp: 100, becomes: DEBRIS },
  window: { name: "Window", tough: Tough.Flimsy, hp: 8, becomes: { thing: "frame" } },
  frame: { name: "Smashed window", tough: Tough.Masonry, hp: 60, becomes: DEBRIS },
  door: { name: "Door", tough: Tough.Solid, hp: 30, becomes: DEBRIS },
  open: { name: "Open door", tough: Tough.Solid, hp: 30, becomes: { thing: "none" } },
  tree: { name: "Tree", tough: Tough.Solid, hp: 45, becomes: DEBRIS },
};

/** What the thing on a tile is made of, or null if there's nothing there that can be broken. */
export function materialAt(map: TacMap, i: number): Material | null {
  const g: Ground = map.ground[i];
  // Walls dug into the earth round a cellar are the earth itself.
  if (g === "earth" || g === "air") return null;
  const t = map.thing[i];
  if (t === "cover") {
    const look = map.look[i];
    return look ? COVER[look] : null;
  }
  return MATERIALS[t] ?? null;
}

/** Hit points left on a tile's thing, or null if it can't be broken. */
export function hpLeft(map: TacMap, i: number): number | null {
  const m = materialAt(map, i);
  return m ? Math.max(0, m.hp - map.wear[i]) : null;
}

/** Whether a weapon with this breach can hurt the thing at a tile at all. */
export function canBreach(map: TacMap, i: number, breach: number): boolean {
  const m = materialAt(map, i);
  return !!m && breach >= m.tough;
}

/** What happened to a tile's thing when it was hit. */
export interface Wrecked {
  /** Damage it took: 0 if the weapon couldn't hurt it. */
  amount: number;
  /** It gave way, and what's there now. */
  broke: Material | null;
  was: Material;
}

/**
 * A hit on whatever stands at a tile. Returns null if there's nothing breakable there. `damage` is
 * the weapon's rolled damage; it only counts if the breach is enough.
 */
export function strike(map: TacMap, i: number, damage: number, breach: number): Wrecked | null {
  const m = materialAt(map, i);
  if (!m) return null;
  if (breach < m.tough || damage <= 0) return { amount: 0, broke: null, was: m };
  map.wear[i] += damage;
  if (map.wear[i] < m.hp) return { amount: damage, broke: null, was: m };
  map.wear[i] = 0;
  map.thing[i] = m.becomes.thing;
  map.look[i] = m.becomes.thing === "cover" ? (m.becomes.look ?? null) : null;
  if (m.becomes.rubble && map.ground[i] !== "air" && map.ground[i] !== "earth") map.ground[i] = "rubble";
  return { amount: damage, broke: m, was: m };
}

import { BIOMES, BiomeId, biomeAt } from "../geoscape/biomes";
import { CITIES, City } from "../geoscape/cities";
import { Battle, Outcome, Unit } from "./battle";
import { CITY_STYLES, CityStyle, buildCity } from "./cityMap";
import { Point, facingTo } from "./map";
import { hashText, mulberry32 } from "./random";
import { Stats, TOOLS, Tool, WEAPONS, Weapon } from "./rules";

/**
 * The opening of the game: one night, one city, one alien hunting a handful of people
 * who were in the wrong place. Turning the tables on it is how the war starts.
 */
export interface Prologue {
  city: City;
  biome: BiomeId;
  style: CityStyle;
  battle: Battle;
  lights: Point[];
  seed: number;
}

/** What the survivors carry out of the city, by how the night ended. */
export const SPOILS: Record<Outcome, string[]> = {
  captured: ["Live alien", "Plasma pistol", "Tracking implant"],
  killed: ["Alien corpse", "Plasma pistol"],
  wiped: [],
  fled: [],
};

export const OUTCOME_TEXT: Record<Outcome, { title: string; text: string }> = {
  captured: {
    title: "Taken alive",
    text: "You have it. Bound, sedated and breathing, with its weapon and the implant it used to track you. Somebody important is going to want to talk to you.",
  },
  killed: {
    title: "It's dead",
    text: "The thing that hunted you is dead in the street. Its pistol still hums. Whatever it used to track you burned out when it died.",
  },
  wiped: {
    title: "No survivors",
    text: "Nobody walks out of the city. By morning the street is cordoned off and the story is a gas explosion.",
  },
  fled: {
    title: "You ran",
    text: "You got out. It didn't follow. Nobody believes you, and you have nothing to show them.",
  },
};

const FIRST = ["Ana", "Ben", "Chidi", "Dana", "Elif", "Farah", "Goran", "Hana", "Ivan", "Jae", "Kofi", "Lena", "Mateo", "Nadia", "Omar", "Priya", "Raul", "Sana", "Tomas", "Yusuf", "Zoe", "Mika", "Ines", "Lars"];
const LAST = ["Okafor", "Novak", "Haddad", "Sato", "Mendes", "Brandt", "Kowalski", "Reyes", "Ivanova", "Osei", "Larsen", "Khan", "Moreau", "Silva", "Park", "Adeyemi", "Costa", "Weber", "Nyambura", "Petrov"];

interface Role {
  role: string;
  stats: Stats;
  weapon: Weapon | null;
  tools: Tool[];
  look: string;
}

const ROLES: Role[] = [
  {
    role: "Police officer",
    stats: { tu: 56, health: 34, bravery: 50, reactions: 50, accuracy: 60, melee: 72, armour: 4 },
    weapon: WEAPONS.pistol,
    tools: [TOOLS.stunBaton],
    look: "#5b7fd1",
  },
  {
    role: "Army reservist",
    stats: { tu: 60, health: 38, bravery: 60, reactions: 55, accuracy: 68, melee: 50, armour: 0 },
    weapon: WEAPONS.rifle,
    tools: [],
    look: "#7e9a52",
  },
  {
    role: "Security guard",
    stats: { tu: 52, health: 40, bravery: 40, reactions: 40, accuracy: 55, melee: 60, armour: 2 },
    weapon: WEAPONS.shotgun,
    tools: [],
    look: "#c9b458",
  },
  {
    role: "Paramedic",
    stats: { tu: 58, health: 32, bravery: 45, reactions: 40, accuracy: 45, melee: 40, armour: 0 },
    weapon: WEAPONS.pistol,
    tools: [TOOLS.medkit],
    look: "#e0e4e8",
  },
];

/** It's called a Hunter because that's what it does. */
const HUNTER: Stats = { tu: 64, health: 55, bravery: 100, reactions: 85, accuracy: 70, melee: 60, armour: 10 };

/** Spread stats a little so no two people are the same. */
function vary(s: Stats, rand: () => number): Stats {
  const v = (n: number) => Math.max(1, Math.round(n * (0.9 + rand() * 0.2)));
  return { tu: v(s.tu), health: v(s.health), bravery: v(s.bravery), reactions: v(s.reactions), accuracy: v(s.accuracy), melee: v(s.melee), armour: s.armour };
}

/** A city for the prologue, picked from the megacities by a seed. */
export function prologueCity(seed: number): City {
  const big = CITIES.filter((c) => c.tier === 1);
  return big[seed % big.length];
}

export function startPrologue(city: City, seed: number): Prologue {
  const biome = biomeAt(city.lat, city.lon);
  const style = CITY_STYLES[biome];
  const s = (seed ^ hashText(city.name)) >>> 0;
  const field = buildCity(s, style);
  const rand = mulberry32(s + 7);
  const centre = field.alienStart;
  const units: Unit[] = ROLES.map((r, i) => {
    const stats = vary(r.stats, rand);
    const p = field.humanStart[i];
    return {
      id: i + 1,
      side: "human",
      name: `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`,
      role: r.role,
      stats,
      x: p.x,
      y: p.y,
      facing: facingTo(p, centre),
      tu: stats.tu,
      health: stats.health,
      stun: 0,
      morale: 70 + Math.floor(rand() * 20),
      wounds: 0,
      kneeling: false,
      weapon: r.weapon,
      ammo: r.weapon?.ammo ?? 0,
      tools: r.tools.map((tool) => ({ tool, uses: tool.uses })),
      revealed: false,
    };
  });
  const a = field.alienStart;
  units.push({
    id: 99,
    side: "alien",
    name: "Hunter",
    role: "Alien",
    stats: HUNTER,
    x: a.x,
    y: a.y,
    facing: facingTo(a, field.humanStart[0]),
    tu: HUNTER.tu,
    health: HUNTER.health,
    stun: 0,
    morale: 100,
    wounds: 0,
    kneeling: false,
    weapon: WEAPONS.plasmaPistol,
    ammo: WEAPONS.plasmaPistol.ammo,
    tools: [],
    revealed: false,
  });
  // It knows roughly where you went to ground.
  const battle = new Battle(field.map, units, s, field.humanStart[0]);
  return { city, biome, style, battle, lights: field.lights, seed };
}

/** Name colour for a unit on the map. */
export const unitLook = (u: Unit) => (u.side === "alien" ? "#b5e655" : ROLES.find((r) => r.role === u.role)?.look ?? "#ccc");

export function briefing(p: Prologue): string {
  return `${p.city.name}, a little after two in the morning. ${BIOMES[p.biome].name} country. ${p.style.blurb}`;
}

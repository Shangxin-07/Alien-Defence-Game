import { BIOMES, BiomeId, biomeAt } from "../geoscape/biomes";
import { CITIES, City } from "../geoscape/cities";
import { AlienMind, Personality, RACES, RaceId, Squad, alienName, alienStats, readSquad, rollSquad } from "./aliens";
import { Battle, Outcome, Unit, alive, conscious } from "./battle";
import { CITY_STYLES, CityStyle, buildCity } from "./cityMap";
import { Point, facingTo } from "./map";
import { hashText, mulberry32 } from "./random";
import { Stats, TOOLS, Tool, WEAPONS, Weapon } from "./rules";

/**
 * The opening of the game: one night, one city, one alien hunting a handful of people
 * who were in the wrong place. Turning the tables on it is how the war starts.
 */
export interface Prologue {
  /** Set for fights after the prologue, which bring their own story. */
  mission?: Mission;
  city: City;
  biome: BiomeId;
  style: CityStyle;
  battle: Battle;
  lights: Point[];
  seed: number;
}

/** A smaller fight later on: the words around it and what it pays. */
export interface Mission {
  title: string;
  /** Plain text, one paragraph per entry. */
  intro: string[];
  outcomes: Record<Outcome, { title: string; text: string }>;
  spoils: Record<Outcome, string[]>;
  /** What your people can read about the aliens before it starts. */
  reads?: string[];
  /** Spoils come from what was actually brought down, one item per alien. */
  countSpoils?: boolean;
}

/** Someone on a scavenging run, as the campaign knows them. */
export interface Scavenger {
  id: number;
  name: string;
  role: string;
  stats: Stats;
  health: number;
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

/** It's called a Hunter because that's what it does. A Strider, the best of them. */
const HUNTER: Stats = { tu: 64, health: 55, bravery: 100, reactions: 85, accuracy: 70, melee: 60, armour: 10 };
/** The Hunter's own range: it hunts alone, patient and not reckless. */
const HUNTER_NORMS: Record<keyof Personality, [number, number]> = { aggression: [45, 70], caution: [50, 72], cohesion: [50, 50], cunning: [40, 75] };
/** Aliens' ids on the battlefield, clear of anyone's person id. */
const ALIEN_ID = 1_000_000;

/** Who you're up against in a smaller fight. */
export interface Force {
  race: RaceId;
  squad: Squad;
  /** A lone straggler, worn down and cut off from the rest. */
  straggler: boolean;
}

const pick = <T,>(weights: [T, number][], r: number): T => {
  let left = r * weights.reduce((n, [, w]) => n + w, 0);
  for (const [v, w] of weights) if ((left -= w) < 0) return v;
  return weights[weights.length - 1][0];
};

/**
 * Rolls who's out there from the fight's seed, so the choice to fight can show it before it starts.
 * A run meets a lone straggler. A sighting can be a small squad with a leader.
 */
export function rollForce(seed: number, sighting: boolean): Force {
  const rand = mulberry32((seed ^ 0x5eed) >>> 0);
  const race = pick<RaceId>(sighting ? [["strider", 50], ["brute", 25], ["shade", 25]] : [["strider", 60], ["brute", 20], ["shade", 20]], rand());
  const size = sighting ? pick([[1, 50], [2, 35], [3, 15]], rand()) : 1;
  return { race, squad: rollSquad(race, size, rand), straggler: !sighting };
}

/** Walkable tiles near a spot for the rest of a squad, a step or two apart. */
function squadSpots(map: Prologue["battle"]["map"], start: Point, n: number): Point[] {
  const { cost } = map.reach(start, 40, new Set());
  const tiles = [...cost.keys()].filter((i) => Number.isFinite(cost[i]) && cost[i] >= 4).sort((a, b) => cost[a] - cost[b]);
  const spots: Point[] = [start];
  for (const i of tiles) {
    if (spots.length >= n) break;
    const p = { x: i % map.w, y: Math.floor(i / map.w) };
    if (spots.every((q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) >= 2)) spots.push(p);
  }
  return spots;
}

function alienUnit(id: number, name: string, stats: Stats, at: Point, facing: number, weapon: Weapon, mind: AlienMind): Unit {
  return {
    id,
    side: "alien",
    name,
    role: "Alien",
    stats,
    x: at.x,
    y: at.y,
    facing,
    tu: stats.tu,
    health: stats.health,
    stun: 0,
    morale: 100,
    wounds: 0,
    kneeling: false,
    weapon,
    ammo: weapon.ammo,
    tools: [],
    revealed: false,
    mind,
  };
}

/**
 * What a fight brought home, one item per alien brought down. A leader's body or a live leader is
 * worth far more than the rest. Running leaves everything behind.
 */
export function battleSpoils(b: Battle, o: Outcome): string[] {
  if (o === "fled" || o === "wiped") return [];
  return b.aliens
    .filter((a) => !conscious(a))
    .map((a) => (a.mind?.rank === "leader" ? (alive(a) ? "Live commander" : "Commander corpse") : alive(a) ? "Live alien" : "Alien corpse"));
}

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
  const mind = rollSquad("strider", 1, rand, HUNTER_NORMS).members[0];
  units.push(alienUnit(99, "Hunter", HUNTER, a, facingTo(a, field.humanStart[0]), WEAPONS.plasmaPistol, mind));
  // It knows roughly where you went to ground.
  const battle = new Battle(field.map, units, s, field.humanStart[0]);
  return { city, biome, style, battle, lights: field.lights, seed };
}

/**
 * A scavenging run gone wrong: the team on the run, cornered by a lone alien in a city block.
 * Everyone carries what their old job gave them; anyone else has a pistol.
 */
/** A sighting being answered, for the briefing: who called, where, and how long the team took. */
export interface SightingBrief {
  caller: string;
  place: string;
  hours: number;
}

/**
 * A small fight against one alien: a scavenging run that met it by accident, or, with `sighting`,
 * a team that answered a call and found it still there.
 */
export function startAmbush(city: City, seed: number, team: Scavenger[], place: string, sighting?: SightingBrief, knowledge = 0): Prologue {
  const biome = biomeAt(city.lat, city.lon);
  const style = CITY_STYLES[biome];
  const s = (seed ^ hashText(city.name + place)) >>> 0;
  const field = buildCity(s, style);
  const rand = mulberry32(s + 11);
  const centre = field.alienStart;
  const units: Unit[] = team.slice(0, field.humanStart.length).map((m, i) => {
    const kit = ROLES.find((r) => r.role === m.role);
    const weapon = kit?.weapon ?? WEAPONS.pistol;
    const p = field.humanStart[i];
    return {
      id: m.id,
      side: "human",
      name: m.name,
      role: m.role,
      stats: { ...m.stats },
      x: p.x,
      y: p.y,
      facing: facingTo(p, centre),
      tu: m.stats.tu,
      health: Math.max(1, m.health),
      stun: 0,
      morale: 60 + Math.floor(rand() * 20),
      wounds: 0,
      kneeling: false,
      weapon,
      ammo: weapon.ammo,
      tools: (kit?.tools ?? []).map((tool) => ({ tool, uses: tool.uses })),
      revealed: false,
    };
  });
  const force = rollForce(seed, !!sighting);
  const race = RACES[force.race];
  const spots = squadSpots(field.map, field.alienStart, force.squad.members.length);
  force.squad.members.forEach((m, i) => {
    const stats = vary(alienStats(force.race, m.rank, force.straggler), rand);
    const at = spots[i % spots.length];
    const name = force.straggler ? `${race.name} straggler` : alienName(force.race, m.rank);
    units.push(alienUnit(ALIEN_ID + i, name, stats, at, facingTo(at, field.humanStart[0]), race.weapon, m));
  });
  const many = force.squad.members.length > 1;
  const battle = new Battle(field.map, units, s, field.humanStart[0]);
  const names = units.filter((u) => u.side === "human").map((u) => u.name);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const mission: Mission = {
    title: `Ambush: ${city.name}`,
    intro: [
      `${city.name}, after dark. ${who} ${names.length === 1 ? "was" : "were"} working the ${place.toLowerCase()} when the lights went out down the street.`,
      `Something is out there, alone, and it has heard you. You can fight it, knock it out and bring it home, or slip away with whatever you can carry.`,
    ],
    reads: readSquad(force.squad, knowledge),
    countSpoils: true,
    outcomes: {
      captured: { title: "Taken alive", text: "It's down and breathing. You drag it home with the supplies. Keep it somewhere it can't get out of." },
      killed: { title: "It's dead", text: "It's dead in the street. You take the body and the supplies, and get out before anything else comes." },
      fled: { title: "You got away", text: "You ran with whatever you could carry. Half of it fell out of your bags on the way." },
      wiped: { title: "Nobody came back", text: "The team never comes home. Nobody goes looking." },
    },
    spoils: { captured: ["Live alien"], killed: ["Alien corpse"], fled: [], wiped: [] },
  };
  if (sighting) {
    const took = sighting.hours < 1 ? `${Math.max(5, Math.round(sighting.hours * 60))} minutes` : `${Math.round(sighting.hours * 10) / 10} hours`;
    mission.title = `Sighting: ${city.name}`;
    mission.intro = many
      ? [
          `${sighting.caller} called it in: something ${sighting.place}. ${who} got there ${took} after it was seen, and they're still here. It wasn't alone.`,
          `They don't know you've come. Kill them, knock them out and bring them home, or pull back before they see you.`,
        ]
      : [
          `${sighting.caller} called it in: something ${sighting.place}. ${who} got there ${took} after it was seen, and it's still here.`,
          `It's alone and it doesn't know you've come. Kill it, knock it out and bring it home, or pull back before it sees you.`,
        ];
    mission.outcomes.captured.text = many
      ? "They're down, and at least one is still breathing. You get them home before anyone else turns up. Keep the live ones somewhere they can't get out of."
      : "It's down and breathing. You get it home before anyone else turns up. Keep it somewhere it can't get out of.";
    mission.outcomes.killed = many
      ? { title: "They're dead", text: "All of them. You strip what you can off their kit and take the bodies home." }
      : { title: "It's dead", text: "It's dead. You strip what you can off its kit and take the body home." };
    mission.outcomes.fled = { title: "You pulled back", text: `You got clear. ${many ? "They're" : "It's"} gone again, and so is the chance.` };
  }
  return { mission, city, biome, style, battle, lights: field.lights, seed };
}

/** Name colour for a unit on the map. */
export const unitLook = (u: Unit) => (u.side === "alien" ? RACES[u.mind?.race ?? "strider"].look : ROLES.find((r) => r.role === u.role)?.look ?? "#ccc");

/** Model shape for a unit: aliens by race, with a crest on whoever leads. */
export const unitShape = (u: Unit) => (u.mind ? { size: RACES[u.mind.race].size, width: RACES[u.mind.race].width, crest: u.mind.rank === "leader" } : {});

export function briefing(p: Prologue): string {
  return `${p.city.name}, a little after two in the morning. ${BIOMES[p.biome].name} country. ${p.style.blurb}`;
}

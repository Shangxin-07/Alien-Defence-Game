import type { Daylight } from "../geoscape/geo";

/**
 * Soldiers, weapons and the numbers behind every action, in the spirit of the original:
 * everything costs time units, and how well a unit does something comes from its stats.
 */

export type Side = "human" | "alien";

export interface Stats {
  /** Time units per turn. Moving, turning, kneeling and shooting all spend them. */
  tu: number;
  health: number;
  /** Bravery resists panic; morale drains when friends fall. */
  bravery: number;
  /** Who gets to shoot first when an enemy moves in view. */
  reactions: number;
  /** Firing accuracy, percent. */
  accuracy: number;
  /** Melee skill, percent: stun batons and fists. */
  melee: number;
  /** Damage soaked from every hit. */
  armour: number;
}

export type FireMode = "snap" | "aimed" | "auto";

export interface ShotMode {
  /** Cost as a percentage of the shooter's full time units, like the original. */
  tuPct: number;
  /** Multiplies the shooter's accuracy, percent. */
  acc: number;
  shots: number;
}

export interface Weapon {
  id: string;
  name: string;
  /** Damage before the 0–200% roll and armour. */
  power: number;
  modes: Partial<Record<FireMode, ShotMode>>;
  /** Tiles before accuracy starts to fall off. */
  range: number;
  /** Accuracy lost per tile beyond range, percent points. */
  falloff: number;
  /** Rounds in a magazine. A spare clip fills any gun's magazine: for now, all bullets fit all guns. */
  ammo: number;
  alien?: boolean;
  /**
   * Energy weapons in human hands have no clips: every shot heats them up, and past HEAT_MAX they
   * shut down until they cool. The aliens know how to vent their own guns, so this is ours alone.
   */
  heat?: { shot: number; cool: number };
}

/** Heat at which an energy weapon shuts down, and the heat it has to cool to before it fires again. */
export const HEAT_MAX = 100;
export const HEAT_RESTART = 50;
/** Swapping in a fresh clip, as a share of full time units. The part-used clip is dropped. */
export const RELOAD_PCT = 25;

export interface Tool {
  id: string;
  name: string;
  kind: "stun" | "medkit";
  power: number;
  tuPct: number;
  uses: number;
}

export const WEAPONS: Record<string, Weapon> = {
  pistol: {
    id: "pistol",
    name: "Service pistol",
    power: 26,
    modes: { snap: { tuPct: 18, acc: 60, shots: 1 }, aimed: { tuPct: 30, acc: 78, shots: 1 } },
    range: 10,
    falloff: 3,
    ammo: 12,
  },
  rifle: {
    id: "rifle",
    name: "Assault rifle",
    power: 30,
    modes: { snap: { tuPct: 25, acc: 60, shots: 1 }, aimed: { tuPct: 80, acc: 110, shots: 1 }, auto: { tuPct: 35, acc: 35, shots: 3 } },
    range: 18,
    falloff: 2,
    ammo: 20,
  },
  shotgun: {
    id: "shotgun",
    name: "Pump shotgun",
    power: 44,
    modes: { snap: { tuPct: 25, acc: 70, shots: 1 }, aimed: { tuPct: 45, acc: 90, shots: 1 } },
    range: 5,
    falloff: 9,
    ammo: 8,
  },
  plasmaPistol: {
    id: "plasmaPistol",
    name: "Plasma pistol",
    power: 52,
    modes: { snap: { tuPct: 30, acc: 65, shots: 1 }, aimed: { tuPct: 60, acc: 85, shots: 1 } },
    range: 16,
    falloff: 2,
    ammo: 99,
    alien: true,
    heat: { shot: 35, cool: 35 },
  },
  /** A Brute's gun: a wide, short spray of plasma. Deadly up close, wild beyond a few streets' width. */
  plasmaScatter: {
    id: "plasmaScatter",
    name: "Plasma scattergun",
    power: 48,
    modes: { snap: { tuPct: 30, acc: 80, shots: 1 }, aimed: { tuPct: 50, acc: 95, shots: 1 } },
    range: 6,
    falloff: 7,
    ammo: 99,
    alien: true,
    heat: { shot: 45, cool: 35 },
  },
  /** A Shade's gun: quiet, long and very accurate, and it doesn't hit as hard. */
  needleRifle: {
    id: "needleRifle",
    name: "Needle rifle",
    power: 40,
    modes: { snap: { tuPct: 28, acc: 70, shots: 1 }, aimed: { tuPct: 55, acc: 115, shots: 1 } },
    range: 22,
    falloff: 1,
    ammo: 99,
    alien: true,
    heat: { shot: 30, cool: 30 },
  },
};

export const TOOLS: Record<string, Tool> = {
  stunBaton: { id: "stunBaton", name: "Stun baton", kind: "stun", power: 60, tuPct: 25, uses: 99 },
  medkit: { id: "medkit", name: "Medikit", kind: "medkit", power: 10, tuPct: 20, uses: 4 },
};

/** Moving onto open ground, orthogonally. Diagonals cost half as much again. */
export const STEP_TU = 4;
export const DIAGONAL_TU = 6;
/** Opening a door on the way through. */
export const DOOR_TU = 3;
/** Up or down one storey: a flight of stairs is hard going, a lift is quicker but you wait for it. */
export const STAIRS_TU = 8;
export const LIFT_TU = 6;
/** Each 45° of turning. */
export const TURN_TU = 1;
export const KNEEL_TU = 4;
export const STAND_TU = 8;
/** Accuracy multiplier when kneeling. */
export const KNEEL_BONUS = 1.15;

/** How far eyes reach, in tiles. People at night see little beyond the street lights. */
export const SIGHT_DAY = 20;
export const SIGHT_NIGHT = 9;
/** Dusk and dawn: grey light, long shadows. */
export const SIGHT_TWILIGHT = 14;

export type { Daylight };

/** How far your people see in the open, away from street lights. Aliens see SIGHT_DAY whatever the hour. */
export function humanSight(light: Daylight): number {
  return light === "day" ? SIGHT_DAY : light === "night" ? SIGHT_NIGHT : SIGHT_TWILIGHT;
}
/** Half-width of the field of view, in degrees. */
export const HUMAN_FOV = 45;
export const ALIEN_FOV = 60;

export const tuCost = (max: number, pct: number) => Math.max(1, Math.round((max * pct) / 100));

/** The chance a single shot flies true, before anything in the way gets a say. */
export function baseHitChance(accuracy: number, mode: ShotMode, weapon: Weapon, distance: number, kneeling: boolean, woundsPenalty = 0): number {
  let pct = (accuracy * mode.acc) / 100;
  if (kneeling) pct *= KNEEL_BONUS;
  pct -= Math.max(0, distance - weapon.range) * weapon.falloff;
  pct -= woundsPenalty;
  return Math.min(0.98, Math.max(0.02, pct / 100));
}

/** Damage rolls anywhere from nothing to double the weapon's power, then armour takes its share. */
export function rollDamage(power: number, armour: number, rand: () => number): number {
  return Math.max(0, Math.round(power * 2 * rand()) - armour);
}

export type Morale = { morale: number; bravery: number };

/** Seeing a friend die costs the timid far more than the brave. */
export const moraleLoss = (bravery: number) => Math.round((110 - bravery) / 2);

/** At the start of a turn, a unit under 50 morale may freeze. */
export const panicChance = (morale: number) => Math.max(0, Math.min(1, ((50 - morale) * 2) / 100));

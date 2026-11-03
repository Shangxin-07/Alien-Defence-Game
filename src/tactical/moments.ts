import type { BattleEvent } from "./battle";
import type { Side } from "./rules";
import type { Point } from "./map";

/**
 * The action camera: which moments of a fight are worth pulling the view over to, and for how long.
 * It never stops the fight to wait for you. It only moves the camera, zooms in, and lingers a little
 * on what matters, so a shot from off screen is seen landing.
 *
 * This is presentation only: it reads the events the rules already produced and changes nothing.
 */

/** How much the camera follows the action: everything, only kills, contact and walls coming down, or not at all. */
export type ActionCam = "all" | "key" | "off";
export const ACTION_CAMS: ActionCam[] = ["all", "key", "off"];
export const ACTION_CAM_LABEL: Record<ActionCam, string> = { all: "All action", key: "Kills, contact, breaches", off: "Off" };

export interface Moment {
  /** What to get in shot: tiles, or unit ids looked up where the screen is showing them now. */
  at: (Point | number)[];
  /** Right in close, or pulled back just enough to get everything in. */
  close: boolean;
  /** Extra seconds to stay on it once it has played, on top of the usual pause. */
  hold: number;
  /** A line across the screen while it lingers. */
  caption?: string;
  tone?: "good" | "bad";
}

/** What the camera needs to know about the people in the fight. */
export interface MomentContext {
  side(id: number): Side;
  name(id: number): string;
  /** Whether your people can see this unit right now. */
  seen(id: number): boolean;
}

/** Seconds to linger on a death or someone dropping: long enough to take it in. */
export const DEATH_HOLD = 1.6;
/** Seconds to linger on the first sight of one of them. */
export const CONTACT_HOLD = 0.7;
/** Seconds to linger on a wall or barrier coming down, and on anything lighter breaking. */
export const BREACH_HOLD = 0.8;
export const BREAK_HOLD = 0.3;
/** Toughness from which a break counts as a key moment: brick and concrete (terrain.ts Masonry). */
const HEAVY = 2;

/** Seconds to linger on a hit that didn't drop anyone. */
export const HIT_HOLD = 0.25;

/**
 * The moment an event deserves, or null to leave the camera alone. `lastShot` is the shot just
 * before it, if any, so a death can say who did it.
 */
export function momentFor(e: BattleEvent, ctx: MomentContext, setting: ActionCam, lastShot: Extract<BattleEvent, { kind: "shot" }> | null = null): Moment | null {
  if (setting === "off") return null;
  const all = setting === "all";
  switch (e.kind) {
    case "damage": {
      const ours = ctx.side(e.unit) === "human";
      // An alien hurt where nobody can see it gives nothing away, unless it drops.
      if (!ours && !ctx.seen(e.unit) && !e.dead && !e.out) return null;
      if (e.dead || e.out) {
        return { at: [e.unit], close: true, hold: DEATH_HOLD, caption: deathLine(e, ctx, lastShot), tone: ours ? "bad" : "good" };
      }
      if (!all) return null;
      // Hit by the shot just shown, the camera already has it in frame: just stay on it a moment.
      const shown = lastShot?.hit === e.unit;
      return { at: shown ? [] : [e.unit], close: false, hold: HIT_HOLD };
    }
    case "shot": {
      // A shot that hits someone counts as a key moment: it's how people get hurt off screen.
      if (!all && e.hit === null) return null;
      // A shooter in the dark stays in the dark: only the end of the shot is shown.
      return { at: e.seen ? [e.from, e.to] : [e.to], close: false, hold: 0 };
    }
    case "wreck": {
      // Only what your people saw come down: a break out of sight is heard, not shown.
      if (!e.broke || !e.seen) return null;
      const heavy = e.tough >= HEAVY;
      if (!heavy && !all) return null;
      if (!heavy) return { at: [e.at], close: false, hold: BREAK_HOLD };
      // A wall going opens a new line of fire: get in close and say so.
      return { at: [e.at], close: true, hold: BREACH_HOLD, caption: `${e.was} ${e.was === "Wall" ? "breached" : "destroyed"}` };
    }
    case "spot":
      return { at: [e.unit], close: true, hold: CONTACT_HOLD, caption: `Contact: ${ctx.name(e.unit)}`, tone: "bad" };
    default:
      return null;
  }
}

function deathLine(e: Extract<BattleEvent, { kind: "damage" }>, ctx: MomentContext, lastShot: Extract<BattleEvent, { kind: "shot" }> | null): string {
  const ours = ctx.side(e.unit) === "human";
  const who = ours || ctx.seen(e.unit) || e.dead ? ctx.name(e.unit) : "Alien";
  const what = e.dead ? "killed" : e.stun ? (ours ? "knocked out" : "stunned") : ours ? "down" : "down, breathing";
  const shotBy = lastShot && lastShot.hit === e.unit && lastShot.unit !== e.unit && e.dead;
  const by = !shotBy ? "" : lastShot!.seen ? ` by ${ctx.name(lastShot!.unit)}` : " from the dark";
  return `${who} ${what}${by}`;
}

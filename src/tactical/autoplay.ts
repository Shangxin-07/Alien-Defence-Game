import { Battle, BattleEvent, BattleSnapshot, Unit, alive, conscious } from "./battle";
import { Point, dist } from "./map";
import { mulberry32 } from "./random";
import { FireMode, KNEEL_TU, TURN_TU, tuCost } from "./rules";

/**
 * Autoplay: your people fight a round in the style you pick, a little worse than you would.
 * Every round it plays is kept, so you can scroll back and take command, at a price.
 */

export type Doctrine = "cautious" | "aggressive" | "capture";

export const DOCTRINES: Record<Doctrine, { name: string; blurb: string }> = {
  cautious: { name: "Cautious", blurb: "Stay together, keep to cover, kneel and keep time back to fire on reflex. Let them come." },
  aggressive: { name: "Aggressive", blurb: "Push forward, find them, close in and shoot first. Nothing held back." },
  capture: { name: "Capture", blurb: "Wear them down without killing them, then go in with the baton. Slow and risky." },
};

/** Share of each person's turns the autoplayer fumbles one thing: it's a bit worse than you. */
export const BLUNDER = 0.15;
/** Lowest chance per shot the autoplayer will take, by doctrine. */
const MIN_SHOT: Record<Doctrine, number> = { cautious: 0.25, aggressive: 0.15, capture: 0.25 };
/** Capture holds fire on anything this hurt while someone with a baton is still up, so it isn't killed. */
const HOLD_FIRE_BELOW = 0.45;
/** The baton goes in once the target is this worn down. */
const GO_IN_BELOW = 0.75;
/** A cautious squad keeps within this many tiles of the middle of the group. */
const HUDDLE = 4;
/** A fight the autoplayer can't finish in this many rounds is called off. */
export const MAX_ROUNDS = 60;

type Fumble = "move" | "shot" | "posture" | null;

const seenAliens = (b: Battle) => b.aliens.filter((a) => conscious(a) && b.isSeen(a));

/** Where your people think the aliens are: what they see, else where they last saw them. */
function knownThreats(b: Battle): Point[] {
  const seen = seenAliens(b);
  if (seen.length) return seen.map((a) => ({ x: a.x, y: a.y }));
  return b.aliens.filter((a) => alive(a) && conscious(a) && b.lastSeen.has(a.id)).map((a) => b.lastSeen.get(a.id)!);
}

function centre(units: Point[]): Point {
  const n = units.length || 1;
  return { x: units.reduce((s, u) => s + u.x, 0) / n, y: units.reduce((s, u) => s + u.y, 0) / n };
}

const nearest = (from: Point, pts: Point[]) => pts.reduce<Point | null>((best, p) => (!best || dist(from, p) < dist(from, best) ? p : best), null);

/** Somewhere nobody has looked yet, close to the squad: where to search when there's no sign of them. */
function unexplored(b: Battle, from: Point): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  for (let i = 0; i < b.seen.length; i++) {
    if (b.seen[i]) continue;
    const p = { x: i % b.map.w, y: Math.floor(i / b.map.w) };
    if (!b.map.walkable(p.x, p.y)) continue;
    const d = dist(p, from);
    if (d >= 6 && d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

function nearCover(b: Battle, p: Point): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && b.map.isCover(p.x + dx, p.y + dy)) return true;
  return false;
}

/** Whether one of your own is standing in the line of fire. */
function friendInTheWay(b: Battle, u: Unit, t: Point): boolean {
  return b.map.line(u, t).slice(1, -1).some((p) => b.unitAt(p.x, p.y)?.side === "human");
}

const hasBaton = (u: Unit) => u.tools.some((t) => t.tool.kind === "stun");

/** Plays your side's turn in the doctrine's style, then ends it. Returns everything that happened. */
export function playRound(b: Battle, doctrine: Doctrine, rand: () => number): BattleEvent[] {
  const out: BattleEvent[] = [];
  if (b.outcome || b.side !== "human") return out;
  const threats = knownThreats(b);
  // Whoever's closest to trouble goes first.
  const order = b.humans.filter(conscious).sort((p, q) => {
    const tp = nearest(p, threats);
    const tq = nearest(q, threats);
    return (tp ? dist(p, tp) : 0) - (tq ? dist(q, tq) : 0);
  });
  for (const u of order) {
    if (b.outcome) break;
    const fumble: Fumble = rand() < BLUNDER ? (["move", "shot", "posture"] as const)[Math.floor(rand() * 3)] : null;
    unitTurn(b, u, doctrine, fumble, rand, out);
  }
  if (!b.outcome) out.push(...b.endTurn());
  return out;
}

function unitTurn(b: Battle, u: Unit, d: Doctrine, fumble: Fumble, rand: () => number, out: BattleEvent[]) {
  const snap = u.weapon?.modes.snap;
  const snapCost = snap ? tuCost(u.stats.tu, snap.tuPct) : 0;
  // Aggressive spends everything; the others keep a reflex shot back.
  const reserve = d === "aggressive" ? 0 : snapCost;
  let moved = false;
  for (let guard = 0; guard < 10; guard++) {
    if (!conscious(u) || b.outcome || b.side !== "human") return;
    if (patchUp(b, u, out)) continue;
    const targets = seenAliens(b);
    if (d === "capture" && takedown(b, u, targets, fumble, out)) continue;
    if (targets.length && shoot(b, u, targets, d, fumble, out)) continue;
    if (moved) break;
    moved = true;
    if (!reposition(b, u, d, targets, reserve, fumble, rand, out)) break;
  }
  if (!conscious(u) || b.outcome || fumble === "posture") return;
  // End the turn looking where the trouble is, kneeling if there's time to spare.
  const threats = knownThreats(b);
  const look = nearest(u, threats) ?? outward(b, u);
  if (look && u.tu >= TURN_TU * 4) out.push(...b.face(u.id, look));
  if (d !== "aggressive" && !u.kneeling && u.tu - KNEEL_TU >= snapCost) out.push(...b.kneel(u.id));
}

/** Facing away from the rest of the squad, so somebody is watching every way. */
function outward(b: Battle, u: Unit): Point | null {
  const mates = b.humans.filter((h) => conscious(h) && h !== u);
  if (!mates.length) return null;
  const c = centre(mates);
  const dx = u.x - c.x;
  const dy = u.y - c.y;
  if (!dx && !dy) return null;
  return { x: Math.round(u.x + dx * 3), y: Math.round(u.y + dy * 3) };
}

/** A medic stops anyone bleeding they can reach, themselves included. */
function patchUp(b: Battle, u: Unit, out: BattleEvent[]): boolean {
  const kit = u.tools.find((t) => t.tool.kind === "medkit");
  if (!kit || kit.uses <= 0) return false;
  const hurt = b.humans.filter((h) => alive(h) && (h.wounds > 0 || h.health < h.stats.health * 0.4)).sort((p, q) => dist(u, p) - dist(u, q));
  for (const h of hurt) {
    if (!b.previewHeal(u.id, h).reason) {
      out.push(...b.heal(u.id, h.id));
      return true;
    }
    if (!h.wounds || h === u) continue;
    // Go to them if there's time to get there and treat them this turn.
    const need = tuCost(u.stats.tu, kit.tool.tuPct);
    const spot = adjacentSpot(b, u, h, u.tu - need);
    if (spot) {
      out.push(...b.move(u.id, spot));
      return true;
    }
  }
  return false;
}

/** The cheapest tile next to someone that a unit can reach within a budget. */
function adjacentSpot(b: Battle, u: Unit, t: Point, budget: number): Point | null {
  if (Math.max(Math.abs(u.x - t.x), Math.abs(u.y - t.y)) <= 1) return null;
  const { cost } = b.reach(u);
  let best: Point | null = null;
  let bestC = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const p = { x: t.x + dx, y: t.y + dy };
      if ((!dx && !dy) || !b.map.inside(p.x, p.y)) continue;
      const c = cost[b.map.idx(p.x, p.y)];
      if (c <= budget && c < bestC) [best, bestC] = [p, c];
    }
  }
  return best;
}

/** Capture: whoever carries a baton swings at anything next to them, or goes in once it's worn down. */
function takedown(b: Battle, u: Unit, targets: Unit[], fumble: Fumble, out: BattleEvent[]): boolean {
  const tool = u.tools.find((t) => t.tool.kind === "stun");
  if (!tool) return false;
  for (const t of targets) {
    const p = b.previewStun(u.id, t);
    if (!p.reason) {
      out.push(...b.stun(u.id, t.id));
      return true;
    }
  }
  // Going in too early is the classic mistake.
  const ready = targets.filter((t) => fumble === "shot" || t.health <= t.stats.health * GO_IN_BELOW).sort((p, q) => dist(u, p) - dist(u, q));
  const swing = tuCost(u.stats.tu, tool.tool.tuPct) + TURN_TU * 2;
  for (const t of ready) {
    const spot = adjacentSpot(b, u, t, u.tu - swing);
    if (!spot) continue;
    const before = u.tu;
    out.push(...b.move(u.id, spot));
    return u.tu < before;
  }
  return false;
}

/** The best shot worth taking at what's in view. */
function shoot(b: Battle, u: Unit, targets: Unit[], d: Doctrine, fumble: Fumble, out: BattleEvent[]): boolean {
  if (!u.weapon || u.ammo <= 0) return false;
  const batonUp = b.humans.some((h) => conscious(h) && hasBaton(h));
  let best: { t: Unit; mode: FireMode; score: number; tu: number } | null = null;
  for (const t of targets) {
    // Capture wants them breathing.
    if (d === "capture" && batonUp && t.health <= t.stats.health * HOLD_FIRE_BELOW) continue;
    if (friendInTheWay(b, u, t)) continue;
    for (const mode of Object.keys(u.weapon.modes) as FireMode[]) {
      // A fumbled turn snaps off a hurried shot.
      if (fumble === "shot" && mode !== "snap") continue;
      const p = b.previewShot(u.id, t, mode);
      if (p.reason || p.chance < MIN_SHOT[d]) continue;
      const shots = u.weapon.modes[mode]!.shots;
      // Expected hits per time unit, nudged toward finishing whatever's already hurt.
      const score = ((p.chance * shots) / p.tu) * (1.5 - t.health / t.stats.health);
      if (!best || score > best.score) best = { t, mode, score, tu: p.tu };
    }
  }
  if (!best) return false;
  // Steady the aim first when there's time for both.
  if (d !== "aggressive" && fumble !== "posture" && !u.kneeling && u.tu >= best.tu + KNEEL_TU) out.push(...b.kneel(u.id));
  const before = u.tu;
  out.push(...b.shoot(u.id, best.t, best.mode));
  return u.tu < before;
}

/** Moves the way the doctrine says: closer, together, or toward cover. Returns false if it stayed put. */
function reposition(b: Battle, u: Unit, d: Doctrine, targets: Unit[], reserve: number, fumble: Fumble, rand: () => number, out: BattleEvent[]): boolean {
  const squad = b.humans.filter(conscious);
  const middle = centre(squad);
  const threats = knownThreats(b);
  const threat = nearest(u, threats);
  const goIn = d === "aggressive" || (d === "capture" && hasBaton(u));
  let goal: Point | null;
  let budget: number;
  if (goIn) {
    goal = threat ?? unexplored(b, middle);
    // Close enough to shoot once it gets there.
    budget = u.tu - Math.max(reserve, targets.length ? tuCost(u.stats.tu, u.weapon?.modes.snap?.tuPct ?? 25) : 0);
  } else {
    // A careful squad holds where it is once it knows where they are, and lets them come.
    if (threat && nearCover(b, u)) return false;
    goal = threat ?? unexplored(b, middle);
    budget = (u.tu - reserve - KNEEL_TU) * (targets.length ? 1 : 0.5);
  }
  if (!goal || budget < 4) return false;
  const g = goal;
  const rate = (p: Point) => {
    let score = dist(p, g);
    if (nearCover(b, p)) score -= d === "aggressive" ? 0.8 : 2;
    // Bunched up, one shot hits two.
    if (squad.some((h) => h !== u && Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) <= 1)) score += 1.2;
    if (!goIn) score += Math.max(0, dist(p, middle) - HUDDLE) * 1.5;
    return score;
  };
  const { cost } = b.reach(u);
  const options: { p: Point; score: number }[] = [];
  for (let i = 0; i < cost.length; i++) {
    const c = cost[i];
    if (!(c > 0) || c > budget) continue;
    const p = { x: i % b.map.w, y: Math.floor(i / b.map.w) };
    options.push({ p, score: rate(p) });
  }
  if (!options.length) return false;
  options.sort((p, q) => p.score - q.score);
  // A fumble picks somewhere that seemed fine at the time.
  const pick = fumble === "move" ? options[Math.floor(rand() * options.length)] : options[0];
  if (fumble !== "move" && pick.score >= rate(u) - 0.5) return false;
  const before = u.tu;
  out.push(...b.move(u.id, pick.p));
  return u.tu < before;
}

/** Plays the rest of a fight out with nobody watching. */
export function playOut(b: Battle, doctrine: Doctrine, rand: () => number, maxRounds = MAX_ROUNDS): void {
  while (!b.outcome && b.turn <= maxRounds) playRound(b, doctrine, rand);
  if (!b.outcome) b.abandon();
}

// ---------- Risk ----------

export interface Risk {
  /** Won without losing anyone. */
  clean: number;
  /** Won, or got out, with someone lost. */
  losses: number;
  /** Wiped out, or half the squad lost. */
  disaster: number;
  /** How far either way the real odds might be, from how well your people know the enemy. */
  spread: number;
  runs: number;
}

/** How much less sure the estimate is against an enemy your people barely know. */
export const RISK_SPREAD = [0.25, 0.15, 0.08, 0.04];

/** One simulated fight from here: how it ended for your people. */
export function simulate(b: Battle, doctrine: Doctrine, seed: number): "clean" | "losses" | "disaster" {
  const f = b.fork(seed);
  const start = f.humans.filter(alive).length;
  playOut(f, doctrine, mulberry32(seed ^ 0x9e3779b9));
  const lost = start - f.humans.filter(alive).length;
  const won = f.outcome === "captured" || f.outcome === "killed";
  if (f.outcome === "wiped" || (lost && lost * 2 >= start)) return "disaster";
  return won && !lost ? "clean" : "losses";
}

/**
 * Odds for autoplaying from here, from simulated fights against what's really out there.
 * The less your people know the enemy, the wider the range they can give.
 */
export function estimateRisk(b: Battle, doctrine: Doctrine, knowledge: number, runs = 24, seed = 1): Risk {
  const n = { clean: 0, losses: 0, disaster: 0 };
  for (let i = 0; i < runs; i++) n[simulate(b, doctrine, seed + i * 7919)]++;
  return { clean: n.clean / runs, losses: n.losses / runs, disaster: n.disaster / runs, spread: RISK_SPREAD[Math.min(3, Math.max(0, knowledge))], runs };
}

/** A share as a range, rounded to fives: "40–70%". */
export function oddsText(p: number, spread: number): string {
  const r = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 20) * 5;
  const lo = r(p - spread);
  const hi = r(p + spread);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
}

// ---------- The rewind timeline ----------

/** Rounds back you can take command from. */
export const REWIND_WINDOW = 6;

/** What happened in a round, for the timeline. */
export interface RoundMarks {
  contact: boolean;
  wounded: string[];
  killed: string[];
  aliensDown: number;
  commanderDown: boolean;
  panics: number;
}

export interface RoundRecord {
  round: number;
  /** The fight at the start of the round, before anyone moved. */
  start: BattleSnapshot;
  /** Played by autoplay. Only those rounds can be taken back. */
  auto: boolean;
  /** Filled in once the round has been played. */
  marks?: RoundMarks;
}

/** What it costs to take command from the start of a round. */
export interface RewindPrice {
  /** Rounds of fighting thrown away, counted from where the fight is now. */
  undone: number;
  /** Rounds you must then play by hand. */
  lockout: number;
  /** Morale everyone loses: command second-guessed them. */
  morale: number;
  /** Why it can't be done, or null. */
  reason: string | null;
}

export const lockoutFor = (undone: number) => 1 + 2 * undone;
export const moraleFor = (undone: number) => Math.min(15, 3 * undone);

/**
 * Every round of the fight, kept so you can go back. Rewinding re-rolls the dice from the start of
 * a round, and the price grows with how far back that is from where the fight has got to.
 */
export class Timeline {
  readonly rounds: RoundRecord[] = [];
  /** Autoplay can't be switched back on before this round. */
  lockedUntil = 0;
  rewinds = 0;

  constructor(public brutal = false) {}

  record(round: number): RoundRecord | undefined {
    return this.rounds.find((r) => r.round === round);
  }

  /** Keeps the fight as it stands at the start of a round, once. */
  begin(b: Battle): void {
    if (b.outcome || b.side !== "human" || this.record(b.turn)) return;
    this.rounds.push({ round: b.turn, start: b.snapshot(), auto: false });
  }

  /** A round has been played (or the fight ended during it): note what happened, and keep the next one. */
  played(b: Battle, round: number, auto: boolean): void {
    const r = this.record(round);
    if (r) {
      r.auto ||= auto;
      r.marks = marks(r.start, b);
    }
    this.begin(b);
  }

  /** Where the fight has got to: the round now being played, or one past the round it ended in. */
  now(b: Battle): number {
    return b.outcome ? b.turn + 1 : b.turn;
  }

  /** Whether autoplay may run this round. */
  locked(b: Battle): boolean {
    return b.turn < this.lockedUntil;
  }

  price(b: Battle, round: number): RewindPrice {
    const undone = this.now(b) - round;
    const out = (reason: string | null): RewindPrice => ({ undone, lockout: lockoutFor(undone), morale: moraleFor(undone), reason });
    const r = this.record(round);
    if (!r) return out("Not recorded");
    if (undone === 0) return out(null);
    if (this.brutal) return out("No going back in brutal mode");
    if (!r.auto) return out("Played by hand");
    if (undone > REWIND_WINDOW) return out("Too far back");
    return out(null);
  }

  /** Takes command from the start of a round: the fight goes back there with new dice, and you play by hand for a while. */
  rewind(b: Battle, round: number, seed: number): RewindPrice {
    const p = this.price(b, round);
    if (p.reason) return p;
    const r = this.record(round)!;
    if (p.undone > 0) {
      b.restore(r.start, seed);
      this.rounds.splice(this.rounds.indexOf(r) + 1);
      delete r.marks;
      this.rewinds++;
      for (const u of b.humans) if (conscious(u)) u.morale = Math.max(0, u.morale - p.morale);
    }
    r.auto = false;
    this.lockedUntil = round + p.lockout;
    return p;
  }

  /** Rounds autoplay played, for what the fight brings home. */
  get autoRounds(): number {
    return this.rounds.filter((r) => r.auto).length;
  }
}

function marks(start: BattleSnapshot, b: Battle): RoundMarks {
  const was = new Map(start.units.map((u) => [u.id, u]));
  const m: RoundMarks = { contact: !start.tally.contact && !!b.tally.contact, wounded: [], killed: [], aliensDown: 0, commanderDown: false, panics: b.tally.panics - start.tally.panics };
  for (const u of b.units) {
    const before = was.get(u.id);
    if (!before) continue;
    if (u.side === "human") {
      if (alive(before) && !alive(u)) m.killed.push(u.name);
      else if (alive(u) && u.health < before.health) m.wounded.push(u.name);
    } else if (conscious(before) && !conscious(u)) {
      m.aliensDown++;
      if (start.inCharge === u.id) m.commanderDown = true;
    }
  }
  return m;
}

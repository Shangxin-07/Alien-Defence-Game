import { batonGrudge } from "./adapt";
import { AlienMind, Personality, RACES, firstLook } from "./aliens";
import { DIRS, Point, TacMap, Thing, dist, facingTo, turnSteps } from "./map";
import { mulberry32 } from "./random";
import {
  ALIEN_FOV,
  FireMode,
  HUMAN_FOV,
  KNEEL_TU,
  SIGHT_DAY,
  SIGHT_NIGHT,
  STAND_TU,
  Side,
  Stats,
  TURN_TU,
  Tool,
  Weapon,
  baseHitChance,
  moraleLoss,
  panicChance,
  rollDamage,
  tuCost,
} from "./rules";

export interface Unit {
  id: number;
  side: Side;
  name: string;
  /** What they were before this started: officer, reservist... */
  role: string;
  stats: Stats;
  x: number;
  y: number;
  facing: number;
  tu: number;
  health: number;
  /** Stun damage taken. When it reaches health, the unit drops. */
  stun: number;
  morale: number;
  /** Bleeding wounds: one health lost per wound at the start of each of the unit's turns. */
  wounds: number;
  kneeling: boolean;
  weapon: Weapon | null;
  ammo: number;
  tools: { tool: Tool; uses: number }[];
  /** Gave away their position by firing this turn. */
  revealed: boolean;
  /** An alien's race, rank and personality. Aliens without one think like the first night's Hunter. */
  mind?: AlienMind;
}

/** How well the aliens are working together: under their leader, under a stand-in, or each for itself. */
export type Coordination = "full" | "partial" | "none";

/** How an alien without a rolled mind thinks: the first night's Hunter, roughly. */
const DEFAULT_MIND: Personality = { aggression: 55, caution: 60, cohesion: 50, cunning: 50 };

export type Outcome = "captured" | "killed" | "wiped" | "fled";

export type BattleEvent =
  | { kind: "move"; unit: number; to: Point; facing: number; seen: boolean }
  | { kind: "face"; unit: number; facing: number }
  | { kind: "kneel"; unit: number; kneeling: boolean }
  | { kind: "door"; at: Point }
  | { kind: "shot"; unit: number; from: Point; to: Point; hit: number | null; plasma: boolean; seen: boolean }
  | { kind: "damage"; unit: number; amount: number; stun: boolean; dead: boolean; out: boolean }
  | { kind: "say"; text: string; tone?: "bad" | "good" }
  | { kind: "spot"; unit: number }
  | { kind: "turn"; side: Side; number: number }
  | { kind: "end"; outcome: Outcome };

/**
 * How your people fought, counted as it happens. The aliens learn from it between fights, and the
 * rewind timeline reads its marks from it.
 */
export interface Tally {
  /** Human turns counted, and the share of each person's time units left unspent at the end, summed. */
  humanTurns: number;
  idleTu: number;
  /** Shots you chose to take; the close ones; shots fired on reflex. */
  shots: number;
  closeShots: number;
  reflexShots: number;
  stunTries: number;
  panics: number;
  /** The turn your people first saw one of them, or 0. */
  contact: number;
}

/** Shots at this range or closer count as pushing in. */
export const CLOSE_RANGE = 5;

const emptyTally = (): Tally => ({ humanTurns: 0, idleTu: 0, shots: 0, closeShots: 0, reflexShots: 0, stunTries: 0, panics: 0, contact: 0 });

/** Everything needed to put a battle back exactly as it was at one moment. */
export interface BattleSnapshot {
  turn: number;
  side: Side;
  outcome: Outcome | null;
  units: Unit[];
  seen: Uint8Array;
  visible: Uint8Array;
  lastSeen: [number, Point][];
  inView: number[];
  scent: [number, Point | null][];
  inCharge: number | null;
  nextUp: number | null;
  stepUpTurn: number;
  alienShakenUntil: number;
  humanShakenUntil: number;
  steady: boolean;
  fallen: number[];
  remarked: number[];
  focus: number[];
  things: Thing[];
  tally: Tally;
}

/** A unit with nothing shared with the original but its weapon, which never changes. */
export function cloneUnit(u: Unit): Unit {
  const c: Unit = { ...u, stats: { ...u.stats }, tools: u.tools.map((t) => ({ ...t })) };
  if (u.mind) c.mind = { ...u.mind, nature: { ...u.mind.nature }, mind: { ...u.mind.mind } };
  return c;
}

export interface ShotPreview {
  /** Chance to hit the target, cover between you included. */
  chance: number;
  tu: number;
  /** Why the shot can't be taken, or null. */
  reason: string | null;
  /** Cover between the shooter and the target. */
  cover: boolean;
}

/** How far the alien can track a heartbeat through walls. */
export const TRACKER_RANGE = 12;
/** Turns the aliens fight badly after losing whoever was giving orders. */
const LEADERLESS_TURNS = 2;
/** Accuracy and reactions while they reorganise. */
const LEADERLESS_ACCURACY = 0.75;
const LEADERLESS_REACTIONS = 0.65;
/** Your people's aim while shaken by losing whoever led them. */
const SHAKEN_ACCURACY = 0.85;
/** A race this sure you sit on reflex fire keeps its distance and shoots from the dark. */
const SNIPE_AT = 0.45;
/** A race this sure you rush it holds its ground in cover and lets you come. */
const BRACE_AT = 0.45;
/** Aim against someone who charged in, once drilled against rushing. */
const CLOSE_DRILL = 1.3;
/** Reactions once drilled against rushing. */
const BRACED_REACTIONS = 2;
/** Spent more than this share of their time units and they've overreached. */
const OVERREACH = 0.3;
/** Just past how far your people see at night. */
const SNIPE_RANGE = SIGHT_NIGHT + 1;
/** Health the alien grows back each turn. */
export const ALIEN_REGEN = 2;
/** Reaction fire and plain misses fly this far before they're spent. */
const SHOT_REACH = 30;

export const alive = (u: Unit) => u.health > 0;
export const conscious = (u: Unit) => u.health > 0 && u.stun < u.health;

/**
 * One battle, played out in turns. Every action spends time units, updates the state at once
 * and returns what happened as events, so the screen can play them back and the rules can be tested.
 */
export class Battle {
  turn = 1;
  side: Side = "human";
  outcome: Outcome | null = null;
  /** Tiles your people have ever seen, and can see right now. */
  readonly seen: Uint8Array;
  readonly visible: Uint8Array;
  /** Where your people last saw each alien, by id. */
  readonly lastSeen = new Map<number, Point>();
  /** Aliens your people can see right now, by id. */
  private readonly inView = new Set<number>();
  /** Where each alien thinks you are: noises, glimpses. A coordinated squad shares what it knows. */
  private readonly scent = new Map<number, Point | null>();
  /** Who leads your people. Losing them shakes everyone. */
  readonly humanLeader: number | null;
  /** The alien giving orders now, if any. */
  inCharge: number | null = null;
  /** Who steps up when the one in charge falls, and from which turn. */
  private nextUp: number | null = null;
  private stepUpTurn = 0;
  /** Penalties run up to and including these turns. */
  private alienShakenUntil = 0;
  private humanShakenUntil = 0;
  /** Your people saw their leader die: steadier against panic for the rest of the fight. */
  steady = false;
  /** Units whose fall has been dealt with. */
  private readonly fallen = new Set<number>();
  /** Aliens a soldier has already remarked on. */
  private readonly remarked = new Set<number>();
  /** Humans the aliens have hit this turn: a coordinated squad piles onto them. */
  private readonly focus = new Set<number>();
  /** How your people have fought so far. */
  tally: Tally = emptyTally();
  private rand: () => number;
  private events: BattleEvent[] = [];

  constructor(readonly map: TacMap, readonly units: Unit[], seed = 1, scent: Point | null = null) {
    this.rand = mulberry32(seed);
    this.seen = new Uint8Array(map.w * map.h);
    this.visible = new Uint8Array(map.w * map.h);
    for (const a of this.aliens) this.scent.set(a.id, scent);
    this.inCharge = this.aliens.find((a) => a.mind?.rank === "leader")?.id ?? null;
    this.nextUp = this.aliens.find((a) => a.mind?.rank === "second")?.id ?? null;
    // The bravest leads, when there's anyone to lead.
    const people = this.humans;
    this.humanLeader = people.length > 1 ? people.reduce((p, q) => (q.stats.bravery > p.stats.bravery ? q : p)).id : null;
    this.updateVision();
  }

  get humans(): Unit[] {
    return this.units.filter((u) => u.side === "human");
  }

  get aliens(): Unit[] {
    return this.units.filter((u) => u.side === "alien");
  }

  /** The first alien: the only one in a fight against a lone alien. */
  get alien(): Unit {
    return this.aliens[0];
  }

  unit(id: number): Unit {
    return this.units.find((u) => u.id === id)!;
  }

  unitAt(x: number, y: number): Unit | undefined {
    return this.units.find((u) => alive(u) && u.x === x && u.y === y);
  }

  // ---------- Rewinding ----------

  /** The whole state of the fight, to come back to later. */
  snapshot(): BattleSnapshot {
    return {
      turn: this.turn,
      side: this.side,
      outcome: this.outcome,
      units: this.units.map(cloneUnit),
      seen: this.seen.slice(),
      visible: this.visible.slice(),
      lastSeen: [...this.lastSeen].map(([id, p]) => [id, { ...p }]),
      inView: [...this.inView],
      scent: [...this.scent].map(([id, p]) => [id, p && { ...p }]),
      inCharge: this.inCharge,
      nextUp: this.nextUp,
      stepUpTurn: this.stepUpTurn,
      alienShakenUntil: this.alienShakenUntil,
      humanShakenUntil: this.humanShakenUntil,
      steady: this.steady,
      fallen: [...this.fallen],
      remarked: [...this.remarked],
      focus: [...this.focus],
      things: [...this.map.thing],
      tally: { ...this.tally },
    };
  }

  /**
   * Puts the fight back as it was, with fresh dice: what happens next won't be what happened before.
   * Units keep their identity, so anything holding one still holds the same person.
   */
  restore(s: BattleSnapshot, seed: number): void {
    this.rand = mulberry32(seed);
    this.turn = s.turn;
    this.side = s.side;
    this.outcome = s.outcome;
    for (const saved of s.units) Object.assign(this.unit(saved.id), cloneUnit(saved));
    this.seen.set(s.seen);
    this.visible.set(s.visible);
    const refill = <K, V>(m: Map<K, V>, entries: [K, V][]) => {
      m.clear();
      for (const [k, v] of entries) m.set(k, v);
    };
    const reset = <T,>(set: Set<T>, items: T[]) => {
      set.clear();
      for (const i of items) set.add(i);
    };
    refill(this.lastSeen, s.lastSeen.map(([id, p]) => [id, { ...p }]));
    reset(this.inView, s.inView);
    refill(this.scent, s.scent.map(([id, p]) => [id, p && { ...p }]));
    this.inCharge = s.inCharge;
    this.nextUp = s.nextUp;
    this.stepUpTurn = s.stepUpTurn;
    this.alienShakenUntil = s.alienShakenUntil;
    this.humanShakenUntil = s.humanShakenUntil;
    this.steady = s.steady;
    reset(this.fallen, s.fallen);
    reset(this.remarked, s.remarked);
    reset(this.focus, s.focus);
    s.things.forEach((t, i) => (this.map.thing[i] = t));
    this.tally = { ...s.tally };
    this.events = [];
  }

  /** A separate copy of the fight from here, with its own dice, to play out without touching this one. */
  fork(seed: number): Battle {
    const b = new Battle(this.map.clone(), this.units.map(cloneUnit), seed);
    b.restore(this.snapshot(), seed);
    return b;
  }

  /** Whether your people can see this alien right now. */
  isSeen(u: Unit): boolean {
    return this.inView.has(u.id);
  }

  /** Whether any alien is in view. */
  get alienSeen(): boolean {
    return this.inView.size > 0;
  }

  /** How well the aliens are working together right now. */
  coordination(): Coordination {
    const boss = this.inCharge === null ? null : this.unit(this.inCharge);
    if (!boss || !conscious(boss)) return "none";
    return boss.mind?.rank === "leader" ? "full" : "partial";
  }

  /** Accuracy and reactions after leaders fall. */
  accuracyOf(u: Unit): number {
    if (u.side === "alien" && this.turn <= this.alienShakenUntil) return u.stats.accuracy * LEADERLESS_ACCURACY;
    if (u.side === "human" && this.turn <= this.humanShakenUntil) return u.stats.accuracy * SHAKEN_ACCURACY;
    return u.stats.accuracy;
  }

  reactionsOf(u: Unit): number {
    if (u.side === "alien" && this.turn <= this.alienShakenUntil) return u.stats.reactions * LEADERLESS_REACTIONS;
    return u.stats.reactions;
  }

  /**
   * An alien whose race has learned that you rush is waiting for exactly that: it's quicker on the
   * trigger, and steadier, against anyone who has spent their turn charging rather than holding ground.
   */
  private braced(u: Unit): boolean {
    return (u.mind?.counters?.pushing ?? 0) >= BRACE_AT;
  }

  private overreached(t: Unit | undefined): boolean {
    return !!t && t.side === "human" && t.tu < t.stats.tu * OVERREACH;
  }

  /** Aim against whoever walked into it. */
  drill(u: Unit, target: Point): number {
    return this.braced(u) && this.overreached(this.unitAt(target.x, target.y)) ? CLOSE_DRILL : 1;
  }

  /** Reflexes against whoever walked into it. */
  reflex(u: Unit, mover: Unit): number {
    return this.braced(u) && this.overreached(mover) ? BRACED_REACTIONS : 1;
  }

  /** Whether the aliens are still reeling from losing whoever gave the orders. */
  get aliensReeling(): boolean {
    return this.turn <= this.alienShakenUntil;
  }

  get humansShaken(): boolean {
    return this.turn <= this.humanShakenUntil;
  }

  // ---------- Sight ----------

  /** Whether a unit can see a tile. Revealed targets (muzzle flash) can be seen in the dark. */
  canSee(u: Unit, p: Point, revealed = false): boolean {
    const d = dist(u, p);
    if (d < 1.5) return true;
    if (d > SIGHT_DAY) return false;
    const lit = revealed || u.side === "alien" || this.map.lit[this.map.idx(p.x, p.y)] === 1;
    if (!lit && d > SIGHT_NIGHT) return false;
    const fx = DIRS[u.facing].x;
    const fy = DIRS[u.facing].y;
    const cos = ((p.x - u.x) * fx + (p.y - u.y) * fy) / (d * Math.hypot(fx, fy));
    const fov = u.side === "alien" ? ALIEN_FOV : HUMAN_FOV;
    if (cos < Math.cos((fov * Math.PI) / 180) - 1e-9) return false;
    return this.map.clearLine(u, p);
  }

  /** Whether the other side can see this unit right now. */
  spotted(u: Unit): boolean {
    return this.units.some((o) => o.side !== u.side && conscious(o) && this.canSee(o, u, u.revealed));
  }

  /** Recomputes what your people can see. Returns the aliens that just came into view. */
  private updateVision(): Unit[] {
    this.visible.fill(0);
    for (const u of this.humans) {
      if (!conscious(u)) continue;
      for (let y = Math.max(0, u.y - SIGHT_DAY); y <= Math.min(this.map.h - 1, u.y + SIGHT_DAY); y++) {
        for (let x = Math.max(0, u.x - SIGHT_DAY); x <= Math.min(this.map.w - 1, u.x + SIGHT_DAY); x++) {
          const i = this.map.idx(x, y);
          if (this.visible[i]) continue;
          if (this.canSee(u, { x, y })) this.visible[i] = this.seen[i] = 1;
        }
      }
    }
    const fresh: Unit[] = [];
    for (const a of this.aliens) {
      const now = alive(a) && this.spotted(a);
      if (now && !this.inView.has(a.id)) fresh.push(a);
      if (now) {
        this.inView.add(a.id);
        this.lastSeen.set(a.id, { x: a.x, y: a.y });
      } else this.inView.delete(a.id);
    }
    return fresh;
  }

  /** Spot events for aliens that just came into view, and what your people make of them. */
  private announce(fresh: Unit[]) {
    for (const a of fresh) {
      this.events.push({ kind: "spot", unit: a.id });
      if (!this.tally.contact) this.tally.contact = this.turn;
      if (!a.mind || this.remarked.has(a.id) || !conscious(a)) continue;
      this.remarked.add(a.id);
      // You can only tell who's in charge while they're still following orders.
      if (a.mind.rank === "leader" && this.coordination() !== "full") continue;
      const line = firstLook(a.mind);
      if (line) this.events.push({ kind: "say", text: `"${line}"` });
    }
  }

  // ---------- Your actions ----------

  /** Everywhere a unit can walk this turn, and the routes there. */
  reach(u: Unit): ReturnType<TacMap["reach"]> {
    const budget = u.tu - (u.kneeling ? STAND_TU : 0);
    return this.map.reach(u, Math.max(0, budget), this.occupied(u));
  }

  private occupied(except: Unit): Set<number> {
    return new Set(this.units.filter((o) => o !== except && alive(o)).map((o) => this.map.idx(o.x, o.y)));
  }

  /** Walks a unit along its cheapest route. Stops early if it spots the alien or is shot. */
  move(id: number, target: Point): BattleEvent[] {
    this.events = [];
    const u = this.unit(id);
    if (!this.mayAct(u)) return this.flush();
    const { cost, prev } = this.reach(u);
    if (!Number.isFinite(cost[this.map.idx(target.x, target.y)])) return this.flush();
    if (u.kneeling) this.setKneel(u, false);
    this.walk(u, this.map.route(prev, target));
    return this.flush();
  }

  /** Turns to face a tile, 1 TU per 45°. */
  face(id: number, target: Point): BattleEvent[] {
    this.events = [];
    const u = this.unit(id);
    if (!this.mayAct(u)) return this.flush();
    const f = facingTo(u, target);
    const cost = turnSteps(u.facing, f) * TURN_TU;
    if (!cost || cost > u.tu) return this.flush();
    u.tu -= cost;
    u.facing = f;
    this.events.push({ kind: "face", unit: u.id, facing: f });
    const fresh = this.updateVision();
    if (fresh.length) {
      this.announce(fresh);
      this.events.push({ kind: "say", text: `${u.name}: "There it is!"`, tone: "bad" });
    }
    return this.flush();
  }

  kneel(id: number): BattleEvent[] {
    this.events = [];
    const u = this.unit(id);
    if (this.mayAct(u)) this.setKneel(u, !u.kneeling);
    return this.flush();
  }

  previewShot(id: number, target: Point, mode: FireMode): ShotPreview {
    const u = this.unit(id);
    const w = u.weapon;
    const m = w?.modes[mode];
    const tu = m ? tuCost(u.stats.tu, m.tuPct) + turnSteps(u.facing, facingTo(u, target)) * TURN_TU : 0;
    const no = (reason: string): ShotPreview => ({ chance: 0, tu, reason, cover: false });
    if (!w || !m) return no("Can't fire that way");
    if (u.x === target.x && u.y === target.y) return no("Pick a target");
    if (u.ammo <= 0) return no("Out of ammo");
    if (tu > u.tu) return no("Not enough time units");
    if (!this.map.clearLine(u, target)) return no("No line of fire");
    const base = baseHitChance(this.accuracyOf(u) * this.drill(u, target), m, w, dist(u, target), u.kneeling, u.wounds * 4);
    let through = 1;
    let cover = false;
    const target_ = this.unitAt(target.x, target.y);
    for (const p of this.map.line(u, target).slice(1, -1)) {
      const k = this.interceptChance(u, p, target_);
      if (k) cover = true;
      through *= 1 - k;
      const other = this.unitAt(p.x, p.y);
      if (other) through *= 0.5;
    }
    return { chance: base * through, tu, reason: null, cover };
  }

  shoot(id: number, target: Point, mode: FireMode): BattleEvent[] {
    this.events = [];
    const u = this.unit(id);
    if (!this.mayAct(u)) return this.flush();
    const p = this.previewShot(id, target, mode);
    if (p.reason) return this.flush();
    if (u.side === "human") {
      this.tally.shots++;
      if (dist(u, target) <= CLOSE_RANGE) this.tally.closeShots++;
    }
    this.fire(u, target, mode);
    if (u.side === "human") {
      // They hear every shot.
      for (const a of this.aliens) this.scent.set(a.id, { x: u.x, y: u.y });
      this.react(u);
    }
    this.check();
    return this.flush();
  }

  /** Swing at an adjacent enemy with a stun weapon. */
  previewStun(id: number, target: Unit): ShotPreview {
    const u = this.unit(id);
    const tool = u.tools.find((t) => t.tool.kind === "stun");
    const tu = tool ? tuCost(u.stats.tu, tool.tool.tuPct) + turnSteps(u.facing, facingTo(u, target)) * TURN_TU : 0;
    const no = (reason: string): ShotPreview => ({ chance: 0, tu, reason, cover: false });
    if (!tool) return no("No stun weapon");
    if (Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y)) > 1) return no("Get next to it first");
    if (tu > u.tu) return no("Not enough time units");
    return { chance: Math.min(0.95, u.stats.melee / 100), tu, reason: null, cover: false };
  }

  stun(id: number, targetId: number): BattleEvent[] {
    this.events = [];
    const u = this.unit(id);
    const t = this.unit(targetId);
    if (!this.mayAct(u) || !conscious(t)) return this.flush();
    const p = this.previewStun(id, t);
    if (p.reason) return this.flush();
    const tool = u.tools.find((x) => x.tool.kind === "stun")!;
    if (u.side === "human") this.tally.stunTries++;
    this.turnToward(u, t);
    u.tu -= tuCost(u.stats.tu, tool.tool.tuPct);
    if (this.rand() < p.chance) {
      const amount = Math.max(1, Math.round(tool.tool.power * (0.5 + this.rand())) - Math.round(t.stats.armour / 2));
      t.stun += amount;
      const out = t.stun >= t.health;
      this.events.push({ kind: "damage", unit: t.id, amount, stun: true, dead: false, out });
      this.events.push({ kind: "say", text: out ? `${u.name} drops it. It's down and breathing.` : `${u.name} lands the baton: ${amount} stun.`, tone: "good" });
    } else {
      this.events.push({ kind: "say", text: `${u.name} swings and misses.`, tone: "bad" });
    }
    if (conscious(t) && t.side === "alien") this.smell(t, u);
    this.react(u);
    this.check();
    return this.flush();
  }

  /** Patch up yourself or someone next to you. Stops all bleeding. */
  previewHeal(id: number, target: Unit): ShotPreview {
    const u = this.unit(id);
    const kit = u.tools.find((t) => t.tool.kind === "medkit");
    const tu = kit ? tuCost(u.stats.tu, kit.tool.tuPct) : 0;
    const no = (reason: string): ShotPreview => ({ chance: 0, tu, reason, cover: false });
    if (!kit || kit.uses <= 0) return no("No medikit uses left");
    if (target.side !== u.side || !alive(target)) return no("Pick a wounded friend");
    if (Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y)) > 1) return no("Get next to them first");
    if (!target.wounds && target.health >= target.stats.health) return no("Not hurt");
    if (tu > u.tu) return no("Not enough time units");
    return { chance: 1, tu, reason: null, cover: false };
  }

  heal(id: number, targetId: number): BattleEvent[] {
    this.events = [];
    const u = this.unit(id);
    const t = this.unit(targetId);
    if (!this.mayAct(u) || this.previewHeal(id, t).reason) return this.flush();
    const kit = u.tools.find((x) => x.tool.kind === "medkit")!;
    u.tu -= tuCost(u.stats.tu, kit.tool.tuPct);
    kit.uses--;
    const before = t.health;
    t.wounds = 0;
    t.health = Math.min(t.stats.health, t.health + kit.tool.power);
    t.stun = Math.max(0, t.stun - 10);
    this.events.push({ kind: "say", text: `${u.name} patches up ${t === u ? "their own wounds" : t.name}: bleeding stopped${t.health > before ? `, +${t.health - before} health` : ""}.`, tone: "good" });
    return this.flush();
  }

  /** Ends your turn: the alien moves, then a new turn starts. */
  endTurn(): BattleEvent[] {
    this.events = [];
    if (this.outcome || this.side !== "human") return this.flush();
    this.side = "alien";
    const up = this.humans.filter(conscious);
    if (up.length) {
      this.tally.humanTurns++;
      this.tally.idleTu += up.reduce((n, u) => n + u.tu / u.stats.tu, 0) / up.length;
    }
    for (const u of this.humans) u.revealed = false;
    this.events.push({ kind: "turn", side: "alien", number: this.turn });
    this.startTurn("alien");
    if (!this.outcome) this.alienTurn();
    if (!this.outcome) {
      this.turn++;
      this.side = "human";
      for (const a of this.aliens) a.revealed = false;
      this.events.push({ kind: "turn", side: "human", number: this.turn });
      this.startTurn("human");
    }
    this.updateVision();
    return this.flush();
  }

  /** Run for it. The alien keeps its tech. */
  abandon(): BattleEvent[] {
    this.events = [];
    if (!this.outcome) this.finish("fled");
    return this.flush();
  }

  // ---------- Rules ----------

  private mayAct(u: Unit): boolean {
    return !this.outcome && this.side === u.side && conscious(u);
  }

  private flush(): BattleEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private setKneel(u: Unit, kneeling: boolean) {
    const cost = kneeling ? KNEEL_TU : STAND_TU;
    if (u.tu < cost || u.kneeling === kneeling) return;
    u.tu -= cost;
    u.kneeling = kneeling;
    this.events.push({ kind: "kneel", unit: u.id, kneeling });
  }

  private turnToward(u: Unit, p: Point) {
    const f = facingTo(u, p);
    const steps = turnSteps(u.facing, f);
    if (!steps) return;
    u.tu -= steps * TURN_TU;
    u.facing = f;
    this.events.push({ kind: "face", unit: u.id, facing: f });
  }

  /** Walks step by step. Returns false if the walk was cut short. */
  private walk(u: Unit, path: Point[]): boolean {
    for (const step of path) {
      const cost = this.map.stepCost(u, step);
      if (cost > u.tu || this.unitAt(step.x, step.y)) return false;
      const i = this.map.idx(step.x, step.y);
      if (this.map.thing[i] === "door") {
        this.map.thing[i] = "open";
        this.events.push({ kind: "door", at: step });
      }
      u.tu -= cost;
      u.facing = facingTo(u, step);
      u.x = step.x;
      u.y = step.y;
      const fresh = this.updateVision();
      this.events.push({ kind: "move", unit: u.id, to: { x: u.x, y: u.y }, facing: u.facing, seen: u.side === "human" || this.isSeen(u) });
      if (u.side === "human" && fresh.length) {
        this.announce(fresh);
        this.events.push({ kind: "say", text: `${u.name}: "Contact!"`, tone: "bad" });
        this.react(u);
        return false;
      }
      if (u.side === "alien" && fresh.includes(u)) {
        this.announce([u]);
        this.events.push({ kind: "say", text: "Movement! Something's out there.", tone: "bad" });
      }
      this.react(u);
      if (!conscious(u) || this.outcome) return false;
    }
    return true;
  }

  /** Enemies who see a unit spend its moment to shoot at it, if they're quicker. */
  private react(mover: Unit) {
    if (!conscious(mover)) return;
    const moverScore = this.reactionsOf(mover) * (mover.tu / mover.stats.tu);
    for (const e of this.units) {
      if (e.side === mover.side || !conscious(e) || !e.weapon || e.ammo <= 0 || this.outcome) continue;
      const snap = e.weapon.modes.snap;
      if (!snap) continue;
      const cost = tuCost(e.stats.tu, snap.tuPct) + turnSteps(e.facing, facingTo(e, mover)) * TURN_TU;
      if (cost > e.tu || !this.canSee(e, mover, mover.revealed)) continue;
      if (this.reactionsOf(e) * this.reflex(e, mover) * (e.tu / e.stats.tu) <= moverScore) continue;
      this.events.push({ kind: "say", text: e.side === "alien" ? "It fires as you move!" : `${e.name} fires on reflex!`, tone: e.side === "alien" ? "bad" : "good" });
      if (e.side === "human") this.tally.reflexShots++;
      this.fire(e, { x: mover.x, y: mover.y }, "snap");
      if (e.side === "human") this.smell(mover, e);
      this.check();
      if (!conscious(mover)) return;
    }
  }

  /** Chance a piece of cover on the line soaks up a shot. Cover right in front of the shooter is shot over. */
  private interceptChance(shooter: Unit, p: Point, target?: Unit): number {
    if (!this.map.isCover(p.x, p.y)) return 0;
    if (Math.max(Math.abs(p.x - shooter.x), Math.abs(p.y - shooter.y)) <= 1) return 0;
    const hugging = target && Math.max(Math.abs(p.x - target.x), Math.abs(p.y - target.y)) <= 1;
    if (hugging && target.kneeling) return 0.6;
    return hugging ? 0.4 : 0.25;
  }

  private fire(u: Unit, target: Point, mode: FireMode) {
    const w = u.weapon!;
    const m = w.modes[mode]!;
    this.turnToward(u, target);
    u.tu -= tuCost(u.stats.tu, m.tuPct);
    u.revealed = true;
    const aimedAt = this.unitAt(target.x, target.y);
    for (let s = 0; s < m.shots && u.ammo > 0; s++) {
      u.ammo--;
      const chance = baseHitChance(this.accuracyOf(u) * this.drill(u, target), m, w, dist(u, target), u.kneeling, u.wounds * 4);
      const onTarget = this.rand() < chance;
      let end = target;
      if (!onTarget) {
        // A miss goes somewhere near, worse the further the target.
        const spread = 0.8 + dist(u, target) * 0.12;
        end = { x: target.x + (this.rand() * 2 - 1) * spread * 1.6, y: target.y + (this.rand() * 2 - 1) * spread * 1.6 };
      }
      const d = dist(u, end) || 1;
      const far = {
        x: Math.round(u.x + ((end.x - u.x) / d) * SHOT_REACH),
        y: Math.round(u.y + ((end.y - u.y) / d) * SHOT_REACH),
      };
      const path = this.map.line(u, onTarget ? target : far);
      let impact = path[path.length - 1];
      let hit: Unit | null = null;
      for (const p of path.slice(1)) {
        if (!this.map.inside(p.x, p.y) || this.map.blocksSight(p.x, p.y)) {
          impact = p;
          break;
        }
        const there = this.unitAt(p.x, p.y);
        const intended = there && there === aimedAt && p.x === target.x && p.y === target.y;
        if (there && there !== u) {
          if (intended && onTarget) {
            hit = there;
            impact = p;
            break;
          }
          if (!intended && this.rand() < 0.5) {
            hit = there;
            impact = p;
            break;
          }
        }
        if (this.rand() < this.interceptChance(u, p, aimedAt)) {
          impact = p;
          break;
        }
        impact = p;
        if (onTarget && p.x === target.x && p.y === target.y) break;
      }
      const seen = u.side === "human" || this.spotted(u);
      this.events.push({ kind: "shot", unit: u.id, from: { x: u.x, y: u.y }, to: impact, hit: hit?.id ?? null, plasma: !!w.alien, seen });
      if (hit) this.damage(hit, w.power, u);
      if (this.outcome) return;
    }
    if (u.ammo <= 0) this.events.push({ kind: "say", text: `${u.name} is out of ammo.`, tone: "bad" });
  }

  private damage(t: Unit, power: number, by: Unit) {
    const amount = rollDamage(power, t.stats.armour, this.rand);
    t.health = Math.max(0, t.health - amount);
    if (amount >= 10) t.wounds += amount >= 25 ? 2 : 1;
    const dead = t.health <= 0;
    this.events.push({ kind: "damage", unit: t.id, amount, stun: false, dead, out: !dead && t.stun >= t.health });
    if (t.side === "human") {
      if (amount) t.morale = Math.max(0, t.morale - 10);
      this.events.push({
        kind: "say",
        text: dead ? `${t.name} is killed.` : amount ? `${t.name} is hit for ${amount}${t.wounds ? ", bleeding" : ""}.` : `${t.name} is grazed. Armour held.`,
        tone: "bad",
      });
      if (dead) for (const h of this.humans) if (alive(h) && h !== t) h.morale = Math.max(0, h.morale - moraleLoss(h.stats.bravery));
      if (by.side === "human" && t !== by) this.events.push({ kind: "say", text: `Friendly fire from ${by.name}.`, tone: "bad" });
      if (by.side === "alien" && amount) this.focus.add(t.id);
    } else {
      const it = this.aliens.length > 1 ? `The ${t.name.toLowerCase()}` : "The alien";
      this.events.push({ kind: "say", text: dead ? `${it} goes down. It's dead.` : amount ? `Hit! ${amount} damage.` : "Hit, but it shrugs it off.", tone: "good" });
      if (!dead && by.side === "human") this.smell(t, by);
    }
    if (dead) t.kneeling = false;
  }

  /** Bleeding, then morale and panic, at the start of a side's turn. */
  private startTurn(side: Side) {
    if (side === "alien") this.stepUp();
    const together = this.coordination() !== "none" || this.aliens.length === 1;
    for (const u of this.units) {
      if (u.side !== side || !alive(u)) continue;
      // Its wounds close by themselves, and it slowly heals.
      if (u.side === "alien") {
        u.wounds = 0;
        u.health = Math.min(u.stats.health, u.health + (u.mind ? RACES[u.mind.race].regen : ALIEN_REGEN));
      }
      if (u.wounds) {
        u.health = Math.max(0, u.health - u.wounds);
        const dead = u.health <= 0;
        this.events.push({ kind: "damage", unit: u.id, amount: u.wounds, stun: false, dead, out: false });
        if (side === "human") this.events.push({ kind: "say", text: dead ? `${u.name} bleeds out.` : `${u.name} is bleeding (−${u.wounds}).`, tone: "bad" });
        if (dead && side === "human") for (const h of this.humans) if (alive(h) && h !== u) h.morale = Math.max(0, h.morale - moraleLoss(h.stats.bravery));
      }
      if (!conscious(u)) continue;
      u.tu = u.stats.tu;
      if (side === "human") {
        u.morale = Math.min(100, u.morale + 10);
        if (this.rand() < panicChance(u.morale) * (this.steady ? 0.5 : 1)) {
          u.tu = 0;
          this.tally.panics++;
          this.events.push({ kind: "say", text: `${u.name} panics and freezes.`, tone: "bad" });
        }
        continue;
      }
      // Without anyone giving orders, their nerve comes back slowly.
      u.morale = Math.min(100, u.morale + (together ? 10 : 3));
      if (u.mind) this.nerve(u, u.mind);
    }
    this.check();
  }

  /** A frightened alien may charge, bolt or freeze, by its nature. */
  private nerve(a: Unit, m: AlienMind) {
    m.state = "steady";
    if (this.rand() >= panicChance(a.morale)) return;
    m.state = m.mind.aggression >= 65 ? "berserk" : m.mind.caution >= 50 || m.mind.cunning >= 60 ? "cowering" : "frozen";
    const seen = this.isSeen(a);
    const text =
      m.state === "berserk"
        ? seen
          ? `The ${a.name.toLowerCase()} shrieks and comes straight at you.`
          : "Something out there is screaming."
        : m.state === "cowering"
          ? seen
            ? `The ${a.name.toLowerCase()} breaks and scrambles for cover.`
            : "You hear something scrambling away."
          : seen
            ? `The ${a.name.toLowerCase()} just stands there.`
            : null;
    if (text) this.events.push({ kind: "say", text, tone: "good" });
    if (m.state === "frozen") a.tu = 0;
  }

  /** The next in line takes charge once the shock has passed, if they're still standing. */
  private stepUp() {
    if (this.inCharge !== null || this.nextUp === null || this.turn < this.stepUpTurn) return;
    const s = this.unit(this.nextUp);
    this.nextUp = null;
    if (!s || !conscious(s)) return;
    this.inCharge = s.id;
    // It pulls them back together: the worst of the confusion ends now.
    this.alienShakenUntil = Math.min(this.alienShakenUntil, this.turn - 1);
    this.events.push({ kind: "say", text: this.isSeen(s) ? `Another one is giving the orders now.` : "The noises out there are getting organised again.", tone: "bad" });
  }

  /** Someone just died or dropped: what it does to both sides. */
  private onFall(u: Unit) {
    if (u.side === "human") {
      if (u.id !== this.humanLeader) return;
      this.humanShakenUntil = this.turn + 1;
      for (const h of this.humans) if (conscious(h)) h.morale = Math.max(0, h.morale - 20);
      for (const a of this.aliens) if (conscious(a)) a.morale = Math.min(100, a.morale + 15);
      this.events.push({ kind: "say", text: `${u.name} is down. Nobody's sure who's calling it now.`, tone: "bad" });
      return;
    }
    const commander = u.id === this.inCharge;
    for (const a of this.aliens) {
      if (a === u || !conscious(a)) continue;
      const cohesion = (a.mind ?? { mind: DEFAULT_MIND }).mind.cohesion;
      a.morale = Math.max(0, a.morale - Math.round(moraleLoss(a.stats.bravery) * (0.5 + cohesion / 100)));
      if (!commander) continue;
      // A tight squad leaned on its leader, and falls harder.
      a.morale = Math.max(0, a.morale - Math.round(15 + cohesion * 0.35));
      if (a.mind) {
        const m = a.mind.mind;
        // Hotheads get reckless; the rest get careful.
        if (m.aggression >= 60 || a.mind.maverick) m.aggression = Math.min(100, m.aggression + 15);
        else m.caution = Math.min(100, m.caution + 15);
      }
    }
    if (!commander) return;
    this.inCharge = null;
    this.alienShakenUntil = this.turn + LEADERLESS_TURNS;
    this.stepUpTurn = this.turn + LEADERLESS_TURNS;
    if (this.nextUp === u.id) this.nextUp = null;
    if (!this.aliens.some((a) => a !== u && conscious(a))) return;
    this.steady = true;
    for (const h of this.humans) if (conscious(h)) h.morale = Math.min(100, h.morale + 25);
    this.events.push({ kind: "say", text: "That one was giving the orders. The rest are falling apart.", tone: "good" });
  }

  private check() {
    if (this.outcome) return;
    for (const u of this.units) {
      if (conscious(u) || this.fallen.has(u.id)) continue;
      this.fallen.add(u.id);
      this.onFall(u);
    }
    const aliens = this.aliens;
    if (!aliens.some(conscious)) return this.finish(aliens.some(alive) ? "captured" : "killed");
    if (!this.humans.some(conscious)) return this.finish("wiped");
  }

  private finish(o: Outcome) {
    this.outcome = o;
    this.events.push({ kind: "end", outcome: o });
  }

  // ---------- The aliens ----------

  private alienTurn() {
    this.focus.clear();
    for (const a of this.aliens) {
      if (this.outcome) return;
      if (conscious(a)) this.alienActs(a);
    }
  }

  /** How an alien leans right now. */
  private mindOf(a: Unit): Personality {
    return a.mind?.mind ?? DEFAULT_MIND;
  }

  /** One alien's turn, played the way its personality and nerve say. */
  private alienActs(a: Unit) {
    const p = this.mindOf(a);
    const state = a.mind?.state ?? "steady";
    if (state === "frozen") return;
    const berserk = state === "berserk";
    const snapCost = tuCost(a.stats.tu, a.weapon!.modes.snap!.tuPct);
    const learned = berserk ? undefined : a.mind?.counters;
    // Learned that you sit tight on reflex fire: it shoots from the dark rather than walk into it.
    const sniper = (learned?.holding ?? 0) >= SNIPE_AT;
    // Learned that you rush: it keeps two shots back for when you overreach.
    const braced = (learned?.pushing ?? 0) >= BRACE_AT;
    // The reckless keep nothing back for reflexes.
    // A sniper is all in on the long shot and keeps nothing back, which is what a rush catches.
    // A braced one always keeps a shot back.
    const reserve = berserk || sniper || (p.aggression >= 75 && p.caution < 40 && !braced) ? 0 : snapCost;
    const keepOff = sniper ? SNIPE_RANGE : 0;
    // How good a shot has to be before it takes it.
    const minShot = berserk ? 0.05 : Math.max(0.12, Math.min(0.4, 0.35 - p.aggression * 0.002));
    // Under this share of its health, it breaks off and looks for somewhere to hide.
    const retreatAt = berserk ? 0 : state === "cowering" ? 2 : Math.max(0.05, Math.min(0.7, 0.2 + p.caution * 0.005 - p.aggression * 0.0018));
    // How far it will close in for a better shot. Leaders hang back.
    const closeSteps = berserk ? 99 : a.mind?.rank === "leader" && this.coordination() === "full" ? 2 : Math.round(2 + p.aggression / 20);
    let closedIn = false;
    for (let guard = 0; guard < 12 && !this.outcome && conscious(a); guard++) {
      const targets = this.targetsFor(a);
      if (targets.length && a.mind) a.mind.waited = 0;
      if (a.health < a.stats.health * retreatAt) {
        if (targets.length && this.tryShoot(a, targets, Math.max(0.45, minShot))) continue;
        this.retreat(a, reserve);
        break;
      }
      if (targets.length) {
        if (this.tryShoot(a, targets, minShot)) continue;
        // Poor odds: close in on the nearest once, keeping enough to fire on reflex.
        const t = targets.sort((x, y) => dist(a, x) - dist(a, y))[0];
        // A sniper takes the long shot from out in the dark instead.
        if (sniper && dist(a, t) >= SNIPE_RANGE) {
          if (this.tryShoot(a, targets, 0.08)) continue;
          break;
        }
        if (!closedIn && this.advance(a, t, reserve, closeSteps, berserk ? 1 : 3, true)) {
          closedIn = true;
          continue;
        }
        // Can't get a view this turn: take whatever shot there is, or start walking.
        if (this.tryShoot(a, targets, berserk ? 0.02 : 0.08)) continue;
        if (!closedIn && this.advance(a, t, reserve, closeSteps * 2, 3)) {
          closedIn = true;
          continue;
        }
        break;
      }
      const goal = this.hunt(a);
      if (!goal) break;
      if (this.lieInWait(a, goal, p)) return;
      const plan = this.approach(a, goal, p);
      if (!this.advance(a, plan.goal, reserve, 99, sniper && !plan.alone ? SIGHT_DAY - 4 : plan.within, false, plan.alone, keepOff)) break;
    }
    // Ends its turn looking where it expects you to come from.
    const goal = this.hunt(a);
    if (goal && conscious(a)) this.look(a, goal);
  }

  private look(a: Unit, p: Point) {
    const f = facingTo(a, p);
    if (f === a.facing) return;
    a.facing = f;
    this.events.push({ kind: "face", unit: a.id, facing: f });
  }

  /** Who it can shoot at: what it sees, or, while the squad works together, what any of them sees. */
  private targetsFor(a: Unit): Unit[] {
    const eyes = this.coordination() === "none" ? [a] : this.aliens.filter(conscious);
    return this.humans.filter((h) => conscious(h) && eyes.some((e) => this.canSee(e, h, h.revealed)));
  }

  /** It knows where you are now; a squad working together all know. */
  private smell(a: Unit, at: Point) {
    const p = { x: at.x, y: at.y };
    this.scent.set(a.id, p);
    if (this.coordination() !== "none") for (const o of this.aliens) if (conscious(o)) this.scent.set(o.id, p);
  }

  /** A cunning alien close to its prey may wait for it to come round the corner, for a turn or two. */
  private lieInWait(a: Unit, goal: Point, p: Personality): boolean {
    const m = a.mind;
    if (!m || m.state !== "steady" || p.cunning < 65 || m.waited >= 2) return false;
    if (this.isSeen(a) || dist(a, goal) > 10) return false;
    if (this.rand() > (p.cunning - 50) / 50) return false;
    m.waited++;
    this.look(a, goal);
    return true;
  }

  /**
   * Where to head while hunting. Under its leader, a cunning squad spreads out to come at you from
   * the sides. Without one, a tight squad regroups before it does anything else.
   */
  private approach(a: Unit, goal: Point, p: Personality): { goal: Point; within: number; alone: boolean } {
    const squad = this.aliens.filter(conscious);
    const co = this.coordination();
    if (co === "full" && squad.length > 1 && p.cunning >= 40 && p.cohesion >= 35 && a.mind?.rank !== "leader") {
      const flankers = squad.filter((x) => x.mind?.rank !== "leader");
      const side = flankers.indexOf(a) % 2 ? -1 : 1;
      const cx = squad.reduce((n, x) => n + x.x, 0) / squad.length;
      const cy = squad.reduce((n, x) => n + x.y, 0) / squad.length;
      const len = Math.hypot(goal.x - cx, goal.y - cy) || 1;
      const flank = {
        x: Math.max(0, Math.min(this.map.w - 1, Math.round(goal.x - ((goal.y - cy) / len) * 6 * side))),
        y: Math.max(0, Math.min(this.map.h - 1, Math.round(goal.y + ((goal.x - cx) / len) * 6 * side))),
      };
      if (dist(a, flank) > 3 && dist(a, goal) > 6) return { goal: flank, within: 2, alone: true };
    }
    if (co === "none" && squad.length > 1 && p.cohesion >= 60) {
      const ally = squad.filter((x) => x !== a).sort((x, y) => dist(a, x) - dist(a, y))[0];
      if (ally && dist(a, ally) > 5) return { goal: ally, within: 2, alone: true };
    }
    return { goal, within: 10, alone: false };
  }

  /** The best shot it can afford, if the odds are good enough. A squad working together piles onto whoever's already hurt. */
  private tryShoot(a: Unit, targets: Unit[], minChance: number): boolean {
    const together = this.coordination() !== "none";
    let best: { t: Unit; mode: FireMode; score: number } | null = null;
    for (const t of targets) {
      for (const mode of ["aimed", "snap"] as FireMode[]) {
        const p = this.previewShot(a.id, t, mode);
        if (p.reason || p.chance < minChance) continue;
        // Prefer sure shots on the weak.
        const score =
          p.chance * (1.5 - t.health / t.stats.health) +
          (mode === "aimed" ? 0.05 : 0) +
          (together && this.focus.has(t.id) ? 0.25 : 0) +
          // A squad that's learned about the baton goes for whoever carries one.
          (t.tools.some((x) => x.tool.kind === "stun") ? batonGrudge(a.mind) : 0);
        if (!best || score > best.score) best = { t, mode, score };
      }
    }
    if (!best) return false;
    this.fire(a, best.t, best.mode);
    this.react(a);
    this.check();
    return true;
  }

  /** Where it's heading: a heartbeat it can track, the last noise, or the middle of town. */
  private hunt(a: Unit): Point | null {
    const range = a.mind ? RACES[a.mind.race].tracker : TRACKER_RANGE;
    const near = this.humans.filter((h) => conscious(h) && dist(a, h) <= range).sort((p, q) => dist(a, p) - dist(a, q))[0];
    if (near) {
      this.smell(a, near);
      return near;
    }
    const scent = this.scent.get(a.id);
    // Somewhere it can see with nobody there is a cold trail.
    const cold = scent && (dist(a, scent) <= 1.5 || (this.canSee(a, scent) && !this.humans.some((h) => conscious(h) && h.x === scent.x && h.y === scent.y)));
    if (scent && !cold) return scent;
    // Lost the trail: cast about somewhere near one of you. They know roughly where people are, and
    // nobody can hide from them for ever.
    const quarry = this.humans.filter(conscious);
    if (!quarry.length) return null;
    const q = quarry[Math.floor(this.rand() * quarry.length)];
    const guess = {
      x: Math.max(0, Math.min(this.map.w - 1, Math.round(q.x + (this.rand() * 2 - 1) * 8))),
      y: Math.max(0, Math.min(this.map.h - 1, Math.round(q.y + (this.rand() * 2 - 1) * 8))),
    };
    this.scent.set(a.id, guess);
    return guess;
  }

  /**
   * Moves toward a spot within `within` tiles of a point with a clear line to it, up to `maxSteps`,
   * keeping `reserve` TUs. Returns false if it couldn't move. `strict` only goes for a spot with a view that it can reach this turn.
   * `alone` heads for the point itself rather than anyone near it, for flanking and regrouping.
   * `keepOff` stays at least that far from all of you if it can.
   */
  private advance(a: Unit, goal: Point, reserve: number, maxSteps: number, within: number, strict = false, alone = false, keepOff = 0): boolean {
    const { cost, prev } = this.map.reach(a, Infinity, this.occupied(a));
    // Head for the cheapest spot with a clear line to the goal or anyone near it; failing that, the nearest it can get.
    const prey = alone ? [goal] : [goal, ...this.humans.filter((h) => conscious(h) && dist(h, goal) <= TRACKER_RANGE)];
    // The careful like a spot next to cover.
    const coverPull = Math.max(0, this.mindOf(a).caution - 40) / 10;
    let best = -1;
    let bestD = Infinity;
    let sight: Point | null = null;
    for (let i = 0; i < cost.length; i++) {
      if (!Number.isFinite(cost[i])) continue;
      const p = { x: i % this.map.w, y: Math.floor(i / this.map.w) };
      const d = dist(p, goal);
      const view = prey.find((h) => dist(p, h) <= within && this.map.clearLine(p, h));
      let score = view ? cost[i] + dist(p, view) * 2 : 10_000 + d * 100 + cost[i] * 0.01;
      if (view && coverPull && this.nearCover(p)) score -= coverPull;
      // Somewhere your people can't see it in the dark.
      if (view && keepOff && this.humans.some((h) => conscious(h) && dist(h, p) < keepOff)) score += 40;
      if (score < bestD) [best, bestD, sight] = [i, score, view ?? null];
    }
    // Closing in only makes sense toward a spot with a view of its prey.
    if (best < 0 || (strict && (!sight || cost[best] > a.tu - reserve))) return false;
    const path = this.map.route(prev, { x: best % this.map.w, y: Math.floor(best / this.map.w) });
    const steps: Point[] = [];
    let spend = 0;
    for (const p of path) {
      const c = this.map.stepCost(steps.length ? steps[steps.length - 1] : a, p);
      if (spend + c > a.tu - reserve || steps.length >= maxSteps) break;
      spend += c;
      steps.push(p);
      // Stop the moment a target comes into view, to shoot.
      if (this.humans.some((h) => conscious(h) && this.canSeeFrom(a, p, h))) break;
    }
    if (!steps.length) {
      // Already where it wants to be: turn to look at whoever it's after.
      if (!sight || best !== this.map.idx(a.x, a.y)) return false;
      const f = facingTo(a, sight);
      const cost = turnSteps(a.facing, f) * TURN_TU;
      if (!cost || cost > a.tu) return false;
      this.turnToward(a, sight);
      return true;
    }
    this.walk(a, steps);
    return true;
  }

  private nearCover(p: Point): boolean {
    for (const d of DIRS) if (this.map.inside(p.x + d.x, p.y + d.y) && this.map.isCover(p.x + d.x, p.y + d.y)) return true;
    return false;
  }

  /** Could the alien see a human from a tile, facing the way it would be walking? */
  private canSeeFrom(a: Unit, p: Point, h: Unit): boolean {
    return this.canSee({ ...a, x: p.x, y: p.y, facing: facingTo(p, h) }, h, h.revealed);
  }

  /** Breaks line of sight with everyone it knows about, as far as it can get. */
  private retreat(a: Unit, reserve: number) {
    const { cost, prev } = this.map.reach(a, a.tu - reserve, this.occupied(a));
    const threats = this.humans.filter(conscious);
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < cost.length; i++) {
      if (!Number.isFinite(cost[i])) continue;
      const p = { x: i % this.map.w, y: Math.floor(i / this.map.w) };
      const exposed = threats.filter((h) => this.map.clearLine(h, p) && dist(h, p) <= SIGHT_DAY).length;
      const away = Math.min(...threats.map((h) => dist(h, p)), 30);
      const score = away - exposed * 15;
      if (score > bestScore) [best, bestScore] = [i, score];
    }
    if (best < 0) return;
    const path = this.map.route(prev, { x: best % this.map.w, y: Math.floor(best / this.map.w) });
    if (path.length) this.walk(a, path);
  }
}

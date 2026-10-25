import { DIRS, Point, TacMap, dist, facingTo, turnSteps } from "./map";
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
}

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
/** Under this share of its health, the alien breaks off and looks for somewhere to hide. */
const RETREAT_AT = 0.4;
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
  /** Where your people last saw the alien. */
  lastSeen: Point | null = null;
  /** Where the alien thinks you are: noises, glimpses. */
  private scent: Point | null;
  private readonly rand: () => number;
  private events: BattleEvent[] = [];

  constructor(readonly map: TacMap, readonly units: Unit[], seed = 1, scent: Point | null = null) {
    this.rand = mulberry32(seed);
    this.seen = new Uint8Array(map.w * map.h);
    this.visible = new Uint8Array(map.w * map.h);
    this.scent = scent;
    this.updateVision();
  }

  get humans(): Unit[] {
    return this.units.filter((u) => u.side === "human");
  }

  get alien(): Unit {
    return this.units.find((u) => u.side === "alien")!;
  }

  unit(id: number): Unit {
    return this.units.find((u) => u.id === id)!;
  }

  unitAt(x: number, y: number): Unit | undefined {
    return this.units.find((u) => alive(u) && u.x === x && u.y === y);
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

  /** Recomputes what your people can see. Returns true if the alien just came into view. */
  private updateVision(): boolean {
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
    const a = this.alien;
    const wasSeen = this.alienSeen;
    this.alienSeen = alive(a) && this.spotted(a);
    if (this.alienSeen) this.lastSeen = { x: a.x, y: a.y };
    return this.alienSeen && !wasSeen;
  }
  alienSeen = false;

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
    if (this.updateVision()) this.events.push({ kind: "spot", unit: this.alien.id }, { kind: "say", text: `${u.name}: "There it is!"`, tone: "bad" });
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
    const base = baseHitChance(u.stats.accuracy, m, w, dist(u, target), u.kneeling, u.wounds * 4);
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
    this.fire(u, target, mode);
    if (u.side === "human" && alive(this.alien)) {
      // The alien hears every shot.
      this.scent = { x: u.x, y: u.y };
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
    if (alive(t) && conscious(t) && t.side === "alien") this.scent = { x: u.x, y: u.y };
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
    for (const u of this.humans) u.revealed = false;
    this.events.push({ kind: "turn", side: "alien", number: this.turn });
    this.startTurn("alien");
    if (!this.outcome) this.alienTurn();
    if (!this.outcome) {
      this.turn++;
      this.side = "human";
      this.alien.revealed = false;
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
      const spottedNow = this.updateVision();
      this.events.push({ kind: "move", unit: u.id, to: { x: u.x, y: u.y }, facing: u.facing, seen: u.side === "human" || this.alienSeen });
      if (u.side === "human" && spottedNow) {
        this.events.push({ kind: "spot", unit: this.alien.id }, { kind: "say", text: `${u.name}: "Contact!"`, tone: "bad" });
        this.react(u);
        return false;
      }
      if (u.side === "alien" && spottedNow) this.events.push({ kind: "spot", unit: u.id }, { kind: "say", text: "Movement! It's out there.", tone: "bad" });
      this.react(u);
      if (!conscious(u) || this.outcome) return false;
    }
    return true;
  }

  /** Enemies who see a unit spend its moment to shoot at it, if they're quicker. */
  private react(mover: Unit) {
    if (!conscious(mover)) return;
    const moverScore = mover.stats.reactions * (mover.tu / mover.stats.tu);
    for (const e of this.units) {
      if (e.side === mover.side || !conscious(e) || !e.weapon || e.ammo <= 0 || this.outcome) continue;
      const snap = e.weapon.modes.snap;
      if (!snap) continue;
      const cost = tuCost(e.stats.tu, snap.tuPct) + turnSteps(e.facing, facingTo(e, mover)) * TURN_TU;
      if (cost > e.tu || !this.canSee(e, mover, mover.revealed)) continue;
      if (e.stats.reactions * (e.tu / e.stats.tu) <= moverScore) continue;
      this.events.push({ kind: "say", text: e.side === "alien" ? "It fires as you move!" : `${e.name} fires on reflex!`, tone: e.side === "alien" ? "bad" : "good" });
      this.fire(e, { x: mover.x, y: mover.y }, "snap");
      if (e.side === "human") this.scent = { x: e.x, y: e.y };
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
      const chance = baseHitChance(u.stats.accuracy, m, w, dist(u, target), u.kneeling, u.wounds * 4);
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
    } else {
      this.events.push({ kind: "say", text: dead ? "The alien goes down. It's dead." : amount ? `Hit! ${amount} damage.` : "Hit, but it shrugs it off.", tone: "good" });
      if (!dead) this.scent = { x: by.x, y: by.y };
    }
    if (dead) t.kneeling = false;
  }

  /** Bleeding, then morale and panic, at the start of a side's turn. */
  private startTurn(side: Side) {
    for (const u of this.units) {
      if (u.side !== side || !alive(u)) continue;
      // Its wounds close by themselves, and it slowly heals.
      if (u.side === "alien") {
        u.wounds = 0;
        u.health = Math.min(u.stats.health, u.health + ALIEN_REGEN);
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
      u.morale = Math.min(100, u.morale + 10);
      if (side === "human" && this.rand() < panicChance(u.morale)) {
        u.tu = 0;
        this.events.push({ kind: "say", text: `${u.name} panics and freezes.`, tone: "bad" });
      }
    }
    this.check();
  }

  private check() {
    if (this.outcome) return;
    const a = this.alien;
    if (!alive(a)) return this.finish("killed");
    if (!conscious(a)) return this.finish("captured");
    if (!this.humans.some(conscious)) return this.finish("wiped");
  }

  private finish(o: Outcome) {
    this.outcome = o;
    this.events.push({ kind: "end", outcome: o });
  }

  // ---------- The alien ----------

  private alienTurn() {
    const a = this.alien;
    if (!conscious(a)) return;
    const snapCost = tuCost(a.stats.tu, a.weapon!.modes.snap!.tuPct);
    let closedIn = false;
    for (let guard = 0; guard < 12 && !this.outcome && conscious(a); guard++) {
      const targets = this.humans.filter((h) => conscious(h) && this.canSee(a, h, h.revealed));
      // Hurt badly, it breaks contact and hides.
      if (a.health < a.stats.health * RETREAT_AT) {
        if (targets.length && this.tryShoot(a, targets, 0.45)) continue;
        this.retreat(a, snapCost);
        break;
      }
      if (targets.length) {
        if (this.tryShoot(a, targets, 0.25)) continue;
        // Poor odds: close in on the nearest once, keeping enough to fire on reflex.
        const t = targets.sort((p, q) => dist(a, p) - dist(a, q))[0];
        if (!closedIn && this.advance(a, t, snapCost, 4, 3, true)) {
          closedIn = true;
          continue;
        }
        // Can't get closer: take whatever shot there is.
        if (this.tryShoot(a, targets, 0.08)) continue;
        break;
      }
      const goal = this.hunt(a);
      if (!goal) break;
      if (!this.advance(a, goal, snapCost, 99, 10)) break;
    }
    // Ends its turn looking where it expects you to come from.
    const goal = this.hunt(a);
    if (goal && conscious(a)) {
      const f = facingTo(a, goal);
      if (f !== a.facing) {
        a.facing = f;
        this.events.push({ kind: "face", unit: a.id, facing: f });
      }
    }
  }

  /** The best shot it can afford, if the odds are good enough. */
  private tryShoot(a: Unit, targets: Unit[], minChance: number): boolean {
    let best: { t: Unit; mode: FireMode; score: number } | null = null;
    for (const t of targets) {
      for (const mode of ["aimed", "snap"] as FireMode[]) {
        const p = this.previewShot(a.id, t, mode);
        if (p.reason || p.chance < minChance) continue;
        // Prefer sure shots on the weak.
        const score = p.chance * (1.5 - t.health / t.stats.health) + (mode === "aimed" ? 0.05 : 0);
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
    const near = this.humans.filter((h) => conscious(h) && dist(a, h) <= TRACKER_RANGE).sort((p, q) => dist(a, p) - dist(a, q))[0];
    if (near) {
      this.scent = { x: near.x, y: near.y };
      return near;
    }
    if (this.scent && dist(a, this.scent) > 1.5) return this.scent;
    this.scent = null;
    return { x: this.map.w >> 1, y: this.map.h >> 1 };
  }

  /**
   * Moves toward a spot within `within` tiles of a point with a clear line to it, up to `maxSteps`,
   * keeping `reserve` TUs. Returns false if it couldn't move. `strict` only goes for a spot with a view that it can reach this turn.
   */
  private advance(a: Unit, goal: Point, reserve: number, maxSteps: number, within: number, strict = false): boolean {
    const { cost, prev } = this.map.reach(a, Infinity, this.occupied(a));
    // Head for the cheapest spot with a clear line to the goal or anyone near it; failing that, the nearest it can get.
    const prey = [goal, ...this.humans.filter((h) => conscious(h) && dist(h, goal) <= TRACKER_RANGE)];
    let best = -1;
    let bestD = Infinity;
    let sight: Point | null = null;
    for (let i = 0; i < cost.length; i++) {
      if (!Number.isFinite(cost[i])) continue;
      const p = { x: i % this.map.w, y: Math.floor(i / this.map.w) };
      const d = dist(p, goal);
      const view = prey.find((h) => dist(p, h) <= within && this.map.clearLine(p, h));
      const score = view ? cost[i] + dist(p, view) * 2 : 10_000 + d * 100 + cost[i] * 0.01;
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

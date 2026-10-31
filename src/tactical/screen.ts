import "./tactical.css";
import { Color, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { DOCTRINES, Doctrine, MAX_ROUNDS, REWIND_WINDOW, RISK_SPREAD, RoundRecord, Timeline, oddsText, playRound, simulate } from "./autoplay";
import { Battle, BattleEvent, Outcome, Tally, Unit, alive, canFire, conscious, usesHeat } from "./battle";
import { TacticalCamera } from "./camera";
import { Point, levelName, lvl, samePoint } from "./map";
import { mulberry32 } from "./random";
import { OUTCOME_TEXT, Prologue, SPOILS, battleSpoils, briefing, lightRead, unitLook, unitShape } from "./prologue";
import { FireMode, KNEEL_TU, LIFT_TU, STAIRS_TU, STAND_TU, Stats, tuCost } from "./rules";
import { LEVEL_Y, TacticalView } from "./view";
import { $, escape, toast as showToast, token } from "../ui/dom";

/** What someone came out of a fight carrying. */
export type Gear = Pick<Unit, "weapon" | "ammo" | "clips" | "tools">;

export interface CombatResult {
  outcome: Outcome;
  recovered: string[];
  survivors: number;
  /** Who walked out, as they are now. */
  people: { id: number; name: string; role: string; stats: Stats; health: number; gear: Gear }[];
  turns: number;
  /** How your people fought, for the aliens to learn from. */
  tally: Tally;
  /** Whether the alien giving the orders went down. */
  commanderDown: boolean;
}

/** What the combat screen needs from the game around it. */
export interface CombatHost {
  prologue: Prologue;
  /** The player read the results and wants to carry on. */
  finish(result: CombatResult): void;
  /** Same night again, a different city. */
  retry(): void;
  /** Straight to the geoscape from the briefing. */
  skip(): void;
  /** How well your people know this enemy: the risk estimate is only as good as that. */
  knowledge?: number;
}

type Mode = "move" | FireMode | "stun" | "heal" | "face";

const root = $("combatScreen");

// ---------- Scene ----------
const canvas = $("battlefield") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new Color(token("--void")));
const scene = new Scene();
const camera = new PerspectiveCamera(40, 1, 0.1, 300);
const view = new TacticalView(scene);
const cam = new TacticalCamera(camera, canvas);

// ---------- State ----------
let host: CombatHost | null = null;
let battle: Battle | null = null;
let selected: Unit | null = null;
let mode: Mode = "move";
let hover: Point | null = null;
let reach: ReturnType<Battle["reach"]> | null = null;
let lastPointer: "mouse" | "touch" = "mouse";
const queue: BattleEvent[] = [];
let wait = 0;
let playing = false;
/** Every round so far, for taking command back. */
let timeline = new Timeline();
/** Autoplay, while it's running. */
let auto: { doctrine: Doctrine } | null = null;
/** Playback speed while watching autoplay. */
let speed = 1;
let autoRand = mulberry32(1);
/** Bumped to cancel a risk estimate that's still being worked out. */
let estimating = 0;

const ray = new Raycaster();
const ndc = new Vector2();
const ground = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();
/** The tile under the pointer, on the level being looked at. */
function pickTile(e: PointerEvent): Point | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ground.constant = -view.level * LEVEL_Y;
  if (!ray.ray.intersectPlane(ground, hit)) return null;
  return view.tileAt(hit.x, hit.z);
}

const same = (a: Point | null, b: Point | null) => !!a && !!b && samePoint(a, b);
const busy = () => playing || !!auto || !battle || !!battle.outcome || battle.side !== "human" || !$("combatModal").hidden;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const visibleAlienAt = (p: Point) => {
  const u = battle?.unitAt(p);
  return u && u.side === "alien" && battle!.isSeen(u) ? u : undefined;
};

// ---------- Levels ----------
/** Looks at one level of the map: it and everything below it show, the floors above are lifted off. */
function showLevel(z: number) {
  if (!battle) return;
  view.setLevel(z);
  cam.setHeight(view.level * LEVEL_Y);
  refreshLevels();
  // While a move plays out, the units are mid-animation: only the floors change.
  if (playing) return;
  view.sync(battle);
  view.select(selected);
  hover = null;
  refreshReach();
  preview();
}

/** The level name, and which way there are aliens in view that this level hides. */
function refreshLevels() {
  if (!battle) return;
  const z = view.level;
  $("lvName").textContent = levelName(z);
  ($("lvDown") as HTMLButtonElement).disabled = z <= battle.map.bottom;
  ($("lvUp") as HTMLButtonElement).disabled = z >= battle.map.top;
  const seen = battle.aliens.filter((a) => conscious(a) && battle!.isSeen(a));
  $("lvUp").classList.toggle("alert", seen.some((a) => lvl(a) > z));
  $("lvDown").classList.toggle("alert", seen.some((a) => lvl(a) < z));
}

// ---------- Selecting and previewing ----------
function select(u: Unit | null) {
  selected = u && conscious(u) ? u : null;
  mode = "move";
  refreshReach();
  if (selected && lvl(selected) !== view.level) showLevel(lvl(selected));
  view.select(selected);
  if (selected) cam.lookAt(view.world(selected).x, view.world(selected).z);
  refreshHud();
}

function refreshReach() {
  reach = selected && battle ? battle.reach(selected) : null;
  if (!reach || mode !== "move") return view.showReach([]);
  const tiles: number[] = [];
  reach.cost.forEach((c, i) => {
    if (c > 0 && Number.isFinite(c)) tiles.push(i);
  });
  view.showReach(tiles);
}

function nextUnit() {
  if (!battle) return;
  const squad = battle.humans.filter(conscious);
  if (!squad.length) return;
  const start = selected ? squad.indexOf(selected) : -1;
  for (let k = 1; k <= squad.length; k++) {
    const u = squad[(start + k) % squad.length];
    if (u.tu >= 4) return select(u);
  }
  select(squad[(start + 1) % squad.length]);
}

function setMode(m: Mode) {
  mode = mode === m ? "move" : m;
  refreshReach();
  preview();
  refreshHud();
}

/** What would happen if you clicked the tile under the pointer. */
function preview() {
  view.showPath([], true);
  if (!battle || !selected || busy()) return hint(defaultHint());
  if (!hover) return hint(defaultHint());
  const tap = lastPointer === "mouse" ? "Click" : "Tap again";
  if (mode === "move") {
    const alien = visibleAlienAt(hover);
    if (alien) return hint(`<b>${escape(alien.name)}</b> ${lastPointer === "mouse" ? "Click" : "Tap"} it to line up your best shot.`);
    const own = battle.unitAt(hover);
    if (own && own.side === "human") return hint(`<b>${escape(own.name)}</b> <span class="dim">${escape(own.role)}</span>`);
    if (!reach) return hint(defaultHint());
    const i = battle.map.idx(hover.x, hover.y, lvl(hover));
    const c = reach.cost[i];
    if (!Number.isFinite(c)) return hint(`<span class="bad">Can't get there this turn.</span>`);
    // With a mouse the route waits until the pointer has rested on a tile a while; a tap shows it at once.
    if (lastPointer === "mouse" && !routeReady) return hint(`<b>Move</b> <span class="dim">${routeDelay ? "Hold still to plot the route." : ""} Click to go.</span>`);
    const path = battle.map.route(reach.prev, hover);
    view.showPath(path, true);
    const stand = selected.kneeling ? STAND_TU : 0;
    const via = battle.map.thing[i];
    const climb = via === "stairs" ? ` Stairs: ${STAIRS_TU} TU a storey.` : via === "lift" ? ` Lift: ${LIFT_TU} TU a storey.` : "";
    return hint(`<b>Move</b> ${c + stand} TU <span class="dim">(${selected.tu - c - stand} left)${stand ? ", stands up first" : ""}.${climb} ${tap} to go.</span>`);
  }
  if (mode === "face") return hint(`<b>Turn</b> to face here, 1 TU per 45°. ${tap} to turn.`);
  if (mode === "stun") {
    const t = visibleAlienAt(hover);
    if (!t) return hint(`<span class="dim">Stun baton: pick the alien when you're next to it.</span>`);
    const p = battle.previewStun(selected.id, t);
    return hint(p.reason ? `<span class="bad">${p.reason}</span>` : `<b>Stun</b> ${pct(p.chance)} to hit · ${p.tu} TU. ${tap} to swing.`);
  }
  if (mode === "heal") {
    const t = battle.unitAt(hover);
    if (!t || t.side !== "human") return hint(`<span class="dim">Medikit: pick yourself or someone next to you.</span>`);
    const p = battle.previewHeal(selected.id, t);
    return hint(p.reason ? `<span class="bad">${p.reason}</span>` : `<b>Medikit</b> on ${escape(t.name)} · ${p.tu} TU. ${tap} to treat.`);
  }
  const p = battle.previewShot(selected.id, hover, mode);
  const label = mode === "auto" ? "Auto fire" : mode === "aimed" ? "Aimed shot" : "Snap shot";
  if (p.reason) return hint(`<b>${label}</b> <span class="bad">${p.reason}</span>`);
  const target = visibleAlienAt(hover) ? "" : ` <span class="dim">at empty ground</span>`;
  const per = mode === "auto" ? " per round" : "";
  hint(`<b>${label}</b>${target} ${pct(p.chance)}${per} · ${p.tu} TU${p.cover ? ` <span class="dim">· cover in the way</span>` : ""}. ${tap} to fire.`);
}

function defaultHint(): string {
  if (!battle) return "";
  if (auto) return `<span class="dim">Autoplay is fighting ${DOCTRINES[auto.doctrine].name.toLowerCase()}ly. Take over, or open the timeline to take command from an earlier round.</span>`;
  if (battle.side !== "human") return `<span class="dim">Alien activity…</span>`;
  if (!selected) return `<span class="dim">Pick one of your people.</span>`;
  if (mode !== "move") return `<span class="dim">Pick a target. Esc or the same button cancels.</span>`;
  return `<span class="dim">${lastPointer === "mouse" ? "Click" : "Tap"} a tile to move. Drag or WASD to pan, Q/E to turn, scroll or pinch to zoom.</span>`;
}

let hintHtml = "";
function hint(html: string) {
  if (html === hintHtml) return;
  hintHtml = html;
  $("combatHint").innerHTML = html;
}

// ---------- Route preview delay ----------
/** Seconds the pointer must rest on a tile before its route is plotted; 0 means never. */
const ROUTE_KEY = "alien-defence.routeDelay";
const ROUTE_OFF = 7;
let routeDelay = 2;
try {
  const saved = Number(localStorage.getItem(ROUTE_KEY));
  if (saved >= 1 && saved <= ROUTE_OFF) routeDelay = saved === ROUTE_OFF ? 0 : saved;
} catch {
  // Settings are a convenience only.
}
let routeReady = false;
let routeTimer = 0;
function restartRouteTimer() {
  routeReady = false;
  clearTimeout(routeTimer);
  if (!routeDelay) return;
  routeTimer = window.setTimeout(() => {
    routeReady = true;
    preview();
  }, routeDelay * 1000);
}
{
  const slider = $("routeDelay") as HTMLInputElement;
  const label = $("routeDelayValue");
  const show = () => (label.textContent = routeDelay ? `${routeDelay} s` : "Off");
  slider.value = String(routeDelay || ROUTE_OFF);
  show();
  slider.addEventListener("input", () => {
    const v = Number(slider.value);
    routeDelay = v === ROUTE_OFF ? 0 : v;
    show();
    try {
      localStorage.setItem(ROUTE_KEY, String(v));
    } catch {
      // Not saved; fine.
    }
    restartRouteTimer();
  });
}

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || cam.isDragging) return;
  lastPointer = "mouse";
  const t = pickTile(e);
  if (same(t, hover)) return;
  hover = t;
  restartRouteTimer();
  preview();
});

cam.onClick = (e) => {
  lastPointer = e.pointerType === "mouse" ? "mouse" : "touch";
  if (busy() || !battle) return;
  const t = pickTile(e);
  // Touch has no hover: the first tap previews, a second on the same tile acts.
  const confirmed = lastPointer === "mouse" || same(t, hover);
  hover = t;
  if (!t) return preview();
  const there = battle.unitAt(t);
  if (there && there.side === "human" && conscious(there) && mode !== "heal" && there !== selected) {
    select(there);
    return preview();
  }
  if (!selected) return preview();
  if (mode === "move" && visibleAlienAt(t)) {
    // Clicking the alien picks the best shot you can afford.
    const aimed = battle.previewShot(selected.id, t, "aimed");
    setMode(aimed.reason ? "snap" : "aimed");
    return;
  }
  if (!confirmed) return preview();
  const id = selected.id;
  if (mode === "move") {
    if (!reach || !Number.isFinite(reach.cost[battle.map.idx(t.x, t.y, lvl(t))])) return toast("Can't get there this turn", true);
    act(battle.move(id, t));
  } else if (mode === "face") {
    act(battle.face(id, t));
  } else if (mode === "stun") {
    const a = visibleAlienAt(t);
    const p = a && battle.previewStun(id, a);
    if (!a || !p || p.reason) return toast(p?.reason ?? "Pick the alien", true);
    act(battle.stun(id, a.id));
  } else if (mode === "heal") {
    const u = battle.unitAt(t);
    const p = u && battle.previewHeal(id, u);
    if (!u || !p || p.reason) return toast(p?.reason ?? "Pick someone to treat", true);
    act(battle.heal(id, u.id));
  } else {
    const p = battle.previewShot(id, t, mode);
    if (p.reason) return toast(p.reason, true);
    act(battle.shoot(id, t, mode));
  }
  mode = "move";
};

// ---------- Playing out what happened ----------
function act(events: BattleEvent[]) {
  if (!events.length) return;
  queue.push(...events);
  playing = true;
  view.showPath([], true);
  view.showReach([]);
  hint("");
  refreshHud();
}

/** Applies one event to the screen; returns how long to dwell on it. */
function apply(e: BattleEvent): number {
  const b = battle!;
  switch (e.kind) {
    case "move": {
      const u = b.unit(e.unit);
      view.stepTo(e.unit, e.to, e.facing);
      if (u.side === "alien") {
        view.setVisible(e.unit, e.seen);
        if (!e.seen) return 0.01;
      }
      // Follow your own people up and down the stairs.
      if (u === selected && lvl(e.to) !== view.level) showLevel(lvl(e.to));
      if (u === selected) view.select({ ...u, x: e.to.x, y: e.to.y, z: e.to.z });
      const w = view.world(e.to);
      cam.lookAt(w.x, w.z);
      return 0.15;
    }
    case "face":
      view.face(e.unit, e.facing);
      return 0.04;
    case "kneel":
      view.pose(b.unit(e.unit));
      return 0.12;
    case "door":
      view.openDoor(e.at);
      return 0;
    case "shot": {
      view.tracer(e.from, e.to, e.plasma, !e.seen);
      if (e.seen) view.setVisible(e.unit, true);
      return 0.42;
    }
    case "damage": {
      const u = b.unit(e.unit);
      const pos = view.unitPos(u.id);
      if (pos && (u.side === "human" || b.isSeen(u) || e.dead || e.out)) {
        floater(pos, e.stun ? `STUN ${e.amount}` : e.amount ? `−${e.amount}` : "0", e.stun ? "stun" : u.side);
      }
      if (e.dead || e.out) view.pose(u);
      return 0.35;
    }
    case "say":
      log(e.text, e.tone);
      return 0;
    case "spot": {
      // Show where it is, whichever floor that is.
      const a = b.unit(e.unit);
      if (lvl(a) !== view.level) showLevel(lvl(a));
      view.setVisible(e.unit, true);
      const pos = view.unitPos(e.unit);
      if (pos) cam.lookAt(pos.x, pos.z);
      return 0.6;
    }
    case "turn":
      banner(e.side === "alien" ? "Alien activity" : `Turn ${e.number}`);
      if (e.side === "human") $("turnNo").textContent = String(e.number);
      return e.side === "alien" ? 0.8 : 0.5;
    case "end":
      return 0.8;
  }
}

function pump(dt: number) {
  if (wait > 0) {
    wait -= dt * (auto ? speed : 1);
    return;
  }
  while (queue.length) {
    wait = apply(queue.shift()!);
    if (wait > 0) return;
  }
  if (!playing) return;
  playing = false;
  settle();
}

/** After the dust settles: snap the view to the rules and pick up where you were. */
function settle() {
  const b = battle!;
  view.sync(b);
  refreshLevels();
  if (b.outcome) return results(b.outcome);
  if (auto) return autoRound();
  if (!selected || !conscious(selected)) {
    selected = null;
    nextUnit();
  } else {
    refreshReach();
    view.select(selected);
  }
  refreshHud();
  preview();
}

// ---------- HUD ----------
function refreshHud() {
  const b = battle;
  if (!b) return;
  const roster = $("roster");
  roster.replaceChildren();
  for (const u of b.humans) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `member${u === selected ? " on" : ""}${alive(u) ? "" : " dead"}`;
    btn.disabled = !conscious(u);
    btn.innerHTML = `<span class="swatch"></span><span class="nm"></span><span class="meta"></span>`;
    (btn.querySelector(".swatch") as HTMLElement).style.background = unitLook(u);
    btn.querySelector(".nm")!.textContent = u.id === b.humanLeader ? `★ ${u.name}` : u.name;
    btn.querySelector(".meta")!.textContent = alive(u) ? `TU ${u.tu} · HP ${u.health}${u.wounds ? " · bleeding" : ""}${u.kneeling ? " · kneeling" : ""}${lvl(u) ? ` · ${levelName(lvl(u)).toLowerCase()}` : ""}` : "Killed";
    btn.addEventListener("click", () => !busy() && select(u));
    roster.appendChild(btn);
  }
  const u = selected;
  $("unitName").textContent = u?.name ?? "—";
  $("unitRole").textContent = u?.role ?? "";
  const gun = (w: Unit) =>
    !w.weapon ? "Unarmed" : usesHeat(w) ? `${w.weapon.name} ${w.overheated ? "OVERHEATED" : `heat ${Math.round(w.heat ?? 0)}%`}` : `${w.weapon.name} ${w.ammo}/${w.weapon.ammo} · ${w.clips ?? 0} clip${w.clips === 1 ? "" : "s"}`;
  const gear = u ? [gun(u), ...u.tools.map((t) => (t.tool.kind === "medkit" ? `${t.tool.name} ×${t.uses}` : t.tool.name))].filter(Boolean) : [];
  $("unitGear").textContent = gear.join(" · ");
  bar("Tu", u?.tu ?? 0, u?.stats.tu ?? 1);
  bar("Hp", u?.health ?? 0, u?.stats.health ?? 1, u?.wounds ? `bleeding ${u.wounds}` : "");
  bar("Mo", u?.morale ?? 0, 100);
  $("unitStats").textContent = u
    ? `Accuracy ${u.stats.accuracy} · Reactions ${u.stats.reactions} · Bravery ${u.stats.bravery} · Melee ${u.stats.melee} · Armour ${u.stats.armour}`
    : "";
  for (const btn of $("actions").querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
    const m = btn.dataset.mode as Mode;
    btn.setAttribute("aria-pressed", String(mode === m));
    let enabled = !!u && !busy();
    let label = btn.textContent!.split(" ")[0];
    if (u && (m === "snap" || m === "aimed" || m === "auto")) {
      const sm = u.weapon?.modes[m];
      enabled &&= !!sm && canFire(u);
      btn.hidden = !sm;
      if (sm) label += ` ${tuCost(u.stats.tu, sm.tuPct)}`;
    } else if (u && (m === "stun" || m === "heal")) {
      const tool = u.tools.find((t) => t.tool.kind === (m === "stun" ? "stun" : "medkit"));
      btn.hidden = !tool;
      if (tool) label += ` ${tuCost(u.stats.tu, tool.tool.tuPct)}`;
      enabled &&= !!tool && tool.uses > 0;
    }
    btn.textContent = label;
    btn.disabled = !enabled;
  }
  const reload = $("reload") as HTMLButtonElement;
  const rl = u ? battle!.previewReload(u.id) : null;
  reload.hidden = !u?.weapon || usesHeat(u);
  reload.textContent = `Reload ${rl?.tu ?? ""}`;
  reload.disabled = !rl || !!rl.reason || busy();
  reload.title = rl?.reason ? `Reload (R): ${rl.reason}` : "Reload (R): swap in a fresh clip. What's left in the old one is dropped.";
  const kneel = $("kneel") as HTMLButtonElement;
  kneel.textContent = u?.kneeling ? `Stand ${STAND_TU}` : `Kneel ${KNEEL_TU}`;
  kneel.disabled = !u || busy() || u.tu < (u.kneeling ? STAND_TU : KNEEL_TU);
  ($("endTurn") as HTMLButtonElement).disabled = busy();
  // The hint floats just above the unit panel, whatever its height.
  document.documentElement.style.setProperty("--panel-h", `${$("combatScreen").querySelector<HTMLElement>(".unitpanel")!.offsetHeight}px`);
  ($("nextUnit") as HTMLButtonElement).disabled = busy();
}

function bar(key: string, value: number, max: number, note = "") {
  ($(`bar${key}`) as HTMLElement).style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  $(`val${key}`).textContent = `${value}/${max}${note ? ` ${note}` : ""}`;
}

function log(text: string, tone?: "bad" | "good") {
  const li = document.createElement("li");
  li.textContent = text;
  if (tone) li.className = tone;
  const ol = $("combatLog");
  ol.appendChild(li);
  while (ol.children.length > 7) ol.firstElementChild!.remove();
}

let bannerTimer = 0;
function banner(text: string) {
  const b = $("turnBanner");
  b.textContent = text;
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (b.hidden = true), 1100);
}

const toast = (text: string, bad = false) => showToast(text, bad, 2200);

// Floating damage numbers.
const floaters: { el: HTMLDivElement; pos: Vector3; life: number }[] = [];
function floater(pos: Vector3, text: string, kind: string) {
  const el = document.createElement("div");
  el.className = `floater ${kind}`;
  el.textContent = text;
  $("combatLabels").appendChild(el);
  floaters.push({ el, pos: pos.clone().setY(1.8), life: 1.3 });
}
const proj = new Vector3();
function placeFloaters(dt: number) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  for (let k = floaters.length - 1; k >= 0; k--) {
    const f = floaters[k];
    f.life -= dt;
    f.pos.y += dt * 0.6;
    if (f.life <= 0) {
      f.el.remove();
      floaters.splice(k, 1);
      continue;
    }
    proj.copy(f.pos).project(camera);
    f.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -50%)`;
    f.el.style.opacity = String(Math.min(1, f.life * 2));
  }
}

// ---------- Briefing and results ----------
function modal(title: string, body: string, buttons: { label: string; go?: boolean; run: () => void }[]) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  const box = $("modalButtons");
  box.replaceChildren();
  for (const b of buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = b.label;
    if (b.go) el.className = "go";
    el.addEventListener("click", () => {
      $("combatModal").hidden = true;
      b.run();
    });
    box.appendChild(el);
  }
  $("combatModal").hidden = false;
  (box.querySelector(".go") as HTMLElement | null)?.focus();
}

function brief(p: Prologue) {
  if (p.mission) {
    const m = p.mission;
    const team = p.battle.humans.map((u) => `<li><b>${escape(u.name)}</b>${u.id === p.battle.humanLeader ? " ★ leads" : ""} <span class="dim">${escape(u.role)}, ${escape(u.weapon?.name.toLowerCase() ?? "unarmed")}, ${u.health}/${u.stats.health} HP</span></li>`);
    modal(
      m.title,
      `${m.intro.map((t) => `<p>${escape(t)}</p>`).join("")}
       <p class="dim">${escape(lightRead(p.light))}</p>
       ${m.reads?.length ? `<h2>What we can tell</h2><ul class="reads">${m.reads.map((r) => `<li>${escape(r)}</li>`).join("")}</ul>` : ""}
       <ul class="squadlist">${team.join("")}</ul>
       <p class="dim">Fleeing from the battlefield keeps half of what you found. Anyone who falls here is gone for good.${p.battle.humanLeader !== null ? " Lose whoever leads (★) and the rest are shaken for a while." : ""}</p>`,
      [{ label: "Begin", go: true, run: () => banner("Turn 1") }],
    );
    return;
  }
  const squad = p.battle.humans.map((u) => `<li><b>${escape(u.name)}</b>${u.id === p.battle.humanLeader ? " ★ leads" : ""} <span class="dim">${escape(u.role)}, ${escape(u.weapon?.name.toLowerCase() ?? "unarmed")}${u.tools.length ? `, ${u.tools.map((t) => t.tool.name.toLowerCase()).join(", ")}` : ""}</span></li>`);
  modal(
    `Prologue: ${p.city.name}`,
    `<p>${escape(briefing(p))}</p>
     <p>Something came down in the junction three hours ago. The police cordon is gone, and so is most of the street.
     Four of you are left, hiding in a building on the corner. It's been hunting you all night, and it's getting closer.</p>
     <p>Nobody is coming. Turn the tables: kill it, or knock it out with the baton and take it alive, and take whatever it's carrying.</p>
     <ul class="squadlist">${squad.join("")}</ul>
     <details class="howto"><summary>How it plays</summary>
       <ul>
         <li>Everything costs <b>time units</b> (TU): 4 a step, 6 diagonally, more through doors and rubble. Shots cost a share of your full TU.</li>
         <li>TU you don't spend stay with you through the alien's turn. Anyone who sees it move and is quicker on the draw (reactions × TU left) fires on reflex. So does it.</li>
         <li>${escape(lightRead(p.light))}</li>
         <li>Kneeling steadies your aim. Cover between you and a target soaks up shots; so does cover between it and you.</li>
         <li>Big hits leave you bleeding until a medikit stops it. Seeing friends die drains morale; frightened people freeze.</li>
         <li>It heals slowly, and it can sense anyone within ${12} tiles, walls or not.</li>
       </ul>
     </details>`,
    [
      { label: "Skip the prologue", run: () => host?.skip() },
      { label: "Begin", go: true, run: () => banner("Turn 1") },
    ],
  );
}

function results(o: Outcome) {
  const b = battle!;
  auto = null;
  timeline.played(b, b.turn, false);
  refreshAuto();
  const m = host?.prologue.mission;
  const t = (m?.outcomes ?? OUTCOME_TEXT)[o];
  const survivors = b.humans.filter(alive);
  if (!settled) {
    const all = m?.countSpoils ? battleSpoils(b, o) : (m?.spoils ?? SPOILS)[o];
    // Autoplay doesn't search the dead as carefully as you would.
    const share = timeline.autoRounds / Math.max(1, timeline.rounds.length);
    const left = all.map((r) => r.includes("orpse") && Math.random() < LEFT_BEHIND * share);
    settled = { recovered: all.filter((_, i) => !left[i]), lost: all.filter((_, i) => left[i]) };
  }
  const { recovered, lost } = settled;
  const people = survivors.map((u) => ({
    id: u.id, name: u.name, role: u.role, stats: { ...u.stats }, health: Math.max(1, u.health),
    gear: { weapon: u.weapon, ammo: u.ammo, clips: u.clips ?? 0, tools: u.tools.map((t) => ({ ...t })) },
  }));
  const commanderDown = b.aliens.some((a) => a.mind?.rank === "leader" && !conscious(a));
  const result: CombatResult = { outcome: o, recovered, survivors: survivors.length, turns: b.turn, people, tally: { ...b.tally }, commanderDown };
  const won = o === "captured" || o === "killed";
  const lookBack = rewindable() ? [{ label: "Look back", run: () => openTimeline() }] : [];
  const roll = b.humans.map((u) => `<li>${escape(u.name)} <span class="${alive(u) ? "dim" : "bad"}">${alive(u) ? `${u.health}/${u.stats.health} HP` : "killed"}</span></li>`).join("");
  if (m) {
    modal(
      t.title,
      `<p>${t.text}</p>
       ${recovered.length ? `<h2>Recovered</h2><ul class="spoillist">${tally(recovered).map((r) => `<li>${r}</li>`).join("")}</ul>` : ""}
       ${lost.length ? `<p class="dim">Left behind in the confusion: ${tally(lost).join(", ").toLowerCase()}. Autoplay doesn't search the dead the way you would.</p>` : ""}
       <h2>The team</h2><ul class="squadlist">${roll}</ul>
       ${lookBack.length ? `<p class="dim">You can still look back over the timeline and take command from an earlier round. It costs more the further back you go.</p>` : ""}`,
      [...lookBack, { label: "Back to the geoscape", go: true, run: () => host?.finish(result) }],
    );
    return;
  }
  modal(
    t.title,
    `<p>${t.text}</p>
     ${recovered.length ? `<h2>Recovered</h2><ul class="spoillist">${recovered.map((r) => `<li>${r}</li>`).join("")}</ul>` : ""}
     <h2>Survivors</h2><ul class="squadlist">${roll}</ul>
     <p class="dim">${won ? "This is where the war starts. Choose a city for your first base: whoever made it out moves in and goes to work." : "The war starts anyway, without anything to show for tonight."}</p>`,
    won
      ? [{ label: "Continue to the geoscape", go: true, run: () => host?.finish(result) }]
      : [
          { label: "Go on without it", run: () => host?.finish(result) },
          { label: "Try again", go: true, run: () => host?.retry() },
        ],
  );
}

/** "Alien corpse ×2" rather than the same line twice. */
function tally(items: string[]): string[] {
  const n = new Map<string, number>();
  for (const i of items) n.set(i, (n.get(i) ?? 0) + 1);
  return [...n].map(([i, k]) => (k > 1 ? `${i} ×${k}` : i));
}

// ---------- Autoplay and the timeline ----------
/** At most this share of the bodies is left behind in a fight autoplay played all of. */
const LEFT_BEHIND = 0.3;
/** Simulated fights behind the risk estimate. */
const RISK_RUNS = 20;
const BRUTAL_KEY = "alien-defence.brutal";
const DOCTRINE_KEY = "alien-defence.doctrine";
let brutal = false;
try {
  brutal = localStorage.getItem(BRUTAL_KEY) === "1";
  const d = localStorage.getItem(DOCTRINE_KEY);
  if (d && d in DOCTRINES) ($("doctrine") as HTMLSelectElement).value = d;
} catch {
  // Settings are a convenience only.
}
($("brutal") as HTMLInputElement).checked = brutal;
/** What the end of the fight brought home, worked out once so looking back and returning can't re-roll it. */
let settled: { recovered: string[]; lost: string[] } | null = null;

const doctrine = () => ($("doctrine") as HTMLSelectElement).value as Doctrine;

/** Whether any round can still be taken back. */
function rewindable(): boolean {
  const b = battle;
  return !!b && timeline.rounds.some((r) => {
    const p = timeline.price(b, r.round);
    return !p.reason && p.undone > 0;
  });
}

function refreshAuto() {
  const b = battle;
  if (!b) return;
  $("autoBar").hidden = !auto;
  if (auto) $("autoState").textContent = `Autoplay · ${DOCTRINES[auto.doctrine].name}`;
  ($("autoSpeed") as HTMLButtonElement).textContent = `×${speed}`;
  ($("takeOver") as HTMLButtonElement).disabled = !auto || !!b.outcome;
  ($("autoSkip") as HTMLButtonElement).disabled = !auto || !!b.outcome;
  const locked = timeline.locked(b);
  ($("autoplay") as HTMLButtonElement).disabled = !!auto || playing || !!b.outcome || locked || b.side !== "human";
  const left = timeline.lockedUntil - b.turn;
  $("autoNote").textContent = locked
    ? `You took command: play ${left === 1 ? "this round" : `${left} more rounds`} by hand before autoplay can take over again.`
    : brutal
      ? "Brutal: no rewinds. You can only take over from where the fight is now."
      : "";
  ($("brutal") as HTMLInputElement).disabled = timeline.autoRounds > 0;
  renderTimeline();
}

/** Works out the odds from simulated fights, a few at a time so the screen stays alive, then offers the choice. */
function startAutoplay() {
  const b = battle;
  if (!b || busy() || timeline.locked(b)) return;
  const d = doctrine();
  const token = ++estimating;
  const n = { clean: 0, losses: 0, disaster: 0 };
  const base = Math.floor(Math.random() * 2 ** 31);
  let done = 0;
  const title = `Autoplay: ${DOCTRINES[d].name}`;
  modal(title, `<p>${DOCTRINES[d].blurb}</p><p class="dim" id="riskProgress">Your people are weighing it up…</p>`, [{ label: "Not now", run: () => estimating++ }]);
  const step = () => {
    if (token !== estimating || $("combatModal").hidden) return;
    n[simulate(b, d, base + done * 7919)]++;
    done++;
    if (done < RISK_RUNS) {
      const bar = document.getElementById("riskProgress");
      if (bar) bar.textContent = `Your people are weighing it up… ${Math.round((done / RISK_RUNS) * 100)}%`;
      window.setTimeout(step, 0);
      return;
    }
    offer(d, { clean: n.clean / RISK_RUNS, losses: n.losses / RISK_RUNS, disaster: n.disaster / RISK_RUNS });
  };
  window.setTimeout(step, 30);
}

function offer(d: Doctrine, odds: { clean: number; losses: number; disaster: number }) {
  const k = host?.knowledge ?? 0;
  const spread = RISK_SPREAD[Math.min(3, Math.max(0, k))];
  const sure =
    k <= 0
      ? "Nobody has fought these before. Treat it as a guess."
      : k < 3
        ? "They've met these before, but not often. Take it with a pinch of salt."
        : "They know this enemy well.";
  modal(
    `Autoplay: ${DOCTRINES[d].name}`,
    `<p>${DOCTRINES[d].blurb}</p>
     <h2>What your people reckon</h2>
     <dl class="risk">
       <dt>Clean win</dt><dd class="good">${oddsText(odds.clean, spread)}</dd>
       <dt>Someone lost, or no result</dt><dd>${oddsText(odds.losses, spread)}</dd>
       <dt>Disaster</dt><dd class="bad">${oddsText(odds.disaster, spread)}</dd>
     </dl>
     <p class="dim">${sure} Autoplay fights a little worse than you would, and doesn't search the dead as carefully.</p>
     <p class="dim">${
       brutal
         ? "Brutal mode: you can take over at any time, but only from where the fight is now."
         : `You can take over at any time, or open the timeline and take command from any of the last ${REWIND_WINDOW} rounds it played. The dice are re-rolled, and you then play by hand for a while: longer the further back you go. Watching doesn't hold the fight back. It runs a round ahead of what you see.`
     }</p>`,
    [
      { label: "Not now", run: () => {} },
      { label: "Skip to the result", run: () => beginAuto(d, true) },
      { label: "Watch", go: true, run: () => beginAuto(d, false) },
    ],
  );
}

function beginAuto(d: Doctrine, skip: boolean) {
  if (!battle || battle.outcome || timeline.locked(battle)) return;
  auto = { doctrine: d };
  selected = null;
  view.select(null);
  view.showReach([]);
  view.showPath([], true);
  log(`Autoplay takes over: ${DOCTRINES[d].name.toLowerCase()}.`);
  if (skip) return skipToEnd();
  refreshHud();
  autoRound();
}

/** Autoplay fights one round, and the screen plays it back. The fight is already a round ahead of what you see. */
function autoRound() {
  const b = battle!;
  if (!auto) return;
  if (b.outcome) return results(b.outcome);
  const round = b.turn;
  const events = round > MAX_ROUNDS ? b.abandon() : playRound(b, auto.doctrine, autoRand);
  timeline.played(b, round, true);
  refreshAuto();
  hint(defaultHint());
  act(events);
}

/** Plays the rest out without showing it. */
function skipToEnd() {
  const b = battle!;
  queue.length = 0;
  wait = 0;
  playing = false;
  while (auto && !b.outcome) {
    const round = b.turn;
    const events = round > MAX_ROUNDS ? b.abandon() : playRound(b, auto.doctrine, autoRand);
    timeline.played(b, round, true);
    for (const e of events) if (e.kind === "say") log(e.text, e.tone);
  }
  rebuildView();
  results(b.outcome!);
}

/** Builds the battlefield in the light the fight is fought in. */
function buildScene() {
  const p = host!.prologue;
  const clear = view.build(battle!.map, p.style, p.lights, p.light);
  renderer.setClearColor(new Color(clear || token("--void")));
}

/** Throws the scene away and builds it again from the battle, for after a jump in time. */
function rebuildView() {
  const b = battle!;
  view.clearUnits();
  buildScene();
  for (const u of b.units) view.addUnit(u, unitLook(u), unitShape(u));
  view.sync(b);
  $("turnNo").textContent = String(b.turn);
}

/** Stops autoplay where the fight is now. You play this round by hand. */
function takeOver() {
  const b = battle;
  if (!b || !auto || b.outcome) return;
  timeline.rewind(b, b.turn, 0);
  auto = null;
  log(`You take over from round ${b.turn}.`);
  refreshAuto();
  if (!playing) settle();
}

/** Takes command from the start of an earlier round: new dice, and a stretch of playing by hand. */
function rewindTo(round: number) {
  const b = battle;
  if (!b) return;
  const p = timeline.price(b, round);
  if (p.reason) return toast(p.reason, true);
  if (p.undone === 0) return takeOver();
  auto = null;
  queue.length = 0;
  playing = false;
  wait = 0;
  estimating++;
  settled = null;
  $("combatModal").hidden = true;
  timeline.rewind(b, round, Math.floor(Math.random() * 2 ** 31));
  $("timelinePanel").hidden = true;
  rebuildView();
  $("combatLog").replaceChildren();
  log(`You take command from round ${round}. Play ${p.lockout === 1 ? "this round" : `${p.lockout} rounds`} by hand.`, "bad");
  if (p.morale) log(`"Make your mind up." Everyone loses ${p.morale} morale.`, "bad");
  banner(`Turn ${b.turn}`);
  selected = null;
  nextUnit();
  refreshAuto();
  preview();
}

function openTimeline() {
  if (!battle) return;
  if (battle.outcome) $("combatModal").hidden = true;
  $("timelinePanel").hidden = false;
  $("tlResults").hidden = !battle.outcome;
  renderTimeline(true);
}

function closeTimeline() {
  $("timelinePanel").hidden = true;
  if (battle?.outcome && !playing) results(battle.outcome);
}

const marksHtml = (m: RoundRecord["marks"]) => {
  if (!m) return "";
  const out: string[] = [];
  const mk = (cls: string, sym: string, title: string, n = 1) => out.push(`<span class="mk ${cls}" title="${escape(title)}">${sym.repeat(Math.min(n, 4))}</span>`);
  if (m.contact) mk("contact", "◉", "First contact");
  if (m.wounded.length) mk("wound", "●", `Hurt: ${m.wounded.join(", ")}`, m.wounded.length);
  if (m.killed.length) mk("dead", "✕", `Killed: ${m.killed.join(", ")}`, m.killed.length);
  if (m.aliensDown) mk("down", "▲", `${m.aliensDown} alien${m.aliensDown > 1 ? "s" : ""} down`, m.aliensDown);
  if (m.commanderDown) mk("boss", "★", "Their commander went down");
  if (m.panics) mk("panic", "!", `${m.panics} panicked`, m.panics);
  return out.join(" ") || `<span class="dim">quiet</span>`;
};

function renderTimeline(scroll = false) {
  const b = battle;
  if (!b || $("timelinePanel").hidden) return;
  $("tlNote").textContent = brutal
    ? "Brutal mode: no rewinds. You can only take over from where the fight is now."
    : `Take command from the start of any of the last ${REWIND_WINDOW} rounds autoplay played. The dice are re-rolled, and the price grows with how far back that is from where the fight has got to, which is a round ahead of what you're watching. Rounds you played by hand (✋) can't be taken back.`;
  const ol = $("tlRounds");
  const atEnd = ol.parentElement!.scrollTop + ol.parentElement!.clientHeight >= ol.parentElement!.scrollHeight - 8;
  ol.replaceChildren();
  for (const r of timeline.rounds) {
    const p = timeline.price(b, r.round);
    const now = p.undone === 0;
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.className = [r.marks && !r.auto ? "hand" : "", p.reason ? "out" : "", now ? "free" : ""].filter(Boolean).join(" ");
    const price = now
      ? auto
        ? "Take over now: play this round by hand"
        : "Being played now"
      : p.reason ?? `Play ${p.lockout} rounds by hand${p.morale ? ` · −${p.morale} morale` : ""}`;
    li.innerHTML = `<span class="rn">R${r.round}</span><span class="marks">${now && !r.marks ? `<span class="dim">…</span>` : marksHtml(r.marks)}</span><span class="price">${escape(price)}</span>`;
    const can = now ? !!auto && !b.outcome : !p.reason;
    if (can) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = now ? "Take over" : "Take command";
      if (now) btn.className = "go";
      btn.addEventListener("click", () => rewindTo(r.round));
      li.appendChild(btn);
    }
    const show = () => {
      for (const o of ol.children) o.classList.toggle("on", o === li);
      detail(r);
    };
    li.addEventListener("pointerenter", show);
    li.addEventListener("focus", show);
    ol.appendChild(li);
  }
  if (scroll || atEnd) ol.parentElement!.scrollTop = ol.parentElement!.scrollHeight;
}

/** Your people at the start of a round, next to how they are now. */
function detail(r: RoundRecord) {
  const b = battle!;
  const line = (u: Unit) => `<li>${escape(u.name)} <span class="${alive(u) ? "dim" : "bad"}">${alive(u) ? `${u.health}/${u.stats.health}${u.wounds ? ", bleeding" : ""}` : "killed"}</span></li>`;
  const down = (units: Unit[]) => units.filter((u) => u.side === "alien" && !conscious(u)).length;
  $("tlDetail").innerHTML = `<b>Start of round ${r.round}</b> <span class="dim">${down(r.start.units)} alien${down(r.start.units) === 1 ? "" : "s"} down</span>
    <ul>${r.start.units.filter((u) => u.side === "human").map(line).join("")}</ul>
    <b>${b.outcome ? "How it ended" : "Now"}</b> <span class="dim">${down(b.units)} alien${down(b.units) === 1 ? "" : "s"} down</span>
    <ul>${b.humans.map(line).join("")}</ul>`;
}

$("autoplay").addEventListener("click", startAutoplay);
$("doctrine").addEventListener("change", () => {
  if (auto) auto.doctrine = doctrine();
  try {
    localStorage.setItem(DOCTRINE_KEY, doctrine());
  } catch {
    // Not saved; fine.
  }
  refreshAuto();
});
$("brutal").addEventListener("change", () => {
  brutal = ($("brutal") as HTMLInputElement).checked;
  if (!timeline.autoRounds) timeline.brutal = brutal;
  try {
    localStorage.setItem(BRUTAL_KEY, brutal ? "1" : "0");
  } catch {
    // Not saved; fine.
  }
  refreshAuto();
});
$("autoSpeed").addEventListener("click", () => {
  speed = speed >= 4 ? 1 : speed * 2;
  refreshAuto();
});
$("takeOver").addEventListener("click", takeOver);
$("autoSkip").addEventListener("click", () => auto && skipToEnd());
$("showTimeline").addEventListener("click", openTimeline);
$("autoTimeline").addEventListener("click", openTimeline);
$("closeTimeline").addEventListener("click", closeTimeline);
$("tlResults").addEventListener("click", closeTimeline);

// ---------- Buttons and keys ----------
for (const btn of $("actions").querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  btn.addEventListener("click", () => !busy() && setMode(btn.dataset.mode as Mode));
}
$("kneel").addEventListener("click", () => !busy() && selected && act(battle!.kneel(selected.id)));
$("reload").addEventListener("click", () => !busy() && selected && act(battle!.reload(selected.id)));
$("nextUnit").addEventListener("click", () => !busy() && nextUnit());
$("endTurn").addEventListener("click", () => {
  if (busy()) return;
  mode = "move";
  const round = battle!.turn;
  act(battle!.endTurn());
  timeline.played(battle!, round, false);
  refreshAuto();
});
$("camLeft").addEventListener("click", () => cam.turn(-45));
$("camRight").addEventListener("click", () => cam.turn(45));
$("camIn").addEventListener("click", () => cam.zoomBy(1 / 1.25));
$("camOut").addEventListener("click", () => cam.zoomBy(1.25));
$("lvUp").addEventListener("click", () => showLevel(view.level + 1));
$("lvDown").addEventListener("click", () => showLevel(view.level - 1));

// Two presses to run, since there's no undo.
{
  const b = $("abandon");
  const label = b.textContent!;
  let timer = 0;
  b.addEventListener("click", () => {
    if (busy()) return;
    if (!timer) {
      b.textContent = "Press again to flee";
      b.classList.add("bad");
      timer = window.setTimeout(() => {
        timer = 0;
        b.textContent = label;
        b.classList.remove("bad");
      }, 3000);
      return;
    }
    clearTimeout(timer);
    timer = 0;
    b.textContent = label;
    b.classList.remove("bad");
    act(battle!.abandon());
  });
}

// WASD pans while held, relative to the way the view faces.
const PAN_KEYS: Record<string, [keyof TacticalCamera["drive"], number]> = { w: ["forward", 1], s: ["forward", -1], a: ["right", -1], d: ["right", 1] };
const held = new Set<string>();
function steer() {
  cam.drive.forward = (held.has("w") ? 1 : 0) - (held.has("s") ? 1 : 0);
  cam.drive.right = (held.has("d") ? 1 : 0) - (held.has("a") ? 1 : 0);
}
window.addEventListener("keyup", (e) => {
  if (held.delete(e.key.toLowerCase())) steer();
});
window.addEventListener("blur", () => {
  held.clear();
  steer();
});

window.addEventListener("keydown", (e) => {
  if (root.hidden || e.metaKey || e.ctrlKey || e.altKey || !$("combatModal").hidden) return;
  const k = e.key.toLowerCase();
  if (PAN_KEYS[k]) {
    held.add(k);
    steer();
    e.preventDefault();
    return;
  }
  const modes: Record<string, Mode> = { "1": "snap", "2": "aimed", "3": "auto", b: "stun", h: "heal", f: "face" };
  if (modes[k]) !busy() && setMode(modes[k]);
  else if (k === "k") $("kneel").click();
  else if (k === "r") $("reload").click();
  else if (k === "n" || k === "tab") $("nextUnit").click();
  else if (k === "escape") !busy() && setMode("move");
  else if (k === "q") cam.turn(-45);
  else if (k === "e") cam.turn(45);
  else if (k === "+" || k === "=") cam.zoomBy(1 / 1.2);
  else if (k === "-") cam.zoomBy(1.2);
  // Same keys as the base view, where "]" and Page Down go deeper.
  else if (k === "pageup" || k === "[") showLevel(view.level + 1);
  else if (k === "pagedown" || k === "]") showLevel(view.level - 1);
  else return;
  e.preventDefault();
});

// ---------- Loop ----------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? (2 * Math.atan(Math.tan((22 * Math.PI) / 180) * (h / w)) * 180) / Math.PI : 44;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

/** Shows the combat screen with a fresh prologue battle and its briefing. */
export function openCombat(h: CombatHost): void {
  host = h;
  battle = h.prologue.battle;
  root.hidden = false;
  resize();
  queue.length = 0;
  playing = false;
  wait = 0;
  auto = null;
  estimating++;
  settled = null;
  timeline = new Timeline(brutal);
  timeline.begin(battle);
  autoRand = mulberry32(h.prologue.seed ^ 0xa070);
  $("timelinePanel").hidden = true;
  // The first night is played by hand.
  $("autoBox").hidden = !h.prologue.mission;
  refreshAuto();
  $("combatLog").replaceChildren();
  $("missionPlace").textContent = `${h.prologue.city.name} · ${h.prologue.light}, ${h.prologue.clock}`;
  const several = battle.aliens.length > 1;
  $("missionName").textContent = h.prologue.mission?.title.split(":")[0] ?? "Prologue";
  $("objectiveMain").textContent = several ? "Kill them, or stun them to take them alive." : "Kill the alien, or stun it with the baton to take it alive.";
  $("objectiveNote").textContent = several ? "Bring down the one giving orders and the rest come apart for a while." : "Taken alive, it's worth far more.";
  $("turnNo").textContent = String(battle.turn);
  view.clearUnits();
  buildScene();
  for (const u of battle.units) view.addUnit(u, unitLook(u), unitShape(u));
  view.setLevel(0);
  cam.setHeight(0);
  view.sync(battle);
  refreshLevels();
  cam.bounds = battle.map.w / 2;
  // Portrait screens get closer in, or the people are specks.
  cam.distance = cam.targetDistance = canvas.clientWidth < canvas.clientHeight ? 15 : 22;
  selected = null;
  nextUnit();
  if (selected) {
    const w = view.world(selected);
    cam.lookAt(w.x, w.z, true);
  }
  const many = battle.aliens.length > 1;
  log(h.prologue.mission ? (many ? "They've heard you. Find them before they find you." : "It's heard you. Find it before it finds you.") : "Stay quiet. It's out there.", "bad");
  brief(h.prologue);
}

export function closeCombat(): void {
  root.hidden = true;
  auto = null;
  estimating++;
  host = null;
  battle = null;
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
  if (root.hidden) return;
  if (battle) pump(dt);
  cam.update(dt);
  view.update(dt);
  placeFloaters(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

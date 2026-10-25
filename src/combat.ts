import "./tactical/tactical.css";
import { Color, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { Battle, BattleEvent, Outcome, Unit, alive, conscious } from "./tactical/battle";
import { TacticalCamera } from "./tactical/camera";
import { Point } from "./tactical/map";
import { OUTCOME_TEXT, Prologue, SPOILS, briefing, unitLook } from "./tactical/prologue";
import { FireMode, KNEEL_TU, STAND_TU, Stats, tuCost } from "./tactical/rules";
import { TacticalView } from "./tactical/view";

export interface CombatResult {
  outcome: Outcome;
  recovered: string[];
  survivors: number;
  /** Who walked out, as they are now. */
  people: { name: string; role: string; stats: Stats; health: number }[];
  turns: number;
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
}

type Mode = "move" | FireMode | "stun" | "heal" | "face";

const css = getComputedStyle(document.documentElement);
const token = (name: string) => css.getPropertyValue(name).trim();
const $ = (id: string) => document.getElementById(id)!;
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

const ray = new Raycaster();
const ndc = new Vector2();
const ground = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();
function pickTile(e: PointerEvent): Point | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(ground, hit)) return null;
  return view.tileAt(hit.x, hit.z);
}

const same = (a: Point | null, b: Point | null) => !!a && !!b && a.x === b.x && a.y === b.y;
const busy = () => playing || !battle || !!battle.outcome || battle.side !== "human" || !$("combatModal").hidden;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const escape = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const visibleAlienAt = (p: Point) => {
  const u = battle?.unitAt(p.x, p.y);
  return u && u.side === "alien" && battle!.alienSeen ? u : undefined;
};

// ---------- Selecting and previewing ----------
function select(u: Unit | null) {
  selected = u && conscious(u) ? u : null;
  mode = "move";
  refreshReach();
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
    if (alien) return hint(`<b>The alien</b> ${lastPointer === "mouse" ? "Click" : "Tap"} it to line up your best shot.`);
    const own = battle.unitAt(hover.x, hover.y);
    if (own && own.side === "human") return hint(`<b>${escape(own.name)}</b> <span class="dim">${escape(own.role)}</span>`);
    if (!reach) return hint(defaultHint());
    const i = battle.map.idx(hover.x, hover.y);
    const c = reach.cost[i];
    if (!Number.isFinite(c)) return hint(`<span class="bad">Can't get there this turn.</span>`);
    // With a mouse the route waits until the pointer has rested on a tile a while; a tap shows it at once.
    if (lastPointer === "mouse" && !routeReady) return hint(`<b>Move</b> <span class="dim">${routeDelay ? "Hold still to plot the route." : ""} Click to go.</span>`);
    const path = battle.map.route(reach.prev, hover);
    view.showPath(path, true);
    const stand = selected.kneeling ? STAND_TU : 0;
    return hint(`<b>Move</b> ${c + stand} TU <span class="dim">(${selected.tu - c - stand} left)${stand ? ", stands up first" : ""}. ${tap} to go.</span>`);
  }
  if (mode === "face") return hint(`<b>Turn</b> to face here, 1 TU per 45°. ${tap} to turn.`);
  if (mode === "stun") {
    const t = visibleAlienAt(hover);
    if (!t) return hint(`<span class="dim">Stun baton: pick the alien when you're next to it.</span>`);
    const p = battle.previewStun(selected.id, t);
    return hint(p.reason ? `<span class="bad">${p.reason}</span>` : `<b>Stun</b> ${pct(p.chance)} to hit · ${p.tu} TU. ${tap} to swing.`);
  }
  if (mode === "heal") {
    const t = battle.unitAt(hover.x, hover.y);
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
  const there = battle.unitAt(t.x, t.y);
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
    if (!reach || !Number.isFinite(reach.cost[battle.map.idx(t.x, t.y)])) return toast("Can't get there this turn", true);
    act(battle.move(id, t));
  } else if (mode === "face") {
    act(battle.face(id, t));
  } else if (mode === "stun") {
    const a = visibleAlienAt(t);
    const p = a && battle.previewStun(id, a);
    if (!a || !p || p.reason) return toast(p?.reason ?? "Pick the alien", true);
    act(battle.stun(id, a.id));
  } else if (mode === "heal") {
    const u = battle.unitAt(t.x, t.y);
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
      if (u === selected) view.select({ ...u, x: e.to.x, y: e.to.y });
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
      if (pos && (u.side === "human" || b.alienSeen || e.dead || e.out)) {
        floater(pos, e.stun ? `STUN ${e.amount}` : e.amount ? `−${e.amount}` : "0", e.stun ? "stun" : u.side);
      }
      if (e.dead || e.out) view.pose(u);
      return 0.35;
    }
    case "say":
      log(e.text, e.tone);
      return 0;
    case "spot": {
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
    wait -= dt;
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
  if (b.outcome) return results(b.outcome);
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
    btn.querySelector(".nm")!.textContent = u.name;
    btn.querySelector(".meta")!.textContent = alive(u) ? `TU ${u.tu} · HP ${u.health}${u.wounds ? " · bleeding" : ""}${u.kneeling ? " · kneeling" : ""}` : "Killed";
    btn.addEventListener("click", () => !busy() && select(u));
    roster.appendChild(btn);
  }
  const u = selected;
  $("unitName").textContent = u?.name ?? "—";
  $("unitRole").textContent = u?.role ?? "";
  const gear = u ? [u.weapon ? `${u.weapon.name} (${u.ammo})` : null, ...u.tools.map((t) => (t.tool.kind === "medkit" ? `${t.tool.name} ×${t.uses}` : t.tool.name))].filter(Boolean) : [];
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
      enabled &&= !!sm && u.ammo > 0;
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

let toastTimer = 0;
function toast(text: string, bad = false) {
  const t = $("toast");
  t.textContent = text;
  t.className = bad ? "show bad" : "show";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = ""), 2200);
}

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
  const squad = p.battle.humans.map((u) => `<li><b>${escape(u.name)}</b> <span class="dim">${escape(u.role)}, ${escape(u.weapon?.name.toLowerCase() ?? "unarmed")}${u.tools.length ? `, ${u.tools.map((t) => t.tool.name.toLowerCase()).join(", ")}` : ""}</span></li>`);
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
         <li>It's night. You see 9 tiles in the dark, further under street lights. It sees 20. Firing gives away where you are.</li>
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
  const t = OUTCOME_TEXT[o];
  const survivors = b.humans.filter(alive);
  const recovered = SPOILS[o];
  const people = survivors.map((u) => ({ name: u.name, role: u.role, stats: { ...u.stats }, health: Math.max(1, u.health) }));
  const result: CombatResult = { outcome: o, recovered, survivors: survivors.length, turns: b.turn, people };
  const won = o === "captured" || o === "killed";
  const roll = b.humans.map((u) => `<li>${escape(u.name)} <span class="${alive(u) ? "dim" : "bad"}">${alive(u) ? `${u.health}/${u.stats.health} HP` : "killed"}</span></li>`).join("");
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

// ---------- Buttons and keys ----------
for (const btn of $("actions").querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  btn.addEventListener("click", () => !busy() && setMode(btn.dataset.mode as Mode));
}
$("kneel").addEventListener("click", () => !busy() && selected && act(battle!.kneel(selected.id)));
$("nextUnit").addEventListener("click", () => !busy() && nextUnit());
$("endTurn").addEventListener("click", () => {
  if (busy()) return;
  mode = "move";
  act(battle!.endTurn());
});
$("camLeft").addEventListener("click", () => cam.turn(-45));
$("camRight").addEventListener("click", () => cam.turn(45));
$("camIn").addEventListener("click", () => cam.zoomBy(1 / 1.25));
$("camOut").addEventListener("click", () => cam.zoomBy(1.25));

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
  else if (k === "n" || k === "tab") $("nextUnit").click();
  else if (k === "escape") !busy() && setMode("move");
  else if (k === "q") cam.turn(-45);
  else if (k === "e") cam.turn(45);
  else if (k === "+" || k === "=") cam.zoomBy(1 / 1.2);
  else if (k === "-") cam.zoomBy(1.2);
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
  $("combatLog").replaceChildren();
  $("missionPlace").textContent = `${h.prologue.city.name} · night`;
  $("turnNo").textContent = String(battle.turn);
  view.clearUnits();
  view.build(battle.map, h.prologue.style, h.prologue.lights);
  for (const u of battle.units) view.addUnit(u, unitLook(u));
  view.sync(battle);
  cam.bounds = battle.map.w / 2;
  // Portrait screens get closer in, or the people are specks.
  cam.distance = cam.targetDistance = canvas.clientWidth < canvas.clientHeight ? 15 : 22;
  selected = null;
  nextUnit();
  if (selected) {
    const w = view.world(selected);
    cam.lookAt(w.x, w.z, true);
  }
  log("Stay quiet. It's out there.", "bad");
  brief(h.prologue);
}

export function closeCombat(): void {
  root.hidden = true;
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

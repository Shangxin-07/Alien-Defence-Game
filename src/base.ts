import "./styles.css";
import "./base/base.css";
import { Color, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { BaseCamera } from "./base/baseCamera";
import { BaseView, levelY } from "./base/baseView";
import { BaseLayout, GRID, Item, ItemStatus, LEVELS, LEVEL_NAMES, Site, surfaceExposure } from "./base/layout";
import { ROLE_BONUS, ROLE_NAMES, ROOMS, ROOM_ORDER, RoomId, powerSupply } from "./base/rooms";

// Bumped whenever the starting base changes, so everyone gets the new start. Older saves load as remote bases.
const SAVE_KEY = "alien-defence.base.v3";
document.body.classList.add("base");

const css = getComputedStyle(document.documentElement);
const token = (name: string) => css.getPropertyValue(name).trim();
const $ = (id: string) => document.getElementById(id)!;

if (import.meta.env.MODE.startsWith("single")) $("nav").hidden = true;

// ---------- State ----------
function loadBase(): BaseLayout {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return BaseLayout.load(JSON.parse(raw));
  } catch {
    // A broken or blocked save just means a fresh base.
  }
  return BaseLayout.starter();
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(layout.save()));
  } catch {
    // Saving is a convenience only.
  }
}

type Tool = { kind: "inspect" } | { kind: "build"; type: RoomId } | { kind: "demolish" };
let layout = loadBase();
let tool: Tool = { kind: "inspect" };
let rotated = false;
let active = 0;
let hover: { x: number; y: number } | null = null;
let selected: number | null = null;

// ---------- Scene ----------
const canvas = $("stage") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new Color(token("--void")));
const scene = new Scene();
const camera = new PerspectiveCamera(40, 1, 0.1, 200);
const view = new BaseView(scene, {
  surface: "#2c3a2c",
  street: "#2a2e33",
  rock: "#2a231c",
  grid: token("--grid"),
  build: token("--amber"),
  alert: token("--alert"),
  ok: token("--coast"),
});
const cam = new BaseCamera(camera, canvas);
// Portrait screens need to stand further back to fit the grid when it's turned.
if (canvas.clientWidth < canvas.clientHeight) cam.distance = cam.targetDistance = 16;

const ray = new Raycaster();
const ndc = new Vector2();
const plane = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();
function pickCell(e: PointerEvent): { x: number; y: number } | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  plane.constant = -levelY(active);
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  const x = Math.floor(hit.x + GRID / 2);
  const y = Math.floor(hit.z + GRID / 2);
  return x >= 0 && y >= 0 && x < GRID && y < GRID ? { x, y } : null;
}

/** Top-left cell of the room being placed, so the cursor sits near the middle of it. */
function anchor(type: RoomId, at: { x: number; y: number }) {
  const { w, h } = layout.footprint(type, rotated);
  // Conversions snap onto the building they replace.
  const under = layout.itemAt(active, at.x, at.y);
  if (under && under.type === ROOMS[type].convertsFrom) return { x: under.x, y: under.y, w, h };
  return { x: at.x - Math.floor((w - 1) / 2), y: at.y - Math.floor((h - 1) / 2), w, h };
}

// ---------- Formatting ----------
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const shortMoney = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 2 : 0)}M` : `$${Math.round(n / 1000)}k`);
const STATUS_TEXT: Record<ItemStatus, string> = {
  building: "Under construction",
  online: "Online",
  isolated: "Cut off: no tunnel to the entrance",
  unpowered: "No power",
};
function describeItem(it: Item): string {
  const def = ROOMS[it.type];
  if (def.owned) return `<b>${def.name}</b> <span class="dim">Yours</span><br>${def.blurb} ${convertHint()}`;
  if (def.detritus) return `<b>${def.name}</b> <span class="dim">City building</span><br>${def.blurb} ${clearingCost(it.type)}`;
  const st = layout.status(it.uid);
  const state = st === "building" ? `${STATUS_TEXT[st]}, ${it.daysLeft} days left` : STATUS_TEXT[st];
  const power = it.type === "generator" ? `supplies ${powerSupply(it.level)} power` : def.power ? `draws ${def.power} power` : "";
  return `<b>${def.name}</b> <span class="st ${st}">${state}</span><br>${def.blurb}${power ? ` <span class="dim">(${power})</span>` : ""}`;
}

function clearingCost(type: RoomId): string {
  const def = ROOMS[type];
  return `<span class="dim">Clearing it costs ${shortMoney(def.cost)} and ${def.exposure} cover.</span>`;
}

function coverLabel(cover: number): { text: string; bad: boolean } {
  if (cover >= 70) return { text: "Covert", bad: false };
  if (cover >= 40) return { text: "Watched", bad: false };
  if (cover > 0) return { text: "Exposed", bad: true };
  return { text: "Blown", bad: true };
}

// ---------- Interaction ----------
let infoHtml = "";
function setInfo(html: string) {
  if (html === infoHtml) return;
  infoHtml = html;
  $("info").innerHTML = html;
  $("info").hidden = !html;
}

function updatePreview() {
  view.hideGhost();
  if (!hover) {
    const sel = selected !== null ? layout.items.get(selected) : undefined;
    setInfo(sel && sel.level === active ? describeItem(sel) : defaultHint());
    return;
  }
  if (tool.kind === "build") {
    const a = anchor(tool.type, hover);
    const def = ROOMS[tool.type];
    const reason = layout.check(tool.type, active, a.x, a.y, rotated);
    view.showGhost(active, a.x, a.y, a.w, a.h, def.height, !reason);
    const exposure = layout.site === "city" && active === 0 ? surfaceExposure(def) : 0;
    const costs = `${shortMoney(layout.cost(tool.type, active))}, ${def.days} days${exposure ? `, −${exposure} cover` : ""}`;
    setInfo(`<b>${def.name}</b> <span class="dim">${costs}</span><br>${reason ? `<span class="st isolated">${reason}</span>` : `<span class="st online">${tapToAct("build")}</span>`}`);
    return;
  }
  const it = layout.itemAt(active, hover.x, hover.y);
  if (!it) {
    setInfo(defaultHint());
    return;
  }
  if (tool.kind === "demolish") {
    const reason = layout.checkDemolish(it.uid);
    const def = ROOMS[it.type];
    view.showGhost(active, it.x, it.y, it.w, it.h, def.height, false);
    const verb = def.detritus ? "Clear" : "Demolish";
    const terms = def.detritus ? `${shortMoney(def.cost)}, −${def.exposure} cover.` : "No refund.";
    setInfo(`<b>${verb} ${def.name.toLowerCase()}</b><br>${reason ? `<span class="st isolated">${reason}</span>` : `<span class="dim">${terms} ${tapToAct(verb.toLowerCase())}</span>`}`);
    return;
  }
  view.showGhost(active, it.x, it.y, it.w, it.h, ROOMS[it.type].height, true);
  setInfo(describeItem(it));
}

let lastPointer: "mouse" | "touch" = "mouse";
const tapToAct = (verb: string) => (lastPointer === "mouse" ? `Click to ${verb}.` : `Tap again to ${verb}.`);
function convertHint(): string {
  return `<span class="dim">Pick ${ROOMS.accessPoint.name} in the build list, then this building.</span>`;
}

function defaultHint() {
  if (!layout.hasEntrance() && layout.site === "city" && tool.kind !== "demolish") {
    return `<span class="dim">No way underground yet. Convert your front building into an access point to start digging: pick ${ROOMS.accessPoint.name} in the build list, then the building.</span>`;
  }
  if (tool.kind === "build") return `<span class="dim">Pick a spot for the ${ROOMS[tool.type].name.toLowerCase()}. Rooms must open onto a tunnel or lift.</span>`;
  if (tool.kind === "demolish") {
    return `<span class="dim">Pick something to tear down.${layout.site === "city" ? " City buildings cost money and cover to clear." : ""}</span>`;
  }
  return `<span class="dim">Drag to turn, scroll or pinch to zoom. Pick a facility to build. Lifts stacked on top of each other link the levels.</span>`;
}

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || cam.isDragging) return;
  lastPointer = "mouse";
  const c = pickCell(e);
  if (c?.x === hover?.x && c?.y === hover?.y) return;
  hover = c;
  updatePreview();
});
canvas.addEventListener("pointerleave", (e) => {
  // A lifted finger also "leaves", which would wipe the preview the tap just set.
  if (e.pointerType !== "mouse" || cam.isDragging) return;
  hover = null;
  updatePreview();
});

cam.onClick = (e) => {
  lastPointer = e.pointerType === "mouse" ? "mouse" : "touch";
  const c = pickCell(e);
  // On touch there's no hover, so the first tap previews and a second tap on the same cell confirms.
  const confirmed = lastPointer === "mouse" || (c && hover && c.x === hover.x && c.y === hover.y);
  hover = c;
  if (!c) {
    selected = null;
    updatePreview();
    return;
  }
  if (tool.kind === "inspect") {
    selected = layout.itemAt(active, c.x, c.y)?.uid ?? null;
    updatePreview();
    return;
  }
  if (!confirmed) {
    updatePreview();
    return;
  }
  if (tool.kind === "build") {
    const a = anchor(tool.type, c);
    const reason = layout.check(tool.type, active, a.x, a.y, rotated);
    if (reason) return toast(reason, true);
    layout.place(tool.type, active, a.x, a.y, rotated);
    if (ROOMS[tool.type].convertsFrom) setTool({ kind: "inspect" });
    if (lastPointer === "touch") hover = null;
  } else {
    const it = layout.itemAt(active, c.x, c.y);
    if (!it) return;
    const reason = layout.checkDemolish(it.uid);
    if (reason) return toast(reason, true);
    layout.demolish(it.uid);
    toast(`${ROOMS[it.type].name} ${ROOMS[it.type].detritus ? "cleared" : "demolished"}`);
    if (lastPointer === "touch") hover = null;
  }
  changed();
};

// ---------- HUD ----------
function setTool(t: Tool) {
  tool = t;
  selected = null;
  $("inspect").setAttribute("aria-pressed", String(t.kind === "inspect"));
  $("demolish").setAttribute("aria-pressed", String(t.kind === "demolish"));
  for (const li of $("palette").children) {
    const b = li.firstElementChild as HTMLButtonElement;
    b.setAttribute("aria-pressed", String(t.kind === "build" && b.dataset.type === t.type));
  }
  updatePreview();
}

for (const id of ROOM_ORDER) {
  const def = ROOMS[id];
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.type = id;
  b.setAttribute("aria-pressed", "false");
  b.innerHTML = `<i></i><span class="name"></span><span class="meta"></span>`;
  (b.firstElementChild as HTMLElement).style.background = def.color;
  b.querySelector(".name")!.textContent = def.name;
  b.title = def.blurb;
  b.addEventListener("click", () => setTool(tool.kind === "build" && tool.type === id ? { kind: "inspect" } : { kind: "build", type: id }));
  li.appendChild(b);
  $("palette").appendChild(li);
}

function updatePalette() {
  for (const li of $("palette").children) {
    const b = li.firstElementChild as HTMLButtonElement;
    const def = ROOMS[b.dataset.type as RoomId];
    // Conversions only show while there's something to convert.
    if (def.convertsFrom) {
      const from = def.convertsFrom;
      (li as HTMLElement).hidden = ![...layout.items.values()].some((it) => it.type === from);
    }
    const wrongLevel = (def.siting === "surface" && active !== 0) || (def.siting === "underground" && active === 0);
    const cost = layout.cost(def.id, active);
    const power = def.id === "generator" ? (active ? `+${powerSupply(active)}` : "") : def.power ? `−${def.power}` : "";
    b.querySelector(".meta")!.textContent = wrongLevel
      ? def.siting === "surface" ? "surface only" : "underground only"
      : `${def.w}×${def.h} · ${shortMoney(cost)} · ${def.days}d${power ? ` · ⚡${power}` : ""}`;
    b.classList.toggle("unavailable", wrongLevel || cost > layout.funds);
  }
}

const levelButtons: HTMLButtonElement[] = [];
for (let l = 0; l < LEVELS; l++) {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<span class="name long">${LEVEL_NAMES[l]}</span><span class="name short">${l ? `−${l}` : "Top"}</span><span class="meta"></span>`;
  b.setAttribute("aria-label", LEVEL_NAMES[l]);
  b.addEventListener("click", () => setLevel(l));
  levelButtons.push(b);
  $("levels").appendChild(b);
}

function setLevel(l: number) {
  if (l < 0 || l >= LEVELS || l === active) return;
  active = l;
  cam.targetY = levelY(l);
  hover = null;
  selected = null;
  refresh();
}

function updateLevels() {
  levelButtons.forEach((b, l) => {
    b.setAttribute("aria-pressed", String(l === active));
    const used = [...layout.items.values()].filter((it) => it.level === l).reduce((n, it) => n + it.w * it.h, 0);
    b.querySelector(".meta")!.textContent = used ? `${used}/${GRID * GRID}` : "unexcavated";
  });
}

function updateStats() {
  const s = layout.stats();
  const c = s.capacity;
  const rows: [string, string, boolean?][] = [
    ["Power", `${s.demand} / ${s.supply}`, s.demand > s.supply],
    ["Living space", `${c.crew}`],
    ["Lab space", `${c.science}`],
    ["Workshop space", `${c.engineering}`],
    ["Storage", `${c.storage}`],
    ["Medical beds", `${c.beds}`],
    ["Hangars", `${c.hangars}`],
    ["Containment", `${c.containment}`],
    ["Radar range", s.radar ? `${s.radar} nmi` : "none", !s.radar],
    ["Base defence", `${c.defence}`],
    ["Building", `${s.building}`],
  ];
  const troubled = [...layout.statuses().values()].filter((st) => st === "isolated" || st === "unpowered").length;
  if (troubled) rows.push(["Not working", `${troubled}`, true]);
  $("stats").innerHTML = rows
    .map(([k, v, bad]) => `<div class="row"><span>${k}</span><span${bad ? ' class="bad"' : ""}>${v}</span></div>`)
    .join("");
}

function updateHead() {
  $("site").textContent = layout.site === "city" ? "City, covert" : "Remote";
  const cover = layout.cover();
  $("coverRow").hidden = cover === null;
  if (cover !== null) {
    const { text, bad } = coverLabel(cover);
    $("cover").textContent = `${text} ${cover}%`;
    $("cover").className = bad ? "bad" : "";
    ($("coverBar").firstElementChild as HTMLElement).style.width = `${cover}%`;
    $("coverBar").classList.toggle("bad", bad);
  }
  const sp = layout.specialism();
  const total = Object.values(sp.cells).reduce((a, b) => a + b, 0);
  if (sp.role) {
    $("baseType").textContent = `${ROLE_NAMES[sp.role]} base`;
    $("bonus").textContent = `+${sp.bonus}% ${ROLE_BONUS[sp.role]}`;
  } else {
    $("baseType").textContent = total < 4 ? "Outpost" : "General base";
    $("bonus").textContent = total < 4 ? "Too small to specialise yet" : "Mixed rooms, no bonus";
  }
  $("baseTypeRow").title = (Object.keys(sp.cells) as (keyof typeof sp.cells)[])
    .map((r) => `${ROLE_NAMES[r]}: ${total ? Math.round((sp.cells[r] / total) * 100) : 0}%`)
    .join("\n");
  $("funds").textContent = money(layout.funds);
  // The phone layout stacks the level and status panels under the header, whatever its height.
  document.documentElement.style.setProperty("--head-h", `${$("head").offsetHeight}px`);
  $("day").textContent = String(layout.day);
  const next = layout.nextCompletion();
  ($("waitNext") as HTMLButtonElement).disabled = !next;
  $("waitNext").textContent = next ? `Skip ${next}d` : "Nothing building";
}

// Name tags over the rooms on the active level.
const tagBox = $("labels");
let tagEls: HTMLDivElement[] = [];
function rebuildTags() {
  tagBox.replaceChildren();
  tagEls = view.tags.map((t) => {
    const d = document.createElement("div");
    d.className = `tag ${t.status}`;
    d.textContent = t.status === "building" ? `${t.text} ${layout.items.get(t.uid)!.daysLeft}d` : t.text;
    tagBox.appendChild(d);
    return d;
  });
}
const proj = new Vector3();
function placeTags() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  view.tags.forEach((t, i) => {
    proj.copy(t.pos).project(camera);
    tagEls[i].style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -50%)`;
  });
}

let toastTimer = 0;
function toast(text: string, bad = false) {
  const t = $("toast");
  t.textContent = text;
  t.className = bad ? "show bad" : "show";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = ""), 2600);
}

function refresh() {
  view.rebuild(layout, active);
  rebuildTags();
  updateHead();
  updateLevels();
  updatePalette();
  updateStats();
  updatePreview();
}
function changed() {
  persist();
  refresh();
}

function wait(days: number) {
  if (days <= 0) return;
  const done = layout.advance(days);
  if (done.length) {
    const names = done.map((it) => `${ROOMS[it.type].name} (${LEVEL_NAMES[it.level]})`);
    toast(`Complete: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`);
  }
  changed();
}

$("wait1").addEventListener("click", () => wait(1));
$("waitNext").addEventListener("click", () => wait(layout.nextCompletion()));
$("inspect").addEventListener("click", () => setTool({ kind: "inspect" }));
$("demolish").addEventListener("click", () => setTool(tool.kind === "demolish" ? { kind: "inspect" } : { kind: "demolish" }));
$("rotate").addEventListener("click", () => {
  rotated = !rotated;
  updatePreview();
});
// Two presses to scrap the base, since there's no undo.
for (const site of ["city", "remote"] as Site[]) {
  const b = $(site === "city" ? "newCity" : "newRemote");
  const label = b.textContent!;
  let timer = 0;
  b.addEventListener("click", () => {
    if (!timer) {
      b.textContent = "Press again";
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
    layout = BaseLayout.starter(site, Math.floor(Math.random() * 1e9));
    setLevel(0);
    changed();
  });
}

window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === "r" || k === "R") $("rotate").click();
  else if (k === "x" || k === "X" || k === "Delete") $("demolish").click();
  else if (k === "Escape") setTool({ kind: "inspect" });
  else if (k === "PageDown" || k === "]") setLevel(active + 1);
  else if (k === "PageUp" || k === "[") setLevel(active - 1);
  else if (k === "ArrowLeft") cam.turn(-15);
  else if (k === "ArrowRight") cam.turn(15);
  else if (k === "+" || k === "=") cam.zoomBy(1 / 1.2);
  else if (k === "-") cam.zoomBy(1.2);
  else return;
  e.preventDefault();
});

if (window.matchMedia("(max-width: 640px)").matches) ($("statsBox") as HTMLDetailsElement).open = false;

// ---------- Loop ----------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Hold the horizontal field of view on portrait screens so the whole grid fits.
  camera.fov = w < h ? (2 * Math.atan(Math.tan((20 * Math.PI) / 180) * (h / w)) * 180) / Math.PI : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
refresh();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  cam.update(dt);
  placeTags();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

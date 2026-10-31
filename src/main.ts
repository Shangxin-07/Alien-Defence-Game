import "./styles.css";
import { Color, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { ROOMS } from "./base/rooms";
import { closeBase, openBase } from "./base/screen";
import { BaseRecord, Campaign, Completion, GRANT } from "./campaign/campaign";
import { BaseMarks } from "./geoscape/baseMarks";
import { BIOMES, BIOME_ORDER, biomeAt } from "./geoscape/biomes";
import { blocAt } from "./geoscape/blocs";
import { CITIES, City } from "./geoscape/cities";
import { GameClock, TIME_SPEEDS, formatClock } from "./geoscape/clock";
import { DEG, LatLon, formatLatLon, nmiToRadians, latLonToVector, lightingAt, subsolarPoint, sunElevation, vectorToLatLon } from "./geoscape/geo";
import { Globe } from "./geoscape/globe";
import { GlobeLabels } from "./geoscape/labels";
import { buildMapTextures } from "./geoscape/mapTextures";
import { OrbitView } from "./geoscape/orbitView";
import { $, addItem, choiceButton, escape, money, toast, token } from "./ui/dom";
import { FightHost, ambushDialog, playPrologue } from "./ui/fights";
import { Panel } from "./ui/panel";
import { allocationPanel } from "./ui/panels/allocation";
import { armouryPanel } from "./ui/panels/armoury";
import { recruitPanel } from "./ui/panels/recruit";
import { scavengePanel } from "./ui/panels/scavenge";
import { sightingsPanel } from "./ui/panels/sightings";
import { staffPanel } from "./ui/panels/staff";

// The geoscape screen: the globe, the command panel and the clock. The panels it opens live in
// ui/panels/, the fights in ui/fights.ts, and the base and battle screens in base/screen.ts and
// tactical/screen.ts.

const SAVE_KEY = "alien-defence.campaign.v1";

// ---------- Campaign ----------
function loadCampaign(): Campaign {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Campaign.load(JSON.parse(raw));
  } catch {
    // A broken or blocked save just means a fresh campaign.
  }
  return new Campaign();
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(campaign.save()));
  } catch {
    // Saving is a convenience only.
  }
}
let campaign = loadCampaign();

const screen = $("globeScreen");
const canvas = $("globe") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new Color(token("--void")));

const scene = new Scene();
const camera = new PerspectiveCamera(40, 1, 0.05, 100);
const maps = buildMapTextures(renderer, { ocean: token("--ocean"), coast: token("--coast"), grid: token("--grid") });
const globe = new Globe(scene, maps.day, maps.overlay, new Color(token("--amber")), new Color(token("--border")), new Color(token("--coast")));
const labels = new GlobeLabels($("globeLabels"));
const marks = new BaseMarks($("baseMarks"));
const view = new OrbitView(camera, canvas);
const clock = new GameClock(campaign.time, 60);

// ---------- Panels and fights ----------
const host: FightHost = {
  get campaign() {
    return campaign;
  },
  persist,
  refresh,
  toast: (text) => toast(text),
  get onGlobe() {
    return !screen.hidden;
  },
  leaveGlobe() {
    screen.hidden = true;
    view.enabled = false;
  },
  returnToGlobe() {
    screen.hidden = false;
    view.enabled = true;
    resize();
  },
  news: () => completed([]),
  closePanels: () => panels.forEach((p) => p.hide()),
  suggestSite(city: City) {
    picked = { kind: "site", ll: { lat: city.lat, lon: city.lon } };
    globe.placeMarker(city);
    view.flyTo(city.lat, city.lon);
  },
};

/** The panels opened from the command panel. To add one, see ui/panel.ts. */
const panels = [scavengePanel, recruitPanel, sightingsPanel, armouryPanel, allocationPanel, staffPanel].map((make) => new Panel(make(host)));
const ambush = ambushDialog(host);

// ---------- Picking ----------
const ray = new Raycaster();
const ndc = new Vector2();
function pick(e: PointerEvent): LatLon | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(globe.surface)[0];
  return hit ? vectorToLatLon(hit.point) : null;
}

function describe(ll: LatLon): { terrain: string; territory: string } {
  if (!maps.isLand(ll.lat, ll.lon)) {
    const waters = blocAt(ll.lat, ll.lon);
    return { terrain: "Ocean", territory: waters ? `${waters.name} waters` : "International waters" };
  }
  return { terrain: BIOMES[biomeAt(ll.lat, ll.lon)].name, territory: blocAt(ll.lat, ll.lon)?.name ?? "Unclaimed" };
}

// What's picked on the globe: a spot to survey, or one of our bases.
type Pick = { kind: "site"; ll: LatLon } | { kind: "base"; id: number } | null;
let picked: Pick = null;

/** A visible city within a finger's width of the pointer, so zoomed-out taps still hit it. */
const cityPos = new Vector3();
function cityNear(e: PointerEvent): LatLon | null {
  const r = canvas.getBoundingClientRect();
  const facing = camera.position.clone().normalize();
  let best: LatLon | null = null;
  let bestPx = 16;
  for (const c of CITIES) {
    if (c.tier === 2 && view.distance > 2.7) continue;
    latLonToVector(c.lat, c.lon, 1, cityPos);
    if (cityPos.dot(facing) < 1 / view.distance + 0.05) continue;
    cityPos.project(camera);
    const px = Math.hypot(((cityPos.x + 1) / 2) * r.width - (e.clientX - r.left), ((1 - cityPos.y) / 2) * r.height - (e.clientY - r.top));
    if (px < bestPx) [best, bestPx] = [{ lat: c.lat, lon: c.lon }, px];
  }
  return best;
}

view.onClick = (e) => {
  const ll = cityNear(e) ?? pick(e);
  if (!ll) return;
  picked = { kind: "site", ll };
  globe.placeMarker(ll);
  refresh();
};
marks.onPick = (id) => {
  const b = campaign.bases.find((x) => x.id === id);
  if (!b) return;
  picked = { kind: "base", id };
  globe.hideMarker();
  view.flyTo(b.lat, b.lon);
  refresh();
};

canvas.addEventListener("pointermove", (e) => {
  const ll = pick(e);
  $("cursor").textContent = ll ? formatLatLon(ll) : "—";
  const info = ll ? describe(ll) : null;
  $("terrain").textContent = info?.terrain ?? "—";
  $("territory").textContent = info?.territory ?? "—";
});
canvas.addEventListener("pointerleave", () => {
  if (view.isDragging) return;
  for (const id of ["cursor", "terrain", "territory"]) $(id).textContent = "—";
});

// ---------- HUD ----------
$("zoomIn").addEventListener("click", () => view.zoomBy(1 / 1.35));
$("zoomOut").addEventListener("click", () => view.zoomBy(1.35));

const key = $("terrainKey");
for (const id of BIOME_ORDER) {
  const b = BIOMES[id];
  const li = document.createElement("li");
  li.innerHTML = `<i></i><span></span>`;
  (li.firstElementChild as HTMLElement).style.background = b.color;
  li.querySelector("span")!.textContent = b.name;
  li.title = b.tactical;
  key.appendChild(li);
}

const speedBox = $("speeds");
for (const { label, rate } of TIME_SPEEDS) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.setAttribute("aria-pressed", String(rate === clock.rate));
  b.addEventListener("click", () => {
    clock.rate = rate;
    for (const x of speedBox.children) x.setAttribute("aria-pressed", String(x === b));
  });
  speedBox.appendChild(b);
}

const SPIN_KEY = "alien-defence.autoSpin";
const spinBox = $("autoSpin") as HTMLInputElement;
try {
  spinBox.checked = localStorage.getItem(SPIN_KEY) !== "off";
} catch {
  // Storage blocked: keep the default.
}
view.autoSpin = spinBox.checked;
spinBox.addEventListener("change", () => {
  view.autoSpin = spinBox.checked;
  try {
    localStorage.setItem(SPIN_KEY, spinBox.checked ? "on" : "off");
  } catch {
    // Storage blocked: the setting lasts this visit only.
  }
});

function setRate(rate: number) {
  clock.rate = rate;
  [...speedBox.children].forEach((x, i) => x.setAttribute("aria-pressed", String(TIME_SPEEDS[i].rate === rate)));
}

// ---------- Command panel ----------
const dateText = () => formatClock(campaign.time).date;
const placeOf = (b: BaseRecord) => (b.city ? `${b.city}, covert` : `Remote, ${BIOMES[biomeAt(b.lat, b.lon)].name.toLowerCase()}`);

function baseSummary(b: BaseRecord): string {
  const { building, radar } = b.layout.stats();
  const cover = b.layout.cover();
  const parts = [placeOf(b)];
  if (cover !== null) parts.push(`cover ${cover}%`);
  if (radar) parts.push(`radar ${radar} nmi`);
  if (building) parts.push(`${building} building`);
  return parts.join(" · ");
}

function refreshBases() {
  $("globeFunds").textContent = money(campaign.funds);
  $("globeGrant").textContent = campaign.bases.length ? `$${GRANT / 1e6}M in ${campaign.nextGrant}d` : "once you have a base";
  const list = $("baseList");
  list.replaceChildren();
  for (const b of campaign.bases) {
    const btn = choiceButton(b.name, baseSummary(b));
    btn.title = `Open ${b.name}`;
    btn.addEventListener("click", () => enterBase(b));
    addItem(list, btn);
  }
  list.hidden = !campaign.bases.length;
  const pro = campaign.prologue;
  const spoils = $("spoils");
  spoils.hidden = !pro?.recovered.length;
  if (pro?.recovered.length) spoils.innerHTML = `<b>Recovered in ${escape(pro.city)}</b><span class="dim">${pro.recovered.map(escape).join(", ")}</span>`;
  const s = campaign.supplies;
  const days = campaign.foodDays;
  $("suppliesRow").hidden = !campaign.bases.length;
  $("globeSupplies").textContent = `${s.food} food (${days === Infinity ? "—" : `${days}d`}) · ${s.medicine} med · ${s.scrap} scrap · ${s.fuel} fuel · ${s.ammo} clips`;
  $("globeSupplies").className = days < 3 ? "bad" : "";
  marks.set(
    campaign.bases.map((b) => ({ id: b.id, name: b.name, lat: b.lat, lon: b.lon, covert: b.site === "city" })),
    picked?.kind === "base" ? picked.id : null,
  );
  globe.setRadar(campaign.radar().map((r) => ({ lat: r.lat, lon: r.lon, radius: nmiToRadians(r.nmi) })));
  const first = !campaign.bases.length;
  $("banner").hidden = !first || !!picked;
  const out = pro && pro.outcome !== "skipped" && pro.survivors ? `Your survivors got out of ${pro.city}. ` : "";
  $("banner").textContent = `${out}Choose a city for your first base. It has to stay hidden, and there's no money yet: your own people will dig it out. The clock starts once it's founded.`;
}

function refreshSurvey() {
  const box = $("survey");
  box.hidden = !picked;
  $("globeHint").hidden = !!picked;
  if (!picked) return;
  if (picked.kind === "base") {
    const b = campaign.bases.find((x) => x.id === (picked as { id: number }).id)!;
    box.innerHTML = `<b>${escape(b.name)}</b><div class="dim">${escape(baseSummary(b))}</div>
      <div class="row"><span>Position</span><span>${formatLatLon(b)}</span></div>
      <div class="row"><span>Lighting</span><span>${lightText(b)}</span></div>
      <div class="actions"><button type="button" class="go" id="openBase">Open base</button></div>`;
    $("openBase").addEventListener("click", () => enterBase(b));
    return;
  }
  const ll = picked.ll;
  const s = campaign.survey(ll, maps.isLand(ll.lat, ll.lon));
  // Snap to the city a covert base would hide in.
  const at = s.city ?? ll;
  if (s.city) globe.placeMarker(at);
  const { terrain, territory } = describe(at);
  const kind = !s.site ? "None" : s.site === "city" ? `Covert, under ${s.city!.name}` : `Remote, ${terrain.toLowerCase()}`;
  box.innerHTML = `<b>Site survey</b>
    <div class="row"><span>Position</span><span>${formatLatLon(at)}</span></div>
    <div class="row"><span>Territory</span><span>${escape(territory)}</span></div>
    <div class="row"><span>Base</span><span>${escape(kind)}</span></div>
    ${s.site ? `<div class="row"><span>Cost</span><span>${s.cost ? money(s.cost) : "Paid by the council"}</span></div>` : ""}
    <div class="row"><span>Lighting</span><span>${lightText(at)}</span></div>
    <div class="actions">${s.reason ? `<span class="bad">${escape(s.reason)}</span>` : `<button type="button" class="go" id="foundBase">Found base here</button>`}</div>`;
  if (!s.reason) $("foundBase").addEventListener("click", () => found(ll));
}

function lightText(ll: LatLon): string {
  const light = lightingAt(ll, campaign.time);
  return light === "day" ? `Day, sun ${sunElevation(ll, campaign.time).toFixed(0)}° up` : light === "twilight" ? "Twilight" : "Night";
}

/** Redraws everything on the geoscape that follows the campaign: the command panel, the survey and any open panel. */
function refresh() {
  refreshBases();
  refreshSurvey();
  for (const p of panels) p.refresh();
  ambush.check();
  lastClock = "";
}

function found(ll: LatLon) {
  const first = !campaign.bases.length;
  const b = campaign.found(ll, maps.isLand(ll.lat, ll.lon));
  persist();
  picked = { kind: "base", id: b.id };
  globe.hideMarker();
  toast(`${b.name} founded${b.city ? ` under ${b.city}` : ""}`);
  if (first) setRate(60);
  refresh();
}

function completed(done: Completion[]) {
  // Research and other news from the day's work.
  if (campaign.news.length) {
    toast(campaign.news.splice(0).join(" · "));
    if (clock.rate > 300) setRate(5);
    refresh();
  }
  if (!done.length) return;
  const names = done.map(({ base, item }) => `${ROOMS[item.type].name} at ${base.name}`);
  toast(`Complete: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`);
  // Like the original, news from a base drops the clock back to a crawl so you notice it.
  if (clock.rate > 300) setRate(5);
}

// ---------- Base screen ----------
function enterBase(b: BaseRecord) {
  host.leaveGlobe();
  openBase({
    name: b.name,
    place: placeOf(b),
    layout: campaign.open(b),
    date: dateText,
    wait: (days) => {
      const done = campaign.advanceDays(days);
      clock.time = campaign.time;
      campaign.open(b);
      persist();
      // A run in trouble pulls you out of the base to deal with it.
      if (campaign.ambush) window.setTimeout(() => leaveBase(b), 0);
      return done.map(({ base, item }) => ({ base: base.name, item }));
    },
    save: () => {
      campaign.settle(b);
      persist();
    },
    leave: () => leaveBase(b),
  });
}

function leaveBase(b: BaseRecord) {
  campaign.settle(b);
  persist();
  closeBase();
  picked = { kind: "base", id: b.id };
  globe.hideMarker();
  host.returnToGlobe();
  refresh();
}

// ---------- Prologue and new campaigns ----------
$("replayPrologue").addEventListener("click", () => playPrologue(host));

// Two presses to scrap the campaign, since there's no undo.
{
  const b = $("newCampaign");
  const label = b.textContent!;
  let timer = 0;
  b.addEventListener("click", () => {
    if (!timer) {
      b.textContent = "Press again to scrap everything";
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
    campaign = new Campaign();
    clock.time = campaign.time;
    picked = null;
    globe.hideMarker();
    persist();
    refresh();
    playPrologue(host);
  });
}

// ---------- Clock ----------
let lastClock = "";
let lastDay = campaign.day;
function updateHud() {
  const { time, date } = formatClock(clock.time);
  if (time === lastClock) return;
  lastClock = time;
  $("clock").textContent = time;
  $("date").textContent = date;
  // The survey panel shows lighting and building counts, so it follows the clock, but not every frame.
  if (campaign.day !== lastDay) {
    lastDay = campaign.day;
    persist();
    refresh();
  }
}
window.addEventListener("pagehide", persist);

// ---------- Loop ----------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // On portrait screens, hold the horizontal field of view so the whole globe fits.
  camera.fov = w < h ? (2 * Math.atan(Math.tan(20 * DEG) * (h / w))) / DEG : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
refresh();
if (campaign.bases.length) {
  const b = campaign.bases[0];
  view.lat = b.lat;
  view.lon = b.lon;
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
  if (screen.hidden) return;
  // Nothing happens in the world until the first base is up.
  // A run in a fight holds the clock until the player deals with it.
  if (campaign.bases.length && !campaign.ambush) {
    clock.tick(dt);
    completed(campaign.advanceTo(clock.time));
    if (campaign.ambush) {
      clock.time = campaign.time;
      ambush.check();
    }
  }
  view.update(dt, now);
  globe.setSun(subsolarPoint(clock.time));
  globe.setBorderOpacity(0.85 * Math.min(1, Math.max(0, (3.3 - view.distance) / 0.8)));
  globe.update(now, view.distance);
  labels.update(camera, view.distance, canvas.clientWidth, canvas.clientHeight);
  marks.update(camera, view.distance, canvas.clientWidth, canvas.clientHeight);
  updateHud();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// A new war opens with the prologue.
if (!campaign.bases.length && !campaign.prologue) playPrologue(host);

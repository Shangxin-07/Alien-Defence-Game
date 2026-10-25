import "./styles.css";
import { Color, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { closeBase, openBase } from "./base";
import { ROOMS } from "./base/rooms";
import { BaseRecord, Campaign, Completion, GRANT, nmiToRadians } from "./campaign";
import { closeCombat, openCombat } from "./combat";
import { MAX_RUN_DAYS, MAX_TEAM, SITES, SITE_ORDER, SiteId, cleanChance, describeSupplies } from "./scavenge";
import type { Stats } from "./tactical/rules";
import { BaseMarks } from "./geoscape/baseMarks";
import { BIOMES, BIOME_ORDER, biomeAt } from "./geoscape/biomes";
import { blocAt } from "./geoscape/blocs";
import { CITIES } from "./geoscape/cities";
import { GameClock, TIME_SPEEDS, formatClock } from "./geoscape/clock";
import { DEG, LatLon, formatLatLon, latLonToVector, lightingAt, subsolarPoint, sunElevation, vectorToLatLon } from "./geoscape/geo";
import { Globe } from "./geoscape/globe";
import { GlobeLabels } from "./geoscape/labels";
import { buildMapTextures } from "./geoscape/mapTextures";
import { OrbitView } from "./geoscape/orbitView";
import { JOB_NAMES, Job, buildSkill, fitToWork, project, rollBuild } from "./staff";
import { prologueCity, startAmbush, startPrologue } from "./tactical/prologue";

const css = getComputedStyle(document.documentElement);
const token = (name: string) => css.getPropertyValue(name).trim();
const $ = (id: string) => document.getElementById(id)!;

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

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const dateText = () => formatClock(campaign.time).date;
const placeOf = (b: BaseRecord) => (b.city ? `${b.city}, covert` : `Remote, ${BIOMES[biomeAt(b.lat, b.lon)].name.toLowerCase()}`);
const escape = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

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
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<span class="name"></span><span class="meta"></span>`;
    btn.querySelector(".name")!.textContent = b.name;
    btn.querySelector(".meta")!.textContent = baseSummary(b);
    btn.title = `Open ${b.name}`;
    btn.addEventListener("click", () => enterBase(b));
    li.appendChild(btn);
    list.appendChild(li);
  }
  list.hidden = !campaign.bases.length;
  const pro = campaign.prologue;
  const spoils = $("spoils");
  spoils.hidden = !pro?.recovered.length;
  $("openStaff").hidden = !campaign.staff.length;
  const started = !!campaign.bases.length;
  $("suppliesRow").hidden = !started;
  $("openScavenge").hidden = !started;
  const s = campaign.supplies;
  const days = campaign.foodDays;
  $("globeSupplies").textContent = `${s.food} food (${days === Infinity ? "—" : `${days}d`}) · ${s.medicine} med · ${s.scrap} scrap`;
  $("globeSupplies").className = days < 3 ? "bad" : "";
  $("scavengeSummary").textContent = campaign.runs.length
    ? campaign.runs.map((r) => `${SITES[r.site].name}${r.ambush ? ", in trouble" : `, ${r.daysLeft}d`}`).join(" · ")
    : "Nobody out";
  $("staffSummary").textContent = staffSummary();
  if (pro?.recovered.length) spoils.innerHTML = `<b>Recovered in ${escape(pro.city)}</b><span class="dim">${pro.recovered.map(escape).join(", ")}</span>`;
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

function refresh() {
  refreshBases();
  refreshSurvey();
  if (!$("scavengeModal").hidden) refreshScavenge();
  checkAmbush();
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
    if (!$("staffModal").hidden) refreshStaff();
    refreshBases();
  }
  if (!done.length) return;
  const names = done.map(({ base, item }) => `${ROOMS[item.type].name} at ${base.name}`);
  toast(`Complete: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`);
  // Like the original, news from a base drops the clock back to a crawl so you notice it.
  if (clock.rate > 300) setRate(5);
}

// ---------- Base screen ----------
function enterBase(b: BaseRecord) {
  screen.hidden = true;
  view.enabled = false;
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
  screen.hidden = false;
  view.enabled = true;
  picked = { kind: "base", id: b.id };
  globe.hideMarker();
  resize();
  refresh();
}

// ---------- Staff and research ----------
function staffSummary(): string {
  const id = campaign.research.active;
  if (!campaign.staff.length) return "Nobody yet";
  if (!campaign.bases.length) return `${campaign.staff.length} waiting for a base`;
  if (!id) return "No research project";
  const eta = campaign.researchEta();
  return `${project(id).name}${eta ? `, ~${eta} day${eta === 1 ? "" : "s"}` : ", stalled"}`;
}

function refreshStaff() {
  const r = campaign.research;
  const id = r.active;
  const rate = campaign.researchRate();
  const eta = campaign.researchEta();
  $("researchNow").innerHTML = id
    ? `<div class="row"><span>Working on</span><span>${escape(project(id).name)}</span></div>
       <div class="meter"><i style="width:${Math.min(100, ((r.progress[id] ?? 0) / project(id).points) * 100)}%"></i></div>
       <div class="row"><span>${rate.toFixed(1)} points a day</span><span>${eta ? `~${eta} days left` : campaign.bases.length ? "Nobody on research" : "Waiting for a base"}</span></div>`
    : `<p class="dim">Pick a project. Everyone on research works on it together.</p>`;
  const list = $("projectList");
  list.replaceChildren();
  for (const { project: p, blocker, progress } of campaign.projects()) {
    if (blocker === "Done") continue;
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.disabled = !!blocker;
    b.setAttribute("aria-pressed", String(p.id === id));
    b.innerHTML = `<span class="name"></span><span class="meta"></span>`;
    b.querySelector(".name")!.textContent = p.name;
    b.querySelector(".meta")!.textContent = blocker ?? `${p.blurb} ${Math.floor(progress)}/${p.points}`;
    b.addEventListener("click", () => {
      campaign.setResearch(p.id === id ? null : p.id);
      persist();
      refreshStaff();
      refreshBases();
    });
    li.appendChild(b);
    list.appendChild(li);
  }
  const people = $("staffList");
  people.replaceChildren();
  for (const p of campaign.staff) {
    const li = document.createElement("li");
    const where = campaign.bases.find((b) => b.id === p.base)?.name ?? "No base yet";
    const fit = fitToWork(p);
    li.innerHTML = `<div><b></b> <span class="dim"></span><div class="meta"></div></div><div class="pick"><select aria-label="Base"></select><select aria-label="Job"></select></div>`;
    li.querySelector("b")!.textContent = p.name;
    li.querySelector(".dim")!.textContent = p.role;
    const run = campaign.runs.find((r) => r.id === p.away);
    const status = `${run ? ` · out at the ${SITES[run.site].name.toLowerCase()}` : ""}${p.hunger ? ` · hungry ${p.hunger}d` : ""}`;
    li.querySelector(".meta")!.textContent = `${where}${status} · HP ${p.health}/${p.stats.health}${fit ? "" : " · recovering"} · build ${buildSkill(p).toFixed(2)} · research ${p.aptitude.toFixed(2)}`;
    const [baseSel, sel] = li.querySelectorAll("select");
    baseSel.disabled = sel.disabled = !!p.away;
    baseSel.hidden = campaign.bases.length < 2;
    for (const b of campaign.bases) {
      const o = document.createElement("option");
      o.value = String(b.id);
      o.textContent = b.name;
      baseSel.appendChild(o);
    }
    if (p.base !== null) baseSel.value = String(p.base);
    baseSel.addEventListener("change", () => {
      campaign.transfer(p.id, Number(baseSel.value));
      persist();
      refreshStaff();
      refreshBases();
    });
    for (const job of Object.keys(JOB_NAMES) as Job[]) {
      const o = document.createElement("option");
      o.value = job;
      o.textContent = JOB_NAMES[job];
      sel.appendChild(o);
    }
    sel.value = p.job;
    sel.addEventListener("change", () => {
      p.job = sel.value as Job;
      persist();
      refreshStaff();
      refreshBases();
    });
    people.appendChild(li);
  }
  $("doneBox").hidden = !r.done.length;
  $("doneList").innerHTML = r.done.map((d) => `<li><b>${escape(project(d).name)}</b> ${escape(project(d).result)}</li>`).join("");
}

$("openStaff").addEventListener("click", () => {
  refreshStaff();
  $("staffModal").hidden = false;
});
$("closeStaff").addEventListener("click", () => ($("staffModal").hidden = true));
$("staffModal").addEventListener("click", (e) => {
  if (e.target === $("staffModal")) $("staffModal").hidden = true;
});

// ---------- Scavenging ----------
let runSite: SiteId = "homes";
let runDays = 1;
const runTeam = new Set<number>();

function refreshScavenge() {
  const s = campaign.supplies;
  const days = campaign.foodDays;
  $("supplyRows").innerHTML = `
    <div class="row"><span>Food</span><span${days < 3 ? ' class="bad"' : ""}>${s.food}, ${days === Infinity ? "nobody to feed" : `${days} day${days === 1 ? "" : "s"} for ${campaign.staff.length}`}</span></div>
    <div class="row"><span>Medicine</span><span>${s.medicine}</span></div>
    <div class="row"><span>Scrap</span><span>${s.scrap} (worth ${money(s.scrap * 10_000)} in rooms)</span></div>`;
  const runs = $("runList");
  runs.replaceChildren();
  for (const r of campaign.runs) {
    const li = document.createElement("li");
    const names = r.team.map((id) => campaign.staff.find((p) => p.id === id)?.name ?? "?").join(", ");
    li.innerHTML = `<div><b></b><div class="meta"></div></div>`;
    li.querySelector("b")!.textContent = SITES[r.site].name;
    li.querySelector(".meta")!.textContent = `${names} · ${r.ambush ? "in a fight" : `back in ${r.daysLeft}d`} · found ${describeSupplies(r.loot)}`;
    runs.appendChild(li);
  }
  if (!campaign.runs.length) runs.innerHTML = `<li class="dim">Nobody is out.</li>`;
  const sites = $("siteList");
  sites.replaceChildren();
  for (const id of SITE_ORDER) {
    const site = SITES[id];
    const rich = campaign.richness[id] ?? 1;
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(id === runSite));
    const finds = Object.entries(site.yields).map(([k, [lo, hi]]) => `${k} ${lo}–${hi}`).join(", ");
    b.innerHTML = `<span class="name"></span><span class="meta"></span>`;
    b.querySelector(".name")!.textContent = site.name;
    b.querySelector(".meta")!.textContent = `${site.blurb} Each person finds ${finds} a day${rich < 0.95 ? `, ${Math.round(rich * 100)}% of that now it's been picked over` : ""}.`;
    b.addEventListener("click", () => {
      runSite = id;
      refreshScavenge();
    });
    li.appendChild(b);
    sites.appendChild(li);
  }
  const seg = $("runDays");
  seg.replaceChildren();
  for (let d = 1; d <= MAX_RUN_DAYS; d++) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${d} day${d === 1 ? "" : "s"}`;
    b.setAttribute("aria-pressed", String(d === runDays));
    b.addEventListener("click", () => {
      runDays = d;
      refreshScavenge();
    });
    seg.appendChild(b);
  }
  const team = $("teamList");
  team.replaceChildren();
  for (const p of campaign.staff) {
    const free = campaign.canScavenge(p);
    if (!free) runTeam.delete(p.id);
    const li = document.createElement("li");
    li.innerHTML = `<label><input type="checkbox" /><span><b></b> <span class="dim"></span><span class="meta"></span></span></label>`;
    const box = li.querySelector("input")!;
    box.checked = runTeam.has(p.id);
    box.disabled = !free || (!box.checked && runTeam.size >= MAX_TEAM);
    li.querySelector("b")!.textContent = p.name;
    li.querySelector(".dim")!.textContent = p.role;
    li.querySelector(".meta")!.textContent = ` · ${p.away ? "already out" : !free ? "too hurt" : `${JOB_NAMES[p.job].toLowerCase()} now`} · HP ${p.health}/${p.stats.health}`;
    box.addEventListener("change", () => {
      if (box.checked) runTeam.add(p.id);
      else runTeam.delete(p.id);
      refreshScavenge();
    });
    team.appendChild(li);
  }
  const reason = campaign.checkRun(runSite, [...runTeam], runDays);
  ($("sendRun") as HTMLButtonElement).disabled = !!reason;
  $("runOdds").textContent = reason ?? `${Math.round(cleanChance(runSite, runTeam.size, runDays) * 100)}% chance of getting back without trouble`;
}

$("openScavenge").addEventListener("click", () => {
  refreshScavenge();
  $("scavengeModal").hidden = false;
});
$("closeScavenge").addEventListener("click", () => ($("scavengeModal").hidden = true));
$("scavengeModal").addEventListener("click", (e) => {
  if (e.target === $("scavengeModal")) $("scavengeModal").hidden = true;
});
$("sendRun").addEventListener("click", () => {
  const run = campaign.startRun(runSite, [...runTeam], runDays);
  runTeam.clear();
  persist();
  toast(`${run.team.length === 1 ? "One person heads" : `${run.team.length} head`} out to the ${SITES[run.site].name.toLowerCase()}`);
  refreshScavenge();
  refreshBases();
});

/** Puts a run that's met an alien in front of the player. The clock waits until they choose. */
function checkAmbush() {
  const run = campaign.ambush;
  const box = $("ambushModal");
  if (!run || screen.hidden) {
    box.hidden = true;
    return;
  }
  if (!box.hidden) return;
  $("scavengeModal").hidden = true;
  $("staffModal").hidden = true;
  const team = run.team.map((id) => campaign.staff.find((p) => p.id === id)!);
  $("ambushBody").innerHTML = `<p>The run to the ${SITES[run.site].name.toLowerCase()} has run into an alien, alone and close.</p>
    <ul>${team.map((p) => `<li><b>${escape(p.name)}</b> <span class="dim">${escape(p.role)}, ${p.health}/${p.stats.health} HP</span></li>`).join("")}</ul>
    <p class="dim">Fight it and you might bring home a body or a prisoner as well as the supplies. Run and you drop everything, and someone may get hurt getting away.</p>`;
  box.hidden = false;
}

$("ambushFlee").addEventListener("click", () => {
  campaign.fleeAmbush();
  persist();
  $("ambushModal").hidden = true;
  completed([]);
  refresh();
});
$("ambushFight").addEventListener("click", () => {
  const run = campaign.ambush;
  if (!run) return;
  $("ambushModal").hidden = true;
  const home = campaign.bases.find((b) => b.id === campaign.staff.find((p) => p.id === run.team[0])?.base) ?? campaign.bases[0];
  const city = CITIES.find((c) => c.name === home?.city) ?? nearestCityTo(home);
  const team = run.team.map((id) => campaign.staff.find((p) => p.id === id)!);
  screen.hidden = true;
  view.enabled = false;
  const fight = startAmbush(city, Math.floor(Math.random() * 2 ** 31), team, SITES[run.site].name);
  const back = () => {
    closeCombat();
    screen.hidden = false;
    view.enabled = true;
    resize();
    persist();
    completed([]);
    refresh();
  };
  openCombat({
    prologue: fight,
    finish: (r) => {
      campaign.resolveAmbush({ outcome: r.outcome, people: r.people.map((p) => ({ id: p.id, health: p.health })) });
      back();
    },
    retry: () => {},
    skip: () => {},
  });
});

/** The city a base hides under, or the nearest one to a remote base. */
function nearestCityTo(b: BaseRecord | undefined) {
  if (!b) return CITIES[0];
  return CITIES.reduce((best, c) => (Math.hypot(c.lat - b.lat, c.lon - b.lon) < Math.hypot(best.lat - b.lat, best.lon - b.lon) ? c : best));
}

// ---------- Prologue ----------
/** The opening battle: one night in a city, hunted by a single alien. */
function playPrologue() {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const city = prologueCity(seed);
  screen.hidden = true;
  view.enabled = false;
  const back = () => {
    persist();
    closeCombat();
    screen.hidden = false;
    view.enabled = true;
    // Suggest the city they just escaped from for the first base.
    if (!campaign.bases.length) {
      picked = { kind: "site", ll: { lat: city.lat, lon: city.lon } };
      globe.placeMarker(city);
      view.flyTo(city.lat, city.lon);
    }
    resize();
    refresh();
  };
  const prologue = startPrologue(city, seed);
  // Research aptitude is a coin toss, not their old job: anyone can learn anything. Their old job does make some handier with a shovel.
  const enlist = (people: { name: string; role: string; stats: Stats; health: number }[]) =>
    campaign.enlist(
      people.map((p) => ({ ...p, stats: { ...p.stats }, aptitude: Math.round((0.8 + Math.random() * 0.4) * 100) / 100, build: rollBuild(p.role, Math.random) })),
    );
  openCombat({
    prologue,
    finish: (r) => {
      campaign.recordPrologue({ city: city.name, outcome: r.outcome, recovered: r.recovered, survivors: r.survivors, turns: r.turns });
      enlist(r.people);
      if (r.recovered.length) toast(`Recovered: ${r.recovered.join(", ")}`);
      back();
    },
    retry: () => {
      closeCombat();
      playPrologue();
    },
    skip: () => {
      if (!campaign.prologue) campaign.recordPrologue({ city: city.name, outcome: "skipped", recovered: [], survivors: 0, turns: 0 });
      enlist(prologue.battle.humans);
      back();
    },
  });
}
$("replayPrologue").addEventListener("click", playPrologue);

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
    playPrologue();
  });
}

let toastTimer = 0;
function toast(text: string) {
  const t = $("toast");
  t.textContent = text;
  t.className = "show";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = ""), 3200);
}

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
    refreshBases();
    refreshSurvey();
    if (!$("staffModal").hidden) refreshStaff();
    if (!$("scavengeModal").hidden) refreshScavenge();
    checkAmbush();
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
      checkAmbush();
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
if (!campaign.bases.length && !campaign.prologue) playPrologue();

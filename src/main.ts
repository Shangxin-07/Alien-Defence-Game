import "./styles.css";
import { Color, PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderer } from "three";
import { CAMPAIGN_START, GameClock, TIME_SPEEDS, formatClock } from "./geoscape/clock";
import { DEG, LatLon, formatLatLon, lightingAt, subsolarPoint, sunElevation, vectorToLatLon } from "./geoscape/geo";
import { Globe } from "./geoscape/globe";
import { buildLandTexture } from "./geoscape/landTexture";
import { OrbitView } from "./geoscape/orbitView";

const css = getComputedStyle(document.documentElement);
const token = (name: string) => css.getPropertyValue(name).trim();
const $ = (id: string) => document.getElementById(id)!;

const canvas = $("stage") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new Color(token("--void")));

const scene = new Scene();
const camera = new PerspectiveCamera(40, 1, 0.05, 100);
const map = buildLandTexture(renderer, {
  ocean: token("--ocean"),
  land: token("--land"),
  coast: token("--coast"),
  grid: token("--grid"),
});
const globe = new Globe(scene, map, new Color(token("--amber")));
const view = new OrbitView(camera, canvas);
const clock = new GameClock(CAMPAIGN_START, 60);

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

let site: LatLon | null = null;
view.onClick = (e) => {
  const ll = pick(e);
  if (!ll) return;
  site = ll;
  globe.placeMarker(ll);
  $("site").textContent = formatLatLon(ll);
};
canvas.addEventListener("pointermove", (e) => {
  const ll = pick(e);
  $("cursor").textContent = ll ? formatLatLon(ll) : "—";
});
canvas.addEventListener("pointerleave", () => {
  if (!view.isDragging) $("cursor").textContent = "—";
});

// ---------- HUD ----------
$("zoomIn").addEventListener("click", () => view.zoomBy(1 / 1.35));
$("zoomOut").addEventListener("click", () => view.zoomBy(1.35));

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

let lastClock = "";
function updateHud() {
  const { time, date } = formatClock(clock.time);
  if (time === lastClock) return;
  lastClock = time;
  $("clock").textContent = time;
  $("date").textContent = date;
  if (site) {
    const light = lightingAt(site, clock.time);
    $("light").textContent =
      light === "day" ? `Day, sun ${sunElevation(site, clock.time).toFixed(0)}° up` : light === "twilight" ? "Twilight" : "Night";
  }
}

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

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock.tick(dt);
  view.update(dt, now);
  globe.setSun(subsolarPoint(clock.time));
  globe.update(now, view.distance);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

import { MathUtils, PerspectiveCamera } from "three";
import { latLonToVector } from "./geo";

export const MIN_DISTANCE = 1.55;
export const MAX_DISTANCE = 4.6;
const MAX_LAT = 80;

/**
 * Orbits the camera around the globe with north kept up.
 * Drag spins with inertia, wheel and pinch zoom, a click without dragging is reported via onClick.
 */
export class OrbitView {
  lat = 22;
  lon = 5;
  distance = 3.4;
  targetDistance = 3.4;
  onClick: (e: PointerEvent) => void = () => {};
  /** Off while another screen is showing, so its keys don't spin the globe. */
  enabled = true;
  /** Slow drift after a few seconds without input. Dragging works either way. */
  autoSpin = true;

  private focus: { lat: number; lon: number } | null = null;
  private vLat = 0;
  private vLon = 0;
  private readonly pointers = new Map<number, { x: number; y: number; t: number }>();
  private dragMoved = 0;
  private pinch: { span: number; distance: number } | null = null;
  private idleSince = performance.now();
  private readonly reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private readonly camera: PerspectiveCamera, private readonly el: HTMLElement) {
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.up);
    el.addEventListener("wheel", this.wheel, { passive: false });
    window.addEventListener("keydown", this.key);
  }

  get isDragging(): boolean {
    return this.pointers.size > 0;
  }

  zoomBy(factor: number): void {
    this.targetDistance = MathUtils.clamp(this.targetDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
    this.touch();
  }

  /** Swings the camera round to look down on a spot. Any drag takes back control. */
  flyTo(lat: number, lon: number): void {
    this.focus = { lat: MathUtils.clamp(lat, -MAX_LAT, MAX_LAT), lon };
    this.vLat = this.vLon = 0;
    this.touch();
  }

  update(dt: number, now: number): void {
    if (this.focus) {
      const k = Math.min(1, dt * 4);
      // Go the short way round.
      const dLon = ((((this.focus.lon - this.lon) % 360) + 540) % 360) - 180;
      this.lon += dLon * k;
      this.lat += (this.focus.lat - this.lat) * k;
      if (Math.abs(dLon) < 0.05 && Math.abs(this.focus.lat - this.lat) < 0.05) this.focus = null;
      this.touch();
    }
    if (!this.pointers.size) {
      this.lon += this.vLon * dt * 57.6;
      this.lat = MathUtils.clamp(this.lat + this.vLat * dt * 57.6, -MAX_LAT, MAX_LAT);
      const decay = Math.pow(0.04, dt);
      this.vLon *= decay;
      this.vLat *= decay;
      if (this.autoSpin && !this.reduceMotion && now - this.idleSince > 6000) this.lon += dt * 2.5;
    }
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 8);
    latLonToVector(this.lat, this.lon, this.distance, this.camera.position);
    this.camera.lookAt(0, 0, 0);
  }

  private touch() {
    this.idleSince = performance.now();
  }

  // Drag speed scales with altitude, since the globe looks smaller when zoomed out.
  private degPerPixel() {
    return ((this.distance - 1) * 38) / this.el.clientHeight + 0.01;
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    this.dragMoved = 0;
    this.vLat = this.vLon = 0;
    this.focus = null;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { span: Math.hypot(a.x - b.x, a.y - b.y), distance: this.targetDistance };
    }
    this.el.classList.add("dragging");
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const now = performance.now();
    const dt = Math.max(1, now - p.t);
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = now;
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      this.targetDistance = MathUtils.clamp(this.pinch.distance * (this.pinch.span / span), MIN_DISTANCE, MAX_DISTANCE);
      this.dragMoved += 99;
      return;
    }
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    const k = this.degPerPixel();
    this.lon -= dx * k;
    this.lat = MathUtils.clamp(this.lat + dy * k, -MAX_LAT, MAX_LAT);
    this.vLon = ((-dx * k) / dt) * 16;
    this.vLat = ((dy * k) / dt) * 16;
    this.touch();
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.el.classList.remove("dragging");
      if (this.dragMoved < 6 && e.type === "pointerup") this.onClick(e);
      this.touch();
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0012));
  };

  private key = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [0, -6], ArrowRight: [0, 6], ArrowUp: [4, 0], ArrowDown: [-4, 0] };
    const s = step[e.key];
    if (s) {
      this.lat = MathUtils.clamp(this.lat + s[0], -MAX_LAT, MAX_LAT);
      this.lon += s[1];
      this.touch();
    }
    if (e.key === "+" || e.key === "=") this.zoomBy(1 / 1.2);
    if (e.key === "-") this.zoomBy(1.2);
  };
}

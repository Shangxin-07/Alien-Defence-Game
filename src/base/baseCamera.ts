import { MathUtils, PerspectiveCamera } from "three";

const MIN_DISTANCE = 6;
const MAX_DISTANCE = 22;
const MIN_PITCH = 22;
const MAX_PITCH = 85;

/**
 * Orbits the camera around the active level of the base.
 * Drag turns, wheel and pinch zoom, a tap or click without dragging is reported via onClick.
 */
export class BaseCamera {
  yaw = 35;
  pitch = 55;
  distance = 13;
  targetDistance = 13;
  /** Height of the level being looked at; the view glides between levels. */
  targetY = 0;
  onClick: (e: PointerEvent) => void = () => {};

  private y = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragMoved = 0;
  private pinch: { span: number; distance: number } | null = null;

  constructor(private readonly camera: PerspectiveCamera, private readonly el: HTMLElement) {
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.up);
    el.addEventListener("wheel", this.wheel, { passive: false });
  }

  get isDragging(): boolean {
    return this.pointers.size > 0 && this.dragMoved >= 6;
  }

  zoomBy(factor: number): void {
    this.targetDistance = MathUtils.clamp(this.targetDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  turn(degrees: number): void {
    this.yaw += degrees;
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 8);
    this.distance += (this.targetDistance - this.distance) * k;
    this.y += (this.targetY - this.y) * k;
    const p = this.pitch * MathUtils.DEG2RAD;
    const yw = this.yaw * MathUtils.DEG2RAD;
    this.camera.position.set(
      Math.sin(yw) * Math.cos(p) * this.distance,
      this.y + Math.sin(p) * this.distance,
      Math.cos(yw) * Math.cos(p) * this.distance,
    );
    this.camera.lookAt(0, this.y, 0);
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragMoved = 0;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { span: Math.hypot(a.x - b.x, a.y - b.y), distance: this.targetDistance };
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      this.targetDistance = MathUtils.clamp(this.pinch.distance * (this.pinch.span / Math.max(1, span)), MIN_DISTANCE, MAX_DISTANCE);
      this.dragMoved += 99;
      return;
    }
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    if (this.dragMoved < 6) return;
    this.el.classList.add("dragging");
    this.yaw -= dx * 0.35;
    this.pitch = MathUtils.clamp(this.pitch + dy * 0.25, MIN_PITCH, MAX_PITCH);
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.el.classList.remove("dragging");
      if (this.dragMoved < 6 && e.type === "pointerup") this.onClick(e);
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0012));
  };
}

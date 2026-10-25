import { MathUtils, PerspectiveCamera, Vector3 } from "three";

const MIN_DISTANCE = 9;
const MAX_DISTANCE = 48;

/**
 * Looks down on the battlefield at an angle. Drag pans, the turn buttons or Q/E rotate,
 * wheel and pinch zoom. A click or tap without dragging is reported via onClick.
 */
export class TacticalCamera {
  yaw = 0;
  targetYaw = 0;
  pitch = 58;
  distance = 22;
  targetDistance = 22;
  readonly focus = new Vector3();
  readonly targetFocus = new Vector3();
  onClick: (e: PointerEvent) => void = () => {};
  /** Keeps the focus on the map. */
  bounds = 20;
  /** Panning from held keys: forward and right, each −1, 0 or 1. */
  readonly drive = { forward: 0, right: 0 };

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragMoved = 0;
  private pinch: { span: number; distance: number } | null = null;

  constructor(private readonly camera: PerspectiveCamera, private readonly el: HTMLElement) {
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.up);
    el.addEventListener("wheel", this.wheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  get isDragging(): boolean {
    return this.pointers.size > 0 && this.dragMoved >= 6;
  }

  zoomBy(factor: number): void {
    this.targetDistance = MathUtils.clamp(this.targetDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  turn(degrees: number): void {
    this.targetYaw += degrees;
  }

  lookAt(x: number, z: number, snap = false): void {
    this.targetFocus.set(x, 0, z);
    if (snap) this.focus.copy(this.targetFocus);
  }

  update(dt: number): void {
    if (this.drive.forward || this.drive.right) {
      // Relative to the view: forward is away from the camera. Faster when zoomed out.
      const step = dt * this.distance * 0.9;
      const yw = this.yaw * MathUtils.DEG2RAD;
      const b = this.bounds;
      const f = this.drive.forward;
      const r = this.drive.right;
      this.targetFocus.x = MathUtils.clamp(this.targetFocus.x + (-Math.sin(yw) * f + Math.cos(yw) * r) * step, -b, b);
      this.targetFocus.z = MathUtils.clamp(this.targetFocus.z + (-Math.cos(yw) * f - Math.sin(yw) * r) * step, -b, b);
    }
    const k = Math.min(1, dt * 7);
    this.distance += (this.targetDistance - this.distance) * k;
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.focus.lerp(this.targetFocus, k);
    const p = this.pitch * MathUtils.DEG2RAD;
    const yw = this.yaw * MathUtils.DEG2RAD;
    this.camera.position.set(
      this.focus.x + Math.sin(yw) * Math.cos(p) * this.distance,
      Math.sin(p) * this.distance,
      this.focus.z + Math.cos(yw) * Math.cos(p) * this.distance,
    );
    this.camera.lookAt(this.focus);
  }

  private pan(dx: number, dy: number) {
    // Screen drag moves the ground under the pointer, scaled to the zoom.
    const s = this.distance / 650;
    const yw = this.yaw * MathUtils.DEG2RAD;
    const right = { x: Math.cos(yw), z: -Math.sin(yw) };
    const fwd = { x: -Math.sin(yw), z: -Math.cos(yw) };
    const b = this.bounds;
    this.targetFocus.x = MathUtils.clamp(this.targetFocus.x - (right.x * dx - fwd.x * dy) * s, -b, b);
    this.targetFocus.z = MathUtils.clamp(this.targetFocus.z - (right.z * dx - fwd.z * dy) * s, -b, b);
    this.focus.copy(this.targetFocus);
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
    // Right button turns the view; anything else pans.
    if (e.buttons & 2) this.targetYaw = this.yaw = this.yaw - dx * 0.35;
    else this.pan(dx, dy);
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.el.classList.remove("dragging");
      if (this.dragMoved < 6 && e.type === "pointerup" && e.button === 0) this.onClick(e);
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0012));
  };
}

import { PerspectiveCamera, Vector3 } from "three";
import { latLonToVector } from "./geo";

export interface BaseMark {
  id: number;
  name: string;
  lat: number;
  lon: number;
  covert: boolean;
}

interface Mark {
  id: number;
  el: HTMLButtonElement;
  pos: Vector3;
}

/** Clickable base icons pinned to the globe, hidden once they turn past the horizon. */
export class BaseMarks {
  onPick: (id: number) => void = () => {};
  private marks: Mark[] = [];
  private readonly v = new Vector3();
  private readonly toCamera = new Vector3();

  constructor(private readonly root: HTMLElement) {}

  set(bases: BaseMark[], selected: number | null): void {
    this.root.replaceChildren();
    this.marks = bases.map((b) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `basemark${b.covert ? " covert" : ""}${b.id === selected ? " selected" : ""}`;
      el.innerHTML = `<i></i><span></span>`;
      el.querySelector("span")!.textContent = b.name;
      el.addEventListener("click", () => this.onPick(b.id));
      this.root.appendChild(el);
      return { id: b.id, el, pos: latLonToVector(b.lat, b.lon, 1.002) };
    });
  }

  update(camera: PerspectiveCamera, distance: number, width: number, height: number): void {
    this.toCamera.copy(camera.position).normalize();
    const horizon = 1 / distance;
    for (const m of this.marks) {
      if (m.pos.dot(this.toCamera) < horizon + 0.05) {
        m.el.hidden = true;
        continue;
      }
      this.v.copy(m.pos).project(camera);
      m.el.hidden = false;
      m.el.style.transform = `translate(${((this.v.x + 1) / 2) * width}px, ${((1 - this.v.y) / 2) * height}px)`;
    }
  }
}

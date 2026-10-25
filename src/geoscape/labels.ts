import { PerspectiveCamera, Vector3 } from "three";
import { BLOCS } from "./blocs";
import { CITIES } from "./cities";
import { latLonToVector } from "./geo";

interface Label {
  el: HTMLElement;
  pos: Vector3;
  /** Opacity for a camera distance; 0 hides the label. */
  fade: (distance: number) => number;
}

const ramp = (d: number, from: number, to: number) => Math.min(1, Math.max(0, (from - d) / (from - to)));

/** HTML labels pinned to the globe: cities at every zoom, bloc names as you zoom in. */
export class GlobeLabels {
  private readonly labels: Label[] = [];
  private readonly v = new Vector3();
  private readonly toCamera = new Vector3();

  constructor(root: HTMLElement) {
    for (const city of CITIES) {
      const el = document.createElement("div");
      el.className = `city tier${city.tier}`;
      el.innerHTML = `<i></i><span></span>`;
      el.querySelector("span")!.textContent = city.name;
      root.appendChild(el);
      this.labels.push({
        el,
        pos: latLonToVector(city.lat, city.lon, 1.002),
        fade: city.tier === 1 ? () => 1 : (d) => ramp(d, 2.9, 2.5),
      });
    }
    for (const bloc of BLOCS) {
      const el = document.createElement("div");
      el.className = "bloc";
      el.textContent = bloc.name;
      root.appendChild(el);
      this.labels.push({ el, pos: latLonToVector(bloc.label.lat, bloc.label.lon, 1.002), fade: (d) => ramp(d, 3.4, 2.7) });
    }
  }

  update(camera: PerspectiveCamera, distance: number, width: number, height: number): void {
    this.toCamera.copy(camera.position).normalize();
    for (const l of this.labels) {
      // Hide labels past the visible horizon (which shrinks as the camera closes in), fading toward it.
      const horizon = 1 / distance;
      const facing = l.pos.dot(this.toCamera);
      const opacity = l.fade(distance) * ramp(-facing, -horizon - 0.04, -horizon - 0.16);
      if (opacity <= 0.01) {
        l.el.hidden = true;
        continue;
      }
      this.v.copy(l.pos).project(camera);
      l.el.hidden = false;
      l.el.style.opacity = opacity.toFixed(2);
      l.el.style.transform = `translate(${((this.v.x + 1) / 2) * width}px, ${((1 - this.v.y) / 2) * height}px)`;
    }
  }
}

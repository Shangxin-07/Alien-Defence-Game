import { CanvasTexture, LinearMipmapLinearFilter, WebGLRenderer } from "three";
import LAND from "../data/land-50m.json";

export interface MapPalette {
  ocean: string;
  land: string;
  coast: string;
  grid: string;
}

/** Draws the stylised world map as an equirectangular canvas texture. */
export function buildLandTexture(renderer: WebGLRenderer, palette: MapPalette): CanvasTexture {
  const maxTex = renderer.capabilities.maxTextureSize;
  const W = Math.min(8192, maxTex, window.innerWidth < 700 ? 4096 : 8192);
  const H = W / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  // Ring coordinates are stored as integer tenths of a degree.
  const px = (lon: number) => ((lon / 10 + 180) / 360) * W;
  const py = (lat: number) => ((90 - lat / 10) / 180) * H;
  const hair = Math.max(1, W / 4096);

  g.fillStyle = palette.ocean;
  g.fillRect(0, 0, W, H);

  const landPath = new Path2D();
  for (const r of LAND as number[][]) {
    landPath.moveTo(px(r[0]), py(r[1]));
    for (let i = 2; i < r.length; i += 2) landPath.lineTo(px(r[i]), py(r[i + 1]));
    landPath.closePath();
  }

  // Shallow-water glow: a wide blurred coast stroke under everything else.
  g.save();
  g.filter = `blur(${W / 700}px)`;
  g.strokeStyle = "rgba(60, 130, 160, 0.35)";
  g.lineWidth = W / 300;
  g.stroke(landPath);
  g.restore();

  // Graticule every 15°, with the equator and prime meridian picked out.
  g.lineWidth = hair;
  for (let deg = -180; deg <= 180; deg += 15) {
    g.strokeStyle = deg === 0 ? "rgba(90,150,190,0.55)" : palette.grid;
    g.beginPath();
    g.moveTo(px(deg * 10), 0);
    g.lineTo(px(deg * 10), H);
    g.stroke();
  }
  for (let deg = -75; deg <= 75; deg += 15) {
    g.strokeStyle = deg === 0 ? "rgba(90,150,190,0.55)" : palette.grid;
    g.beginPath();
    g.moveTo(0, py(deg * 10));
    g.lineTo(W, py(deg * 10));
    g.stroke();
  }

  g.fillStyle = palette.land;
  g.fill(landPath, "evenodd");

  // Diagonal hatching so land reads as terrain rather than flat paint.
  g.save();
  g.clip(landPath, "evenodd");
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = hair;
  const step = W / 512;
  g.beginPath();
  for (let x = -H; x < W; x += step) {
    g.moveTo(x, H);
    g.lineTo(x + H, 0);
  }
  g.stroke();
  g.restore();

  g.strokeStyle = palette.coast;
  g.lineWidth = Math.max(1.2, W / 2600);
  g.lineJoin = "round";
  g.stroke(landPath);

  const tex = new CanvasTexture(canvas);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = LinearMipmapLinearFilter;
  return tex;
}

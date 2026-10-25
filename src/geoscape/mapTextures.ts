import { CanvasTexture, LinearMipmapLinearFilter, WebGLRenderer } from "three";
import LAND from "../data/land-50m.json";
import { BIOMES, BiomeId, biomeAt } from "./biomes";
import { BORDER_LINES } from "./blocs";
import { CITIES } from "./cities";

export interface MapPalette {
  ocean: string;
  coast: string;
  grid: string;
}

export interface MapTextures {
  /** Biome-coloured world map, equirectangular. */
  day: CanvasTexture;
  /** Night-side city lights in the red channel, bloc borders in the green channel. */
  overlay: CanvasTexture;
  /** True when a point is on land. */
  isLand(lat: number, lon: number): boolean;
}

// Biome grid resolution, in cells per degree.
const BIOME_RES = 2;

function landPath(W: number, H: number): Path2D {
  // Ring coordinates are stored as integer tenths of a degree.
  const px = (lon: number) => ((lon / 10 + 180) / 360) * W;
  const py = (lat: number) => ((90 - lat / 10) / 180) * H;
  const path = new Path2D();
  for (const r of LAND as number[][]) {
    // Unwrap longitudes so a ring crossing the date line stays in one piece (Eurasia does),
    // instead of jumping across the whole map and painting a band of false land and sea.
    const pts: [number, number][] = [];
    let lon = r[0];
    for (let i = 0; i < r.length; i += 2) {
      if (i) {
        let d = r[i] - r[i - 2];
        if (d > 1800) d -= 3600;
        else if (d < -1800) d += 3600;
        lon += d;
      }
      pts.push([lon, r[i + 1]]);
    }
    // A ring that goes all the way round (Antarctica) closes along the pole instead.
    const wrap = pts[pts.length - 1][0] - pts[0][0];
    if (Math.abs(wrap) > 1800) {
      const pole = pts.reduce((a, p) => a + p[1], 0) < 0 ? -900 : 900;
      pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole]);
    }
    // Draw it where it falls and one world either side, so pieces past ±180° land on the map.
    for (const shift of [-3600, 0, 3600]) {
      const xs = pts.map((p) => p[0] + shift);
      if (Math.max(...xs) < -1800 || Math.min(...xs) > 1800) continue;
      path.moveTo(px(xs[0]), py(pts[0][1]));
      for (let i = 1; i < pts.length; i++) path.lineTo(px(xs[i]), py(pts[i][1]));
      path.closePath();
    }
  }
  return path;
}

/** Paints the biome grid into a small canvas, one pixel per cell. */
function biomeCanvas(): HTMLCanvasElement {
  const w = 360 * BIOME_RES;
  const h = 180 * BIOME_RES;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const rgb = {} as Record<BiomeId, [number, number, number]>;
  for (const b of Object.values(BIOMES)) {
    const n = parseInt(b.color.slice(1), 16);
    rgb[b.id] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  for (let y = 0; y < h; y++) {
    const lat = 90 - (y + 0.5) / BIOME_RES;
    for (let x = 0; x < w; x++) {
      const lon = (x + 0.5) / BIOME_RES - 180;
      const [r, gg, b] = rgb[biomeAt(lat, lon)];
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function buildMapTextures(renderer: WebGLRenderer, palette: MapPalette): MapTextures {
  const maxTex = renderer.capabilities.maxTextureSize;
  const W = Math.min(8192, maxTex, window.innerWidth < 700 ? 4096 : 8192);
  const H = W / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const land = landPath(W, H);
  const px = (lon: number) => ((lon + 180) / 360) * W;
  const py = (lat: number) => ((90 - lat) / 180) * H;
  const hair = Math.max(1, W / 4096);

  g.fillStyle = palette.ocean;
  g.fillRect(0, 0, W, H);

  // Shallow-water glow: a wide blurred coast stroke under everything else.
  g.save();
  g.filter = `blur(${W / 700}px)`;
  g.strokeStyle = "rgba(60, 130, 160, 0.35)";
  g.lineWidth = W / 300;
  g.stroke(land);
  g.restore();

  // Biomes: the coarse grid scaled up with smoothing, so neighbouring biomes blend softly.
  g.save();
  g.clip(land, "evenodd");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.filter = `blur(${W / 1100}px)`;
  g.drawImage(biomeCanvas(), 0, 0, W, H);
  g.filter = "none";
  // Light diagonal hatching so land reads as terrain rather than flat paint.
  g.strokeStyle = "rgba(0,0,0,0.05)";
  g.lineWidth = hair;
  const step = W / 512;
  g.beginPath();
  for (let x = -H; x < W; x += step) {
    g.moveTo(x, H);
    g.lineTo(x + H, 0);
  }
  g.stroke();
  g.restore();

  // Graticule every 15°, over land and sea, with the equator and prime meridian picked out.
  g.lineWidth = hair;
  for (let deg = -180; deg <= 180; deg += 15) {
    g.strokeStyle = deg === 0 ? "rgba(90,150,190,0.55)" : palette.grid;
    g.beginPath();
    g.moveTo(px(deg), 0);
    g.lineTo(px(deg), H);
    g.stroke();
  }
  for (let deg = -75; deg <= 75; deg += 15) {
    g.strokeStyle = deg === 0 ? "rgba(90,150,190,0.55)" : palette.grid;
    g.beginPath();
    g.moveTo(0, py(deg));
    g.lineTo(W, py(deg));
    g.stroke();
  }

  g.strokeStyle = palette.coast;
  g.lineWidth = Math.max(1, W / 3600);
  g.lineJoin = "round";
  g.stroke(land);

  const day = new CanvasTexture(canvas);
  day.anisotropy = renderer.capabilities.getMaxAnisotropy();
  day.minFilter = LinearMipmapLinearFilter;

  return { day, overlay: buildOverlay(), isLand: buildLandMask() };
}

/**
 * Red: city glow for the night side, a bright core per city plus a scatter of suburbs.
 * Green: bloc borders, faded in by the shader as the camera zooms in.
 */
function buildOverlay(): CanvasTexture {
  const W = 4096;
  const H = 2048;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  const px = (lon: number) => ((lon + 180) / 360) * W;
  const py = (lat: number) => ((90 - lat) / 180) * H;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  g.save();
  g.clip(landPath(W, H), "evenodd");
  g.globalCompositeOperation = "lighter";
  for (const city of CITIES) {
    const x = px(city.lon);
    const y = py(city.lat);
    const r = city.tier === 1 ? 12 : 8;
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    glow.addColorStop(0, "rgba(255,0,0,0.95)");
    glow.addColorStop(0.2, "rgba(255,0,0,0.4)");
    glow.addColorStop(1, "rgba(255,0,0,0)");
    g.fillStyle = glow;
    g.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    for (let i = 0; i < (city.tier === 1 ? 70 : 30); i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.pow(rand(), 0.7) * r * 3.5;
      g.fillStyle = `rgba(255,0,0,${0.15 + rand() * 0.35})`;
      g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1);
    }
  }
  g.restore();

  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgb(0,255,0)";
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  for (const line of BORDER_LINES) {
    // Border points are stored as integer twentieths of a degree.
    g.moveTo(px(line[0] / 20), py(line[1] / 20));
    for (let i = 2; i < line.length; i += 2) g.lineTo(px(line[i] / 20), py(line[i + 1] / 20));
  }
  g.stroke();

  const tex = new CanvasTexture(c);
  tex.anisotropy = 4;
  tex.minFilter = LinearMipmapLinearFilter;
  return tex;
}

/** A coarse land/sea lookup for hover readouts (about 0.25° per cell). */
function buildLandMask(): (lat: number, lon: number) => boolean {
  const W = 1440;
  const H = 720;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  g.fill(landPath(W, H), "evenodd");
  const alpha = g.getImageData(0, 0, W, H).data;
  return (lat, lon) => {
    const x = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)));
    const y = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
    return alpha[(y * W + x) * 4 + 3] > 127;
  };
}

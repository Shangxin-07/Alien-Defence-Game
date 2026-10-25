// Regenerates src/data/land-50m.json from Natural Earth (via world-atlas).
// Output: an array of rings, each a flat [lon*10, lat*10, ...] integer list.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/land-50m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const rings = [];
for (const f of land.features) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      const out = [];
      let pa = null, pb = null;
      for (const [lon, lat] of ring) {
        const a = Math.round(lon * 10), b = Math.round(lat * 10);
        if (a === pa && b === pb) continue;
        out.push(a, b);
        pa = a; pb = b;
      }
      if (out.length >= 6) rings.push(out);
    }
  }
}
writeFileSync(new URL("../src/data/land-50m.json", import.meta.url), JSON.stringify(rings));
console.log(`Wrote ${rings.length} rings`);

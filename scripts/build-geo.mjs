// Regenerates the geoscape map data from Natural Earth (via world-atlas):
//   src/data/land-50m.json  coastline rings, flat [lon*10, lat*10, ...] integers
//   src/data/blocs.json     the post-war territorial blocs: merged countries with
//                           simplified, smoothed land borders, flat [lon*20, lat*20, ...]
//
// Lore: after the last war the old national borders were redrawn into a handful
// of large blocs, so the country lists below are merged and their borders smoothed.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature, mergeArcs } from "topojson-client";

const require = createRequire(import.meta.url);
const atlas = (f) => JSON.parse(readFileSync(require.resolve(`world-atlas/${f}`), "utf8"));
const out = (f, data) => writeFileSync(new URL(`../src/data/${f}`, import.meta.url), JSON.stringify(data));

// ---------- Land ----------
{
  const topo = atlas("land-50m.json");
  const rings = [];
  for (const f of feature(topo, topo.objects.land).features) {
    const g = f.geometry;
    for (const poly of g.type === "Polygon" ? [g.coordinates] : g.coordinates) {
      for (const ring of poly) {
        const flat = quantize(ring, 10);
        if (flat.length >= 6) rings.push(flat);
      }
    }
  }
  out("land-50m.json", rings);
  console.log(`land: ${rings.length} rings`);
}

// ---------- Blocs ----------
// Bloc ids must match src/geoscape/blocs.ts. Countries not listed join the bloc
// whose anchor point is nearest (that catches small islands and territories).
const BLOC_MEMBERS = {
  nau: ["United States of America", "Canada", "Greenland", "Bermuda", "St. Pierre and Miquelon"],
  caf: ["Mexico", "Guatemala", "Belize", "Honduras", "El Salvador", "Nicaragua", "Costa Rica", "Panama", "Cuba", "Haiti",
    "Dominican Rep.", "Jamaica", "Bahamas", "Puerto Rico", "Trinidad and Tobago", "Cayman Is.", "Turks and Caicos Is.", "U.S. Virgin Is.",
    "British Virgin Is.", "Anguilla", "Montserrat", "St. Vin. and Gren.", "Saint Lucia", "St. Kitts and Nevis", "Aruba", "Curaçao",
    "Grenada", "St-Martin", "St-Barthélemy", "Sint Maarten", "Dominica", "Barbados", "Antigua and Barb."],
  gco: ["Colombia", "Venezuela", "Ecuador", "Peru", "Bolivia", "Guyana", "Suriname"],
  scr: ["Brazil", "Argentina", "Chile", "Uruguay", "Paraguay", "Falkland Is.", "S. Geo. and the Is."],
  euf: ["United Kingdom", "Ireland", "France", "Spain", "Portugal", "Germany", "Italy", "Netherlands", "Belgium", "Luxembourg",
    "Switzerland", "Austria", "Denmark", "Norway", "Sweden", "Finland", "Iceland", "Poland", "Czechia", "Slovakia", "Hungary",
    "Slovenia", "Croatia", "Bosnia and Herz.", "Serbia", "Montenegro", "Kosovo", "Albania", "Macedonia", "Greece", "Bulgaria",
    "Romania", "Moldova", "Ukraine", "Estonia", "Latvia", "Lithuania", "Malta", "Cyprus", "N. Cyprus", "Faeroe Is.", "Åland",
    "Isle of Man", "Jersey", "Guernsey", "Andorra", "Monaco", "San Marino", "Vatican", "Liechtenstein"],
  eau: ["Russia", "Belarus", "Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan", "Mongolia", "Armenia",
    "Azerbaijan", "Georgia"],
  mec: ["Turkey", "Syria", "Iraq", "Iran", "Lebanon", "Israel", "Palestine", "Jordan", "Saudi Arabia", "Yemen", "Oman",
    "United Arab Emirates", "Qatar", "Bahrain", "Kuwait"],
  mnu: ["Morocco", "W. Sahara", "Algeria", "Tunisia", "Libya", "Egypt", "Sudan"],
  wac: ["Mauritania", "Mali", "Niger", "Chad", "Senegal", "Gambia", "Guinea", "Guinea-Bissau", "Sierra Leone", "Liberia",
    "Côte d'Ivoire", "Ghana", "Togo", "Benin", "Burkina Faso", "Nigeria", "Cameroon", "Cabo Verde"],
  eaf: ["Dem. Rep. Congo", "Congo", "Gabon", "Eq. Guinea", "Central African Rep.", "S. Sudan", "Ethiopia", "Eritrea",
    "Djibouti", "Somalia", "Somaliland", "Kenya", "Uganda", "Rwanda", "Burundi", "Tanzania", "São Tomé and Principe", "Seychelles"],
  sau: ["Angola", "Zambia", "Malawi", "Mozambique", "Zimbabwe", "Botswana", "Namibia", "South Africa", "Lesotho", "eSwatini",
    "Madagascar", "Comoros", "Mauritius", "Saint Helena"],
  inu: ["India", "Pakistan", "Afghanistan", "Bangladesh", "Nepal", "Bhutan", "Sri Lanka", "Maldives", "Siachen Glacier",
    "Br. Indian Ocean Ter."],
  cdr: ["China", "North Korea", "Hong Kong", "Macao"],
  pra: ["Japan", "South Korea", "Taiwan", "Philippines", "Guam", "N. Mariana Is.", "Palau", "Micronesia"],
  sef: ["Myanmar", "Thailand", "Laos", "Cambodia", "Vietnam", "Malaysia", "Singapore", "Brunei", "Indonesia", "Timor-Leste"],
  ocw: ["Australia", "New Zealand", "Papua New Guinea", "Solomon Is.", "Vanuatu", "Fiji", "New Caledonia", "Samoa", "Tonga",
    "Kiribati", "Fr. Polynesia", "Pitcairn Is.", "Cook Is.", "Niue", "Nauru", "American Samoa", "Wallis and Futuna Is."],
};
const ANCHORS = {
  nau: [-100, 50], caf: [-90, 17], gco: [-72, 2], scr: [-58, -22], euf: [10, 50], eau: [80, 58], mec: [45, 28], mnu: [15, 26],
  wac: [-2, 14], eaf: [30, 0], sau: [25, -20], inu: [77, 23], cdr: [104, 34], pra: [135, 30], sef: [110, 5], ocw: [140, -25],
};
const EXCLUDED = new Set(["Antarctica", "Fr. S. Antarctic Lands", "Heard I. and McDonald Is."]);

const topo = atlas("countries-50m.json");
const geoms = topo.objects.countries.geometries;
const blocOf = new Map();
for (const [bloc, names] of Object.entries(BLOC_MEMBERS)) for (const n of names) blocOf.set(n, bloc);

const arcs = decodeArcs(topo);
const assigned = new Map(); // geometry -> bloc
for (const g of geoms) {
  const name = g.properties.name;
  if (EXCLUDED.has(name)) continue;
  let bloc = blocOf.get(name);
  if (!bloc) {
    bloc = nearestBloc(centroid(g));
    console.log(`  ${name} -> ${bloc} (nearest)`);
  }
  assigned.set(g, bloc);
}

// Which blocs touch each arc? Arcs touching two different blocs are the new borders.
const arcBlocs = arcs.map(() => new Set());
for (const [g, bloc] of assigned) for (const i of arcIndices(g)) arcBlocs[i < 0 ? ~i : i].add(bloc);
const isBorder = arcBlocs.map((s) => s.size > 1);

// Coasts are only lightly simplified; borders are simplified hard then rounded off.
const processed = arcs.map((a, i) => (isBorder[i] ? chaikin(simplify(a, 0.6), 3) : simplify(a, 0.05)));

const blocs = [];
for (const bloc of Object.keys(BLOC_MEMBERS)) {
  const members = [...assigned].filter(([, b]) => b === bloc).map(([g]) => g);
  const merged = mergeArcs(topo, members);
  const polys = merged.arcs.map((poly) => poly.map((ring) => quantize(stitch(ring), 20)).filter((r) => r.length >= 6));
  blocs.push({ id: bloc, polys: polys.filter((p) => p.length) });
}
const borders = processed.filter((_, i) => isBorder[i]).map((a) => quantize(a, 20));
out("blocs.json", { blocs, borders });
console.log(`blocs: ${blocs.length} blocs, ${borders.length} border lines`);

// ---------- helpers ----------
function quantize(points, k) {
  const flat = [];
  let pa = null, pb = null;
  for (const [lon, lat] of points) {
    const a = Math.round(lon * k), b = Math.round(lat * k);
    if (a === pa && b === pb) continue;
    flat.push(a, b);
    pa = a; pb = b;
  }
  return flat;
}

function decodeArcs(t) {
  const [sx, sy] = t.transform.scale, [tx, ty] = t.transform.translate;
  return t.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
}

function arcIndices(g) {
  return g.type === "Polygon" ? g.arcs.flat() : g.type === "MultiPolygon" ? g.arcs.flat(2) : [];
}

function stitch(ringArcs) {
  const pts = [];
  for (const i of ringArcs) {
    const a = i < 0 ? [...processed[~i]].reverse() : processed[i];
    pts.push(...(pts.length ? a.slice(1) : a));
  }
  return pts;
}

function centroid(g) {
  let sx = 0, sy = 0, n = 0;
  for (const i of arcIndices(g)) for (const [x, y] of arcs[i < 0 ? ~i : i]) { sx += x; sy += y; n++; }
  return [sx / n, sy / n];
}

function nearestBloc([x, y]) {
  let best = null, bd = Infinity;
  for (const [b, [ax, ay]] of Object.entries(ANCHORS)) {
    const dx = Math.min(Math.abs(x - ax), 360 - Math.abs(x - ax)), d = dx * dx + (y - ay) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// Douglas-Peucker, endpoints kept so neighbouring arcs still meet.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Chaikin corner cutting, endpoints fixed.
function chaikin(pts, iterations) {
  let p = pts;
  for (let k = 0; k < iterations && p.length > 2; k++) {
    const next = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      if (i > 0) next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by]);
      if (i < p.length - 2) next.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    next.push(p[p.length - 1]);
    p = next;
  }
  return p;
}

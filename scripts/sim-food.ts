/**
 * Headless food playtest: can a colony of N people reach food self-sufficiency, and how long does
 * it take? A simple bot plays the real Campaign rules (eating, hunger, runs, ambushes, the black
 * market, building) towards hydroponic farms that feed everyone.
 *
 *   npx vite-node scripts/sim-food.ts [seeds] [max headcount]
 *   NO_MARKET=1 npx vite-node scripts/sim-food.ts   (black market shut)
 *
 * For each headcount it tries every play style in POLICIES on a few seeds, keeps the one that loses
 * the fewest people (then the fastest), and reruns that on all the seeds.
 *
 * The bot always runs from ambushes rather than fighting, puts everyone on construction (nobody on
 * research) and ignores sighting calls, so it shows what a careful player can do with food alone.
 */
import { Campaign } from "../src/campaign";
import type { RoomId } from "../src/base/rooms";
import { rollBuild } from "../src/staff";
import { SITES, Place, ScavengeKind, MAX_TEAM, MAX_SEARCHERS, Supply } from "../src/scavenge";
import type { Stats } from "../src/tactical/rules";

const LONDON = { lat: 51.51, lon: -0.13 };
const HORIZON = 365;

/** Seeded dice, so runs can be repeated. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURVIVORS: { role: string; stats: Stats }[] = [
  { role: "Army reservist", stats: { tu: 60, health: 38, bravery: 60, reactions: 55, accuracy: 68, melee: 50, armour: 0 } },
  { role: "Security guard", stats: { tu: 52, health: 40, bravery: 40, reactions: 40, accuracy: 55, melee: 60, armour: 2 } },
  { role: "Police officer", stats: { tu: 56, health: 34, bravery: 50, reactions: 50, accuracy: 60, melee: 72, armour: 4 } },
  { role: "Paramedic", stats: { tu: 58, health: 32, bravery: 45, reactions: 40, accuracy: 45, melee: 40, armour: 0 } },
];
/** Anyone past the four from the prologue: an average recruit with no family and nothing owed. */
const RECRUIT = { role: "Recruit", stats: { tu: 52, health: 32, bravery: 40, reactions: 42, accuracy: 42, melee: 38, armour: 0 } };

/** Where each room goes in the starter city block, in build order. Farms open straight onto the lift. */
interface Step { type: RoomId; level: number; x: number; y: number; rotated?: boolean }
const CORE: Step[] = [
  { type: "accessPoint", level: 0, x: 3, y: 3 },
  { type: "shaft", level: 1, x: 3, y: 3 },
  { type: "stairs", level: 1, x: 3, y: 3 },
  { type: "lift", level: 1, x: 3, y: 3 },
  { type: "generator", level: 1, x: 1, y: 3 },
];
const FARMS: Step[] = [
  { type: "hydroponics", level: 1, x: 4, y: 3 },
  { type: "hydroponics", level: 1, x: 3, y: 2 },
  { type: "hydroponics", level: 1, x: 3, y: 4 },
];

export interface Policy {
  /** Send a food run when food covers fewer than this many days. */
  foodDays: number;
  /** People per food or scrap run (capped by who's free). */
  team: number;
  /** Days per run. */
  days: number;
  /** Builders kept at home whatever happens. */
  keepHome: number;
  /** Buy black-market food when it would otherwise run out within this many days. */
  buyBelow: number;
}

export interface Result {
  /** Day farms first covered everyone still eating, or null if never within the horizon. */
  selfSufficient: number | null;
  /** Headcount at that point (or at the horizon). */
  people: number;
  deserted: number;
  hungryDays: number;
  /** Food bought on the black market. */
  bought: number;
  firstFarm: number | null;
}

const foodYield = (k: ScavengeKind) => {
  const r = SITES[k].yields.food;
  return r ? (r[0] + r[1]) / 2 : 0;
};
const scrapYield = (k: ScavengeKind) => {
  const r = SITES[k].yields.scrap;
  return r ? (r[0] + r[1]) / 2 : 0;
};

/** Expected finds a person-day, discounted for the chance of trouble. */
function bestPlace(c: Campaign, what: Supply, exclude: Set<number>): Place | undefined {
  let best: Place | undefined;
  let score = 0;
  for (const p of c.places) {
    if (exclude.has(p.id) || p.stock[what] <= 0) continue;
    const y = (what === "food" ? foodYield : scrapYield)(p.kind);
    const s = Math.min(y, p.stock[what]) * (1 - SITES[p.kind].danger * 2);
    if (s > score) [best, score] = [p, s];
  }
  return best;
}

function farmsOnline(c: Campaign): { online: number; producing: number } {
  let online = 0;
  let producing = 0;
  for (const b of c.bases) {
    for (const it of b.layout.items.values()) {
      if (it.type !== "hydroponics" || b.layout.status(it.uid) !== "online") continue;
      online++;
      if ((c.crops[`${b.id}:${it.uid}`] ?? 0) >= 12) producing++;
    }
  }
  return { online, producing };
}

export function simulate(n: number, seed: number, policy: Policy): Result {
  const rand = mulberry(seed);
  const c = new Campaign();
  c.rand = rand;
  const base = c.found(LONDON, true);
  const people = Array.from({ length: n }, (_, i) => {
    const t = i < SURVIVORS.length ? SURVIVORS[i] : RECRUIT;
    return { name: `P${i + 1}`, role: t.role, stats: { ...t.stats }, health: t.stats.health, aptitude: 1, build: rollBuild(t.role, rand) };
  });
  c.enlist(people);
  for (const p of c.staff) p.job = "construction";

  const placed: Step[] = [];
  let deserted = 0;
  let hungryDays = 0;
  let bought = 0;
  let firstFarm: number | null = null;

  const plan = (): Step[] => [...CORE, ...FARMS.slice(0, Math.max(1, Math.ceil(c.mouths / 5)))];

  /** Places the next rooms that can go in now. Conversions wait for what they convert. */
  const build = () => {
    const layout = c.open(base);
    for (const s of plan()) {
      if (placed.includes(s)) continue;
      if (layout.check(s.type, s.level, s.x, s.y, s.rotated)) break;
      layout.place(s.type, s.level, s.x, s.y, s.rotated);
      placed.push(s);
    }
    c.settle(base);
  };

  /** Money and scrap still needed for rooms not yet placed. */
  const shortfall = () => {
    let cost = 0;
    for (const s of plan()) if (!placed.includes(s)) cost += base.layout.cost(s.type, s.level);
    return Math.max(0, cost - c.funds - c.supplies.scrap * 10_000);
  };

  for (let day = 0; day < HORIZON; day++) {
    if (!c.staff.length) break;
    build();
    const { producing } = farmsOnline(c);
    if (firstFarm === null && producing) firstFarm = c.day;
    if (producing * 5 >= c.mouths) {
      return { selfSufficient: c.day, people: c.staff.length, deserted, hungryDays, bought, firstFarm };
    }

    // Black market: only money the rooms don't need, and only to stave off hunger.
    const income = producing * 5;
    const net = c.mouths - income;
    if (net > 0 && c.supplies.food < net * policy.buyBelow) {
      const spare = c.funds - Math.max(0, plan().filter((s) => !placed.includes(s)).reduce((t, s) => t + base.layout.cost(s.type, s.level), 0) - c.supplies.scrap * 10_000);
      while (c.supplies.food < net * policy.buyBelow && c.buyCost("food", 10) <= spare && c.buyCost("food", 10) <= c.funds) {
        c.buy("food", 10);
        bought += 10;
      }
    }

    const free = () => c.staff.filter((p) => c.canScavenge(p)).map((p) => p.id);
    const out = new Set(c.runs.map((r) => r.place).filter((x): x is number => x !== undefined));
    const runningFood = c.runs.some((r) => r.place && c.places.find((p) => p.id === r.place)?.stock.food);
    const avail = () => Math.max(0, free().length - policy.keepHome);

    if (net > 0 && !runningFood && c.supplies.food < net * policy.foodDays && avail() > 0) {
      const place = bestPlace(c, "food", out);
      if (place) {
        c.startRun(place.id, free().slice(0, Math.min(policy.team, MAX_TEAM, avail())), policy.days);
        out.add(place.id);
      }
    }
    const runningScrap = c.runs.some((r) => r.place && ["hardware", "industrial", "homes"].includes(r.site) && !c.places.find((p) => p.id === r.place)?.stock.food);
    if (shortfall() > 0 && !runningScrap && avail() > 0) {
      const place = bestPlace(c, "scrap", out);
      if (place) c.startRun(place.id, free().slice(0, Math.min(policy.team, MAX_TEAM, avail())), policy.days);
    }
    const knownFood = c.places.reduce((t, p) => t + p.stock.food, 0);
    if (knownFood < c.mouths * 10 && !c.runs.some((r) => r.search) && avail() > 0) {
      c.startSearch(free().slice(0, Math.min(MAX_SEARCHERS, avail())), 3);
    }

    const before = c.staff.length;
    const target = c.day + 1;
    while (c.day < target) {
      c.advanceDays(1);
      if (c.ambush) c.fleeAmbush();
    }
    deserted += before - c.staff.length;
    hungryDays += c.staff.filter((p) => p.hunger).length;
  }
  return { selfSufficient: null, people: c.staff.length, deserted, hungryDays, bought, firstFarm };
}

const POLICIES: Policy[] = [];
for (const foodDays of [3, 6, 10])
  for (const team of [1, 2, 3, 4])
    for (const days of [2, 3])
      for (const keepHome of [0, 1, 2])
        for (const buyBelow of [0, 3, 8]) POLICIES.push({ foodDays, team, days, keepHome, buyBelow });

// NO_MARKET=1 leaves the black market shut, to see what scavenging and building alone can do.
if (process.env.NO_MARKET) POLICIES.splice(0, POLICIES.length, ...POLICIES.filter((p) => p.buyBelow === 0));

const pct = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

function summarise(n: number, seeds: number, policy: Policy) {
  const rs = Array.from({ length: seeds }, (_, i) => simulate(n, 1000 + i, policy));
  const ok = rs.filter((r) => r.selfSufficient !== null);
  const days = ok.map((r) => r.selfSufficient!);
  return {
    n,
    reached: ok.length / seeds,
    median: pct(days, 0.5),
    p90: pct(days, 0.9),
    endPeople: rs.reduce((t, r) => t + r.people, 0) / seeds,
    deserted: rs.reduce((t, r) => t + r.deserted, 0) / seeds,
    hungry: rs.reduce((t, r) => t + r.hungryDays, 0) / seeds,
    bought: rs.reduce((t, r) => t + r.bought, 0) / seeds,
    keptAll: rs.filter((r) => r.selfSufficient !== null && r.deserted === 0).length / seeds,
  };
}

const seeds = Number(process.argv[2] ?? 100);
const maxN = Number(process.argv[3] ?? 8);
console.log(`seeds ${seeds}, horizon ${HORIZON} days, ${POLICIES.length} policies tried per headcount`);
for (let n = 1; n <= maxN; n++) {
  // Pick the policy that keeps the most people, then the fastest.
  let best: ReturnType<typeof summarise> | null = null;
  let bestP: Policy | null = null;
  for (const p of POLICIES) {
    const s = summarise(n, Math.max(20, Math.floor(seeds / 5)), p);
    const key = (x: typeof s) => x.keptAll * 1000 + x.reached * 100 - (x.median || 999) / 10;
    if (!best || key(s) > key(best)) [best, bestP] = [s, p];
  }
  const s = summarise(n, seeds, bestP!);
  console.log(
    `N=${n} reached ${(s.reached * 100).toFixed(0)}%  kept everyone ${(s.keptAll * 100).toFixed(0)}%  median day ${s.median} (p90 ${s.p90})  ` +
      `deserted ${s.deserted.toFixed(2)}  people at end ${s.endPeople.toFixed(2)}  hungry person-days ${s.hungry.toFixed(0)}  bought ${s.bought.toFixed(0)}  policy ${JSON.stringify(bestP)}`,
  );
}

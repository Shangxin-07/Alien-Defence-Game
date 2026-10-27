/**
 * Plays autoplay doctrines out with nobody watching, to see how they do and how much the aliens'
 * learning hurts a squad that always fights the same way.
 * Run: npx vite-node scripts/sim-autoplay.ts [seeds]
 * LIGHT=day|dusk|dawn|night sets the light the fights are fought in (night by default).
 */
import { CITIES } from "../src/geoscape/cities";
import { Habit, Habits, noHabits, observe } from "../src/tactical/adapt";
import { Doctrine, playOut } from "../src/tactical/autoplay";
import { alive } from "../src/tactical/battle";
import { Scavenger, prologueCity, startAmbush, startPrologue } from "../src/tactical/prologue";
import { mulberry32 } from "../src/tactical/random";
import { Daylight } from "../src/tactical/rules";

const seeds = Number(process.argv[2] ?? 100);
const doctrines: Doctrine[] = ["cautious", "aggressive", "capture"];
/** The habit each doctrine teaches them most. */
const TELL: Record<Doctrine, Habit> = { cautious: "holding", aggressive: "pushing", capture: "takedowns" };

function team(seed: number): Scavenger[] {
  const p = startPrologue(prologueCity(seed), seed);
  return p.battle.humans.map((u) => ({ id: u.id, name: u.name, role: u.role, stats: u.stats, health: u.stats.health }));
}

type Row = { won: number; captured: number; clean: number; lost: number; wiped: number; rounds: number; n: number; habits: Habits };
const row = (): Row => ({ won: 0, captured: 0, clean: 0, lost: 0, wiped: 0, rounds: 0, n: 0, habits: noHabits() });

function report(label: string, r: Row) {
  const p = (x: number) => `${Math.round((x / r.n) * 100)}%`.padStart(4);
  const h = (Object.keys(r.habits) as Habit[]).map((k) => `${k} ${(r.habits[k] / r.n).toFixed(2)}`).join(" ");
  console.log(`${label.padEnd(34)} win ${p(r.won)} (alive ${p(r.captured)})  clean ${p(r.clean)}  wiped ${p(r.wiped)}  dead ${(r.lost / r.n).toFixed(2)}  rounds ${(r.rounds / r.n).toFixed(1)}  ${h}`);
}

const t0 = Date.now();
/** How far along their learning is in the "they know you" rows: about four fights the same way. */
const LEVEL = Number(process.env.LEVEL ?? 0.6);
const scenarios: { label: string; sighting: boolean; d: Doctrine; learned?: Habits }[] = [];
for (const d of doctrines) scenarios.push({ label: `lone ${d}`, sighting: false, d });
for (const d of doctrines) scenarios.push({ label: `sighting ${d}`, sighting: true, d });
for (const d of doctrines) scenarios.push({ label: `they know you ${d}`, sighting: true, d, learned: { ...noHabits(), [TELL[d]]: LEVEL } });
// Switching style is the way out.
scenarios.push({ label: "know holding, go aggressive", sighting: true, d: "aggressive", learned: { ...noHabits(), holding: LEVEL } });
scenarios.push({ label: "know pushing, go cautious", sighting: true, d: "cautious", learned: { ...noHabits(), pushing: LEVEL } });
const only = process.env.ONLY;
const light = (process.env.LIGHT ?? "night") as Daylight;
for (const sc of scenarios.filter((x) => !only || new RegExp(only).test(x.label))) {
  const r = row();
  for (let s = 1; s <= seeds; s++) {
    const b = startAmbush(CITIES[s % CITIES.length], s, team(s), "Supermarket", sc.sighting ? { caller: "x", place: "here", hours: 1 } : undefined, 0, sc.learned, light).battle;
    const start = b.humans.filter(alive).length;
    playOut(b, sc.d, mulberry32(s * 31));
    const lost = start - b.humans.filter(alive).length;
    r.n++;
    r.rounds += b.turn;
    r.lost += lost;
    if (b.outcome === "captured" || b.outcome === "killed") r.won++;
    if (b.outcome === "captured") r.captured++;
    if ((b.outcome === "captured" || b.outcome === "killed") && !lost) r.clean++;
    if (b.outcome === "wiped") r.wiped++;
    const o = observe(b.tally);
    for (const k of Object.keys(o) as Habit[]) r.habits[k] += o[k];
  }
  report(sc.label, r);
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);

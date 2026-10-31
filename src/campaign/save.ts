import { BaseLayout, SavedBase } from "../base/layout";
import type { Habits } from "../tactical/adapt";
import type { RaceId } from "../tactical/aliens";
import { GEAR, Stores, emptyStores, legacyKit } from "./armoury";
import type { BaseRecord, Campaign, PrologueRecord } from "./campaign";
import type { Candidate, Pledge } from "./recruit";
import { Place, Run, START_SUPPLIES, Supplies, Traded, emptySupplies, startPlaces } from "./scavenge";
import type { Call, Vehicle } from "./sightings";
import { LIAISON, Person, ResearchState } from "./staff";

/**
 * The campaign as it's kept in the browser. Saves from older versions of the game must still load,
 * so a field added later is optional here and `restore` gives it a default (or works it out) when
 * it's missing. Never rename or drop a field: add a new one and upgrade the old one in `restore`.
 */
export interface SavedCampaign {
  version: 1;
  /** Missing in saves from before scavenging existed. */
  supplies?: Supplies;
  runs?: Run[];
  nextRun?: number;
  /** Missing in saves from before places held a fixed stock. */
  places?: Place[];
  nextPlace?: number;
  trophies?: string[];
  candidates?: Candidate[];
  pledges?: Pledge[];
  kills?: number;
  encounters?: Partial<Record<RaceId, number>>;
  learned?: Partial<Record<RaceId, Habits>>;
  nextCandidate?: number;
  market?: Record<Traded, number>;
  calls?: Call[];
  vehicles?: Vehicle[];
  nextCall?: number;
  nextVehicle?: number;
  crops?: Record<string, number>;
  /** Missing in saves from before the armoury existed. */
  armoury?: Partial<Stores>;
  looseClips?: number;
  /** Missing in saves from before the prologue existed. */
  prologue?: PrologueRecord | null;
  /** Missing in saves from before staff existed. */
  staff?: Person[];
  research?: ResearchState;
  nextPerson?: number;
  time: number;
  funds: number;
  nextId: number;
  bases: (Omit<BaseRecord, "layout"> & { layout: SavedBase })[];
}

export function toSave(c: Campaign): SavedCampaign {
  return {
    version: 1,
    time: c.time,
    funds: c.funds,
    nextId: c.ids.base,
    prologue: c.prologue,
    staff: c.staff,
    research: c.research,
    nextPerson: c.ids.person,
    supplies: c.supplies,
    runs: c.runs,
    nextRun: c.ids.run,
    places: c.places,
    nextPlace: c.ids.place,
    trophies: c.trophies,
    candidates: c.candidates,
    pledges: c.pledges,
    kills: c.kills,
    encounters: c.encounters,
    learned: c.learned,
    nextCandidate: c.ids.candidate,
    market: c.market,
    calls: c.calls,
    vehicles: c.vehicles,
    nextCall: c.ids.call,
    nextVehicle: c.ids.vehicle,
    crops: c.crops,
    armoury: c.armoury,
    looseClips: c.looseClips,
    bases: c.bases.map((b) => ({ ...b, layout: b.layout.save() })),
  };
}

/** Fills a new campaign from a save, upgrading saves made before later features existed. */
export function restore(c: Campaign, data: SavedCampaign): void {
  if (data.version !== 1) throw new Error("Unknown save version");
  c.time = data.time;
  c.funds = data.funds;
  c.ids.base = data.nextId;
  c.prologue = data.prologue ?? null;
  c.ids.person = data.nextPerson ?? 1;
  if (data.supplies) c.supplies = { ...START_SUPPLIES, ...data.supplies };
  if (data.runs) c.runs.push(...data.runs);
  c.ids.run = data.nextRun ?? 1;
  if (data.places) {
    c.places = data.places.map((p) => ({ ...p, stock: { ...emptySupplies(), ...p.stock } }));
    c.ids.place = data.nextPlace ?? c.places.reduce((n, p) => Math.max(n, p.id + 1), 1);
  }
  if (data.trophies) c.trophies.push(...data.trophies);
  if (data.candidates) c.candidates.push(...data.candidates);
  if (data.pledges) c.pledges.push(...data.pledges);
  c.kills = data.kills ?? 0;
  c.encounters = { ...data.encounters };
  c.learned = { ...data.learned };
  c.ids.candidate = data.nextCandidate ?? 1;
  if (data.calls) c.calls.push(...data.calls);
  if (data.vehicles) c.vehicles.push(...data.vehicles);
  c.ids.call = data.nextCall ?? 1;
  c.ids.vehicle = data.nextVehicle ?? 1;
  if (data.market) c.market = { ...c.market, ...data.market };
  c.crops = { ...data.crops };
  if (data.research) c.research = data.research;
  if (data.staff) c.staff.push(...data.staff);
  else if (c.prologue) {
    // Saves from before staff existed: the survivors are there, but we never kept who they were.
    const n = c.prologue.survivors;
    c.enlist(Array.from({ length: n }, (_, i) => ({ ...LIAISON, name: `Survivor ${i + 1}`, role: "Survivor" })));
  }
  for (const b of data.bases) c.bases.push({ ...b, layout: BaseLayout.load(b.layout) });
  for (const p of c.staff) if (p.base === null && c.bases[0]) p.base = c.bases[0].id;
  c.armoury = { ...emptyStores(), ...data.armoury };
  c.looseClips = data.looseClips ?? 0;
  if (!data.armoury) {
    // Saves from before the armoury: everyone keeps what their old job gave them, and someone remembers a police station.
    for (const p of c.staff) p.kit ??= legacyKit(p.role);
    if (data.prologue?.recovered.includes(GEAR.plasmaPistol.name)) c.stock(["plasmaPistol"]);
    const station = startPlaces().find((p) => p.kind === "police")!;
    c.places.push({ ...station, id: c.ids.place++ });
  }
}

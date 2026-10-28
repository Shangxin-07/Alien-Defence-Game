import { TOOLS, Tool, WEAPONS, Weapon } from "./tactical/rules";

/**
 * The armoury: guns, armour and kit held in the stores, and what each person carries.
 * Nobody packs their own bag. Each person has a standing request (a rifle and three clips,
 * a medikit, the best armour going) and the quartermaster fills it from whatever is in the
 * stores. How much anyone can carry isn't counted. Spare clips are counted in the supplies:
 * for now, all bullets fit all guns.
 */

export type GunId = "pistol" | "shotgun" | "rifle" | "plasmaPistol" | "plasmaScatter" | "needleRifle";
export type ArmourId = "stabVest" | "bodyArmour";
export type GearId = GunId | ArmourId | "stunBaton" | "medkit";
export type Stores = Record<GearId, number>;

export interface GearInfo {
  name: string;
  kind: "gun" | "armour" | "tool";
  /** Higher is better, within its kind: what "the best going" means. */
  rank: number;
  weapon?: Weapon;
  armour?: number;
  tool?: Tool;
  /** Research that has to be done before anyone can be trusted with it. */
  research?: string;
}

export const GEAR: Record<GearId, GearInfo> = {
  pistol: { name: "Service pistol", kind: "gun", rank: 1, weapon: WEAPONS.pistol },
  shotgun: { name: "Pump shotgun", kind: "gun", rank: 2, weapon: WEAPONS.shotgun },
  rifle: { name: "Assault rifle", kind: "gun", rank: 3, weapon: WEAPONS.rifle },
  plasmaScatter: { name: "Plasma scattergun", kind: "gun", rank: 4, weapon: WEAPONS.plasmaScatter, research: "plasmaScatter" },
  plasmaPistol: { name: "Plasma pistol", kind: "gun", rank: 5, weapon: WEAPONS.plasmaPistol, research: "plasmaPistol" },
  needleRifle: { name: "Needle rifle", kind: "gun", rank: 6, weapon: WEAPONS.needleRifle, research: "needleRifle" },
  stabVest: { name: "Stab vest", kind: "armour", rank: 1, armour: 4 },
  bodyArmour: { name: "Body armour", kind: "armour", rank: 2, armour: 8 },
  stunBaton: { name: "Stun baton", kind: "tool", rank: 1, tool: TOOLS.stunBaton },
  medkit: { name: "Medikit", kind: "tool", rank: 1, tool: TOOLS.medkit },
};

export const GUNS: GunId[] = ["pistol", "shotgun", "rifle", "plasmaScatter", "plasmaPistol", "needleRifle"];
export const ARMOURS: ArmourId[] = ["stabVest", "bodyArmour"];
export const GEAR_ORDER: GearId[] = [...GUNS, ...ARMOURS, "stunBaton", "medkit"];

/** The gear a weapon in a fight belongs to, by the weapon's id. */
export const gunOf = (w: Weapon | null): GunId | null => (w && (GUNS as string[]).includes(w.id) ? (w.id as GunId) : null);

/** Energy weapons run hot instead of taking clips. */
export const isEnergy = (g: GunId | null) => !!g && !!GEAR[g].weapon!.heat;

export const emptyStores = (): Stores => Object.fromEntries(GEAR_ORDER.map((g) => [g, 0])) as Stores;

/** Medicine it takes to make up one medikit, and to restock a used one. */
export const MEDIKIT_COST = 2;
export const MEDIKIT_RESTOCK = 1;
/** Most spare clips anyone asks for. */
export const MAX_CLIPS = 6;

/** What someone has on them. */
export interface Kit {
  gun: GunId | null;
  /** Rounds in the gun's magazine. Energy weapons don't use it. */
  loaded: number;
  /** Spare clips. */
  clips: number;
  armour: ArmourId | null;
  baton: boolean;
  /** Uses left in their medikit, or null for none. */
  medkit: number | null;
}

/** What someone has asked the quartermaster for. */
export interface Request {
  /** A particular gun, the best going, or none at all. */
  gun: GunId | "best" | "none";
  clips: number;
  armour: boolean;
  baton: boolean;
  medkit: boolean;
}

export const noKit = (): Kit => ({ gun: null, loaded: 0, clips: 0, armour: null, baton: false, medkit: null });

const fullMag = (g: GunId) => GEAR[g].weapon!.ammo;

/** A gun out of the stores, as it comes: empty, waiting for a clip. Energy weapons need none. */
const drawGun = (g: GunId): Pick<Kit, "gun" | "loaded"> => ({ gun: g, loaded: isEnergy(g) ? fullMag(g) : 0 });

/** Good defaults for each kind of person: soldiers want a rifle and plenty of clips, medics a medikit. */
export function defaultRequest(role: string): Request {
  const base: Request = { gun: "best", clips: 2, armour: true, baton: false, medkit: false };
  switch (role) {
    case "Soldier":
    case "Army reservist":
      return { ...base, gun: "rifle", clips: 3 };
    case "Police officer":
      return { ...base, gun: "pistol", baton: true };
    case "Security guard":
      return { ...base, gun: "shotgun" };
    case "Nurse":
    case "Paramedic":
      return { ...base, gun: "pistol", clips: 1, medkit: true };
    default:
      return base;
  }
}

/** What someone walks in with. Soldiers bring their rifle; nurses bring a medikit; most people bring nothing. */
export function arrivalKit(role: string, rand: () => number): Kit {
  const k = noKit();
  if (role === "Soldier") {
    Object.assign(k, { gun: "rifle", loaded: fullMag("rifle"), clips: 1 + Math.floor(rand() * 2) });
    const r = rand();
    k.armour = r < 0.25 ? "bodyArmour" : r < 0.75 ? "stabVest" : null;
  } else if (role === "Nurse") {
    k.medkit = TOOLS.medkit.uses;
  } else if (role !== "Drifter" && rand() < 0.15) {
    Object.assign(k, { gun: "pistol", loaded: Math.ceil(fullMag("pistol") * (0.3 + rand() * 0.7)) });
  }
  return k;
}

/**
 * Kit for people who were around before anyone carried anything in particular: what their old
 * job gave them on the first night, or a pistol, and one spare clip.
 */
export function legacyKit(role: string): Kit {
  const k = noKit();
  const gun: GunId = role === "Army reservist" ? "rifle" : role === "Security guard" ? "shotgun" : "pistol";
  Object.assign(k, { gun, loaded: fullMag(gun), clips: 1 });
  if (role === "Police officer") k.baton = true;
  if (role === "Paramedic") k.medkit = TOOLS.medkit.uses;
  return k;
}

/** Everything one person needs from a kit in a fight. */
export interface FightKit {
  weapon: Weapon | null;
  ammo: number;
  clips: number;
  armour: number;
  tools: { tool: Tool; uses: number }[];
}

export function fightKit(k: Kit): FightKit {
  const tools: FightKit["tools"] = [];
  if (k.baton) tools.push({ tool: TOOLS.stunBaton, uses: TOOLS.stunBaton.uses });
  if (k.medkit !== null) tools.push({ tool: TOOLS.medkit, uses: k.medkit });
  const weapon = k.gun ? GEAR[k.gun].weapon! : null;
  return { weapon, ammo: weapon ? (isEnergy(k.gun) ? weapon.ammo : k.loaded) : 0, clips: k.clips, armour: k.armour ? GEAR[k.armour].armour! : 0, tools };
}

/** What someone came out of a fight with, from the kit they went in with and what's left of it. */
export function kitAfter(before: Kit, u: { weapon: Weapon | null; ammo: number; clips?: number; tools: { tool: Tool; uses: number }[] }): Kit {
  const gun = gunOf(u.weapon);
  const kit = u.tools.find((t) => t.tool.kind === "medkit");
  return {
    gun,
    loaded: gun && !isEnergy(gun) ? Math.max(0, u.ammo) : gun ? fullMag(gun) : 0,
    clips: u.clips ?? 0,
    armour: before.armour,
    baton: u.tools.some((t) => t.tool.kind === "stun"),
    medkit: kit ? kit.uses : null,
  };
}

/** One line on what someone carries. */
export function describeKit(k: Kit): string {
  const parts: string[] = [];
  if (k.gun) parts.push(isEnergy(k.gun) ? GEAR[k.gun].name : `${GEAR[k.gun].name} (${k.loaded}/${fullMag(k.gun)}, ${k.clips} spare clip${k.clips === 1 ? "" : "s"})`);
  else parts.push("unarmed");
  if (k.armour) parts.push(GEAR[k.armour].name.toLowerCase());
  if (k.baton) parts.push("stun baton");
  if (k.medkit !== null) parts.push(`medikit ×${k.medkit}`);
  return parts.join(", ");
}

/** The stores the quartermaster draws on. Clips and loose rounds live with the supplies. */
export interface Quarters {
  stores: Stores;
  /** Spare clips. */
  ammo: number;
  /** Part-used clips emptied back into the stores, counted in clips. Every whole one is repacked. */
  loose: number;
  /** Medicine, for restocking a used medikit before it goes back on the shelf. */
  medicine: number;
  /** Research done, for alien weapons. */
  researched: string[];
}

export const usable = (g: GearId, q: Pick<Quarters, "researched">) => !GEAR[g].research || q.researched.includes(GEAR[g].research!);

/** The best of a kind in the stores that this person may use, better than `than`. */
function bestInStores<T extends GearId>(ids: T[], q: Quarters, than: T | null): T | null {
  let best: T | null = null;
  for (const g of ids) {
    if (!q.stores[g] || !usable(g, q)) continue;
    if (than && GEAR[g].rank <= GEAR[than].rank) continue;
    if (!best || GEAR[g].rank > GEAR[best].rank) best = g;
  }
  return best;
}

/** Puts a gun back on the shelf. A part-used magazine is emptied into the loose rounds. */
function shelveGun(k: Kit, q: Quarters) {
  if (!k.gun) return;
  if (!isEnergy(k.gun)) q.loose += k.loaded / fullMag(k.gun);
  q.stores[k.gun]++;
  k.gun = null;
  k.loaded = 0;
}

function repack(q: Quarters) {
  const whole = Math.floor(q.loose + 1e-9);
  q.ammo += whole;
  q.loose = Math.max(0, q.loose - whole);
}

/**
 * Fills one person's request from the stores, and hands back whatever they no longer asked for.
 * At home a part-used magazine is swapped for a full one and the rounds go back in the stores,
 * so nothing is wasted between fights. In a fight, reloading drops what's left.
 */
export function outfit(k: Kit, r: Request, q: Quarters): void {
  // The gun.
  if (r.gun === "none") shelveGun(k, q);
  else if (r.gun === "best") {
    const better = bestInStores(GUNS, q, k.gun && usable(k.gun, q) ? k.gun : null);
    if (better || (k.gun && !usable(k.gun, q))) {
      shelveGun(k, q);
      if (better) {
        q.stores[better]--;
        Object.assign(k, drawGun(better));
      }
    }
  } else if (k.gun !== r.gun && q.stores[r.gun] && usable(r.gun, q)) {
    shelveGun(k, q);
    q.stores[r.gun]--;
    Object.assign(k, drawGun(r.gun));
  } else if (!k.gun) {
    // Not what they asked for, but better than nothing.
    const any = bestInStores(GUNS, q, null);
    if (any) {
      q.stores[any]--;
      Object.assign(k, drawGun(any));
    }
  }
  repack(q);
  // Clips: a full magazine first, then the spares they asked for.
  const conventional = !!k.gun && !isEnergy(k.gun);
  if (conventional && k.loaded < fullMag(k.gun!)) {
    if (q.ammo > 0) {
      q.loose += k.loaded / fullMag(k.gun!);
      q.ammo--;
      k.loaded = fullMag(k.gun!);
    } else if (k.clips > 0) {
      q.loose += k.loaded / fullMag(k.gun!);
      k.clips--;
      k.loaded = fullMag(k.gun!);
    }
    repack(q);
  }
  const want = conventional ? Math.max(0, Math.min(MAX_CLIPS, r.clips)) : 0;
  if (k.clips > want) {
    q.ammo += k.clips - want;
    k.clips = want;
  }
  const take = Math.min(want - k.clips, q.ammo);
  k.clips += take;
  q.ammo -= take;
  // Armour.
  if (!r.armour) {
    if (k.armour) q.stores[k.armour]++;
    k.armour = null;
  } else {
    const better = bestInStores(ARMOURS, q, k.armour);
    if (better) {
      if (k.armour) q.stores[k.armour]++;
      q.stores[better]--;
      k.armour = better;
    }
  }
  // Baton.
  if (r.baton && !k.baton && q.stores.stunBaton) {
    q.stores.stunBaton--;
    k.baton = true;
  } else if (!r.baton && k.baton) {
    q.stores.stunBaton++;
    k.baton = false;
  }
  // Medikit. A used one is restocked with medicine before it goes back; without any, they keep it.
  if (r.medkit && k.medkit === null && q.stores.medkit) {
    q.stores.medkit--;
    k.medkit = TOOLS.medkit.uses;
  } else if (!r.medkit && k.medkit !== null) {
    const used = k.medkit < TOOLS.medkit.uses;
    if (!used || q.medicine >= MEDIKIT_RESTOCK) {
      if (used) q.medicine -= MEDIKIT_RESTOCK;
      q.stores.medkit++;
      k.medkit = null;
    }
  }
}

/** Things worth fixing before anyone goes out: no gun, no ammo, better kit left on the shelf. */
export function kitWarnings(k: Kit, r: Request, q: Quarters): string[] {
  const out: string[] = [];
  if (!k.gun) out.push(r.gun === "none" ? "Unarmed, as asked" : "No gun: none in the stores");
  else if (!isEnergy(k.gun)) {
    if (!k.loaded && !k.clips) out.push("No ammo");
    else if (!k.clips) out.push(`No spare clips: ${k.loaded} rounds and that's it`);
    else if (k.clips < Math.min(r.clips, MAX_CLIPS)) out.push(`Only ${k.clips} of ${r.clips} spare clips`);
  }
  if (k.gun && r.gun !== "best" && r.gun !== "none" && k.gun !== r.gun) out.push(`Asked for a ${GEAR[r.gun].name.toLowerCase()}: none to give`);
  const betterGun = bestInStores(GUNS, q, k.gun);
  if (k.gun && betterGun && r.gun !== "best") out.push(`Better gun in the stores: ${GEAR[betterGun].name.toLowerCase()}`);
  const betterArmour = bestInStores(ARMOURS, q, k.armour);
  if (betterArmour) out.push(`${GEAR[betterArmour].name} in the stores, not worn`);
  if (r.medkit && k.medkit === null) out.push("Asked for a medikit: none in the stores");
  else if (k.medkit === 0) out.push("Medikit used up");
  if (r.baton && !k.baton) out.push("Asked for a stun baton: none in the stores");
  return out;
}

/** What a crate of arms off a scavenging run turns out to hold. Mostly what police and gun shops kept. */
const ARMS_FINDS: [GearId, number][] = [["pistol", 0.34], ["shotgun", 0.24], ["rifle", 0.12], ["stabVest", 0.18], ["bodyArmour", 0.06], ["stunBaton", 0.06]];

export function rollArms(rand: () => number): GearId {
  let r = rand();
  for (const [g, w] of ARMS_FINDS) if ((r -= w) < 0) return g;
  return "pistol";
}

/** Chance an alien's weapon comes home in one piece: off a prisoner, or off a body. Some burn out when their owner falls. */
export const ALIEN_GUN_INTACT = { captured: 0.6, killed: 0.35 };

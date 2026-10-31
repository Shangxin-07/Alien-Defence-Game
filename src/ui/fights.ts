import { kitAfter, describeKit, noKit } from "../campaign/armoury";
import { SITES, runWhere } from "../campaign/scavenge";
import { HOUR_MS } from "../campaign/sightings";
import { rollBuild } from "../campaign/staff";
import { Gear, closeCombat, openCombat } from "../tactical/screen";
import type { City } from "../geoscape/cities";
import { daylightAt, solarTime } from "../geoscape/geo";
import { adaptReads, adaptSquad } from "../tactical/adapt";
import { readSquad } from "../tactical/aliens";
import { lightRead, prologueCity, rollForce, startAmbush, startPrologue } from "../tactical/prologue";
import type { Stats } from "../tactical/rules";
import { $, escape } from "./dom";
import type { Ui } from "./panel";

/** What the fights need from the geoscape screen: a way off the globe and back. */
export interface FightHost extends Ui {
  /** True while the globe is on screen, not a base or a battle. */
  readonly onGlobe: boolean;
  /** Hides the globe while a battle takes over. */
  leaveGlobe(): void;
  /** Brings the globe back once a battle closes. */
  returnToGlobe(): void;
  /** Announces any news the campaign has gathered. */
  news(): void;
  /** Closes any open panel, so a fight isn't hidden behind one. */
  closePanels(): void;
  /** Marks a site on the globe and flies there, to suggest it for a base. */
  suggestSite(city: City): void;
}

/**
 * The dialog for a run that's met an alien: fight or run. The clock waits until the player chooses.
 * Returns `check`, which puts it on screen whenever a run is in trouble.
 */
export function ambushDialog(host: FightHost): { check(): void } {
  const box = $("ambushModal");

  function check() {
    const { campaign } = host;
    const run = campaign.ambush;
    if (!run || !host.onGlobe) {
      box.hidden = true;
      return;
    }
    if (!box.hidden) return;
    host.closePanels();
    const team = run.team.map((id) => campaign.staff.find((p) => p.id === id)!);
    if (run.fightSeed === undefined) {
      run.fightSeed = Math.floor(Math.random() * 2 ** 31);
      host.persist();
    }
    const force = rollForce(run.fightSeed, !!run.call);
    const learned = campaign.learned[force.race];
    adaptSquad(force.squad, learned);
    const many = force.squad.members.length > 1;
    const reads = [...readSquad(force.squad, campaign.knowledge(force.race)), ...adaptReads(learned)];
    const intro = run.call
      ? `The team answering the call got there, ${escape(run.call.place)}, and ${many ? "they're" : "it's"} still there.`
      : `The run to ${escape(runWhere(run))} has run into an alien, alone and close.`;
    const odds = run.call
      ? `Fight and you might bring home ${many ? "bodies or prisoners" : "a body or a prisoner"}, and what's left of the kit. Pull back and someone may get hurt getting away.`
      : "Fight it and you might bring home a body or a prisoner as well as the supplies. Run and you drop everything, and someone may get hurt getting away.";
    const city = campaign.fightCity(run.team);
    const light = daylightAt(city, campaign.time);
    reads.unshift(`${solarTime(city.lon, campaign.time)} local in ${city.name}. ${lightRead(light)}`);
    $("ambushBody").innerHTML = `<p>${intro}</p>
      <ul class="reads">${reads.map((r) => `<li>${escape(r)}</li>`).join("")}</ul>
      <ul>${team.map((p) => `<li><b>${escape(p.name)}</b> <span class="dim">${escape(p.role)}, ${p.health}/${p.stats.health} HP, ${escape(describeKit(p.kit ?? noKit()))}</span>${campaign.kitWarnings(p).length ? `<div class="warn">⚠ ${escape(campaign.kitWarnings(p).join("; "))}</div>` : ""}</li>`).join("")}</ul>
      <p class="dim">${odds}</p>`;
    box.hidden = false;
  }

  $("ambushFlee").addEventListener("click", () => {
    host.campaign.fleeAmbush();
    host.persist();
    box.hidden = true;
    host.news();
    host.refresh();
  });

  $("ambushFight").addEventListener("click", () => {
    const { campaign } = host;
    const run = campaign.ambush;
    if (!run) return;
    box.hidden = true;
    const city = campaign.fightCity(run.team);
    const team = run.team.map((id) => campaign.staff.find((p) => p.id === id)!);
    host.leaveGlobe();
    const sighting = run.call ? { caller: run.call.caller, place: run.call.place, hours: (run.arrive! - run.call.at) / HOUR_MS } : undefined;
    const seed = run.fightSeed ?? Math.floor(Math.random() * 2 ** 31);
    const race = rollForce(seed, !!run.call).race;
    const knowledge = campaign.knowledge(race);
    // The fight is fought in whatever light the globe shows there right now.
    const light = daylightAt(city, campaign.time);
    const fight = startAmbush(city, seed, team, SITES[run.site].name, sighting, knowledge, campaign.learned[race], light, solarTime(city.lon, campaign.time));
    openCombat({
      prologue: fight,
      knowledge,
      finish: (r) => {
        campaign.resolveAmbush({
          outcome: r.outcome,
          recovered: r.recovered,
          race,
          people: r.people.map((p) => ({ id: p.id, health: p.health, kit: kitAfter(campaign.staff.find((s) => s.id === p.id)?.kit ?? noKit(), p.gear) })),
          tally: r.tally,
          commanderDown: r.commanderDown,
        });
        closeCombat();
        host.returnToGlobe();
        host.persist();
        host.news();
        host.refresh();
      },
      retry: () => {},
      skip: () => {},
    });
  });

  return { check };
}

/** The opening battle: one night in a city, hunted by a single alien. Whoever gets out becomes your first staff. */
export function playPrologue(host: FightHost): void {
  const { campaign } = host;
  const seed = Math.floor(Math.random() * 2 ** 31);
  const city = prologueCity(seed);
  host.leaveGlobe();
  const back = () => {
    host.persist();
    closeCombat();
    host.returnToGlobe();
    // Suggest the city they just escaped from for the first base.
    if (!campaign.bases.length) host.suggestSite(city);
    host.refresh();
  };
  const prologue = startPrologue(city, seed);
  // Research aptitude is a coin toss, not their old job: anyone can learn anything. Their old job does make some handier with a shovel.
  // They keep what they walked out with: whatever is left in their guns, and their medikit.
  const enlist = (people: { name: string; role: string; stats: Stats; health: number; gear: Gear }[]) =>
    campaign.enlist(
      people.map((p) => ({
        name: p.name, role: p.role, stats: { ...p.stats }, health: p.health, kit: kitAfter(noKit(), p.gear),
        aptitude: Math.round((0.8 + Math.random() * 0.4) * 100) / 100, build: rollBuild(p.role, Math.random),
      })),
    );
  openCombat({
    prologue,
    finish: (r) => {
      campaign.recordPrologue({ city: city.name, outcome: r.outcome, recovered: r.recovered, survivors: r.survivors, turns: r.turns });
      enlist(r.people);
      if (r.recovered.length) host.toast(`Recovered: ${r.recovered.join(", ")}`);
      back();
    },
    retry: () => {
      closeCombat();
      playPrologue(host);
    },
    skip: () => {
      if (!campaign.prologue) campaign.recordPrologue({ city: city.name, outcome: "skipped", recovered: [], survivors: 0, turns: 0 });
      enlist(prologue.battle.humans.map((u) => ({ ...u, gear: u })));
      back();
    },
  });
}

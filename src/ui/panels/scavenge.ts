import { SCRAP_VALUE } from "../../base/rooms";
import { Duty, dutyOf } from "../../campaign/allocation";
import { MARKET_LOT, MARKET_PRICE, MAX_RUN_DAYS, MAX_SEARCHERS, MAX_TEAM, Run, SEARCH_CHANCE, SITES, Traded, cleanChance, describeSupplies, runWhere } from "../../campaign/scavenge";
import { $, addItem, choiceButton, dayOptions, money, segmented, sendState, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";
import { fillTeam, teamNames } from "../people";

/** Runs that belong on the scavenging panel: out for supplies, or searching for places. */
const scavenging = (r: Run) => !r.recruit && !r.call && !r.repair;

/** Scavenging: the stores, the black market, and sending people out for supplies or new places. */
export function scavengePanel(ui: Ui): PanelSpec {
  /** A known place by id, or "search" to look for new ones. */
  let runSite: number | "search" = 1;
  let runDays = 1;
  const runTeam = new Set<number>();

  function summary() {
    const { campaign } = ui;
    const scavs = campaign.runs.filter(scavenging);
    const text = scavs.length
      ? scavs.map((r) => `${r.search ? "Searching" : r.where ?? SITES[r.site].name}${r.ambush ? ", in trouble" : `, ${r.daysLeft}d`}`).join(" · ")
      : "Nobody out";
    summaryButton("openScavenge", "scavengeSummary", !!campaign.bases.length, text);
  }

  function draw() {
    const { campaign } = ui;
    const s = campaign.supplies;
    const days = campaign.foodDays;
    $("supplyRows").innerHTML = `
      <div class="row"><span>Food</span><span${days < 3 ? ' class="bad"' : ""}>${s.food}, ${days === Infinity ? "nobody to feed" : `${days} day${days === 1 ? "" : "s"} for ${campaign.staff.length}`}</span></div>
      <div class="row"><span>Medicine</span><span>${s.medicine}</span></div>
      <div class="row"><span>Scrap</span><span>${s.scrap} (worth ${money(s.scrap * SCRAP_VALUE)} in rooms)</span></div>
      <div class="row"><span>Fuel</span><span>${s.fuel}</span></div>
      <div class="row"><span>Ammo</span><span>${s.ammo} spare clip${s.ammo === 1 ? "" : "s"} in the stores</span></div>`;

    const market = $("marketRows");
    market.replaceChildren();
    for (const kind of ["food", "medicine", "fuel", "ammo"] as Traded[]) {
      const n = MARKET_LOT[kind];
      const cost = campaign.buyCost(kind, n);
      const row = document.createElement("div");
      row.className = "sendrow";
      const heat = campaign.market[kind];
      row.innerHTML = `<span class="dim"></span><button type="button"></button>`;
      row.querySelector("span")!.textContent = `${n} ${kind} for ${money(cost)}${heat > 1.05 ? `, ${Math.round((heat - 1) * 100)}% over the going rate of ${money(MARKET_PRICE[kind])} a unit` : `, ${money(MARKET_PRICE[kind])} a unit`}`;
      const b = row.querySelector("button")!;
      b.textContent = "Buy";
      const reason = campaign.checkBuy(kind, n);
      b.disabled = !!reason;
      if (reason) b.title = reason;
      b.addEventListener("click", () => {
        campaign.buy(kind, n);
        ui.persist();
        ui.refresh();
      });
      market.appendChild(row);
    }

    const runs = $("runList");
    runs.replaceChildren();
    for (const r of campaign.runs.filter(scavenging)) {
      const li = document.createElement("li");
      li.innerHTML = `<div><b></b><div class="meta"></div></div>`;
      li.querySelector("b")!.textContent = r.search ? "Searching for new places" : r.where ?? SITES[r.site].name;
      const found = r.search ? `${r.found ?? 0} new place${r.found === 1 ? "" : "s"}` : describeSupplies(r.loot);
      li.querySelector(".meta")!.textContent = `${teamNames(campaign, r.team)} · ${r.ambush ? "in a fight" : `back in ${r.daysLeft}d`} · found ${found}`;
      runs.appendChild(li);
    }
    if (!campaign.runs.some(scavenging)) runs.innerHTML = `<li class="dim">Nobody is out.</li>`;

    const sites = $("siteList");
    sites.replaceChildren();
    if (runSite !== "search" && !campaign.findPlace(runSite)) runSite = campaign.places[0]?.id ?? "search";
    const option = (picked: boolean, name: string, meta: string, pick: () => void) => {
      const b = choiceButton(name, meta, picked);
      b.addEventListener("click", () => {
        pick();
        draw();
      });
      addItem(sites, b);
    };
    for (const place of campaign.places) {
      const site = SITES[place.kind];
      const finds = Object.entries(site.yields).map(([k, [lo, hi]]) => `${k} ${lo}–${hi}`).join(", ");
      option(place.id === runSite, place.name, `${site.name}. ${describeSupplies(place.stock)} left. Each person finds ${finds} a day while it lasts.`, () => (runSite = place.id));
    }
    if (!campaign.places.length) sites.innerHTML = `<li class="dim">Nowhere left that you know of.</li>`;
    option(
      runSite === "search",
      "Search for new places",
      `${SITES.search.blurb} Up to ${MAX_SEARCHERS} people; each has a ${Math.round(SEARCH_CHANCE * 100)}% chance a day of finding somewhere new.`,
      () => (runSite = "search"),
    );

    segmented($("runDays"), dayOptions(MAX_RUN_DAYS), runDays, (d) => {
      runDays = d;
      draw();
    });

    const searching = runSite === "search";
    const duty: Duty = searching ? "search" : dutyOf(campaign.findPlace(runSite)!.kind);
    fillTeam($("teamList"), campaign, { team: runTeam, duty, max: searching ? MAX_SEARCHERS : MAX_TEAM, showKit: true, changed: draw });
    const reason = searching && runTeam.size > MAX_SEARCHERS ? `No more than ${MAX_SEARCHERS} searching at once` : campaign.checkRun(runSite, [...runTeam], runDays);
    const kind = searching ? "search" : campaign.findPlace(runSite)!.kind;
    sendState("sendRun", "runOdds", "Send them", reason, `${Math.round(cleanChance(kind, runTeam.size, runDays) * 100)}% chance of getting back without trouble`, campaign.dutyWarnings(runSite, [...runTeam]));
  }

  $("sendRun").addEventListener("click", () => {
    const { campaign } = ui;
    const run = runSite === "search" ? campaign.startSearch([...runTeam], runDays) : campaign.startRun(runSite, [...runTeam], runDays);
    runTeam.clear();
    ui.persist();
    const who = run.team.length === 1 ? "One person heads" : `${run.team.length} head`;
    ui.toast(run.search ? `${who} out to look for new places` : `${who} out to ${runWhere(run)}`);
    ui.refresh();
  });

  return { modal: "scavengeModal", open: "openScavenge", close: "closeScavenge", draw, summary };
}

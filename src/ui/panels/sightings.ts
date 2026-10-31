import { dutyClash } from "../../campaign/allocation";
import { MAX_TEAM } from "../../campaign/scavenge";
import { CAR_SCRAP, CAR_SEATS, HOUR_MS, MAX_MECHANICS, TRAIL_HOURS, Travel, freshness, travelHours, tripFuel } from "../../campaign/sightings";
import { buildSkill } from "../../campaign/staff";
import { $, addItem, choiceButton, segmented, sendState, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";
import { fillTeam, teamNames } from "../people";

const hoursText = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.round(h * 10) / 10} h`);
const count = (n: number, one: string) => (n ? `${n} ${one}${n === 1 ? "" : "s"}` : "");

/** Sightings: calls from people who saw something, the teams sent after them, and the cars. */
export function sightingsPanel(ui: Ui): PanelSpec {
  let callPick: number | null = null;
  let travelBy: Travel = "foot";
  const callTeam = new Set<number>();

  /** The handiest free people for a car: up to two, never anyone locked elsewhere, and people meant for something else only if nobody else will do. */
  function mechanicPick(): number[] {
    const { campaign } = ui;
    return campaign.staff
      .filter((p) => campaign.canScavenge(p) && !dutyClash(p, "garage")?.locked)
      .sort((a, b) => Number(!!dutyClash(a, "garage")) - Number(!!dutyClash(b, "garage")) || buildSkill(b) - buildSkill(a))
      .slice(0, MAX_MECHANICS)
      .map((p) => p.id);
  }

  function summary() {
    const { campaign } = ui;
    const calls = campaign.openCalls.length;
    const answering = campaign.runs.filter((r) => r.call).length;
    const text = [calls ? `${count(calls, "call")} waiting` : "", answering ? `${count(answering, "team")} out` : "", count(campaign.vehicles.length, "car")].filter(Boolean).join(" · ") || "No calls";
    summaryButton("openSightings", "sightingSummary", !!campaign.bases.length, text, !!calls);
  }

  function draw() {
    const { campaign } = ui;
    const now = campaign.time;
    const calls = campaign.openCalls;
    if (callPick !== null && !calls.some((c) => c.id === callPick)) callPick = null;
    if (callPick === null && calls.length) callPick = calls[0].id;
    const list = $("callList");
    list.replaceChildren();
    for (const c of calls) {
      const ago = (now - c.at) / HOUR_MS;
      const b = choiceButton(
        `Something ${c.place}`,
        `${c.caller} called it in ${hoursText(ago)} ago. ${c.km} km away. Gone for sure in ${hoursText(Math.max(0, TRAIL_HOURS - ago))}.`,
        c.id === callPick,
      );
      b.addEventListener("click", () => {
        callPick = c.id;
        draw();
      });
      addItem(list, b);
    }
    if (!calls.length) list.innerHTML = `<li class="dim">No calls. Someone will see something soon enough.</li>`;

    const call = calls.find((c) => c.id === callPick);
    const travelLabel = (by: Travel) => {
      const h = call ? travelHours(call.km, by) : 0;
      return by === "foot" ? `On foot${call ? `, ${hoursText(h)}` : ""}` : `By car${call ? `, ${hoursText(h)}, ${tripFuel(call.km)} fuel` : ""}`;
    };
    segmented($("callTravel"), (["foot", "car"] as Travel[]).map((by) => ({ value: by, label: travelLabel(by) })), travelBy, (by) => {
      travelBy = by;
      draw();
    });

    fillTeam($("callTeamList"), campaign, { team: callTeam, duty: "hunt", max: travelBy === "car" ? CAR_SEATS : MAX_TEAM, showKit: true, changed: draw });
    const reason = call ? campaign.checkResponse(call.id, [...callTeam], travelBy) : "No call to answer";
    const h = call ? travelHours(call.km, travelBy) : 0;
    sendState("sendCall", "callOdds", "Go", reason, call ? `There in ${hoursText(h)}: about ${Math.round(freshness(call, now + h * HOUR_MS) * 100)}% chance it's still there` : "", campaign.dutyWarnings("sighting", [...callTeam]));

    const out = $("responseList");
    out.replaceChildren();
    for (const r of campaign.runs.filter((x) => x.call)) {
      const li = document.createElement("li");
      li.innerHTML = `<div><b></b><div class="meta"></div></div>`;
      li.querySelector("b")!.textContent = `Answering: something ${r.call!.place}`;
      const state = r.ambush ? "in a fight" : r.arrived ? `trail was cold, home in ${hoursText((r.back! - now) / HOUR_MS)}` : `there in ${hoursText((r.arrive! - now) / HOUR_MS)}`;
      li.querySelector(".meta")!.textContent = `${teamNames(campaign, r.team)} · ${r.by === "car" ? "by car" : "on foot"} · ${state}`;
      out.appendChild(li);
    }
    if (!campaign.runs.some((x) => x.call)) out.innerHTML = `<li class="dim">Nobody is out.</li>`;

    const cars = $("vehicleList");
    cars.replaceChildren();
    for (const v of campaign.vehicles) {
      const li = document.createElement("li");
      li.innerHTML = `<div><b></b><div class="meta"></div></div>`;
      li.querySelector("b")!.textContent = v.name[0].toUpperCase() + v.name.slice(1);
      li.querySelector(".meta")!.textContent = v.away ? "out on a call" : "in the yard";
      cars.appendChild(li);
    }
    for (const r of campaign.runs.filter((x) => x.repair)) {
      const li = document.createElement("li");
      li.className = "dim";
      li.textContent = `A car being fixed up: running in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`;
      cars.appendChild(li);
    }
    if (!cars.children.length) cars.innerHTML = `<li class="dim">No cars yet.</li>`;
    const mechanics = mechanicPick();
    const why = mechanics.length ? campaign.checkRepair(mechanics) : "Nobody free to do it";
    sendState(
      "startRepair",
      "repairOdds",
      "Fix up a car",
      why,
      `${CAR_SCRAP} scrap. ${mechanics.map((id) => campaign.staff.find((p) => p.id === id)!.name).join(" and ")} would have it running in ${campaign.repairDays(mechanics)} days`,
      campaign.dutyWarnings("garage", mechanics),
    );
  }

  $("sendCall").addEventListener("click", () => {
    if (callPick === null) return;
    const run = ui.campaign.respond(callPick, [...callTeam], travelBy);
    callTeam.clear();
    ui.persist();
    ui.toast(`${run.team.length === 1 ? "One person heads" : `${run.team.length} head`} out ${run.by === "car" ? "by car" : "on foot"}`);
    ui.refresh();
  });
  $("startRepair").addEventListener("click", () => {
    ui.campaign.startRepair(mechanicPick());
    ui.persist();
    ui.refresh();
  });

  return { modal: "sightingModal", open: "openSightings", close: "closeSightings", draw, summary };
}

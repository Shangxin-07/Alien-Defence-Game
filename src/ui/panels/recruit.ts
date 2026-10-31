import { describeKit } from "../../campaign/armoury";
import { WANT_TEXT } from "../../campaign/recruit";
import { MAX_RECRUITERS, MAX_RUN_DAYS, cleanChance } from "../../campaign/scavenge";
import { $, dayOptions, segmented, sendState, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";
import { fillTeam } from "../people";

/** Recruitment: people who want to join, promises made to them, and sending recruiters out. */
export function recruitPanel(ui: Ui): PanelSpec {
  let recruitDays = 2;
  const recruiters = new Set<number>();

  function summary() {
    const { campaign } = ui;
    const recruiting = campaign.runs.some((r) => r.recruit);
    const text =
      [campaign.candidates.length ? `${campaign.candidates.length} want to join` : "", campaign.pledges.length ? `${campaign.pledges.length} promises` : "", recruiting ? "recruiting" : ""]
        .filter(Boolean)
        .join(" · ") || "Nobody waiting";
    summaryButton("openRecruit", "recruitSummary", !!campaign.bases.length, text);
  }

  function draw() {
    const { campaign } = ui;
    const list = $("candidateList");
    list.replaceChildren();
    for (const c of campaign.candidates) {
      const li = document.createElement("li");
      li.innerHTML = `<div><b></b> <span class="dim"></span><div class="meta"></div><div class="want"></div></div><div class="acts"><button type="button" class="no">Turn away</button><button type="button" class="yes">Take on</button></div>`;
      li.querySelector("b")!.textContent = c.name;
      li.querySelector(".dim")!.textContent = c.role;
      const left = c.until - campaign.day;
      const brings = c.kit ? (describeKit(c.kit) === "unarmed" ? "nothing" : describeKit(c.kit).replace(/^unarmed, /, "")) : "nothing";
      li.querySelector(".meta")!.textContent = `build ${c.build.toFixed(2)} · research ${c.aptitude.toFixed(2)} · HP ${c.stats.health} · aim ${c.stats.accuracy} · waits ${left <= 0 ? "until tomorrow" : `${left} more day${left === 1 ? "" : "s"}`} · brings ${brings}`;
      li.querySelector(".want")!.textContent = `Wants ${WANT_TEXT[c.wants](c.amount)}`;
      const reason = campaign.checkCandidate(c.id);
      const yes = li.querySelector(".yes") as HTMLButtonElement;
      yes.disabled = !!reason;
      if (reason) yes.title = reason;
      yes.addEventListener("click", () => {
        const p = campaign.accept(c.id);
        ui.persist();
        ui.toast(`${p.name} joins${p.dependants ? ` with ${p.dependants === 1 ? "a partner" : `a family of ${p.dependants}`}` : ""}`);
        ui.refresh();
      });
      li.querySelector(".no")!.addEventListener("click", () => {
        campaign.turnAway(c.id);
        ui.persist();
        ui.refresh();
      });
      list.appendChild(li);
    }
    if (!campaign.candidates.length) list.innerHTML = `<li class="dim">Nobody yet. Send someone out to talk to people.</li>`;

    const pledges = $("pledgeList");
    pledges.replaceChildren();
    for (const pl of campaign.pledges) {
      const p = campaign.staff.find((x) => x.id === pl.person);
      if (!p) continue;
      const li = document.createElement("li");
      const left = pl.due - campaign.day;
      const what = pl.wants === "medicine" ? `${pl.amount} medicine (you have ${campaign.supplies.medicine})` : pl.wants === "bed" ? "a bed: living quarters working in a base" : "an alien dead or caught";
      li.innerHTML = `<div><b></b><div class="meta"></div></div>`;
      li.querySelector("b")!.textContent = p.name;
      li.querySelector(".meta")!.textContent = `Promised ${what} · ${left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : "due today"} · loyalty ${p.loyalty ?? 100}`;
      pledges.appendChild(li);
    }
    if (!campaign.pledges.length) pledges.innerHTML = `<li class="dim">No promises to keep.</li>`;

    segmented($("recruitDays"), dayOptions(MAX_RUN_DAYS), recruitDays, (d) => {
      recruitDays = d;
      draw();
    });
    fillTeam($("recruiterList"), campaign, { team: recruiters, duty: "recruit", max: MAX_RECRUITERS, showKit: false, changed: draw });
    const reason = campaign.checkRun("streets", [...recruiters], recruitDays);
    sendState("sendRecruit", "recruitOdds", "Send them", reason, `${Math.round(cleanChance("streets", recruiters.size, recruitDays) * 100)}% chance of getting back without trouble`, campaign.dutyWarnings("streets", [...recruiters]));
  }

  $("sendRecruit").addEventListener("click", () => {
    const run = ui.campaign.startRecruiting([...recruiters], recruitDays);
    recruiters.clear();
    ui.persist();
    ui.toast(`${run.team.length === 1 ? "A recruiter heads" : "Two recruiters head"} out into the streets`);
    ui.refresh();
  });

  return { modal: "recruitModal", open: "openRecruit", close: "closeRecruit", draw, summary };
}

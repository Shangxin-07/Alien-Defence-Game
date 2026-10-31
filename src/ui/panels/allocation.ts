import { DUTIES, DUTY_NAMES, DUTY_SHORT, Duty, HOLD_NAMES, Hold, dutyClash, holdOf, jobDuty } from "../../campaign/allocation";
import type { Campaign } from "../../campaign/campaign";
import { Job, buildSkill, fitToWork } from "../../campaign/staff";
import { $, escape, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";
import { doing, fillJobs } from "../people";

/** Duties nobody can be given any more, because everyone is locked to something else. */
function allocGaps(campaign: Campaign): Duty[] {
  if (!campaign.staff.length) return [];
  return DUTIES.filter((d) => campaign.staff.every((p) => dutyClash(p, d)?.locked));
}

/** Unit allocation: which duties each person is meant for, and how firmly. */
export function allocationPanel(ui: Ui): PanelSpec {
  function summaryText(): string {
    const { campaign } = ui;
    const locked = campaign.staff.filter((p) => holdOf(p) === "lock").length;
    const preferred = campaign.staff.filter((p) => holdOf(p) === "prefer").length;
    const gaps = allocGaps(campaign).length;
    return [locked ? `${locked} locked` : "", preferred ? `${preferred} preferred` : "", gaps ? `${gaps} gap${gaps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "Everyone on any job";
  }

  function draw() {
    const { campaign } = ui;
    const gaps = allocGaps(campaign);
    $("allocGaps").innerHTML = gaps.map((d) => `<li>Nobody can be put on ${escape(DUTY_NAMES[d].toLowerCase())}: everyone is locked to something else.</li>`).join("");
    const table = $("allocTable");
    table.innerHTML = `<thead><tr><th>Person</th><th>Hold</th>${DUTIES.map((d) => `<th title="${escape(DUTY_NAMES[d])}">${escape(DUTY_SHORT[d])}</th>`).join("")}<th>At home</th></tr></thead><tbody></tbody><tfoot></tfoot>`;
    const body = table.querySelector("tbody")!;
    const change = (fn: () => void) => () => {
      fn();
      ui.persist();
      ui.refresh();
    };
    for (const p of campaign.staff) {
      const hold = holdOf(p);
      const tr = document.createElement("tr");
      tr.className = hold;
      const who = document.createElement("td");
      who.innerHTML = `<b></b> <span class="dim"></span><div class="meta"></div>`;
      who.querySelector("b")!.textContent = p.name;
      who.querySelector(".dim")!.textContent = p.role;
      who.querySelector(".meta")!.textContent = [doing(campaign, p), `HP ${p.health}/${p.stats.health}`, fitToWork(p) ? "" : "recovering", `build ${buildSkill(p).toFixed(2)}`, `research ${p.aptitude.toFixed(2)}`, `aim ${p.stats.accuracy}`]
        .filter(Boolean)
        .join(" · ");
      tr.appendChild(who);
      const holdCell = document.createElement("td");
      const holdSel = document.createElement("select");
      holdSel.setAttribute("aria-label", `How firmly ${p.name} is held`);
      for (const h of Object.keys(HOLD_NAMES) as Hold[]) holdSel.add(new Option(HOLD_NAMES[h], h));
      holdSel.value = hold;
      holdSel.addEventListener(
        "change",
        change(() => {
          const next = holdSel.value as Hold;
          // Holding someone with nothing ticked yet starts from what they're doing at home.
          const duties = p.duties?.length ? p.duties : [jobDuty(p.job) ?? "construction"];
          campaign.allocate(p.id, next === "any" ? [] : duties, next);
        }),
      );
      holdCell.appendChild(holdSel);
      tr.appendChild(holdCell);
      for (const d of DUTIES) {
        const td = document.createElement("td");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !!p.duties?.includes(d);
        box.setAttribute("aria-label", `${p.name}: ${DUTY_NAMES[d]}`);
        box.addEventListener(
          "change",
          change(() => {
            const duties = DUTIES.filter((x) => (x === d ? box.checked : !!p.duties?.includes(x)));
            campaign.allocate(p.id, duties, holdOf(p) === "any" ? "prefer" : holdOf(p));
          }),
        );
        td.appendChild(box);
        tr.appendChild(td);
      }
      const now = document.createElement("td");
      now.className = "now";
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", `${p.name}'s job at home`);
      fillJobs(sel, p);
      sel.disabled = !!p.away;
      sel.addEventListener("change", change(() => campaign.setJob(p.id, sel.value as Job)));
      now.appendChild(sel);
      tr.appendChild(now);
      body.appendChild(tr);
    }
    const foot = table.querySelector("tfoot")!;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>Assigned</td><td></td>${DUTIES.map((d) => {
      const n = campaign.staff.filter((p) => p.duties?.includes(d)).length;
      return `<td${gaps.includes(d) ? ' class="bad"' : ""}>${gaps.includes(d) ? "none" : n}</td>`;
    }).join("")}<td></td>`;
    foot.appendChild(tr);
  }

  return {
    modal: "allocModal",
    open: "openAlloc",
    close: "closeAlloc",
    draw,
    summary: () => summaryButton("openAlloc", "allocSummary", !!ui.campaign.staff.length, summaryText()),
  };
}

import { Job, buildSkill, fitToWork, project } from "../../campaign/staff";
import { $, addItem, choiceButton, escape, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";
import { doing, fillJobs } from "../people";

/** Staff & research: who works where, at what, and what the labs are on. */
export function staffPanel(ui: Ui): PanelSpec {
  function summaryText(): string {
    const { campaign } = ui;
    const id = campaign.research.active;
    if (!campaign.staff.length) return "Nobody yet";
    if (!campaign.bases.length) return `${campaign.staff.length} waiting for a base`;
    if (!id) return "No research project";
    const eta = campaign.researchEta();
    return `${project(id).name}${eta ? `, ~${eta} day${eta === 1 ? "" : "s"}` : ", stalled"}`;
  }

  function draw() {
    const { campaign } = ui;
    const r = campaign.research;
    const id = r.active;
    const rate = campaign.researchRate();
    const eta = campaign.researchEta();
    $("researchNow").innerHTML = id
      ? `<div class="row"><span>Working on</span><span>${escape(project(id).name)}</span></div>
         <div class="meter"><i style="width:${Math.min(100, ((r.progress[id] ?? 0) / project(id).points) * 100)}%"></i></div>
         <div class="row"><span>${rate.toFixed(1)} points a day</span><span>${eta ? `~${eta} days left` : campaign.bases.length ? "Nobody on research" : "Waiting for a base"}</span></div>`
      : `<p class="dim">Pick a project. Everyone on research works on it together.</p>`;
    const list = $("projectList");
    list.replaceChildren();
    for (const { project: p, blocker, progress } of campaign.projects()) {
      if (blocker === "Done") continue;
      const b = choiceButton(p.name, blocker ?? `${p.blurb} ${Math.floor(progress)}/${p.points}`, p.id === id);
      b.disabled = !!blocker;
      b.addEventListener("click", () => {
        campaign.setResearch(p.id === id ? null : p.id);
        ui.persist();
        ui.refresh();
      });
      addItem(list, b);
    }
    const people = $("staffList");
    people.replaceChildren();
    for (const p of campaign.staff) {
      const li = document.createElement("li");
      const where = campaign.bases.find((b) => b.id === p.base)?.name ?? "No base yet";
      const fit = fitToWork(p);
      const out = doing(campaign, p);
      li.innerHTML = `<div><b></b> <span class="dim"></span><div class="meta"></div></div><div class="pick"><select aria-label="Base"></select><select aria-label="Job"></select></div>`;
      li.querySelector("b")!.textContent = p.name;
      li.querySelector(".dim")!.textContent = p.role;
      const status = `${out ? ` · ${out}` : ""}${p.hunger ? ` · hungry ${p.hunger}d` : ""}${p.loyalty !== undefined ? ` · loyalty ${p.loyalty}` : ""}${p.dependants ? ` · family of ${p.dependants}` : ""}`;
      li.querySelector(".meta")!.textContent = `${where}${status} · HP ${p.health}/${p.stats.health}${fit ? "" : " · recovering"} · build ${buildSkill(p).toFixed(2)} · research ${p.aptitude.toFixed(2)}`;
      const [baseSel, sel] = li.querySelectorAll("select");
      baseSel.disabled = sel.disabled = !!p.away;
      baseSel.hidden = campaign.bases.length < 2;
      for (const b of campaign.bases) baseSel.add(new Option(b.name, String(b.id)));
      if (p.base !== null) baseSel.value = String(p.base);
      baseSel.addEventListener("change", () => {
        campaign.transfer(p.id, Number(baseSel.value));
        ui.persist();
        ui.refresh();
      });
      fillJobs(sel, p);
      sel.addEventListener("change", () => {
        campaign.setJob(p.id, sel.value as Job);
        ui.persist();
        ui.refresh();
      });
      people.appendChild(li);
    }
    $("doneBox").hidden = !r.done.length;
    $("doneList").innerHTML = r.done.map((d) => `<li><b>${escape(project(d).name)}</b> ${escape(project(d).result)}</li>`).join("");
  }

  return {
    modal: "staffModal",
    open: "openStaff",
    close: "closeStaff",
    draw,
    summary: () => summaryButton("openStaff", "staffSummary", !!ui.campaign.staff.length, summaryText()),
  };
}

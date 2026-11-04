import { PERKS } from "../../tactical/perks";
import { attributeLine, skillLine } from "../../tactical/attributes";
import { Job, buildSkill, fitToWork, project } from "../../campaign/staff";
import { recordLines, recordSummary } from "../../campaign/record";
import { $, addItem, choiceButton, escape, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";
import { doing, fillJobs } from "../people";

/** Staff & research: who works where, at what, and what the labs are on. */
export function staffPanel(ui: Ui): PanelSpec {
  function summaryText(): string {
    const waiting = ui.campaign.staff.filter((p) => p.perkOffer?.length).length;
    const rest = workText();
    return waiting ? `${waiting} perk${waiting === 1 ? "" : "s"} to pick · ${rest}` : rest;
  }

  function workText(): string {
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
      li.innerHTML = `<div><b></b> <span class="dim"></span><div class="meta"></div><div class="meta attrs"></div><div class="meta perks"></div><details class="record"><summary></summary><ul></ul></details></div><div class="pick"><select aria-label="Base"></select><select aria-label="Job"></select></div>`;
      if (p.attributes && p.skills) {
        const skills = skillLine(p.skills);
        li.querySelector(".attrs")!.textContent = `${attributeLine(p.attributes)}${skills ? ` · ${skills}` : ""}`;
        li.querySelector(".attrs")!.setAttribute("title", "Strength, Dexterity, Endurance, Perception, Intelligence, Willpower, Charisma. Everything else is worked out from these and their skills.");
      }
      const perks = li.querySelector(".perks") as HTMLElement;
      if (p.perks?.length) perks.textContent = `Perks: ${p.perks.map((k) => PERKS[k].name).join(", ")}`;
      if (p.perkOffer?.length) {
        const offer = document.createElement("div");
        offer.className = "perkOffer";
        offer.innerHTML = `<div class="dim">Picked up a knack. Choose one:</div>`;
        for (const k of p.perkOffer) {
          const b = choiceButton(PERKS[k].name, PERKS[k].does, false);
          b.addEventListener("click", () => {
            campaign.pickPerk(p.id, k);
            ui.persist();
            ui.refresh();
          });
          offer.appendChild(b);
        }
        perks.after(offer);
      }
      const rec = campaign.rec(p);
      li.querySelector(".record summary")!.textContent = `Service record: ${recordSummary(rec)}`;
      li.querySelector(".record ul")!.innerHTML = recordLines(rec, campaign.day).map((l) => `<li>${escape(l)}</li>`).join("");
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
    $("goneBox").hidden = !campaign.gone.length;
    $("goneList").innerHTML = [...campaign.gone]
      .reverse()
      .map(
        (g) =>
          `<li class="${g.died ? "fallen" : "left"}"><b>${escape(g.name)}</b> <span class="dim">${escape(g.role)} · ${escape(g.how)}, day ${g.day + 1}</span>
           <details class="record"><summary>${escape(recordSummary(g.record))}</summary><ul>${recordLines(g.record, g.day).map((l) => `<li>${escape(l)}</li>`).join("")}</ul></details></li>`,
      )
      .join("");
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

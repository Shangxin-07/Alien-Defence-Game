import { FAMILIES, KIND_NAMES, LEVELS, Project, leadsTo, needs, project } from "../../campaign/tech";
import { MATERIALS, SUPPLY_NAMES } from "../../campaign/scavenge";
import { art } from "../art";
import { $, escape, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";

type State = "done" | "active" | "ready" | "locked" | "planned";

const STATE_NAMES: Record<State, string> = {
  done: "Done",
  active: "Researching",
  ready: "Ready to start",
  locked: "Locked",
  planned: "Coming later",
};

/** Everything a project is waiting on, and everything waiting on it. */
const prereqs = (p: Project) => [...(p.allOf ?? []), ...(p.after ?? [])];

/**
 * The tech tree: every project in three families and nine levels, from what you have to what's
 * coming. Pick a project that's ready to set everyone on research to it.
 */
export function techPanel(ui: Ui): PanelSpec {
  function stateOf(p: Project, blocker: string | null): State {
    if (ui.campaign.research.done.includes(p.id)) return "done";
    if (ui.campaign.research.active === p.id) return "active";
    if (p.planned) return "planned";
    return blocker ? "locked" : "ready";
  }

  function draw() {
    const { campaign } = ui;
    const s = campaign.supplies;
    const id = campaign.research.active;
    const eta = campaign.researchEta();
    $("techNow").innerHTML = `
      <div class="row"><span>Researching</span><span>${id ? `${escape(project(id).name)}${eta ? `, ~${eta} day${eta === 1 ? "" : "s"}` : ", stalled"}` : "Nothing"}</span></div>
      <div class="row"><span>Labs working</span><span>${campaign.labs}</span></div>
      <div class="mats">${MATERIALS.map((m) => `<span><b>${s[m]}</b> ${escape(SUPPLY_NAMES[m].toLowerCase())}</span>`).join("")}</div>`;

    const tree = $("techTree");
    tree.replaceChildren();
    const rows = new Map(campaign.tree().map((r) => [r.project.id, r]));
    for (const f of FAMILIES) {
      const col = document.createElement("section");
      col.className = `techfamily ${f.id}`;
      col.innerHTML = `<h2>${escape(f.name)}</h2><p class="dim">${escape(f.blurb)}</p>`;
      for (const l of f.levels) {
        const lv = document.createElement("div");
        lv.className = "techlevel";
        lv.innerHTML = `<h3><span class="code">${l}</span> ${escape(LEVELS[l].name)}</h3><p class="dim">${escape(LEVELS[l].blurb)}</p>`;
        const list = document.createElement("div");
        list.className = "techcards";
        for (const r of rows.values()) {
          if (r.project.level !== l) continue;
          list.appendChild(card(r.project, r.blocker, r.progress));
        }
        lv.appendChild(list);
        col.appendChild(lv);
      }
      tree.appendChild(col);
    }
  }

  function card(p: Project, blocker: string | null, progress: number): HTMLElement {
    const state = stateOf(p, blocker);
    const b = document.createElement("button");
    b.type = "button";
    b.className = `techcard ${state}`;
    b.dataset.id = p.id;
    b.setAttribute("aria-pressed", String(state === "active"));
    b.disabled = state !== "ready" && state !== "active";
    const pic = art("tech", p.id);
    const status =
      state === "locked" ? blocker! : state === "active" || (state === "ready" && progress) ? `${Math.floor(progress)}/${p.points} points` : STATE_NAMES[state];
    const after = leadsTo(p.id).map((q) => q.name);
    b.innerHTML = `
      <span class="pic ${pic ? "" : "none"}">${pic ? `<img src="${pic}" alt="" loading="lazy" />` : `<i>${p.level}</i>`}</span>
      <span class="body">
        <span class="name"></span>
        <span class="kind"></span>
        <span class="gives"></span>
        <span class="needs"></span>
        <span class="status"></span>
        ${after.length ? `<span class="leads"></span>` : ""}
      </span>`;
    const set = (sel: string, text: string) => (b.querySelector(sel)!.textContent = text);
    set(".name", p.name);
    set(".kind", `${KIND_NAMES[p.kind]} · ${p.points} points`);
    set(".gives", p.gives);
    const need = needs(p);
    if (need === "Nothing") b.querySelector(".needs")!.remove();
    else set(".needs", need);
    set(".status", status);
    if (after.length) set(".leads", `Leads to ${after.join(", ")}`);
    b.title = state === "done" ? p.result : p.blurb;
    b.addEventListener("click", () => {
      ui.campaign.setResearch(state === "active" ? null : p.id);
      ui.persist();
      ui.refresh();
    });
    // Point at a project to light up what it needs and what it opens.
    const mark = (on: boolean) => {
      const tree = $("techTree");
      for (const id of prereqs(p)) tree.querySelector(`[data-id="${id}"]`)?.classList.toggle("pre", on);
      for (const q of leadsTo(p.id)) tree.querySelector(`[data-id="${q.id}"]`)?.classList.toggle("post", on);
    };
    for (const [ev, on] of [["mouseenter", true], ["mouseleave", false], ["focus", true], ["blur", false]] as const) b.addEventListener(ev, () => mark(on));
    return b;
  }

  function summary() {
    const { campaign } = ui;
    const done = campaign.research.done.length;
    const ready = campaign.projects().filter((r) => !r.blocker && r.project.id !== campaign.research.active).length;
    summaryButton("openTech", "techSummary", !!campaign.staff.length, `${done} learned${ready ? ` · ${ready} ready to start` : ""}`);
  }

  return { modal: "techModal", open: "openTech", close: "closeTech", draw, summary };
}

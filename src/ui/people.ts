import { DUTY_NAMES, Duty, dutyClash, dutyList, jobDuty } from "../campaign/allocation";
import { describeKit, noKit } from "../campaign/armoury";
import type { Campaign } from "../campaign/campaign";
import { runWhere } from "../campaign/scavenge";
import { JOB_NAMES, Job, Person, fitToWork } from "../campaign/staff";

/** What someone is out doing, or an empty string when they're home. */
export function doing(campaign: Campaign, p: Person): string {
  const run = campaign.runs.find((r) => r.id === p.away);
  if (!run) return "";
  return run.recruit ? "out recruiting" : run.search ? "out searching" : run.call ? "answering a call" : run.repair ? "fixing a car" : `out at ${runWhere(run)}`;
}

/** Fills a job picker for someone: jobs their lock rules out can be seen but not picked. */
export function fillJobs(sel: HTMLSelectElement, p: Person) {
  for (const job of Object.keys(JOB_NAMES) as Job[]) {
    const o = new Option(JOB_NAMES[job], job);
    const duty = jobDuty(job);
    const clash = duty && dutyClash(p, duty);
    if (clash?.locked) {
      o.disabled = true;
      o.textContent += " (locked out)";
    } else if (clash) o.textContent += " ⚠";
    sel.add(o);
  }
  sel.value = p.job;
}

/** A note for a team list on how this trip fits their allocation, and whether their lock rules it out. */
export function dutyNote(p: Person, duty: Duty): { text: string; locked: boolean } {
  const clash = dutyClash(p, duty);
  if (clash) return { text: ` · ${clash.locked ? "locked to" : "⚠ meant for"} ${dutyList(p)}`, locked: clash.locked };
  return { text: p.duties?.length ? ` · assigned to ${DUTY_NAMES[duty].toLowerCase()}` : "", locked: false };
}

/** Warnings on someone's kit, as one line for a team list. Empty when there's nothing to fix. */
export function kitWarn(campaign: Campaign, p: Person): string {
  const w = campaign.kitWarnings(p).filter((x) => !/as asked/.test(x));
  return w.length ? ` · ⚠ ${w.join("; ")}` : "";
}

export interface TeamPick {
  /** Who's ticked. People who can't go are taken out of it. */
  team: Set<number>;
  /** The duty the trip counts as, for allocation warnings and locks. */
  duty: Duty;
  /** Most people who can be ticked. */
  max: number;
  /** Show health and kit, for trips that might end in a fight. */
  showKit: boolean;
  /** Called after a box is ticked or cleared. */
  changed(): void;
}

/** Fills a "who goes" list with a tick box for everyone, greying out anyone who can't go. */
export function fillTeam(list: HTMLElement, campaign: Campaign, pick: TeamPick) {
  const { team } = pick;
  list.replaceChildren();
  for (const p of campaign.staff) {
    const note = dutyNote(p, pick.duty);
    const free = campaign.canScavenge(p) && !note.locked;
    if (!free) team.delete(p.id);
    const li = document.createElement("li");
    li.innerHTML = `<label><input type="checkbox" /><span><b></b> <span class="dim"></span><span class="meta"></span></span></label>`;
    const box = li.querySelector("input")!;
    box.checked = team.has(p.id);
    box.disabled = !free || (!box.checked && team.size >= pick.max);
    li.querySelector("b")!.textContent = p.name;
    li.querySelector(".dim")!.textContent = p.role;
    const state = p.away ? "already out" : !fitToWork(p) ? "too hurt" : `${JOB_NAMES[p.job].toLowerCase()} now`;
    const kit = pick.showKit ? ` · HP ${p.health}/${p.stats.health} · ${describeKit(p.kit ?? noKit())}${kitWarn(campaign, p)}` : "";
    li.querySelector(".meta")!.textContent = ` · ${state}${note.text}${kit}`;
    box.addEventListener("change", () => {
      if (box.checked) team.add(p.id);
      else team.delete(p.id);
      pick.changed();
    });
    list.appendChild(li);
  }
}

/** Names of the people on a team, for a list of who's out. */
export const teamNames = (campaign: Campaign, team: number[]) => team.map((id) => campaign.staff.find((p) => p.id === id)?.name ?? "?").join(", ");

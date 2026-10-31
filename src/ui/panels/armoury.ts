import { ARMOURS, GEAR, GUNS, GearId, GunId, MAX_CLIPS, MEDIKIT_COST, Request, describeKit, noKit } from "../../campaign/armoury";
import { $, escape, summaryButton } from "../dom";
import type { PanelSpec, Ui } from "../panel";

type Flag = "armour" | "baton" | "medkit";

/** The armoury: what's on the shelves and what each person asks to carry. */
export function armouryPanel(ui: Ui): PanelSpec {
  function summary() {
    const { campaign } = ui;
    const warned = campaign.staff.filter((p) => campaign.kitWarnings(p).some((w) => !/as asked/.test(w))).length;
    const guns = GUNS.reduce((n, g) => n + campaign.armoury[g], 0);
    const text = [`${campaign.supplies.ammo} clips`, guns ? `${guns} spare gun${guns === 1 ? "" : "s"}` : "", warned ? `${warned} with problems` : ""].filter(Boolean).join(" · ");
    const unarmed = campaign.staff.some((p) => campaign.kitWarnings(p).some((w) => /No gun|No ammo/.test(w)));
    summaryButton("openArmoury", "armourySummary", !!campaign.staff.length, text, unarmed);
  }

  function draw() {
    const { campaign } = ui;
    const a = campaign.armoury;
    const s = campaign.supplies;
    const shelf = (ids: readonly GearId[]) => ids.filter((g) => a[g]).map((g) => `${a[g]} ${GEAR[g].name.toLowerCase()}`).join(", ") || "none";
    $("storeRows").innerHTML = `
      <div class="row"><span>Spare clips</span><span${s.ammo ? "" : ' class="bad"'}>${s.ammo}${campaign.looseClips > 0.01 ? `, and loose rounds worth ${Math.round(campaign.looseClips * 100)}% of a clip` : ""}</span></div>
      <div class="row"><span>Guns</span><span>${escape(shelf(GUNS))}</span></div>
      <div class="row"><span>Armour</span><span>${escape(shelf(ARMOURS))}</span></div>
      <div class="row"><span>Kit</span><span>${escape(shelf(["stunBaton", "medkit"]))}</span></div>`;
    const reason = campaign.checkMedikit();
    ($("makeMedikit") as HTMLButtonElement).disabled = !!reason;
    $("medikitOdds").textContent = reason ?? `${MEDIKIT_COST} medicine of your ${s.medicine}`;
    $("armouryWarnings").innerHTML = campaign.armouryWarnings().map((w) => `<li>${escape(w)}</li>`).join("");
    const list = $("loadoutList");
    list.replaceChildren();
    for (const p of campaign.staff) {
      const r = campaign.requestOf(p);
      const li = document.createElement("li");
      li.innerHTML = `<div><b></b> <span class="dim"></span><div class="meta"></div><div class="warn"></div></div>
        <div class="pick">
          <select aria-label="Gun"></select>
          <select aria-label="Spare clips"></select>
          <label><input type="checkbox" data-k="armour" /> Armour</label>
          <label><input type="checkbox" data-k="baton" /> Baton</label>
          <label><input type="checkbox" data-k="medkit" /> Medikit</label>
          <button type="button" class="quiet">Default</button>
        </div>`;
      li.querySelector("b")!.textContent = p.name;
      li.querySelector(".dim")!.textContent = p.role;
      li.querySelector(".meta")!.textContent = `${p.away ? "Out, carrying " : "Carries "}${describeKit(p.kit ?? noKit())}`;
      li.querySelector(".warn")!.textContent = campaign.kitWarnings(p).join(" · ");
      const [gunSel, clipSel] = li.querySelectorAll("select");
      const guns: [Request["gun"], string][] = [["best", "Best gun going"], ...GUNS.map((g): [GunId, string] => [g, GEAR[g].name]), ["none", "No gun"]];
      for (const [v, label] of guns) gunSel.add(new Option(label, v));
      gunSel.value = r.gun;
      for (let n = 0; n <= MAX_CLIPS; n++) clipSel.add(new Option(`${n} spare clip${n === 1 ? "" : "s"}`, String(n)));
      clipSel.value = String(r.clips);
      const boxes = li.querySelectorAll<HTMLInputElement>("input[data-k]");
      for (const b of boxes) b.checked = r[b.dataset.k as Flag];
      const change = () => {
        const next: Request = { ...r, gun: gunSel.value as Request["gun"], clips: Number(clipSel.value) };
        for (const b of boxes) next[b.dataset.k as Flag] = b.checked;
        campaign.setRequest(p.id, next);
        ui.persist();
        ui.refresh();
      };
      gunSel.addEventListener("change", change);
      clipSel.addEventListener("change", change);
      for (const b of boxes) b.addEventListener("change", change);
      const reset = li.querySelector("button")!;
      reset.hidden = !p.request;
      reset.title = "Back to the usual loadout for their role";
      reset.addEventListener("click", () => {
        campaign.resetRequest(p.id);
        ui.persist();
        ui.refresh();
      });
      list.appendChild(li);
    }
  }

  $("makeMedikit").addEventListener("click", () => {
    ui.campaign.makeMedikit();
    ui.persist();
    ui.refresh();
  });

  return { modal: "armouryModal", open: "openArmoury", close: "closeArmoury", draw, summary };
}

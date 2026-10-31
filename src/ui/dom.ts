/** Small DOM helpers shared by the geoscape screen and its panels. */

export const $ = (id: string) => document.getElementById(id)!;

const css = getComputedStyle(document.documentElement);
/** A colour or other value from the CSS custom properties, such as `--amber`. */
export const token = (name: string) => css.getPropertyValue(name).trim();

export const escape = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

let toastTimer = 0;
/** A short message across the bottom of the screen, for `ms` milliseconds. `bad` shows it as a warning. */
export function toast(text: string, bad = false, ms = 3200) {
  const t = $("toast");
  t.textContent = text;
  t.className = bad ? "show bad" : "show";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = ""), ms);
}

/** A button with a name and a line of detail, for pick lists. `pressed` marks the one picked. */
export function choiceButton(name: string, meta: string, pressed?: boolean): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
  b.innerHTML = `<span class="name"></span><span class="meta"></span>`;
  b.querySelector(".name")!.textContent = name;
  b.querySelector(".meta")!.textContent = meta;
  return b;
}

/** Puts an element into a new list item and adds it to the list. */
export function addItem(list: HTMLElement, child: HTMLElement): HTMLLIElement {
  const li = document.createElement("li");
  li.appendChild(child);
  list.appendChild(li);
  return li;
}

/** Fills a segmented control: one button per option, the current one pressed. */
export function segmented<T>(box: HTMLElement, options: readonly { value: T; label: string }[], current: T, pick: (value: T) => void) {
  box.replaceChildren();
  for (const { value, label } of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(value === current));
    b.addEventListener("click", () => pick(value));
    box.appendChild(b);
  }
}

/** Options for 1 to `max` days. */
export const dayOptions = (max: number) => Array.from({ length: max }, (_, i) => ({ value: i + 1, label: `${i + 1} day${i === 0 ? "" : "s"}` }));

/** Sets a send button and the line beside it. Sending people off their allocation needs "anyway". */
export function sendState(button: string, odds: string, label: string, reason: string | null, text: string, warnings: string[]) {
  const b = $(button) as HTMLButtonElement;
  b.disabled = !!reason;
  b.textContent = !reason && warnings.length ? `${label} anyway` : label;
  $(odds).textContent = reason ?? (warnings.length ? `⚠ ${warnings.join("; ")}. ${text}` : text);
  $(odds).className = !reason && warnings.length ? "warnline" : "dim";
}

/** Shows the button that opens a panel, with its one-line summary. */
export function summaryButton(button: string, summary: string, shown: boolean, text: string, bad = false) {
  $(button).hidden = !shown;
  $(summary).textContent = text;
  $(summary).className = bad ? "meta bad" : "meta";
}

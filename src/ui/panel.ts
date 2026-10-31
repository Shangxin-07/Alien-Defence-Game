import type { Campaign } from "../campaign/campaign";
import { $ } from "./dom";

/** What a panel needs from the geoscape screen around it. */
export interface Ui {
  /** The campaign being played. Read it each time: a new campaign replaces it. */
  readonly campaign: Campaign;
  /** Saves the campaign. Call after every change to it. */
  persist(): void;
  /** Redraws the command panel, the survey and any open panel. */
  refresh(): void;
  toast(text: string): void;
}

export interface PanelSpec {
  /** Ids in index.html: the modal, the button on the command panel that opens it, and its Close button. */
  modal: string;
  open: string;
  close: string;
  /** Redraws the panel's contents. Only called while it's open. */
  draw(): void;
  /** Updates its button on the command panel: whether it shows, and the line beside it. */
  summary(): void;
}

/**
 * A modal opened from a button on the command panel, such as Staff or Scavenging. To add one, give it
 * markup in index.html, write a `PanelSpec` for it under `ui/panels/`, and add it to the list in main.ts.
 */
export class Panel {
  private readonly box: HTMLElement;

  constructor(private readonly spec: PanelSpec) {
    this.box = $(spec.modal);
    $(spec.open).addEventListener("click", () => this.show());
    $(spec.close).addEventListener("click", () => this.hide());
    // A click on the backdrop closes it too.
    this.box.addEventListener("click", (e) => {
      if (e.target === this.box) this.hide();
    });
  }

  get isOpen(): boolean {
    return !this.box.hidden;
  }

  show() {
    this.spec.draw();
    this.box.hidden = false;
  }

  hide() {
    this.box.hidden = true;
  }

  /** Redraws it if it's open, and its summary either way. */
  refresh() {
    this.spec.summary();
    if (this.isOpen) this.spec.draw();
  }
}

// Initialization overlay (Mini §3.3): stepped progress + per-asset status + retry.

import { brandIcon } from "./brand";

type AssetState = "todo" | "busy" | "done" | "failed";

interface Asset {
  id: string;
  label: string;
  critical: boolean;
  runner: () => Promise<void>;
  state: AssetState;
  detail?: string;
  error?: string;
}

export class BootstrapOverlay {
  readonly el: HTMLDivElement;
  private assets: Asset[] = [];
  private barFill!: HTMLElement;
  private pct!: HTMLElement;
  private listEl!: HTMLElement;
  private onDone: (() => void) | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "overlay-root";
    this.el.innerHTML = `
      <div class="overlay" role="dialog" aria-label="Initializing Platform Builder">
        <div class="brand-col"></div>
        <div class="msg">Please wait, initializing&hellip;</div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <div class="pct">0%</div>
        <div class="assets" aria-live="polite"></div>
      </div>`;
    const brandCol = this.el.querySelector(".brand-col") as HTMLElement;
    const icon = brandIcon("icon-lg");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = "QuantumCoin";
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = "Platform Builder";
    brandCol.append(icon, name, sub);

    this.barFill = this.el.querySelector(".bar > i") as HTMLElement;
    this.pct = this.el.querySelector(".pct") as HTMLElement;
    this.listEl = this.el.querySelector(".assets") as HTMLElement;
  }

  addAsset(id: string, label: string, runner: () => Promise<void>, critical = true): void {
    this.assets.push({ id, label, critical, runner, state: "todo" });
  }

  setDetail(id: string, detail: string): void {
    const a = this.assets.find((x) => x.id === id);
    if (a) {
      a.detail = detail;
      this.renderList();
    }
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.renderList();
  }

  async run(onDone: () => void): Promise<void> {
    this.onDone = onDone;
    await Promise.all(this.assets.map((a) => this.runOne(a)));
    this.maybeDismiss();
  }

  private async runOne(a: Asset): Promise<void> {
    a.state = "busy";
    a.error = undefined;
    this.renderList();
    try {
      await a.runner();
      a.state = "done";
    } catch (err) {
      a.state = "failed";
      a.error = err instanceof Error ? err.message : String(err);
    }
    this.renderList();
    this.updateProgress();
  }

  private updateProgress(): void {
    const total = this.assets.length;
    const completed = this.assets.filter((a) => a.state === "done").length;
    const settled = this.assets.filter((a) => a.state === "done" || a.state === "failed").length;
    const percent = Math.round((settled / total) * 100);
    this.barFill.style.width = `${percent}%`;
    this.pct.textContent = `${percent}%`;
    this.el.querySelector(".bar")?.setAttribute("aria-valuenow", String(percent));
    void completed;
  }

  private maybeDismiss(): void {
    const criticalOk = this.assets.filter((a) => a.critical).every((a) => a.state === "done");
    const nonCriticalSettled = this.assets
      .filter((a) => !a.critical)
      .every((a) => a.state === "done" || a.state === "failed");
    if (criticalOk && nonCriticalSettled) {
      this.el.remove();
      this.onDone?.();
    }
  }

  private renderList(): void {
    this.listEl.innerHTML = "";
    for (const a of this.assets) {
      const row = document.createElement("div");
      row.className = `asset ${a.state}`;
      const s = document.createElement("span");
      s.className = "s";
      s.innerHTML =
        a.state === "done" ? "\u2713" :
        a.state === "busy" ? '<span class="spin">\u21BB</span>' :
        a.state === "failed" ? "\u2715" : "\u25CB";
      row.appendChild(s);
      row.appendChild(document.createTextNode(" " + a.label));

      if (a.state === "busy" && a.detail) {
        const d = document.createElement("span");
        d.className = "detail";
        d.textContent = a.detail;
        row.appendChild(d);
      }
      if (a.state === "failed") {
        const retry = document.createElement("button");
        retry.className = "btn ghost retry";
        retry.textContent = "Retry";
        retry.addEventListener("click", async () => {
          await this.runOne(a);
          this.maybeDismiss();
        });
        row.appendChild(retry);
        if (a.error) {
          const e = document.createElement("div");
          e.className = "detail";
          e.style.flexBasis = "100%";
          e.style.marginLeft = "28px";
          e.textContent = a.error;
          row.appendChild(e);
        }
      }
      this.listEl.appendChild(row);
    }
    this.updateProgress();
  }
}

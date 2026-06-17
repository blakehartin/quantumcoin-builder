// Terminal dock (Mini §4.1): compilation log, ABI messages, download confirmations.

import type { EditorDiagnostic } from "../compiler/types";

export type LogKind = "info" | "success" | "warning" | "error";

export class Terminal {
  readonly el: HTMLElement;
  private body!: HTMLDivElement;
  private onDiagnosticClick?: (d: EditorDiagnostic) => void;

  constructor() {
    this.el = document.createElement("section");
    this.el.className = "terminal";
    this.el.innerHTML = `
      <div class="panel-head"><span>Terminal</span><span class="muted">Compilation output</span></div>
      <div class="term-body" aria-live="polite"></div>`;
    this.body = this.el.querySelector(".term-body") as HTMLDivElement;
  }

  setDiagnosticClickHandler(fn: (d: EditorDiagnostic) => void): void {
    this.onDiagnosticClick = fn;
  }

  private timestamp(): string {
    return new Date().toLocaleTimeString([], { hour12: false });
  }

  log(message: string, kind: LogKind = "info"): void {
    const line = document.createElement("div");
    line.className = "l" + (kind === "error" ? " errc" : kind === "warning" ? " warnc" : kind === "success" ? " ok" : "");
    line.innerHTML = `<span class="ts">${this.timestamp()}</span>  ${escapeHtml(message)}`;
    this.body.appendChild(line);
    this.scrollToEnd();
  }

  /** Clickable diagnostic row that jumps the editor to the reported line (§5.6). */
  logDiagnostic(d: EditorDiagnostic): void {
    const line = document.createElement("div");
    line.className = "l clickable " + (d.severity === "error" ? "errc" : "warnc");
    const loc = `${d.file}:${d.line}${d.column ? ":" + d.column : ""}`;
    line.innerHTML = `<span class="ts">${this.timestamp()}</span>  ${escapeHtml(loc)}: ${d.severity}: ${escapeHtml(d.message)}`;
    line.addEventListener("click", () => this.onDiagnosticClick?.(d));
    this.body.appendChild(line);
    this.scrollToEnd();
  }

  clear(): void {
    this.body.innerHTML = "";
  }

  private scrollToEnd(): void {
    this.body.scrollTop = this.body.scrollHeight;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

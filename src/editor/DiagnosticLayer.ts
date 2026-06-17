import type { EditorDiagnostic, Severity } from "../compiler/types";

/** Full-line row backgrounds for errors/warnings + the active line (Mini §5.4, §5.6). */
export class DiagnosticLayer {
  readonly el: HTMLDivElement;
  private lineHeight: number;

  constructor(lineHeight: number) {
    this.el = document.createElement("div");
    this.el.className = "qce-layer qce-rows";
    this.el.setAttribute("aria-hidden", "true");
    this.lineHeight = lineHeight;
  }

  /** Highest severity per line (error wins over warning). */
  static byLine(diags: EditorDiagnostic[]): Map<number, Severity> {
    const map = new Map<number, Severity>();
    for (const d of diags) {
      const cur = map.get(d.line);
      if (cur === "error") continue;
      map.set(d.line, d.severity);
    }
    return map;
  }

  render(lineCount: number, activeLine: number, severities: Map<number, Severity>): void {
    let html = "";
    for (let ln = 1; ln <= lineCount; ln++) {
      const sev = severities.get(ln);
      const classes = ["row"];
      if (ln === activeLine) classes.push("active");
      if (sev) classes.push(sev === "error" ? "err" : "warn");
      html += `<div class="${classes.join(" ")}" style="height:${this.lineHeight}px"></div>`;
    }
    this.el.innerHTML = html;
  }

  setTransform(scrollLeft: number, scrollTop: number): void {
    this.el.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  }
}

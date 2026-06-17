import type { Severity } from "../compiler/types";

export interface GutterMark {
  severity: Severity;
  message: string;
}

/** Line-number gutter with per-line diagnostic icons (Mini §5.3, §5.6). */
export class Gutter {
  readonly el: HTMLDivElement;
  private inner: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "qce-gutter";
    this.inner = document.createElement("div");
    this.inner.className = "qce-gutter-inner";
    this.el.appendChild(this.inner);
  }

  render(lineCount: number, activeLine: number, marks: Map<number, GutterMark>): void {
    let html = "";
    for (let ln = 1; ln <= lineCount; ln++) {
      const mark = marks.get(ln);
      const classes = ["ln"];
      if (ln === activeLine) classes.push("active");
      if (mark) classes.push(mark.severity === "error" ? "err" : "warn");
      const icon = mark
        ? `<span class="mark" title="${escapeAttr(mark.message)}">${mark.severity === "error" ? "\u2715" : "\u26A0"}</span>`
        : "";
      html += `<div class="${classes.join(" ")}">${icon}${ln}</div>`;
    }
    this.inner.innerHTML = html;
  }

  setScrollTop(scrollTop: number): void {
    this.inner.style.transform = `translateY(${-scrollTop}px)`;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

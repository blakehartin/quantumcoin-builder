import type { EditorDiagnostic, Severity } from "../compiler/types";

const PAD_TOP = 8; // matches .qce-input / .qce-highlight padding
const PAD_LEFT = 14;

export interface Marker {
  line: number; // 1-based
  startCol: number; // 1-based
  len: number; // length in characters (monospace cells)
  severity: Severity;
}

/**
 * Column-precise diagnostic markers (Mini §5.6). Draws a bold underline bar at
 * the exact `column..endColumn` range of each error/warning so the location
 * inside the line is obvious — complementing the full-line row highlight.
 */
export class MarkerLayer {
  readonly el: HTMLDivElement;
  private lineHeight: number;

  constructor(lineHeight: number) {
    this.el = document.createElement("div");
    this.el.className = "qce-layer qce-markers";
    this.el.setAttribute("aria-hidden", "true");
    this.lineHeight = lineHeight;
  }

  /** Build markers from diagnostics, using line text for end-of-line fallback. */
  static fromDiagnostics(diags: EditorDiagnostic[], source: string): Marker[] {
    const lines = source.split("\n");
    const markers: Marker[] = [];
    for (const d of diags) {
      const startCol = d.column && d.column > 0 ? d.column : 1;
      const sameLineEnd =
        d.endColumn && (d.endLine ?? d.line) === d.line && d.endColumn > startCol;
      let len: number;
      if (sameLineEnd) {
        len = d.endColumn! - startCol;
      } else {
        const lineLen = lines[d.line - 1]?.length ?? startCol;
        len = Math.max(1, lineLen - (startCol - 1));
      }
      markers.push({ line: d.line, startCol, len, severity: d.severity });
    }
    return markers;
  }

  render(markers: Marker[]): void {
    let html = "";
    for (const m of markers) {
      const top = PAD_TOP + (m.line - 1) * this.lineHeight;
      const left = `calc(${PAD_LEFT}px + ${m.startCol - 1}ch)`;
      const width = `calc(${Math.max(1, m.len)}ch)`;
      const cls = m.severity === "error" ? "mk err" : "mk warn";
      html += `<div class="${cls}" style="top:${top}px;height:${this.lineHeight}px;left:${left};width:${width}"></div>`;
    }
    this.el.innerHTML = html;
  }

  setTransform(scrollLeft: number, scrollTop: number): void {
    this.el.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  }
}

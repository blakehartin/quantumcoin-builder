import { Document } from "./Document";
import { HighlightLayer } from "./HighlightLayer";
import { Gutter, type GutterMark } from "./Gutter";
import { DiagnosticLayer } from "./DiagnosticLayer";
import type { EditorDiagnostic } from "../compiler/types";

export interface PragmaStatus {
  ok: boolean;
  found: string | null; // raw version found, or null if missing
  message: string;
}

export interface QCEditorOptions {
  tabSize?: number;
  onChange?: (path: string, value: string) => void;
  onPragmaChange?: (status: PragmaStatus) => void;
}

const PRAGMA_RE = /pragma\s+solidity\s+([^;]+);/;

/**
 * Best-effort check that a pragma version constraint is satisfiable by the only
 * supported compiler, Solidity 0.7.6 (the QuantumCoin "7.6" build). The compiler
 * itself remains the source of truth; this just gives a friendly pre-compile hint.
 */
export function pragmaAllows076(raw: string): boolean {
  const v = raw.replace(/\s+/g, " ").trim();
  // Range form: >=0.7.0 <0.8.0 (and similar) — accept if it brackets 0.7.x.
  if (/>=?\s*0\.7(\.\d+)?/.test(v) && /<\s*0\.8(\.0)?/.test(v)) return true;
  const m = v.match(/^([\^~]?)0\.7(?:\.(\d+))?$/);
  if (!m) return false;
  const op = m[1];
  const patch = m[2] === undefined ? undefined : Number(m[2]);
  if (patch === undefined) return true; // "0.7" / "^0.7" / "~0.7" -> includes 0.7.6
  if (op === "^" || op === "~") return patch <= 6; // [0.7.patch, 0.8.0) contains 0.7.6
  return patch === 6; // exact pin
}
const LINE_H = 20; // matches --editor-line-h

/**
 * In-house code editor (Mini §5). Textarea + highlight-backdrop architecture,
 * Solidity 7.6 syntax coloring, diagnostic rows, gutter icons, pragma guard,
 * find/replace, go-to-line. 100% first-party — no third-party editor libraries.
 */
export class QCEditor {
  private opts: QCEditorOptions;
  private doc = new Document("");
  private path = "untitled.sol";

  private root!: HTMLDivElement;
  private wrap!: HTMLDivElement;
  private textarea!: HTMLTextAreaElement;
  private banner!: HTMLDivElement;

  private highlight = new HighlightLayer();
  private gutter = new Gutter();
  private rows = new DiagnosticLayer(LINE_H);

  private diagnostics: EditorDiagnostic[] = [];
  private retokenizeTimer: number | null = null;
  private tabSize: number;

  constructor(opts: QCEditorOptions = {}) {
    this.opts = opts;
    this.tabSize = opts.tabSize ?? 4;
  }

  mount(container: HTMLElement): void {
    this.root = document.createElement("div");
    this.root.className = "editor-area";

    // Pragma guard banner (Mini §5.4)
    this.banner = document.createElement("div");
    this.banner.className = "pragma-banner";
    this.root.appendChild(this.banner);

    const editor = document.createElement("div");
    editor.className = "qceditor";

    this.wrap = document.createElement("div");
    this.wrap.className = "qce-wrap";

    this.textarea = document.createElement("textarea");
    this.textarea.className = "qce-input";
    this.textarea.spellcheck = false;
    this.textarea.wrap = "off";
    this.textarea.setAttribute("role", "textbox");
    this.textarea.setAttribute("aria-multiline", "true");
    this.textarea.setAttribute("aria-label", "Solidity source editor");
    this.textarea.setAttribute("autocapitalize", "off");
    this.textarea.setAttribute("autocomplete", "off");

    this.wrap.appendChild(this.rows.el);
    this.wrap.appendChild(this.highlight.el);
    this.wrap.appendChild(this.textarea);

    editor.appendChild(this.gutter.el);
    editor.appendChild(this.wrap);
    this.root.appendChild(editor);
    container.appendChild(this.root);

    this.bindEvents();
    this.refreshAll();
  }

  private bindEvents(): void {
    this.textarea.addEventListener("input", () => {
      this.doc.setValue(this.textarea.value);
      // Clear diagnostics on edit until next compile (Mini §5.6 default).
      if (this.diagnostics.length) this.diagnostics = [];
      this.scheduleRetokenize();
      this.opts.onChange?.(this.path, this.doc.getValue());
      this.checkPragma();
    });

    this.textarea.addEventListener("scroll", () => this.syncScroll());
    this.textarea.addEventListener("keyup", () => this.updateActiveLine());
    this.textarea.addEventListener("click", () => this.updateActiveLine());
    this.textarea.addEventListener("keydown", (e) => this.onKeyDown(e));

    const ro = new ResizeObserver(() => this.refreshLayers());
    ro.observe(this.wrap);
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Tab inserts spaces (Mini §5.4)
    if (e.key === "Tab") {
      e.preventDefault();
      this.insertText(" ".repeat(this.tabSize));
      return;
    }
    // Smart indent after "{"
    if (e.key === "Enter") {
      const { selectionStart } = this.textarea;
      const value = this.textarea.value;
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const indentMatch = currentLine.match(/^[ \t]*/);
      let indent = indentMatch ? indentMatch[0] : "";
      const prevChar = value[selectionStart - 1];
      if (prevChar === "{") indent += " ".repeat(this.tabSize);
      if (indent) {
        e.preventDefault();
        this.insertText("\n" + indent);
      }
    }
    // Go to line
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
      e.preventDefault();
      this.openGoToLine();
    }
    // Find
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      this.openFindReplace(false);
    }
    // Replace
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
      e.preventDefault();
      this.openFindReplace(true);
    }
  }

  private insertText(text: string): void {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    this.textarea.setRangeText(text, start, end, "end");
    this.textarea.dispatchEvent(new Event("input"));
  }

  // ---- Document API ----

  setDocument(path: string, content: string): void {
    this.path = path;
    this.doc.setValue(content);
    this.textarea.value = this.doc.getValue();
    this.diagnostics = [];
    this.refreshAll();
    this.checkPragma();
  }

  getValue(): string {
    return this.doc.getValue();
  }

  getPath(): string {
    return this.path;
  }

  focus(): void {
    this.textarea.focus();
  }

  // ---- Diagnostics (Mini §5.6) ----

  setDiagnostics(diags: EditorDiagnostic[]): void {
    this.diagnostics = diags.filter((d) => d.file === this.path);
    this.refreshLayers();
    this.gutterRender();
  }

  gotoLine(line: number, flash = false): void {
    const offset = this.doc.lineStartOffset(line);
    this.textarea.focus();
    this.textarea.setSelectionRange(offset, offset);
    const targetTop = (line - 1) * LINE_H - this.wrap.clientHeight / 2;
    this.textarea.scrollTop = Math.max(0, targetTop);
    this.syncScroll();
    this.updateActiveLine();
    if (flash) this.flashLine(line);
  }

  private flashLine(line: number): void {
    const idx = line - 1;
    const rowEls = this.rows.el.children;
    const el = rowEls[idx] as HTMLElement | undefined;
    if (!el) return;
    el.style.transition = "background-color .15s";
    const prev = el.style.backgroundColor;
    el.style.backgroundColor = "rgba(34,211,238,0.25)";
    setTimeout(() => {
      el.style.backgroundColor = prev;
    }, 1000);
  }

  // ---- Pragma guard (Mini §5.4) ----

  getPragmaStatus(): PragmaStatus {
    const m = this.doc.getValue().match(PRAGMA_RE);
    if (!m) {
      return { ok: false, found: null, message: "Missing `pragma solidity 0.7.6;`" };
    }
    const version = m[1]!.trim();
    if (!pragmaAllows076(version)) {
      return {
        ok: false,
        found: version,
        message: `Solidity \`${version}\` is not supported — this builder compiles 0.7.6 only`,
      };
    }
    return { ok: true, found: version, message: "" };
  }

  private checkPragma(): void {
    const status = this.getPragmaStatus();
    if (status.ok) {
      this.banner.classList.remove("show");
      this.banner.textContent = "";
    } else {
      this.banner.classList.add("show");
      this.banner.innerHTML = `\u26A0 ${escapeHtml(status.message)}. Compile is blocked until the source uses <span class="mono">pragma solidity 0.7.6;</span>`;
    }
    this.opts.onPragmaChange?.(status);
  }

  // ---- Rendering ----

  private scheduleRetokenize(): void {
    if (this.retokenizeTimer != null) clearTimeout(this.retokenizeTimer);
    this.retokenizeTimer = window.setTimeout(() => {
      this.highlight.render(this.doc.getValue());
      this.refreshLayers();
      this.gutterRender();
    }, 120);
  }

  private refreshAll(): void {
    this.highlight.render(this.doc.getValue());
    this.refreshLayers();
    this.gutterRender();
    this.syncScroll();
  }

  private gutterRender(): void {
    const marks = new Map<number, GutterMark>();
    for (const d of this.diagnostics) {
      const existing = marks.get(d.line);
      if (existing?.severity === "error") continue;
      marks.set(d.line, { severity: d.severity, message: d.message });
    }
    this.gutter.render(this.doc.lineCount, this.activeLine(), marks);
    this.gutter.setScrollTop(this.textarea.scrollTop);
  }

  private refreshLayers(): void {
    const severities = DiagnosticLayer.byLine(this.diagnostics);
    this.rows.render(this.doc.lineCount, this.activeLine(), severities);
    const width = Math.max(this.textarea.scrollWidth, this.wrap.clientWidth);
    this.rows.el.style.width = `${width}px`;
    this.syncScroll();
  }

  private updateActiveLine(): void {
    this.rows.render(this.doc.lineCount, this.activeLine(), DiagnosticLayer.byLine(this.diagnostics));
    this.rows.el.style.width = `${Math.max(this.textarea.scrollWidth, this.wrap.clientWidth)}px`;
    this.gutterRender();
    this.syncScroll();
  }

  private activeLine(): number {
    return this.doc.offsetToLineCol(this.textarea.selectionStart).line;
  }

  private syncScroll(): void {
    const { scrollLeft, scrollTop } = this.textarea;
    this.highlight.setTransform(scrollLeft, scrollTop);
    this.rows.setTransform(scrollLeft, scrollTop);
    this.gutter.setScrollTop(scrollTop);
  }

  // ---- Edit menu hooks ----

  undo(): void {
    this.textarea.focus();
    document.execCommand("undo");
    this.afterExternalEdit();
  }
  redo(): void {
    this.textarea.focus();
    document.execCommand("redo");
    this.afterExternalEdit();
  }
  private afterExternalEdit(): void {
    this.doc.setValue(this.textarea.value);
    this.refreshAll();
    this.opts.onChange?.(this.path, this.doc.getValue());
    this.checkPragma();
  }

  // ---- Find / Replace + Go to line (Mini §5.4) ----

  openGoToLine(): void {
    const modal = new EditorModal("Go to line");
    const input = modal.addText("Line number", "");
    input.type = "number";
    modal.addPrimary("Go", () => {
      const n = parseInt(input.value, 10);
      if (!Number.isNaN(n)) this.gotoLine(Math.max(1, n), true);
      modal.close();
    });
    modal.open();
  }

  openFindReplace(withReplace: boolean): void {
    const modal = new EditorModal(withReplace ? "Find and Replace" : "Find");
    const find = modal.addText("Find", this.selectedText());
    const replace = withReplace ? modal.addText("Replace", "") : null;
    const matchCase = modal.addCheckbox("Match case");

    const doFind = () => {
      const term = find.value;
      if (!term) return;
      const hay = matchCase.checked ? this.textarea.value : this.textarea.value.toLowerCase();
      const needle = matchCase.checked ? term : term.toLowerCase();
      const from = this.textarea.selectionEnd;
      let idx = hay.indexOf(needle, from);
      if (idx === -1) idx = hay.indexOf(needle, 0); // wrap
      if (idx !== -1) {
        this.textarea.focus();
        this.textarea.setSelectionRange(idx, idx + term.length);
        const line = this.doc.offsetToLineCol(idx).line;
        this.gotoLine(line);
        this.textarea.setSelectionRange(idx, idx + term.length);
      }
    };

    modal.addPrimary("Find next", doFind);
    if (withReplace && replace) {
      modal.addSecondary("Replace", () => {
        if (this.selectedText() === find.value && find.value) {
          this.insertText(replace.value);
        }
        doFind();
      });
      modal.addSecondary("Replace all", () => {
        const term = find.value;
        if (!term) return;
        const flags = matchCase.checked ? "g" : "gi";
        const re = new RegExp(escapeRegExp(term), flags);
        this.textarea.value = this.textarea.value.replace(re, replace.value);
        this.afterExternalEdit();
      });
    }
    modal.open();
  }

  private selectedText(): string {
    return this.textarea.value.slice(this.textarea.selectionStart, this.textarea.selectionEnd);
  }
}

// ---- Tiny first-party modal used by find/replace + go-to-line ----

class EditorModal {
  private rootEl: HTMLDivElement;
  private body: HTMLDivElement;
  private actions: HTMLDivElement;

  constructor(title: string) {
    this.rootEl = document.createElement("div");
    this.rootEl.className = "modal-root";
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.addEventListener("click", () => this.close());
    const modal = document.createElement("div");
    modal.className = "modal";
    const h = document.createElement("h3");
    h.textContent = title;
    this.body = document.createElement("div");
    this.actions = document.createElement("div");
    this.actions.className = "actions";
    modal.append(h, this.body, this.actions);
    this.rootEl.append(backdrop, modal);
    this.rootEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  addText(label: string, value: string): HTMLInputElement {
    const field = document.createElement("div");
    field.className = "field";
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.style.minWidth = "70px";
    lab.style.color = "var(--text-muted)";
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    field.append(lab, input);
    this.body.appendChild(field);
    return input;
  }

  addCheckbox(label: string): HTMLInputElement {
    const lab = document.createElement("label");
    lab.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    lab.append(input, document.createTextNode(label));
    this.body.appendChild(lab);
    return input;
  }

  addPrimary(label: string, onClick: () => void): void {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    this.actions.appendChild(b);
  }

  addSecondary(label: string, onClick: () => void): void {
    const b = document.createElement("button");
    b.className = "btn ghost";
    b.textContent = label;
    b.addEventListener("click", onClick);
    this.actions.appendChild(b);
  }

  open(): void {
    document.body.appendChild(this.rootEl);
    const firstInput = this.body.querySelector("input");
    (firstInput as HTMLInputElement | null)?.focus();
  }

  close(): void {
    this.rootEl.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

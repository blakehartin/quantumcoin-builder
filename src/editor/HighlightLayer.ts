import { tokenize, type Token } from "./TokenizerSolidity76";

const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/; // 20-byte Ethereum literal — flagged (Mini §5.4)

const CLASS: Record<Token["type"], string> = {
  comment: "tok-comment",
  string: "tok-string",
  number: "tok-number",
  keyword: "tok-keyword",
  type: "tok-type",
  builtin: "tok-builtin",
  operator: "tok-operator",
  identifier: "tok-identifier",
  plain: "tok-plain",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Read-only syntax-highlight backdrop (Mini §5.3). Maps tokens -> themed spans. */
export class HighlightLayer {
  readonly el: HTMLPreElement;

  constructor() {
    this.el = document.createElement("pre");
    this.el.className = "qce-layer qce-highlight";
    this.el.setAttribute("aria-hidden", "true");
  }

  render(source: string): void {
    const tokens = tokenize(source);
    let html = "";
    for (const t of tokens) {
      if (t.type === "plain") {
        html += escapeHtml(t.text);
        continue;
      }
      let cls = CLASS[t.type];
      if (t.type === "number" && ETH_ADDR_RE.test(t.text)) {
        cls += " sq-addr";
      }
      html += `<span class="${cls}">${escapeHtml(t.text)}</span>`;
    }
    // Trailing newline keeps the last line's height stable.
    this.el.innerHTML = html + "\n";
  }

  setTransform(scrollLeft: number, scrollTop: number): void {
    this.el.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  }
}

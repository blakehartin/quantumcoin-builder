// Text document model for QCEditor (Mini §5.3): newline normalization + line math.

export class Document {
  private text = "";

  constructor(initial = "") {
    this.setValue(initial);
  }

  getValue(): string {
    return this.text;
  }

  setValue(v: string): void {
    // Normalize CRLF / CR to LF.
    this.text = v.replace(/\r\n?/g, "\n");
  }

  get lineCount(): number {
    let n = 1;
    for (let i = 0; i < this.text.length; i++) {
      if (this.text.charCodeAt(i) === 10) n++;
    }
    return n;
  }

  /** 0-based char offset of the start of a 1-based line number. */
  lineStartOffset(line: number): number {
    if (line <= 1) return 0;
    let seen = 1;
    for (let i = 0; i < this.text.length; i++) {
      if (this.text.charCodeAt(i) === 10) {
        seen++;
        if (seen === line) return i + 1;
      }
    }
    return this.text.length;
  }

  /** Convert a 0-based offset to { line, column } (both 1-based). */
  offsetToLineCol(offset: number): { line: number; column: number } {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let line = 1;
    let lastNl = -1;
    for (let i = 0; i < clamped; i++) {
      if (this.text.charCodeAt(i) === 10) {
        line++;
        lastNl = i;
      }
    }
    return { line, column: clamped - lastNl };
  }
}

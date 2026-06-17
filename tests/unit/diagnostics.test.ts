import { describe, it, expect } from "vitest";
import { Document } from "../../src/editor/Document";
import { DiagnosticLayer } from "../../src/editor/DiagnosticLayer";
import type { EditorDiagnostic } from "../../src/compiler/types";

describe("Document line math (§5.3)", () => {
  it("maps offsets to 1-based line/column", () => {
    const doc = new Document("line1\nline2\nline3");
    expect(doc.lineCount).toBe(3);
    expect(doc.offsetToLineCol(0)).toEqual({ line: 1, column: 1 });
    expect(doc.offsetToLineCol(6)).toEqual({ line: 2, column: 1 });
    expect(doc.lineStartOffset(3)).toBe(12);
  });

  it("normalizes CRLF to LF", () => {
    const doc = new Document("a\r\nb\r\nc");
    expect(doc.lineCount).toBe(3);
    expect(doc.getValue()).toBe("a\nb\nc");
  });
});

describe("Diagnostic row mapping (§5.6)", () => {
  it("error wins over warning on the same line", () => {
    const diags: EditorDiagnostic[] = [
      { file: "A.sol", line: 5, severity: "warning", message: "w" },
      { file: "A.sol", line: 5, severity: "error", message: "e" },
      { file: "A.sol", line: 8, severity: "warning", message: "w2" },
    ];
    const byLine = DiagnosticLayer.byLine(diags);
    expect(byLine.get(5)).toBe("error");
    expect(byLine.get(8)).toBe("warning");
  });
});

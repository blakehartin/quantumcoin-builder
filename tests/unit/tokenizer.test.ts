import { describe, it, expect } from "vitest";
import { tokenize } from "../../src/editor/TokenizerSolidity76";

function typesOf(src: string) {
  return tokenize(src).map((t) => ({ type: t.type, text: t.text }));
}

describe("Solidity 7.6 tokenizer (§5.5)", () => {
  it("classifies keywords, types, builtins distinctly", () => {
    const toks = typesOf("contract C { function f() public view {} }");
    const byText = new Map(toks.map((t) => [t.text, t.type]));
    expect(byText.get("contract")).toBe("keyword");
    expect(byText.get("function")).toBe("keyword");
    expect(byText.get("public")).toBe("keyword");
    expect(byText.get("view")).toBe("keyword");
    expect(byText.get("C")).toBe("identifier");
  });

  it("recognizes integer/byte types including widths", () => {
    const byText = new Map(typesOf("uint256 a; int8 b; bytes32 c; address d;").map((t) => [t.text, t.type]));
    expect(byText.get("uint256")).toBe("type");
    expect(byText.get("int8")).toBe("type");
    expect(byText.get("bytes32")).toBe("type");
    expect(byText.get("address")).toBe("type");
  });

  it("tokenizes comments, strings, and numbers", () => {
    const toks = typesOf('// hi\n"str" 0xFF 1e18');
    expect(toks.some((t) => t.type === "comment" && t.text === "// hi")).toBe(true);
    expect(toks.some((t) => t.type === "string" && t.text === '"str"')).toBe(true);
    expect(toks.some((t) => t.type === "number" && t.text === "0xFF")).toBe(true);
    expect(toks.some((t) => t.type === "number" && t.text === "1e18")).toBe(true);
  });

  it("flags builtins", () => {
    const byText = new Map(typesOf("require(x); assert(y); revert();").map((t) => [t.text, t.type]));
    expect(byText.get("require")).toBe("builtin");
    expect(byText.get("assert")).toBe("builtin");
    expect(byText.get("revert")).toBe("keyword"); // revert is a statement keyword in our grammar
  });

  it("round-trips source text exactly", () => {
    const src = "pragma solidity 7.6;\n\ncontract A { uint256 x = 0xff; }\n";
    expect(tokenize(src).map((t) => t.text).join("")).toBe(src);
  });
});

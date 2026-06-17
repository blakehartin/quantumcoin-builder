import { describe, it, expect } from "vitest";
import { createHash } from "../../src/shims/crypto";

const hex = (s: string) => createHash("sha256").update(s).digest("hex");

describe("crypto shim SHA-256", () => {
  it("matches known vectors", () => {
    expect(hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });

  it("handles multi-block input", () => {
    const long = "a".repeat(1000);
    expect(hex(long)).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
});

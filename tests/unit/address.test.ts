import { describe, it, expect } from "vitest";
import { isAddress } from "../../src/abi/sdk";

// Without initSdk(), isAddress uses the first-party 32-byte fallback (§7.1).
describe("32-byte address validation (§7.1)", () => {
  it("rejects a 42-char (20-byte) Ethereum address", () => {
    expect(isAddress("0x1234567890123456789012345678901234567890")).toBe(false);
  });

  it("accepts a 66-char (32-byte) QuantumCoin address", () => {
    const addr = "0x" + "ab".repeat(32);
    expect(addr.length).toBe(66);
    expect(isAddress(addr)).toBe(true);
  });

  it("rejects malformed hex", () => {
    expect(isAddress("0xZZZ")).toBe(false);
    expect(isAddress("not-an-address")).toBe(false);
  });
});

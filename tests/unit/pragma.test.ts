import { describe, it, expect } from "vitest";
import { pragmaAllows076 } from "../../src/editor/QCEditor";

describe("Pragma guard for Solidity up to 0.7.6 (§5.4)", () => {
  it("accepts any constraint satisfiable by a version <= 0.7.6", () => {
    for (const v of [
      "0.7.6",
      "^0.7.6",
      "~0.7.6",
      "^0.7.0",
      "0.7",
      "^0.7",
      "0.7.5",
      "0.6.12",
      "^0.6.0",
      "~0.7.4",
      ">=0.7.0 <0.8.0",
      ">=0.4.0 <0.8.0",
      ">0.7.5",
      "<=0.7.6",
      "<0.8.0",
    ]) {
      expect(pragmaAllows076(v), v).toBe(true);
    }
  });

  it("rejects the invalid bare `7.6` and anything requiring a version above 0.7.6", () => {
    for (const v of ["7.6", "0.8.0", "^0.8.0", ">=0.8.0", "0.7.7", "^0.7.7", ">0.7.6", ">0.7.7"]) {
      expect(pragmaAllows076(v), v).toBe(false);
    }
  });
});

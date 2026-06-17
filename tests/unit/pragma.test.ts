import { describe, it, expect } from "vitest";
import { pragmaAllows076 } from "../../src/editor/QCEditor";

describe("Pragma guard for Solidity 0.7.6 (§5.4)", () => {
  it("accepts forms satisfiable by 0.7.6", () => {
    for (const v of ["0.7.6", "^0.7.6", "~0.7.6", "^0.7.0", "0.7", "^0.7", ">=0.7.0 <0.8.0"]) {
      expect(pragmaAllows076(v), v).toBe(true);
    }
  });

  it("rejects the invalid bare `7.6` and wrong majors/minors", () => {
    for (const v of ["7.6", "0.8.0", "^0.8.0", "0.6.12", "0.7.7", "^0.7.7"]) {
      expect(pragmaAllows076(v), v).toBe(false);
    }
  });
});

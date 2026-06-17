import { describe, it, expect } from "vitest";
import { createZip, readZip, textEntry } from "../../src/export/zip";

describe("First-party ZIP builder (§8.2)", () => {
  it("round-trips STORE entries", async () => {
    const blob = createZip([
      textEntry("Storage.abi.json", '[{"type":"function","name":"getValue"}]'),
      textEntry("Storage.creation.bytecode.hex", "0xdeadbeef"),
      textEntry("Storage.runtime.bytecode.hex", "0xbeef"),
    ]);
    expect(blob.type).toBe("application/zip");

    const entries = await readZip(blob);
    const byName = new Map(entries.map((e) => [e.name, e.text]));
    expect(byName.get("Storage.creation.bytecode.hex")).toBe("0xdeadbeef");
    expect(byName.get("Storage.runtime.bytecode.hex")).toBe("0xbeef");
    expect(byName.get("Storage.abi.json")).toContain("getValue");
  });

  it("produces a non-empty archive", () => {
    const blob = createZip([textEntry("a.txt", "hello")]);
    expect(blob.size).toBeGreaterThan(22); // at least EOCD
  });
});

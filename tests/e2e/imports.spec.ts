import { test, expect } from "@playwright/test";

/**
 * Verifies that relative, in-project Solidity imports resolve during
 * compilation. All workspace files are passed to the compiler as standard-JSON
 * `sources`, so `import "./Lib.sol";` links against the matching workspace key
 * without any import callback (Mini §6.2).
 *
 * Like the main compile spec, this skips itself when the ~24 MB soljson
 * compiler has not been vendored.
 */
const LIB_SOL = `// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

library Lib {
    function double(uint256 x) internal pure returns (uint256) {
        return x * 2;
    }
}
`;

const MAIN_SOL = `// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "./Lib.sol";

contract Main {
    function run(uint256 x) public pure returns (uint256) {
        return Lib.double(x);
    }
}
`;

test("resolves a relative in-project import during compilation", async ({ page, baseURL }) => {
  const probe = await page.request.get(`${baseURL}/assets/compilers/soljson-v32b.8.12.js`);
  const contentType = probe.headers()["content-type"] ?? "";
  const vendored = probe.ok() && /javascript|ecmascript/i.test(contentType);
  test.skip(!vendored, "soljson compiler not vendored — run `npm run vendor:compiler`");

  // Seed a two-file workspace where Main.sol imports ./Lib.sol.
  await page.addInitScript(
    ([lib, main]) => {
      localStorage.setItem(
        "qcpbm.workspace.v1",
        JSON.stringify({ files: { "Lib.sol": lib, "Main.sol": main }, active: "Main.sol" }),
      );
      localStorage.setItem("qcpbm.workspace.active", "Main.sol");
    },
    [LIB_SOL, MAIN_SOL],
  );

  await page.goto("/");
  await expect(page.locator('[data-testid="ide-root"]')).toBeVisible({ timeout: 30_000 });

  await page.locator(".side .ptab", { hasText: "Compiler" }).click();
  await page.locator(".side .btn.block", { hasText: "Compile" }).first().click();

  // If the relative import did not resolve, the compiler would report a
  // "Source ... not found" error instead of success.
  await expect(page.locator(".term-body")).toContainText("Compiled successfully", { timeout: 60_000 });
  await expect(page.locator(".term-body")).not.toContainText("not found");
  await expect(page.locator(".side .status-row")).toContainText("0 errors");
});

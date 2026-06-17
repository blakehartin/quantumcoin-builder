import { test, expect } from "@playwright/test";

/**
 * Boot + editor + panel smoke test (Mini §12.1).
 *
 * Full compile-to-download E2E additionally requires the vendored ~23 MB
 * soljson compiler (run `npm run vendor:compiler`). This smoke test verifies the
 * bootstrap overlay dismisses, the IDE mounts, the editor accepts input, and the
 * Compiler/ABI panels render — without depending on the heavy compiler asset.
 */
test("app boots and the editor + panels are interactive", async ({ page }) => {
  await page.goto("/");

  // Bootstrap overlay dismisses -> IDE root becomes visible.
  const ide = page.locator('[data-testid="ide-root"]');
  await expect(ide).toBeVisible({ timeout: 30_000 });

  // Branding (§9.2)
  await expect(page.locator(".titlebar .title")).toHaveText("QuantumCoin");

  // Editor accepts input
  const editor = page.locator("textarea.qce-input");
  await expect(editor).toBeVisible();
  await editor.click();
  await expect(editor).toHaveValue(/contract Storage/);

  // Right panel tabs (§7.3 / §8.3)
  await expect(page.locator(".side .ptab", { hasText: "Compiler" })).toBeVisible();
  await page.locator(".side .ptab", { hasText: "ABI" }).click();
  await expect(page.locator(".side .pbody")).toBeVisible();

  // Menu bar present (§4.2)
  await expect(page.locator(".menubar .menu .label", { hasText: "Build" })).toBeVisible();
});

import { test, expect } from '@playwright/test';

test('Early Warning page shows actionable tactical directives and dispatch buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('http://localhost:5173/early-warning', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Check Actionable Directives Panel exists
  const panel = page.locator('.actionable-directives-panel');
  await expect(panel).toHaveCount(1);

  // Check 3 role cards
  await expect(page.locator('.card-forestry')).toHaveCount(1);
  await expect(page.locator('.card-fire-service')).toHaveCount(1);
  await expect(page.locator('.card-public-admin')).toHaveCount(1);

  // Check buttons
  await expect(page.locator('.btn-copy')).toHaveCount(1);
  await expect(page.locator('.btn-cap')).toHaveCount(1);
  await expect(page.locator('.btn-send')).toHaveCount(1);

  // Capture screenshot
  await page.screenshot({ path: '../reports/ui/early-warning-actionable-directives.png', fullPage: true });
});


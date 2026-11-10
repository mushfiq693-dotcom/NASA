import { test, expect } from '@playwright/test';

test('Early Warning page shows live threat assessment and community exposure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('http://localhost:5173/early-warning', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Check Telemetry & Threat Assessment Grid
  await expect(page.locator('.ew-telemetry-grid')).toHaveCount(1);

  // Check Map Container
  await expect(page.locator('.ew-map-container')).toHaveCount(1);

  // Check Downwind Communities Table
  await expect(page.locator('.receptors-table')).toHaveCount(1);

  // Check Decision Support Disclaimer
  await expect(page.locator('.disclaimer-box')).toHaveCount(1);

  // Check Navbar has Telegram Channel link and NO motion toggle
  await expect(page.locator('.nav-telegram-btn')).toHaveCount(1);
  await expect(page.locator('.motion-toggle-wrapper')).toHaveCount(0);

  // Capture screenshot
  await page.screenshot({ path: '../reports/ui/early-warning-clean.png', fullPage: true });
});

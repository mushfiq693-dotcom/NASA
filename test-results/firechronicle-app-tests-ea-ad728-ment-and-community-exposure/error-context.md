# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firechronicle/app/tests/early_warning.spec.ts >> Early Warning page shows live threat assessment and community exposure
- Location: firechronicle/app/tests/early_warning.spec.ts:3:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/early-warning
Call log:
  - navigating to "http://localhost:5173/early-warning", waiting until "domcontentloaded"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Early Warning page shows live threat assessment and community exposure', async ({ page }) => {
  4  |   await page.setViewportSize({ width: 1440, height: 1200 });
> 5  |   await page.goto('http://localhost:5173/early-warning', { waitUntil: 'domcontentloaded' });
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/early-warning
  6  |   await page.waitForTimeout(1000);
  7  | 
  8  |   // Check Telemetry & Threat Assessment Grid
  9  |   await expect(page.locator('.ew-telemetry-grid')).toHaveCount(1);
  10 | 
  11 |   // Check Map Container
  12 |   await expect(page.locator('.ew-map-container')).toHaveCount(1);
  13 | 
  14 |   // Check Downwind Communities Table
  15 |   await expect(page.locator('.receptors-table')).toHaveCount(1);
  16 | 
  17 |   // Check Decision Support Disclaimer
  18 |   await expect(page.locator('.disclaimer-box')).toHaveCount(1);
  19 | 
  20 |   // Check Navbar has Telegram Channel link and NO motion toggle
  21 |   await expect(page.locator('.nav-telegram-btn')).toHaveCount(1);
  22 |   await expect(page.locator('.motion-toggle-wrapper')).toHaveCount(0);
  23 | 
  24 |   // Capture screenshot
  25 |   await page.screenshot({ path: '../reports/ui/early-warning-clean.png', fullPage: true });
  26 | });
  27 | 
```
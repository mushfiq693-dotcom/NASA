import { test, expect } from '@playwright/test';

test.describe('Footer Placement, Sensor Lab Navigation, & Scroll Visibility', () => {
  test('Navbar: Sensor Lab is removed from top navbar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Verify Sensor Lab is NOT in the navbar
    const navSensorLab = page.locator('.nav-links a:has-text("Sensor Lab")');
    await expect(navSensorLab).toHaveCount(0);
  });

  test('Landing page: footer with Sensor Lab only visible after scrolling all the way to the end', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify .bengal-footer exists in DOM
    const footer = page.locator('.bengal-footer');
    await expect(footer).toHaveCount(1);

    // Verify Sensor Lab is present in the footer
    const labLink = footer.locator('a[href="/lab"]');
    await expect(labLink).toHaveCount(1);

    // Initial check: footer should NOT be in the viewport without scrolling
    const initialBox = await footer.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(initialBox!.y).toBeGreaterThanOrEqual(900);

    // Scroll all the way to the bottom inside .scroll-overlay
    await page.evaluate(() => {
      const container = document.querySelector('.scroll-overlay');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });

    await page.waitForTimeout(1000);

    // After scrolling to bottom, footer should be visible in viewport
    const scrolledBox = await footer.boundingBox();
    expect(scrolledBox).not.toBeNull();
    expect(scrolledBox!.y).toBeLessThan(900);
    expect(scrolledBox!.y + scrolledBox!.height).toBeGreaterThan(0);
  });

  test('Subpages: footer exists at bottom and is only visible after scrolling down', async ({ page }) => {
    const subpages = [
      { path: '/calendar', selector: '.calendar-container' },
      { path: '/early-warning', selector: '.early-warning-container' },
      { path: '/live', selector: '.live-container' },
      { path: '/lab', selector: '.lab-container' },
      { path: '/validation', selector: '.validation-container' },
      { path: '/methodology', selector: '.methodology-container' }
    ];

    for (const { path, selector } of subpages) {
      await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      const footer = page.locator('.bengal-footer');
      await expect(footer).toHaveCount(1);

      // Initial check: footer should be below the 900px viewport initially
      const initialBox = await footer.boundingBox();
      expect(initialBox).not.toBeNull();
      expect(initialBox!.y).toBeGreaterThanOrEqual(850);

      // Scroll to bottom
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }, selector);

      await page.waitForTimeout(600);

      // After scrolling, footer should be in the viewport
      const scrolledBox = await footer.boundingBox();
      expect(scrolledBox).not.toBeNull();
      expect(scrolledBox!.y).toBeLessThan(900);
      expect(scrolledBox!.y + scrolledBox!.height).toBeGreaterThan(0);
    }
  });
});

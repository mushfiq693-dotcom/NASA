import { test, expect } from '@playwright/test';

test.describe('Footer Placement & Visibility', () => {
  test('Landing page: footer only visible after scrolling all the way to the end', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify .landing-footer exists in DOM
    const footer = page.locator('.landing-footer');
    await expect(footer).toHaveCount(1);

    // Initial check: footer should NOT be in the viewport without scrolling
    const initialBox = await footer.boundingBox();
    expect(initialBox).not.toBeNull();
    // Bounding box Y should be well below 900px viewport height (around 3000px+)
    expect(initialBox!.y).toBeGreaterThanOrEqual(900);

    // Scroll all the way to the bottom inside .scroll-overlay
    await page.evaluate(() => {
      const scrollOverlay = document.querySelector('.scroll-overlay');
      if (scrollOverlay) {
        scrollOverlay.scrollTop = scrollOverlay.scrollHeight;
      }
    });

    await page.waitForTimeout(1000);

    // After scrolling to bottom, footer should be visible in viewport
    const scrolledBox = await footer.boundingBox();
    expect(scrolledBox).not.toBeNull();
    // In viewport means its top is within viewport (< 900) and bottom is visible
    expect(scrolledBox!.y).toBeLessThan(900);
    expect(scrolledBox!.y + scrolledBox!.height).toBeGreaterThan(0);
  });

  test('Subpages: footer does not exist on /atlas, /calendar, /lab, /live, /validation', async ({ page }) => {
    const subpages = ['/atlas', '/calendar', '/lab', '/live', '/validation', '/methodology'];
    for (const sub of subpages) {
      await page.goto(`http://localhost:5173${sub}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      // Verify neither .landing-footer nor .shell-footer exist
      const landingFooter = page.locator('.landing-footer');
      await expect(landingFooter).toHaveCount(0);

      const shellFooter = page.locator('.shell-footer');
      await expect(shellFooter).toHaveCount(0);
    }
  });
});


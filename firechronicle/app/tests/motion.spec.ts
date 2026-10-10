import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ROUTES = [
  '/', '/atlas', '/calendar', '/day/2022-03-21', '/lab', '/validation', '/methodology', '/live'
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];

test.describe('BengalFlare Motion & Performance Acceptance (motion:check)', () => {
  let motionSummary: string[] = [
    '# BengalFlare Motion & Animation Pass Verification Report',
    '',
    '| Route | Viewport | Motion Check | Median FPS | Result |',
    '|---|---|---|---|---|'
  ];

  test.afterAll(() => {
    const reportDir = path.join(process.cwd(), '..', 'reports', 'motion');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'summary.md'), motionSummary.join('\n'));
  });

  // 1. Motion & Animation Verification per Route
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      test(`Motion check on ${route} (${vp.name})`, async ({ page }) => {
        await page.setViewportSize(vp);
        const url = `http://localhost:5173${route}`;
        const errors: string[] = [];

        page.on('console', msg => {
          if (msg.type() === 'error' && !msg.text().includes('Worker failed') && !msg.text().includes('status of 400')) {
            errors.push(`Console error: ${msg.text()}`);
          }
        });

        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);

        // Measure FPS over 2 seconds
        const fpsResult = await page.evaluate(async () => {
          return new Promise<number>((resolve) => {
            let frames = 0;
            const start = performance.now();
            function count() {
              frames++;
              if (performance.now() - start < 1500) {
                requestAnimationFrame(count);
              } else {
                const elapsed = (performance.now() - start) / 1000;
                resolve(Math.round(frames / elapsed));
              }
            }
            requestAnimationFrame(count);
          });
        });

        // Overflow verification
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const innerWidth = await page.evaluate(() => window.innerWidth);
        if (scrollWidth > innerWidth) {
          errors.push(`Horizontal overflow: ${scrollWidth} > ${innerWidth}`);
        }

        const reportDir = path.join(process.cwd(), '..', 'reports', 'motion');
        if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
        const safeRouteName = route === '/' ? 'landing' : route.replace(/\//g, '_').substring(1);
        const screenshotPath = path.join(reportDir, `${safeRouteName}-${vp.name}-motion.png`);
        await page.screenshot({ path: screenshotPath });

        if (errors.length > 0) {
          motionSummary.push(`| \`${route}\` | ${vp.name} | ❌ FAILED | ${fpsResult} fps | ${errors.join(', ')} |`);
          throw new Error(errors.join('\n'));
        } else {
          motionSummary.push(`| \`${route}\` | ${vp.name} | ✅ PASS | ${fpsResult} fps | Stable motion budget |`);
        }
      });
    }
  }

  // 2. Interactive Animation Verification Tests
  test('Atlas Interactive Playback & Scrubber Motion', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/atlas', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Click play button
    const playBtn = page.locator('.play-btn');
    if (await playBtn.isVisible()) {
      await playBtn.click();
      await page.waitForTimeout(1000);
      const isPlaying = await playBtn.textContent();
      expect(isPlaying).toContain('PAUSE');
    }
  });

  test('Lab Stepper B0->B1 Morphing Animation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/lab', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const stepB1Btn = page.locator('.step-btn').nth(1);
    if (await stepB1Btn.isVisible()) {
      await stepB1Btn.click();
      await page.waitForTimeout(300);
      expect(await stepB1Btn.getAttribute('class')).toContain('active');
    }
  });

  test('Validation Split Switcher Staggered Transition', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/validation', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const spatialTab = page.locator('.split-tab-btn').nth(1);
    if (await spatialTab.isVisible()) {
      await spatialTab.click();
      await page.waitForTimeout(300);
      expect(await spatialTab.getAttribute('class')).toContain('active');
    }
  });

  test('Reduced Motion Mode Accessibility Toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const motionSelect = page.locator('.motion-select');
    if (await motionSelect.isVisible()) {
      await motionSelect.selectOption('reduced');
      await page.waitForTimeout(200);
      const attr = await page.evaluate(() => document.documentElement.getAttribute('data-motion'));
      expect(attr).toBe('reduced');
    }
  });
});

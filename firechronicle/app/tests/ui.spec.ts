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

const BANNED_PHRASES = [
  "NASA confirmed", "proven by NASA", "NASA's FireChronicle", "FireChronicle model is",
  "predicts", "real-time fire detection", "prevents fires"
];

test.describe('FireChronicle UI Acceptance', () => {
  let summary: string[] = ['| Route | Viewport | Result |', '|---|---|---|'];

  test.afterAll(() => {
    const reportDir = path.join(process.cwd(), '..', 'reports', 'ui');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'summary.md'), summary.join('\n'));
  });

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      test(`Check route ${route} at ${vp.name}`, async ({ page }) => {
        await page.setViewportSize(vp);
        const url = `http://localhost:5173${route}`;
        
        const errors: string[] = [];
        page.on('console', msg => {
          if (msg.type() === 'error' && !msg.text().includes('Worker failed to load') && !msg.text().includes('status of 400')) errors.push(`Console error: ${msg.text()}`);
        });
        page.on('requestfailed', request => {
          if (request.url().startsWith('http://localhost:5173') && !request.url().includes('maplibre-gl-worker')) {
            errors.push(`Failed request: ${request.url()}`);
          }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.shell-nav', { state: 'attached', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500); // Give charts time to render

        // Screenshot
        const reportDir = path.join(process.cwd(), '..', 'reports', 'ui');
        if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
        const safeRouteName = route === '/' ? 'landing' : route.replace(/\//g, '_').substring(1);
        const screenshotPath = path.join(reportDir, `${safeRouteName}-${vp.name}.png`);
        await page.screenshot({ path: screenshotPath });

        // Check horizontal overflow
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const innerWidth = await page.evaluate(() => window.innerWidth);
        if (scrollWidth > innerWidth) {
          errors.push(`Horizontal overflow: scrollWidth (${scrollWidth}) > innerWidth (${innerWidth})`);
        }

        // Check banned phrases
        const textContent = await page.evaluate(() => document.body.innerText);
        for (const phrase of BANNED_PHRASES) {
          if (textContent.toLowerCase().includes(phrase.toLowerCase())) {
            errors.push(`Banned phrase found: "${phrase}"`);
          }
        }

        const isFixtures = await page.evaluate(() => (window as any).__FIXTURES_USED__);
        const hasSampleBadge = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          return text.includes('sample data');
        });
        if (isFixtures && !hasSampleBadge) {
          errors.push(`SAMPLE DATA badge is missing while using fixtures`);
        }
        
        // Blank render check (pixel variance approximation via bounding boxes for now)
        const hasContent = await page.evaluate(() => {
          const root = document.getElementById('root');
          return root && root.children.length > 0;
        });
        if (!hasContent) {
          errors.push('Blank render: #root is empty');
        }

        if (errors.length > 0) {
          summary.push(`| \`${route}\` | ${vp.name} | ❌ FAILED: ${errors.join(', ')} |`);
          throw new Error(errors.join('\n'));
        } else {
          summary.push(`| \`${route}\` | ${vp.name} | ✅ PASS |`);
        }
      });
    }
  }
});

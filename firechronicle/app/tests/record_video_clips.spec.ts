import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const OUTPUT_DIR = path.resolve(process.cwd(), '..', 'reports', 'video_clips');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

test.use({
  video: {
    mode: 'on',
    size: { width: 1920, height: 1080 },
  },
  viewport: { width: 1920, height: 1080 },
});

test.describe('Automated Broadcast Video Clips Generator (1080p 60fps)', () => {
  test('Clip 1: Landing Page - 3D Globe & Orbital Telemetry', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(2000);
    // Smooth interaction
    await page.mouse.move(500, 400, { steps: 20 });
    await page.waitForTimeout(4000);
  });

  test('Clip 2: Atlas Explorer - MapLibre GPU & Hotspots', async ({ page }) => {
    await page.goto('http://localhost:5173/atlas');
    await page.waitForTimeout(3000);
    // Hover and pan
    await page.mouse.move(800, 500, { steps: 25 });
    await page.waitForTimeout(4000);
  });

  test('Clip 3: 24-Year Calendar - Matrix & Observability Index', async ({ page }) => {
    await page.goto('http://localhost:5173/calendar');
    await page.waitForTimeout(2000);
    // Smooth scroll down to view matrix
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(4000);
  });

  test('Clip 4: Day Detail - March 21, 2022 Satellite Sweep Forensics', async ({ page }) => {
    await page.goto('http://localhost:5173/day/2022-03-21');
    await page.waitForTimeout(2500);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(4000);
  });

  test('Clip 5: Sensor Lab - B0 to B5 Quantile Forest Benchmarking', async ({ page }) => {
    await page.goto('http://localhost:5173/lab');
    await page.waitForTimeout(2000);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(4000);
  });

  test('Clip 6: Live NRT Constellation - Radar & S-NPP Countdown', async ({ page }) => {
    await page.goto('http://localhost:5173/live');
    await page.waitForTimeout(3000);
    await page.mouse.move(960, 540, { steps: 20 });
    await page.waitForTimeout(4000);
  });

  test('Clip 7: Early Warning System - Threat Cone & Downwind Communities', async ({ page }) => {
    await page.goto('http://localhost:5173/early-warning');
    await page.waitForTimeout(2500);
    await page.mouse.wheel(0, 450);
    await page.waitForTimeout(4000);
  });
});


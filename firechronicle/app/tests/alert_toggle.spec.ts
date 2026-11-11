import { test, expect } from '@playwright/test';

test.describe('Alerts Toggle Switch & Suppression of Spam Notifications', () => {
  test('renders toggle switch with correct initial state and toggles cleanly', async ({ page }) => {
    // Grant notification permission in browser context and mock permission getter for headless environment
    await page.addInitScript(() => {
      (window as any).__NOTIFICATION_CALLS__ = [];
      const orig = window.Notification;
      window.Notification = new Proxy(orig, {
        construct(target, args) {
          (window as any).__NOTIFICATION_CALLS__.push({ title: args[0], options: args[1] });
          return Reflect.construct(target, args);
        }
      });
      Object.defineProperty(window.Notification, 'permission', {
        get: () => 'granted',
        configurable: true
      });
      window.Notification.requestPermission = async () => 'granted';
    });

    await page.goto('http://localhost:5173/');

    // Find the toggle button
    const toggle = page.locator('.nav-alert-toggle');
    await expect(toggle).toBeVisible();

    // Verify initial active state or click to toggle
    const initialText = await toggle.innerText();
    expect(initialText.toUpperCase()).toContain('ALERTS');

    // Click toggle to switch state (e.g. from ON to OFF)
    await toggle.click();
    await page.waitForTimeout(100);

    // Verify NO dummy notifications were popped upon clicking the toggle button
    const notificationCalls = await page.evaluate(() => (window as any).__NOTIFICATION_CALLS__);
    expect(notificationCalls.length).toBe(0);

    // Verify localStorage persistence
    const storageVal = await page.evaluate(() => localStorage.getItem('bengalflare_alerts_enabled'));
    expect(storageVal).toBe('false');

    // Click again to toggle back to ON
    await toggle.click();
    await page.waitForTimeout(100);
    const updatedStorageVal = await page.evaluate(() => localStorage.getItem('bengalflare_alerts_enabled'));
    expect(updatedStorageVal).toBe('true');

    // Still no spurious notification popup
    const secondNotificationCalls = await page.evaluate(() => (window as any).__NOTIFICATION_CALLS__);
    expect(secondNotificationCalls.length).toBe(0);
  });
});

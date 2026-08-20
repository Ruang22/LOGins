import { expect, test } from '@playwright/test';

function luminance([red, green, blue]) {
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function parseRgb(value) {
  return value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
}

test('teacher workspace exposes labeled landmarks, a visible focus indicator, and readable critical colors', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Weekly lesson schedule' })).toBeVisible();
  await expect(page.getByLabel('Describe the lesson')).toBeVisible();

  const parentDashboard = page.getByRole('button', { name: 'Parent dashboard' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(parentDashboard).toBeFocused();
  const focus = await parentDashboard.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { color: styles.outlineColor, style: styles.outlineStyle, width: styles.outlineWidth };
  });
  expect(focus.style).toBe('solid');
  expect(focus.width).toBe('3px');
  expect(focus.color).toBe('rgb(45, 108, 223)');

  const contrast = await page.getByRole('button', { name: 'Teacher workbench' }).evaluate((element) => {
    const styles = getComputedStyle(element);
    return { foreground: styles.color, background: styles.backgroundColor };
  });
  const foregroundLuminance = luminance(parseRgb(contrast.foreground));
  const backgroundLuminance = luminance(parseRgb(contrast.background));
  expect((Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)).toBeGreaterThanOrEqual(4.5);
});

test.describe('mobile release checks', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('parent workspace remains usable without document-level horizontal scrolling on a mobile viewport', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Parent dashboard' }).click();

    await expect(page.getByRole('heading', { name: 'Family lesson desk' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add a lesson package' })).toBeVisible();
    expect(await page.locator('body').evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});

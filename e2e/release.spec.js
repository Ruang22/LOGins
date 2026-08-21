import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

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

  await expect(page).toHaveTitle('AI 排课助手');
  await expect(page.getByTestId('role-gate')).toBeVisible();
  await expect(page.getByRole('heading', { name: '请选择您的身份' })).toBeVisible();
  await page.getByTestId('choose-teacher').click();

  await expect(page.getByTestId('teacher-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: '今天，按分钟上课' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '教师工作区' })).toBeVisible();
  await expect(page.getByRole('region', { name: /课程$/ })).toBeVisible();

  await expect(page.getByTestId('workbench-destination')).toBeFocused();
  const aiSchedule = page.getByRole('button', { name: 'AI 排课草稿' });
  await aiSchedule.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(aiSchedule).toBeFocused();
  const focus = await aiSchedule.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { color: styles.outlineColor, style: styles.outlineStyle, width: styles.outlineWidth };
  });
  expect(focus.style).toBe('solid');
  expect(focus.width).toBe('3px');
  expect(focus.color).toBe('rgb(230, 166, 60)');

  const contrast = await page.getByRole('button', { name: '手动排课' }).evaluate((element) => {
    const styles = getComputedStyle(element);
    return { foreground: styles.color, background: styles.backgroundColor };
  });
  const foregroundLuminance = luminance(parseRgb(contrast.foreground));
  const backgroundLuminance = luminance(parseRgb(contrast.background));
  expect((Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)).toBeGreaterThanOrEqual(4.5);

  await aiSchedule.click();
  await expect(page.getByRole('textbox', { name: '课程描述' })).toBeVisible();
});

test.describe('mobile release checks', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('parent workspace remains usable without document-level horizontal scrolling on a mobile viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('role-gate')).toBeVisible();
    await page.getByTestId('choose-parent').click();

    await expect(page.getByTestId('parent-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: /课程轨迹$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '添加课时' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});

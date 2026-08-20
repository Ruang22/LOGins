import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

test('parent completes a visibly simulated package order through Express and sees the persisted balance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '家长中心' }).click();

  await expect(page.getByText('仅供演示使用，不会使用真实付款方式。')).toBeVisible();
  await expect(page.locator('.package-option').first()).toContainText('¥500.00');
  await page.getByRole('button', { name: '选择' }).first().click();
  await expect(page.getByText('演示订单已创建')).toBeVisible();
  await page.getByRole('button', { name: '完成模拟付款' }).click();

  await expect(page.getByRole('status')).toContainText('模拟付款已完成');
  await expect(page.getByText('模拟付款已完成', { exact: true })).toBeVisible();
  await expect(page.locator('.child-summary dd').first()).toHaveText('22');
  await expect(page.locator('.credit-balance strong')).toHaveText('19');
});

test('parent cannot access a supplied foreign child id and the dashboard cannot render that record', async ({ page }) => {
  const foreignOrderAttempt = await page.request.post('/api/parent/orders', {
    headers: { 'x-demo-user': 'parent-demo' },
    data: {
      studentId: 'e2e-foreign-child',
      packageId: 'demo-10',
    },
  });
  expect(foreignOrderAttempt.status()).toBe(403);
  await expect(foreignOrderAttempt.json()).resolves.toEqual({ code: 'FORBIDDEN' });

  const dashboard = await page.request.get('/api/parent/dashboard', {
    headers: { 'x-demo-user': 'parent-demo' },
  });
  expect(dashboard.ok()).toBeTruthy();
  const body = await dashboard.json();
  expect(body.students.map(({ id }) => id)).not.toContain('e2e-foreign-child');

  await page.goto('/');
  await page.getByRole('button', { name: '家长中心' }).click();
  await expect(page.getByText('Avery Rivera (Demo Student)')).toBeVisible();
  await expect(page.getByText('Foreign Child (Synthetic Record)')).toHaveCount(0);
  await expect(page.getByText('这里仅显示属于此演示家长账户的学生。')).toBeVisible();
});

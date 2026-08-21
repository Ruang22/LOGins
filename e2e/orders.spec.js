import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

async function selectParentWorkbench(page) {
  await page.getByTestId('choose-parent').click();
  await expect(page.getByTestId('parent-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新轨迹' })).toBeEnabled();
}

test('parent completes a visibly simulated package order through Express and sees the persisted balance', async ({ page }) => {
  await page.goto('/');
  await selectParentWorkbench(page);

  await expect(page.getByText('模拟支付 · 演示数据')).toBeVisible();
  await expect(page.getByTestId('package-demo-10')).toContainText('选择此套餐');
  await page.getByTestId('package-demo-10').click();
  await expect(page.getByText('等待模拟支付')).toBeVisible();
  await page.getByTestId('simulate-payment').click();

  await expect(page.getByRole('status')).toContainText('模拟付款已完成');
  await expect(page.getByText('模拟付款已完成', { exact: true })).toBeVisible();
  await expect(page.getByTestId('purchased-credits')).toHaveText('22');
  await expect(page.getByTestId('available-credits')).toHaveText('19 节');
});

test('parent cannot access a supplied foreign child id and the dashboard cannot render that record', async ({ page }) => {
  await page.goto('/');
  await selectParentWorkbench(page);

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

  await expect(page.getByText('Avery Rivera (Demo Student)')).toBeVisible();
  await expect(page.getByText('Foreign Child (Synthetic Record)')).toHaveCount(0);
  await expect(page.getByText('只显示当前家长账户的第一位孩子')).toBeVisible();
});

test('parent workbench captures readable desktop and mobile views without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await selectParentWorkbench(page);

  const createLesson = await page.request.post('/api/teacher/lessons', {
    headers: { 'x-demo-user': 'teacher-demo' },
    data: { studentIds: ['e2e-avery'], startAt: '2032-01-05T10:00:00.000Z' },
  });
  expect(createLesson.status()).toBe(201);
  await page.getByRole('button', { name: '刷新轨迹' }).click();

  const nextLessonTime = page.getByTestId('next-lesson-time');
  await expect(nextLessonTime).toHaveText(/^\d{2}:\d{2}$/);

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: testInfo.outputPath(`parent-${viewport.name}.png`), fullPage: true });

    if (viewport.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      const touchTargetHeights = await page.getByTestId('parent-shell').getByRole('button').evaluateAll((buttons) => (
        buttons.map((button) => button.getBoundingClientRect().height)
      ));
      expect(touchTargetHeights.every((height) => height >= 44)).toBeTruthy();

      const refresh = page.getByRole('button', { name: '刷新轨迹' });
      await refresh.focus();
      await expect(refresh).toHaveCSS('outline-width', '3px');
    }
  }
});

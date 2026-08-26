import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

const teacherAccount = { id: 'e2e-teacher', name: 'Maya Chen (Demo Teacher)' };
const parentAccount = { id: 'e2e-parent-demo', name: 'Jordan Rivera (Demo Parent)' };

async function selectTeacherWorkbench(page) {
  const accountsResponse = page.waitForResponse((response) => (
    response.url().includes('/api/accounts?role=teacher') && response.request().method() === 'GET'
  ));
  await page.getByTestId('choose-teacher').click();
  const accounts = await (await accountsResponse).json();
  expect(accounts).toContainEqual(expect.objectContaining(teacherAccount));
  const accountGate = page.getByTestId('account-gate');
  await expect(accountGate).toBeVisible();
  await accountGate.getByRole('button').filter({ hasText: teacherAccount.name }).click();
  await expect(page.getByTestId('teacher-shell')).toBeVisible();
  await expect(page.getByTestId('role-gate')).toHaveCount(0);
}

async function selectParentWorkbench(page) {
  const accountsResponse = page.waitForResponse((response) => (
    response.url().includes('/api/accounts?role=parent') && response.request().method() === 'GET'
  ));
  await page.getByTestId('choose-parent').click();
  const accounts = await (await accountsResponse).json();
  expect(accounts).toContainEqual(expect.objectContaining(parentAccount));
  await expect(page.getByTestId('account-gate')).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择家长账户' })).toBeVisible();
  await page.getByRole('button').filter({ hasText: parentAccount.name }).click();
  await expect(page.getByTestId('parent-shell')).toBeVisible();
  await expect(page.getByTestId('role-gate')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '刷新轨迹' })).toBeEnabled();
}

test('teacher creates and confirms manual QR, then the parent sees only their single child history without confirmation controls', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  await page.getByRole('navigation', { name: '教师工作区' }).getByRole('button', { name: /^订单/ }).click();
  await page.getByTestId('open-teacher-order').click();
  const dialog = page.getByRole('dialog', { name: '登记订单' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('本地记录，不发起真实收款');
  await expect(dialog).toContainText('扫码登记（模拟）');

  await dialog.getByRole('combobox', { name: '学员' }).selectOption('e2e-avery');
  await dialog.getByRole('radio', { name: '扫码登记（模拟）', exact: true }).check();
  await dialog.getByLabel('套餐名称', { exact: true }).fill('E2E 线下扫码包');
  await dialog.getByLabel('登记课时', { exact: true }).fill('4');
  await dialog.getByLabel('金额（元）', { exact: true }).fill('199.50');

  const createResponsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/teacher/orders/manual') && response.request().method() === 'POST'
  ));
  await dialog.getByRole('button', { name: '创建待确认订单' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const order = await createResponse.json();
  expect(order).toEqual(expect.objectContaining({
    packageName: 'E2E 线下扫码包',
    creditQuantity: 4,
    amountCents: 19950,
    paymentMode: 'manual_qr',
    status: 'pending',
  }));
  await expect(page.getByRole('status')).toContainText('扫码登记（模拟）订单已创建');

  const row = page.locator('.teacher-list__row--orders').filter({ hasText: 'E2E 线下扫码包' });
  await expect(row).toContainText('扫码登记（模拟）');
  await expect(row).toContainText('待确认');
  const confirm = row.getByRole('button', { name: '确认到账（模拟）' });
  await expect(confirm).toBeVisible();

  const confirmResponsePromise = page.waitForResponse((response) => (
    response.url().endsWith(`/api/teacher/orders/${order.id}/confirm-manual`) && response.request().method() === 'PATCH'
  ));
  await confirm.click();
  const confirmResponse = await confirmResponsePromise;
  expect(confirmResponse.status()).toBe(200);
  const paid = await confirmResponse.json();
  expect(paid.status).toBe('paid');
  expect(paid.paidAt).toBeTruthy();
  await expect(page.getByRole('status')).toContainText('扫码登记（模拟）已确认');
  await expect(row).toContainText('已确认');
  await expect(confirm).toHaveCount(0);

  await page.getByRole('button', { name: '切换身份' }).click();
  await selectParentWorkbench(page);

  await expect(page.getByRole('heading', { name: /Avery Rivera.*课程轨迹/ })).toBeVisible();
  await expect(page.getByText('Rowan Rivera (Demo Student)')).toHaveCount(0);
  const orderHistory = page.getByTestId('order-trail').locator('li').filter({ hasText: 'E2E 线下扫码包' });
  await expect(orderHistory).toContainText('4 节');
  await expect(orderHistory).toContainText('扫码登记（模拟）');
  await expect(orderHistory).toContainText('已到账');
  await expect(page.getByTestId('simulated-qr-registration')).toContainText('扫码登记（模拟）');
  await expect(page.getByText('模拟支付 · 演示数据')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认到账（模拟）' })).toHaveCount(0);
  await expect(page.getByText('确认收款')).toHaveCount(0);

  const dashboard = await page.request.get('/api/parent/dashboard', {
    headers: { 'x-demo-user': parentAccount.id },
  });
  expect(dashboard.ok()).toBeTruthy();
  const parentData = await dashboard.json();
  expect(parentData.students).toHaveLength(1);
  expect(parentData.students[0].id).toBe('e2e-avery');
  expect(parentData.orders.map(({ id }) => id)).toContain(order.id);
});

test('parent completes a visibly simulated package order through Express and sees persisted balance and history', async ({ page }) => {
  await page.goto('/');
  await selectParentWorkbench(page);

  await expect(page.getByText('模拟支付 · 演示数据')).toBeVisible();
  await expect(page.getByTestId('package-demo-10')).toContainText('选择此套餐');
  await page.getByTestId('package-demo-10').click();
  await expect(page.getByText('等待模拟支付')).toBeVisible();
  await page.getByTestId('simulate-payment').click();

  await expect(page.getByRole('status')).toContainText('模拟付款已完成');
  await expect(page.getByTestId('purchased-credits')).toHaveText('22');
  await expect(page.getByTestId('available-credits')).toHaveText('19 节');
  await expect(page.getByTestId('order-trail')).toContainText('模拟支付');
  await expect(page.getByRole('button', { name: '确认到账（模拟）' })).toHaveCount(0);
});

test('parent cannot access a supplied foreign child id and the dashboard cannot render that record', async ({ page }) => {
  await page.goto('/');
  await selectParentWorkbench(page);

  const foreignOrderAttempt = await page.request.post('/api/parent/orders', {
    headers: { 'x-demo-user': parentAccount.id },
    data: {
      studentId: 'e2e-foreign-child',
      packageId: 'demo-10',
    },
  });
  expect(foreignOrderAttempt.status()).toBe(403);
  await expect(foreignOrderAttempt.json()).resolves.toEqual({ code: 'FORBIDDEN' });

  const dashboard = await page.request.get('/api/parent/dashboard', {
    headers: { 'x-demo-user': parentAccount.id },
  });
  expect(dashboard.ok()).toBeTruthy();
  const body = await dashboard.json();
  expect(body.students).toHaveLength(1);
  expect(body.students.map(({ id }) => id)).not.toContain('e2e-foreign-child');

  await expect(page.getByText('Avery Rivera (Demo Student)')).toBeVisible();
  await expect(page.getByText('Foreign Child (Synthetic Record)')).toHaveCount(0);
  await expect(page.getByText('只显示当前家长账户的第一位孩子')).toBeVisible();
});

test('parent workbench captures desktop and mobile views without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await selectTeacherWorkbench(page);
  await page.getByRole('button', { name: '手动排课' }).click();
  const scheduleDialog = page.getByRole('dialog', { name: '手动排课' });
  await scheduleDialog.getByTestId('student-e2e-avery').check();
  await scheduleDialog.getByLabel('日期', { exact: true }).fill('2032-01-05');
  await scheduleDialog.getByLabel('开始时间', { exact: true }).fill('18:00');
  await scheduleDialog.getByLabel('课程备注', { exact: true }).fill('家长端响应式验收');
  const createLesson = page.waitForResponse((response) => (
    response.url().endsWith('/api/teacher/lessons') && response.request().method() === 'POST'
  ));
  await scheduleDialog.getByRole('button', { name: '保存课程' }).click();
  expect((await createLesson).status()).toBe(201);
  await page.getByRole('button', { name: '切换身份' }).click();
  await selectParentWorkbench(page);

  const nextLessonTime = page.getByTestId('next-lesson-time');
  await expect(nextLessonTime).toHaveText(/^\d{2}:\d{2}$/);

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.name === 'desktop') {
      const packageTrackWidth = await page.locator('.package-track').evaluate((element) => element.getBoundingClientRect().width);
      expect(packageTrackWidth).toBeGreaterThanOrEqual(viewport.width / 2);
    }
    await page.screenshot({ path: testInfo.outputPath(`parent-${viewport.name}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    if (viewport.name === 'mobile') {
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

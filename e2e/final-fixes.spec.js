import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

test.use({ timezoneId: 'UTC' });

const accounts = {
  teacher: {
    first: { id: 'e2e-teacher', name: '崔欣（演示教师）' },
    second: { id: 'e2e-teacher-other', name: '周老师（另一位演示教师）' },
  },
  parent: {
    first: { id: 'e2e-parent-demo', name: '李女士（演示家长）' },
    second: { id: 'e2e-parent-foreign', name: 'Foreign Parent (Synthetic Record)' },
  },
};

async function chooseAccount(page, role, account) {
  const accountsResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/accounts?role=${role}`) && response.request().method() === 'GET'
  ));
  await page.getByTestId(`choose-${role}`).click();
  expect((await (await accountsResponse).json()).map(({ id }) => id)).toContain(account.id);
  const gate = page.getByTestId('account-gate');
  await expect(gate).toBeVisible();
  await gate.getByRole('button').filter({ hasText: account.name }).click();
  await expect(page.getByTestId(`${role}-shell`)).toBeVisible();
}

async function switchRole(page) {
  await page.getByRole('button', { name: '切换身份' }).click();
  await expect(page.getByTestId('role-gate')).toBeVisible();
}

async function createLesson(page, { date = '2032-05-01', note = '账户隔离课程' } = {}) {
  await page.getByTestId('open-manual-schedule').click();
  const dialog = page.getByRole('dialog', { name: '手动排课' });
  await dialog.getByTestId('student-e2e-avery').check();
  await dialog.getByLabel('日期', { exact: true }).fill(date);
  await dialog.getByLabel('开始时间', { exact: true }).fill('18:05');
  await dialog.getByLabel('课程备注', { exact: true }).fill(note);
  const response = page.waitForResponse((candidate) => (
    candidate.url().endsWith('/api/teacher/lessons') && candidate.request().method() === 'POST'
  ));
  await dialog.getByRole('button', { name: '保存课程' }).click();
  const created = await response;
  expect(created.status()).toBe(201);
  return created.json();
}

test('teacher-to-teacher switching removes the previous schedule and failed account loads expose no stale data', async ({ page }) => {
  await page.goto('/');
  await chooseAccount(page, 'teacher', accounts.teacher.first);
  await createLesson(page);
  await expect(page.getByTestId('schedule-row')).toContainText('刘丽（演示学员）');

  await switchRole(page);
  await chooseAccount(page, 'teacher', accounts.teacher.second);
  await expect(page.getByTestId('schedule-row')).toHaveCount(0);

  await page.evaluate(() => sessionStorage.setItem('schedule-assistant-role-session', JSON.stringify({
    role: 'teacher',
    accountId: 'missing-teacher-account',
  })));
  await page.reload();
  await expect(page.getByTestId('teacher-shell').getByRole('alert')).toContainText('UNAUTHORIZED');
  await expect(page.getByTestId('schedule-row')).toHaveCount(0);
});

test('parent-to-parent switching replaces the child trajectory instead of retaining the previous account', async ({ page }) => {
  await page.goto('/');
  await chooseAccount(page, 'parent', accounts.parent.first);
  await expect(page.getByRole('heading', { name: /刘丽.*课程轨迹/ })).toBeVisible();

  await switchRole(page);
  await chooseAccount(page, 'parent', accounts.parent.second);
  await expect(page.getByRole('heading', { name: /Foreign Child.*课程轨迹/ })).toBeVisible();
  await expect(page.getByText('刘丽（演示学员）')).toHaveCount(0);
});

test('teacher-parent switching clears the AI draft and never carries role-specific content across', async ({ page }) => {
  await page.goto('/');
  await chooseAccount(page, 'teacher', accounts.teacher.first);
  await page.getByRole('button', { name: 'AI 排课草稿' }).click();
  await page.getByRole('textbox', { name: '课程描述' }).fill('不得跨角色保留的教师草稿');

  await switchRole(page);
  await chooseAccount(page, 'parent', accounts.parent.first);
  await expect(page.getByText('不得跨角色保留的教师草稿')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /刘丽.*课程轨迹/ })).toBeVisible();

  await switchRole(page);
  await chooseAccount(page, 'teacher', accounts.teacher.first);
  await page.getByRole('button', { name: 'AI 排课草稿' }).click();
  await expect(page.getByRole('textbox', { name: '课程描述' })).toHaveValue('');
  await expect(page.getByText(/课程轨迹$/)).toHaveCount(0);
});

test('real order routes reject second-child, inactive, and rebound confirmations for both simulation and manual-qr', async ({ page, db }) => {
  const headers = { 'x-demo-user': accounts.parent.first.id };
  const secondChild = await page.request.post('/api/parent/orders', {
    headers,
    data: { studentId: 'e2e-rowan', packageId: 'demo-10' },
  });
  expect(secondChild.status()).toBe(403);
  await expect(secondChild.json()).resolves.toEqual({ code: 'FORBIDDEN' });

  await db.student.update({ where: { id: 'e2e-avery' }, data: { isActive: false } });
  const inactiveSimulation = await page.request.post('/api/parent/orders', {
    headers,
    data: { studentId: 'e2e-avery', packageId: 'demo-10' },
  });
  expect(inactiveSimulation.status()).toBe(400);
  await expect(inactiveSimulation.json()).resolves.toEqual({ code: 'STUDENT_INACTIVE' });
  const inactiveManual = await page.request.post('/api/teacher/orders/manual', {
    headers: { 'x-demo-user': accounts.teacher.first.id },
    data: {
      studentId: 'e2e-avery',
      packageName: '停用学生订单',
      creditQuantity: 1,
      amountCents: 100,
      paymentMode: 'manual_qr',
    },
  });
  expect(inactiveManual.status()).toBe(400);
  await expect(inactiveManual.json()).resolves.toEqual({ code: 'STUDENT_INACTIVE' });

  await db.student.update({ where: { id: 'e2e-avery' }, data: { isActive: true } });
  const simulation = await page.request.post('/api/parent/orders', {
    headers,
    data: { studentId: 'e2e-avery', packageId: 'demo-10' },
  });
  expect(simulation.status()).toBe(201);
  const simulationOrder = await simulation.json();
  await db.student.update({ where: { id: 'e2e-avery' }, data: { parentId: accounts.parent.second.id } });
  const reboundSimulation = await page.request.post(`/api/parent/orders/${simulationOrder.id}/simulate-payment`, { headers });
  expect(reboundSimulation.status()).toBe(403);
  await expect(reboundSimulation.json()).resolves.toEqual({ code: 'FORBIDDEN' });

  const manual = await page.request.post('/api/teacher/orders/manual', {
    headers: { 'x-demo-user': accounts.teacher.first.id },
    data: {
      studentId: 'e2e-rowan',
      packageName: '改绑确认订单',
      creditQuantity: 2,
      amountCents: 200,
      paymentMode: 'manual_qr',
    },
  });
  expect(manual.status()).toBe(201);
  const manualOrder = await manual.json();
  await db.student.update({ where: { id: 'e2e-rowan' }, data: { isActive: false } });
  const inactiveConfirmation = await page.request.patch(`/api/teacher/orders/${manualOrder.id}/confirm-manual`, {
    headers: { 'x-demo-user': accounts.teacher.first.id },
  });
  expect(inactiveConfirmation.status()).toBe(400);
  await expect(inactiveConfirmation.json()).resolves.toEqual({ code: 'STUDENT_INACTIVE' });
  await db.student.update({
    where: { id: 'e2e-rowan' },
    data: { isActive: true, parentId: accounts.parent.second.id },
  });
  const reboundManual = await page.request.patch(`/api/teacher/orders/${manualOrder.id}/confirm-manual`, {
    headers: { 'x-demo-user': accounts.teacher.first.id },
  });
  expect(reboundManual.status()).toBe(403);
  await expect(reboundManual.json()).resolves.toEqual({ code: 'FORBIDDEN' });
});

test('UTC browser shows Beijing 18:05 and stale drawer writes fail accessibly without illegal completed actions', async ({ page }) => {
  await page.goto('/');
  await chooseAccount(page, 'teacher', accounts.teacher.first);
  const lesson = await createLesson(page, { date: '2032-05-02', note: '北京时间抽屉验收' });
  const row = page.getByTestId('schedule-row').filter({ hasText: '刘丽（演示学员）' });
  await expect(row.getByTestId('schedule-time')).toHaveText('18:05');
  await row.click();
  let drawer = page.getByRole('dialog', { name: /刘丽/ });
  await expect(drawer).toContainText('18:05');

  const completed = await page.request.patch(`/api/teacher/lessons/${lesson.id}`, {
    headers: { 'x-demo-user': accounts.teacher.first.id },
    data: { action: 'complete' },
  });
  expect(completed.status()).toBe(200);
  const failedWrite = page.waitForResponse((response) => (
    response.url().endsWith(`/api/teacher/lessons/${lesson.id}`) && response.request().method() === 'PATCH'
  ));
  await drawer.getByRole('button', { name: '标记为已完成' }).click();
  expect((await failedWrite).status()).toBe(400);
  await expect(drawer.getByRole('alert')).toContainText('INVALID_TRANSITION');
  await expect(drawer.getByRole('button', { name: '标记为已完成' })).toBeEnabled();

  await drawer.getByRole('button', { name: '关闭课程详情' }).click();
  const refresh = page.waitForResponse((response) => response.url().endsWith('/api/teacher/schedule'));
  await page.getByRole('button', { name: '刷新' }).click();
  await refresh;
  await expect(row).toContainText('已完成');
  await row.click();
  drawer = page.getByRole('dialog', { name: /刘丽/ });
  await expect(drawer.getByRole('button', { name: '编辑课程' })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: '取消预约' })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: '标记为已完成' })).toHaveCount(0);
  await drawer.getByRole('button', { name: '关闭课程详情' }).click();

  await switchRole(page);
  await chooseAccount(page, 'parent', accounts.parent.first);
  await expect(page.getByTestId('lesson-trail')).toContainText('18:05');
});

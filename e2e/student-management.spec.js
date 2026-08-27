import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

const teacherAccount = {
  id: 'e2e-teacher',
  name: 'Maya Chen (Demo Teacher)',
};

async function selectTeacherAccount(page) {
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

async function openStudentManager(page) {
  await page.getByRole('navigation', { name: '教师工作区' }).getByRole('button', { name: /^学员/ }).click();
  await page.getByTestId('manage-students').click();
  const dialog = page.getByRole('dialog', { name: '学员管理' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('teacher creates, edits, archives a student and cannot schedule the archived student', async ({ page }, testInfo) => {
  const originalName = 'E2E 林一';
  const editedName = 'E2E 林一（已编辑）';

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await selectTeacherAccount(page);

  let dialog = await openStudentManager(page);
  const closeButton = dialog.getByRole('button', { name: '关闭学员管理' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '新增学员' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  await dialog.getByLabel('姓名', { exact: true }).fill(originalName);
  await dialog.getByLabel('年级', { exact: true }).fill('8');
  await dialog.getByLabel('家长姓名', { exact: true }).fill('E2E 林家长');
  await dialog.getByLabel('家长邮箱', { exact: true }).fill('e2e.lin.parent@example.test');
  await dialog.getByLabel('总课时', { exact: true }).fill('6');

  const createResponse = page.waitForResponse((response) => (
    response.url().endsWith('/api/teacher/students') && response.request().method() === 'POST'
  ));
  await dialog.getByRole('button', { name: '新增学员' }).click();
  const createdResponse = await createResponse;
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(created).toEqual(expect.objectContaining({ name: originalName, grade: 8, totalCredits: 6, isActive: true }));
  await expect(page.getByRole('status')).toHaveText('学员已新增。');
  await expect(page.getByText(originalName, { exact: true })).toBeVisible();

  dialog = await openStudentManager(page);
  const createdRow = dialog.locator('.workflow-manager__row').filter({ hasText: originalName });
  await createdRow.getByRole('button', { name: '编辑' }).click();
  await dialog.getByLabel('姓名', { exact: true }).fill(editedName);
  await dialog.getByLabel('总课时', { exact: true }).fill('8');

  const updateResponse = page.waitForResponse((response) => (
    response.url().endsWith(`/api/teacher/students/${created.id}`) && response.request().method() === 'PATCH'
  ));
  await dialog.getByRole('button', { name: '保存修改' }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('学员资料已更新。');
  await expect(page.getByText(editedName, { exact: true })).toBeVisible();

  dialog = await openStudentManager(page);
  const editedRow = dialog.locator('.workflow-manager__row').filter({ hasText: editedName });
  page.once('dialog', (confirmation) => confirmation.accept());
  const archiveResponse = page.waitForResponse((response) => (
    response.url().endsWith(`/api/teacher/students/${created.id}`) && response.request().method() === 'DELETE'
  ));
  await editedRow.getByRole('button', { name: '停用' }).click();
  expect((await archiveResponse).status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('学员已停用，历史记录仍保留。');
  await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);

  await page.getByTestId('open-manual-schedule').click();
  const scheduleDialog = page.getByRole('dialog', { name: '手动排课' });
  await expect(scheduleDialog).toBeVisible();
  await expect(scheduleDialog.getByText(editedName, { exact: true })).toHaveCount(0);

  const rejected = await page.request.post('/api/teacher/lessons', {
    headers: { 'x-demo-user': teacherAccount.id },
    data: {
      studentIds: [created.id],
      startAt: '2032-03-01T18:05:00+08:00',
      durationMinutes: 60,
      note: '停用学员不得排课',
    },
  });
  expect(rejected.status()).toBe(400);
  await expect(rejected.json()).resolves.toEqual({ code: 'STUDENT_INACTIVE' });

  await page.keyboard.press('Escape');
  await expect(scheduleDialog).toHaveCount(0);
  await expect(page.getByTestId('open-manual-schedule')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('student-management-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('390px teacher student and order management use readable cards without internal horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const orderResponse = await page.request.post('/api/teacher/orders/manual', {
    headers: { 'x-demo-user': teacherAccount.id },
    data: {
      studentId: 'e2e-avery',
      packageName: '390px 可见课程包',
      creditQuantity: 4,
      amountCents: 19950,
      paymentMode: 'manual_qr',
    },
  });
  expect(orderResponse.status()).toBe(201);
  await page.goto('/');
  await selectTeacherAccount(page);

  const teacherNav = page.getByRole('navigation', { name: '教师工作区' });
  await teacherNav.getByRole('button', { name: /^学员/ }).click();
  let list = page.locator('.teacher-list');
  expect(await list.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await list.evaluate((element) => element.clientWidth),
  );
  const studentRow = list.locator('.teacher-list__row').filter({ hasText: 'Avery Rivera (Demo Student)' });
  await expect(studentRow).toContainText('使用中');
  await expect(studentRow).toContainText('9 节');
  await expect(studentRow).toContainText('3 节');
  const manage = page.getByTestId('manage-students');
  await expect(manage).toBeInViewport();
  await manage.click();
  const studentDialog = page.getByRole('dialog', { name: '学员管理' });
  const managedRow = studentDialog.locator('.workflow-manager__row').filter({ hasText: 'Avery Rivera (Demo Student)' });
  await expect(managedRow.getByRole('button', { name: '编辑' })).toBeInViewport();
  await expect(managedRow.getByRole('button', { name: '停用' })).toBeInViewport();
  await studentDialog.getByRole('button', { name: '关闭学员管理' }).click();

  await teacherNav.getByRole('button', { name: /^订单/ }).click();
  list = page.locator('.teacher-list');
  expect(await list.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await list.evaluate((element) => element.clientWidth),
  );
  const orderRow = list.locator('.teacher-list__row--orders').filter({ hasText: '390px 可见课程包' });
  await expect(orderRow).toContainText('Avery Rivera (Demo Student)');
  await expect(orderRow).toContainText('4 节');
  await expect(orderRow).toContainText('¥199.50');
  await expect(orderRow).toContainText('待确认');
  await expect(orderRow.getByRole('button', { name: '确认到账（模拟）' })).toBeInViewport();
  await expect(page.getByTestId('open-teacher-order')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

const teacherAccount = {
  id: 'e2e-teacher',
  name: '崔欣（演示教师）',
};

async function selectTeacherWorkbench(page) {
  const accountsResponse = page.waitForResponse((response) => (
    response.url().includes('/api/accounts?role=teacher') && response.request().method() === 'GET'
  ));
  await page.getByTestId('choose-teacher').click();
  const accounts = await (await accountsResponse).json();
  expect(accounts).toContainEqual(expect.objectContaining(teacherAccount));
  const accountGate = page.getByTestId('account-gate');
  await expect(accountGate).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择教师账户' })).toBeVisible();
  await accountGate.getByRole('button').filter({ hasText: teacherAccount.name }).click();
  await expect(page.getByTestId('teacher-shell')).toBeVisible();
  await expect(page.getByTestId('role-gate')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '手动排课' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新' })).toBeEnabled();
}

test('unconfigured AI provider rejects a draft without creating a lesson', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  await page.getByRole('button', { name: 'AI 排课草稿' }).click();
  const description = page.getByRole('textbox', { name: '课程描述' });
  await description.fill('e2e individual lesson');
  const responsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/ai/parse-schedule') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: '生成待确认草稿' }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toEqual({ code: 'AI_PROVIDER_UNAVAILABLE' });
  await expect(page.getByRole('alert')).toContainText('AI 预览暂不可用（AI_PROVIDER_UNAVAILABLE）');
  await expect(description).toHaveValue('e2e individual lesson');
  await expect(page.getByRole('button', { name: '确认预约' })).toHaveCount(0);

  const schedule = await page.request.get('/api/teacher/schedule', {
    headers: { 'x-demo-user': teacherAccount.id },
  });
  expect(schedule.ok()).toBeTruthy();
  expect(await schedule.json()).toHaveLength(0);
});

async function openManualSchedule(page) {
  await page.getByRole('button', { name: '手动排课' }).click();
  const dialog = page.getByRole('dialog', { name: '手动排课' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillManualLesson(dialog, {
  studentIds = ['e2e-avery'],
  date = '2032-03-01',
  time = '18:05',
  note = '一分钟精度的英语课',
} = {}) {
  for (const studentId of studentIds) await dialog.getByTestId(`student-${studentId}`).check();
  await dialog.getByLabel('日期', { exact: true }).fill(date);
  await dialog.getByLabel('开始时间', { exact: true }).fill(time);
  await dialog.getByLabel('课程备注', { exact: true }).fill(note);
}

async function saveManualLesson(page, options) {
  const dialog = await openManualSchedule(page);
  await fillManualLesson(dialog, options);
  const responsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/teacher/lessons') && response.request().method() === 'POST'
  ));
  await dialog.getByRole('button', { name: '保存课程' }).click();
  return responsePromise;
}

test('teacher schedules a minute-precise one-hour lesson at 18:05 through Express and PostgreSQL', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  const response = await saveManualLesson(page);
  expect(response.status()).toBe(201);
  const lesson = await response.json();
  expect(lesson).toEqual(expect.objectContaining({
    startsAt: '2032-03-01T10:05:00.000Z',
    durationMinutes: 60,
    note: '一分钟精度的英语课',
  }));

  await expect(page.getByRole('status')).toHaveText('手动排课已保存。');
  const row = page.getByTestId('schedule-row').filter({ hasText: '刘丽（演示学员）' });
  await expect(row.getByTestId('schedule-time')).toHaveText('18:05');
  await expect(row).toContainText('60 分钟');
  await expect(row).toContainText('已排课');
});

test('manual schedule uses a compact desktop panel and a touch-ready mobile sheet', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await selectTeacherWorkbench(page);

  let dialog = await openManualSchedule(page);
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(920);
  await expect(dialog.getByTestId('selected-student-summary')).toHaveText('可选择同年级学员一起上课');
  await dialog.getByTestId('student-e2e-avery').check();
  await expect(dialog.getByTestId('selected-student-summary')).toHaveText('已选 1 人 · 8 年级');
  await expect(dialog.getByTestId('student-balance-e2e-avery')).toHaveText('可用 9 节');
  await page.screenshot({ path: testInfo.outputPath('manual-schedule-desktop.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  dialog = page.getByRole('dialog', { name: '手动排课' });
  await expect(dialog.getByRole('button', { name: '保存课程' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const actionHeights = await dialog.locator('.workflow-sheet__actions button').evaluateAll((buttons) => (
    buttons.map((button) => button.getBoundingClientRect().height)
  ));
  expect(actionHeights.every((height) => height >= 44)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('manual-schedule-mobile.png') });
});

test('teacher schedules a same-grade group through the backend validation path', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  const response = await saveManualLesson(page, {
    studentIds: ['e2e-avery', 'e2e-rowan'],
    date: '2032-03-02',
    note: '八年级同组课',
  });
  expect(response.status()).toBe(201);
  await expect(page.getByRole('status')).toHaveText('手动排课已保存。');
  await expect(page.getByTestId('schedule-row')).toContainText('刘丽（演示学员）、王然（演示学员）');
});

test('teacher receives the real TIME_CONFLICT rejection without adding a second lesson', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  expect((await saveManualLesson(page)).status()).toBe(201);
  const conflictDialog = await openManualSchedule(page);
  await fillManualLesson(conflictDialog, { note: '冲突课程' });
  await conflictDialog.getByRole('button', { name: '保存课程' }).click();

  await expect(page.getByRole('alert')).toContainText('无法保存课程（TIME_CONFLICT）');
  const schedule = await page.request.get('/api/teacher/schedule', {
    headers: { 'x-demo-user': teacherAccount.id },
  });
  expect(schedule.ok()).toBeTruthy();
  const conflictSlot = (await schedule.json()).filter(({ startsAt }) => startsAt === '2032-03-01T10:05:00.000Z');
  expect(conflictSlot).toHaveLength(1);
});

test('teacher receives the real NO_CREDITS rejection without adding a lesson', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  const dialog = await openManualSchedule(page);
  await fillManualLesson(dialog, {
    studentIds: ['e2e-zero-credit'],
    date: '2032-03-03',
    note: '零课时课程',
  });
  await dialog.getByRole('button', { name: '保存课程' }).click();

  await expect(page.getByRole('alert')).toContainText('无法保存课程（NO_CREDITS）');
  const schedule = await page.request.get('/api/teacher/schedule', {
    headers: { 'x-demo-user': teacherAccount.id },
  });
  expect(schedule.ok()).toBeTruthy();
  expect(await schedule.json()).toHaveLength(0);
});

test('keyboard users stay in the lesson dialog and return to its trigger after closing it', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);
  expect((await saveManualLesson(page, { date: '2032-03-04', note: '键盘验收课程' })).status()).toBe(201);

  const trigger = page.getByTestId('schedule-row').filter({ hasText: '刘丽（演示学员）' });
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: /刘丽/ });
  const close = dialog.getByRole('button', { name: '关闭课程详情' });
  const complete = dialog.getByRole('button', { name: '标记为已完成' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(close).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(complete).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole('button', { name: '标记为已完成' }).click();
  await expect(page.getByRole('status')).toHaveText('课程已完成。');
});

test('teacher workbench captures desktop and mobile views without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await selectTeacherWorkbench(page);
  expect((await saveManualLesson(page)).status()).toBe(201);

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: testInfo.outputPath(`teacher-${viewport.name}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    if (viewport.name === 'mobile') {
      const touchTargetHeights = await page.getByTestId('teacher-shell').getByRole('button').evaluateAll((buttons) => (
        buttons.map((button) => button.getBoundingClientRect().height)
      ));
      expect(touchTargetHeights.every((height) => height >= 44)).toBeTruthy();

      const manualSchedule = page.getByRole('button', { name: '手动排课' });
      await manualSchedule.focus();
      await expect(manualSchedule).toHaveCSS('outline-width', '3px');
    }
  }
});

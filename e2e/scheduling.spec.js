import { expect } from '@playwright/test';
import { test } from './fixtures.mjs';

async function selectTeacherWorkbench(page) {
  await page.getByTestId('choose-teacher').click();
  await expect(page.getByTestId('teacher-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: '手动排课' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新' })).toBeEnabled();
}

async function preview(page, description) {
  await page.getByRole('button', { name: 'AI 排课草稿' }).click();
  await page.getByLabel('课程描述').fill(description);
  await page.getByRole('button', { name: '生成待确认草稿' }).click();
  await expect(page.getByRole('complementary', { name: 'AI 排课预览' })).toContainText('未排课草稿');
}

async function previewAndConfirm(page, description) {
  await preview(page, description);
  await page.getByRole('button', { name: '确认预约' }).click();
}

test('teacher confirms an individual AI preview through the Express API and PostgreSQL', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  await previewAndConfirm(page, 'e2e individual lesson');

  await expect(page.getByRole('status')).toHaveText('预约已确认，并已加入课表。');
  await expect(page.getByRole('button', { name: /Avery Rivera/ })).toBeVisible();
  await expect(page.getByTestId('schedule-row').filter({ hasText: 'Avery Rivera (Demo Student)' })).toContainText('已排课');
});

test('teacher confirms a same-grade group lesson through the backend validation path', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  await previewAndConfirm(page, 'e2e same-grade group lesson');

  await expect(page.getByRole('status')).toHaveText('预约已确认，并已加入课表。');
  await expect(page.getByRole('button', { name: /Avery Rivera.*Rowan Rivera/ })).toBeVisible();
  await expect(page.getByTestId('schedule-row').filter({ hasText: 'Rowan Rivera (Demo Student)' })).toContainText('已排课');
});

test('teacher receives the real TIME_CONFLICT rejection without adding a second lesson', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  await previewAndConfirm(page, 'e2e conflict baseline lesson');
  await expect(page.getByRole('status')).toHaveText('预约已确认，并已加入课表。');

  await previewAndConfirm(page, 'e2e conflicting lesson');

  await expect(page.getByRole('alert')).toContainText('预约未保存（TIME_CONFLICT）');
  const schedule = await page.request.get('/api/teacher/schedule', { headers: { 'x-demo-user': 'teacher-demo' } });
  expect(schedule.ok()).toBeTruthy();
  const conflictSlot = (await schedule.json()).filter(({ startsAt }) => startsAt === '2032-01-07T10:00:00.000Z');
  expect(conflictSlot).toHaveLength(1);
});

test('teacher receives the real NO_CREDITS rejection without adding a lesson', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);

  await previewAndConfirm(page, 'e2e zero credit lesson');

  await expect(page.getByRole('alert')).toContainText('预约未保存（NO_CREDITS）');
  await expect(page.getByRole('button', { name: /Zero Credit/ })).toHaveCount(0);
});

test('keyboard users stay in the lesson dialog and return to its trigger after closing it', async ({ page }) => {
  await page.goto('/');
  await selectTeacherWorkbench(page);
  await previewAndConfirm(page, 'e2e completion lesson');

  const trigger = page.getByRole('button', { name: /Avery Rivera/ }).last();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: /Avery Rivera/ });
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

test('teacher workbench captures readable desktop and mobile views without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await selectTeacherWorkbench(page);
  await previewAndConfirm(page, 'e2e individual lesson');

  const scheduledTime = page.getByTestId('schedule-row').getByTestId('schedule-time');
  await expect(scheduledTime).toHaveText(/^\d{2}:\d{2}$/);

  for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: testInfo.outputPath(`teacher-${viewport.name}.png`), fullPage: true });

    if (viewport.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
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

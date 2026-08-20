import { expect, test } from '@playwright/test';

test('parent completes a visibly simulated package order through Express and sees the persisted balance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Parent dashboard' }).click();

  await expect(page.getByText('For demonstration only — no real payment method is used.')).toBeVisible();
  await page.getByRole('button', { name: 'Choose' }).first().click();
  await expect(page.getByText('Demo order ready')).toBeVisible();
  await page.getByRole('button', { name: 'Complete simulated payment' }).click();

  await expect(page.getByRole('status')).toContainText('Simulated payment complete');
  await expect(page.getByText('Simulated payment complete')).toBeVisible();
  await expect(page.locator('.child-summary dd').first()).toHaveText('22');
  await expect(page.locator('.credit-balance strong')).toHaveText('19');
});

test('parent cannot access a supplied foreign child id and the dashboard cannot render that record', async ({ page }) => {
  const foreignOrderAttempt = await page.request.post('/api/parent/orders', {
    headers: { 'x-demo-user': 'parent-demo' },
    data: {
      studentId: 'e2e-foreign-child',
      packageName: 'Foreign Synthetic Package',
      creditQuantity: 1,
      amountCents: 1,
    },
  });
  expect(foreignOrderAttempt.status()).toBe(404);
  await expect(foreignOrderAttempt.json()).resolves.toEqual({ code: 'STUDENT_NOT_FOUND' });

  const dashboard = await page.request.get('/api/parent/dashboard', {
    headers: { 'x-demo-user': 'parent-demo' },
  });
  expect(dashboard.ok()).toBeTruthy();
  const body = await dashboard.json();
  expect(body.students.map(({ id }) => id)).not.toContain('e2e-foreign-child');

  await page.goto('/');
  await page.getByRole('button', { name: 'Parent dashboard' }).click();
  await expect(page.getByText('Avery Rivera (Demo Student)')).toBeVisible();
  await expect(page.getByText('Foreign Child (Synthetic Record)')).toHaveCount(0);
  await expect(page.getByText('Only children belonging to this demonstration parent account appear here.')).toBeVisible();
});

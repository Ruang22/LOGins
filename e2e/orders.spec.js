import { expect, test } from '@playwright/test';

const ownStudent = {
  id: 'avery', name: 'Avery Rivera (Demo Student)', grade: 8,
  totalCredits: 12, attendedCredits: 3, reservedCredits: 1, lessons: [],
};

async function mockParentApi(page) {
  const state = { student: structuredClone(ownStudent), order: null };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/teacher/schedule') return respond([]);
    if (url.pathname === '/api/teacher/students') return respond([]);
    if (url.pathname === '/api/teacher/orders') return respond([]);
    if (url.pathname === '/api/parent/dashboard') return respond({
      parent: { id: 'parent-demo', name: 'Jordan Rivera (Demo Parent)', email: 'jordan.rivera.demo.parent@example.test' },
      students: [state.student],
    });
    if (url.pathname === '/api/parent/orders' && request.method() === 'POST') {
      state.order = { id: 'order-1', status: 'pending', paymentMode: 'simulation', ...request.postDataJSON() };
      return respond(state.order, 201);
    }
    if (url.pathname === '/api/parent/orders/order-1/simulate-payment' && request.method() === 'POST') {
      state.order = { ...state.order, status: 'paid' };
      state.student.totalCredits += state.order.creditQuantity;
      return respond(state.order);
    }
    return respond({ code: 'UNEXPECTED_E2E_REQUEST' }, 500);
  });
  return state;
}

test('parent completes a visibly simulated package order and sees the refreshed balance', async ({ page }) => {
  const state = await mockParentApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Parent dashboard' }).click();

  await expect(page.getByText('For demonstration only — no real payment method is used.')).toBeVisible();
  await page.getByRole('button', { name: 'Choose' }).first().click();
  await expect(page.getByText('Demo order ready')).toBeVisible();
  await page.getByRole('button', { name: 'Complete simulated payment' }).click();

  await expect(page.getByRole('status')).toContainText('Simulated payment complete');
  await expect(page.getByText('Simulated payment complete')).toBeVisible();
  expect(state.order.status).toBe('paid');
  expect(state.student.totalCredits).toBe(22);
});

test('parent dashboard renders only data from the signed-in demonstration parent account', async ({ page }) => {
  await mockParentApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Parent dashboard' }).click();

  await expect(page.getByText('Avery Rivera (Demo Student)')).toBeVisible();
  await expect(page.getByText('Foreign Child (Synthetic Record)')).toHaveCount(0);
  await expect(page.getByText('Only children belonging to this demonstration parent account appear here.')).toBeVisible();
});

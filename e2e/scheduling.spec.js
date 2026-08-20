import { expect, test } from '@playwright/test';

const students = [
  { id: 'avery', name: 'Avery Rivera (Demo Student)', grade: 8, totalCredits: 12, attendedCredits: 3, reservedCredits: 1 },
  { id: 'rowan', name: 'Rowan Rivera (Demo Student)', grade: 8, totalCredits: 5, attendedCredits: 0, reservedCredits: 0 },
  { id: 'zero', name: 'Zero Credit (Demo Student)', grade: 9, totalCredits: 0, attendedCredits: 0, reservedCredits: 0 },
];

function lesson({ id = 'lesson-1', studentIds = ['avery'], startAt = '2031-01-08T10:00:00.000Z', status = 'scheduled' } = {}) {
  return {
    id,
    startsAt: startAt,
    durationMinutes: 60,
    status,
    participants: studentIds.map((studentId) => ({ studentId, student: students.find(({ id: value }) => value === studentId) })),
  };
}

async function mockTeacherApi(page, { nextCreateError, initialLessons = [] } = {}) {
  const state = { lessons: [...initialLessons], students: structuredClone(students), nextCreateError };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname === '/api/teacher/schedule' && request.method() === 'GET') return respond(state.lessons);
    if (url.pathname === '/api/teacher/students' && request.method() === 'GET') return respond(state.students);
    if (url.pathname === '/api/teacher/orders' && request.method() === 'GET') return respond([]);
    if (url.pathname === '/api/ai/parse-schedule' && request.method() === 'POST') {
      const { text } = request.postDataJSON();
      const studentNames = text.includes('group') ? [students[0].name, students[1].name] : text.includes('zero') ? [students[2].name] : [students[0].name];
      return respond({ suggestion: { courseName: 'English conversation', startAt: '2031-01-08T10:00:00.000Z', studentNames } });
    }
    if (url.pathname === '/api/teacher/lessons' && request.method() === 'POST') {
      if (state.nextCreateError) return respond({ code: state.nextCreateError }, 400);
      const body = request.postDataJSON();
      const created = lesson({ id: `lesson-${state.lessons.length + 1}`, studentIds: body.studentIds, startAt: body.startAt });
      state.lessons.push(created);
      for (const id of body.studentIds) state.students.find((student) => student.id === id).reservedCredits += 1;
      return respond(created, 201);
    }
    const transition = url.pathname.match(/^\/api\/teacher\/lessons\/([^/]+)$/);
    if (transition && request.method() === 'PATCH') {
      const current = state.lessons.find(({ id }) => id === transition[1]);
      const { action } = request.postDataJSON();
      current.status = action === 'complete' ? 'completed' : 'cancelled';
      for (const participant of current.participants) {
        const student = state.students.find(({ id }) => id === participant.studentId);
        student.reservedCredits -= 1;
        if (action === 'complete') student.attendedCredits += 1;
      }
      return respond(current);
    }
    return respond({ code: 'UNEXPECTED_E2E_REQUEST' }, 500);
  });
  return state;
}

async function previewAndConfirm(page, description) {
  await page.getByLabel('Describe the lesson').fill(description);
  await page.getByRole('button', { name: 'Create AI preview' }).click();
  await expect(page.getByRole('complementary', { name: 'AI schedule preview' })).toContainText('Unscheduled draft');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
}

test('teacher confirms an individual AI preview before one student reservation is saved', async ({ page }) => {
  const state = await mockTeacherApi(page);
  await page.goto('/');

  await previewAndConfirm(page, 'individual English lesson');

  await expect(page.getByRole('status')).toHaveText('Reservation confirmed and added to the weekly schedule.');
  expect(state.lessons).toHaveLength(1);
  expect(state.lessons[0].participants).toHaveLength(1);
  await expect(page.getByRole('button', { name: /Avery Rivera/ })).toBeVisible();
});

test('teacher confirms a same-grade group lesson after reviewing the AI preview', async ({ page }) => {
  const state = await mockTeacherApi(page);
  await page.goto('/');

  await previewAndConfirm(page, 'group English lesson');

  expect(state.lessons[0].participants.map(({ studentId }) => studentId)).toEqual(['avery', 'rowan']);
  expect(state.lessons[0].participants.map(({ student }) => student.grade)).toEqual([8, 8]);
  await expect(page.getByRole('button', { name: /Avery Rivera.*Rowan Rivera/ })).toBeVisible();
});

test('teacher is shown a conflict rejection without a schedule mutation', async ({ page }) => {
  const state = await mockTeacherApi(page, { nextCreateError: 'TIME_CONFLICT' });
  await page.goto('/');

  await previewAndConfirm(page, 'individual conflict lesson');

  await expect(page.getByRole('alert')).toContainText('Reservation not saved (TIME_CONFLICT)');
  expect(state.lessons).toHaveLength(0);
});

test('teacher is shown an insufficient-credit rejection without a schedule mutation', async ({ page }) => {
  const state = await mockTeacherApi(page, { nextCreateError: 'NO_CREDITS' });
  await page.goto('/');

  await previewAndConfirm(page, 'zero credit lesson');

  await expect(page.getByRole('alert')).toContainText('Reservation not saved (NO_CREDITS)');
  expect(state.lessons).toHaveLength(0);
});

test('teacher can complete a scheduled lesson through the keyboard-accessible details dialog', async ({ page }) => {
  const scheduledLesson = lesson();
  const state = await mockTeacherApi(page, { initialLessons: [scheduledLesson] });
  await page.goto('/');

  await page.getByRole('button', { name: /Avery Rivera/ }).click();
  const dialog = page.getByRole('dialog', { name: /Avery Rivera/ });
  await expect(dialog.getByRole('button', { name: 'Close lesson details' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Mark completed' }).click();

  await expect(page.getByRole('status')).toHaveText('Lesson completed.');
  expect(state.lessons[0].status).toBe('completed');
  expect(state.students.find(({ id }) => id === 'avery')).toMatchObject({ reservedCredits: 0, attendedCredits: 4 });
});

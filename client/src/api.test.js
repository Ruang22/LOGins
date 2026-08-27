import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

describe('api account selection', () => {
  it('loads role-filtered accounts without a protected account header', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetch);

    await api.accounts('parent');

    expect(fetch).toHaveBeenCalledWith('/api/accounts?role=parent', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('sends the selected persisted account id to protected parent requests', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ students: [] }));
    vi.stubGlobal('fetch', fetch);

    await api.parent.dashboard('parent-local-id');

    expect(fetch).toHaveBeenCalledWith('/api/parent/dashboard', expect.objectContaining({
      headers: {
        'Content-Type': 'application/json',
        'x-demo-user': 'parent-local-id',
      },
    }));
  });
});

describe('teacher write APIs', () => {
  it('uses the selected teacher account for student create, update, and archive', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ id: 'student-a' }));
    vi.stubGlobal('fetch', fetch);
    const student = {
      name: '林一',
      grade: 8,
      parentName: '林家长',
      parentEmail: 'lin@example.test',
      totalCredits: 10,
    };

    await api.teacher.createStudent(student, 'teacher-local-id');
    await api.teacher.updateStudent('student-a', { totalCredits: 12 }, 'teacher-local-id');
    await api.teacher.archiveStudent('student-a', 'teacher-local-id');

    expect(fetch.mock.calls).toEqual([
      ['/api/teacher/students', expect.objectContaining({ method: 'POST', body: JSON.stringify(student), headers: expect.objectContaining({ 'x-demo-user': 'teacher-local-id' }) })],
      ['/api/teacher/students/student-a', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ totalCredits: 12 }), headers: expect.objectContaining({ 'x-demo-user': 'teacher-local-id' }) })],
      ['/api/teacher/students/student-a', expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ 'x-demo-user': 'teacher-local-id' }) })],
    ]);
  });

  it('keeps lesson edits distinct from transitions and sends manual-order endpoints', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ id: 'record-a' }));
    vi.stubGlobal('fetch', fetch);
    const lesson = {
      studentIds: ['student-a'],
      startAt: '2032-03-01T18:05:00+08:00',
      durationMinutes: 60,
      note: '考前复习',
    };
    const order = {
      studentId: 'student-a',
      packageName: '冲刺课时包',
      creditQuantity: 6,
      amountCents: 128050,
      paymentMode: 'manual_qr',
    };

    await api.teacher.editLesson('lesson-a', lesson, 'teacher-local-id');
    await api.teacher.createManualOrder(order, 'teacher-local-id');
    await api.teacher.confirmManualOrder('order-a', 'teacher-local-id');

    expect(fetch.mock.calls).toEqual([
      ['/api/teacher/lessons/lesson-a', expect.objectContaining({ method: 'PATCH', body: JSON.stringify(lesson) })],
      ['/api/teacher/orders/manual', expect.objectContaining({ method: 'POST', body: JSON.stringify(order) })],
      ['/api/teacher/orders/order-a/confirm-manual', expect.objectContaining({ method: 'PATCH' })],
    ]);
  });
});

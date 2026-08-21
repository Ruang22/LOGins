import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import './support/test-database.js';
import { seedDatabase } from '../prisma/seed.js';
import { createApp } from '../src/app.js';

const prisma = new PrismaClient();
const createdIds = { users: [], students: [], lessons: [] };

function at(hour, minute = 0) {
  return new Date(Date.UTC(2031, 0, 2, hour, minute)).toISOString();
}

async function createStudent({ grade = 8, credits = 2 } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parent = await prisma.user.create({
    data: { name: `Route Parent ${suffix}`, email: `route-parent-${suffix}@example.test`, role: 'parent' },
  });
  const student = await prisma.student.create({
    data: { parentId: parent.id, name: `Route Student ${suffix}`, grade, totalCredits: credits },
  });
  createdIds.users.push(parent.id);
  createdIds.students.push(student.id);
  return student;
}

after(async () => {
  if (createdIds.lessons.length) await prisma.lesson.deleteMany({ where: { id: { in: createdIds.lessons } } });
  if (createdIds.students.length) await prisma.student.deleteMany({ where: { id: { in: createdIds.students } } });
  if (createdIds.users.length) await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
  await prisma.$disconnect();
});

test('a parent cannot call teacher schedule', async () => {
  await seedDatabase(prisma);
  await request(createApp())
    .get('/api/teacher/schedule')
    .set('x-demo-user', 'parent-demo')
    .expect(403, { code: 'FORBIDDEN' });
});

test('teacher creates, views, and completes a lesson through teacher routes', async () => {
  await seedDatabase(prisma);
  const student = await createStudent();
  const app = createApp();

  const students = await request(app)
    .get('/api/teacher/students')
    .set('x-demo-user', 'teacher-demo')
    .expect(200);
  const listedStudent = students.body.find(({ id }) => id === student.id);
  assert.equal(listedStudent.isActive, true);
  assert.equal(listedStudent.parent.email.startsWith('route-parent-'), true);
  assert.ok(students.body.every((listedStudent) => !Object.hasOwn(listedStudent, 'parentId')));

  const created = await request(app)
    .post('/api/teacher/lessons')
    .set('x-demo-user', 'teacher-demo')
    .send({ studentIds: [student.id], startAt: at(9) })
    .expect(201);
  createdIds.lessons.push(created.body.id);
  assert.equal(created.body.status, 'scheduled');

  const schedule = await request(app)
    .get('/api/teacher/schedule')
    .set('x-demo-user', 'teacher-demo')
    .expect(200);
  assert.ok(schedule.body.some(({ id }) => id === created.body.id));

  const completed = await request(app)
    .patch(`/api/teacher/lessons/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({ action: 'complete' })
    .expect(200);
  assert.equal(completed.body.status, 'completed');
});

test('teacher manually creates and edits a minute-precise lesson with a note', async () => {
  await seedDatabase(prisma);
  const firstStudent = await createStudent({ grade: 8, credits: 3 });
  const secondStudent = await createStudent({ grade: 8, credits: 3 });
  const app = createApp();

  const created = await request(app)
    .post('/api/teacher/lessons')
    .set('x-demo-user', 'teacher-demo')
    .send({
      studentIds: [firstStudent.id],
      startAt: '2032-03-01T18:05:00+08:00',
      durationMinutes: 60,
      note: '语法复习',
    })
    .expect(201);
  createdIds.lessons.push(created.body.id);
  assert.equal(created.body.note, '语法复习');

  const edited = await request(app)
    .patch(`/api/teacher/lessons/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({
      studentIds: [secondStudent.id],
      startAt: '2032-03-01T19:05:00+08:00',
      durationMinutes: 60,
      note: '阅读复习',
    })
    .expect(200);
  assert.equal(edited.body.note, '阅读复习');
  assert.equal(edited.body.startsAt, '2032-03-01T11:05:00.000Z');
  assert.deepEqual(edited.body.participants.map(({ studentId }) => studentId), [secondStudent.id]);
});

test('lesson patch rejects mixed and malformed update payloads', async () => {
  await seedDatabase(prisma);
  const student = await createStudent();
  const app = createApp();
  const created = await request(app)
    .post('/api/teacher/lessons')
    .set('x-demo-user', 'teacher-demo')
    .send({ studentIds: [student.id], startAt: at(20) })
    .expect(201);
  createdIds.lessons.push(created.body.id);

  const edit = {
    studentIds: [student.id],
    startAt: at(21),
    durationMinutes: 60,
    note: '',
  };
  await request(app)
    .patch(`/api/teacher/lessons/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({ action: 'cancel', ...edit })
    .expect(400, { code: 'INVALID_LESSON_UPDATE' });
  await request(app)
    .patch(`/api/teacher/lessons/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({ ...edit, unexpected: true })
    .expect(400, { code: 'INVALID_LESSON_UPDATE' });
  await request(app)
    .patch(`/api/teacher/lessons/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({})
    .expect(400, { code: 'INVALID_LESSON_UPDATE' });
  await request(app)
    .patch(`/api/teacher/lessons/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({ action: 'reschedule' })
    .expect(400, { code: 'INVALID_LESSON_UPDATE' });
});

test('lesson edits map unknown lessons to 404 and parent access to 403', async () => {
  await seedDatabase(prisma);
  const student = await createStudent();
  const body = { studentIds: [student.id], startAt: at(22), durationMinutes: 60, note: '' };
  const app = createApp();

  await request(app)
    .patch('/api/teacher/lessons/unknown-lesson')
    .set('x-demo-user', 'teacher-demo')
    .send(body)
    .expect(404, { code: 'LESSON_NOT_FOUND' });
  await request(app)
    .patch('/api/teacher/lessons/unknown-lesson')
    .set('x-demo-user', 'parent-demo')
    .send(body)
    .expect(403, { code: 'FORBIDDEN' });
});

test('teacher route refuses to schedule an inactive student', async () => {
  await seedDatabase(prisma);
  const student = await createStudent();
  await prisma.student.update({ where: { id: student.id }, data: { isActive: false } });

  await request(createApp())
    .post('/api/teacher/lessons')
    .set('x-demo-user', 'teacher-demo')
    .send({ studentIds: [student.id], startAt: at(23), durationMinutes: 60, note: '' })
    .expect(400, { code: 'STUDENT_INACTIVE' });
});

test('teacher creates, edits, and archives a student through teacher routes', async () => {
  await seedDatabase(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const app = createApp();

  const created = await request(app)
    .post('/api/teacher/students')
    .set('x-demo-user', 'teacher-demo')
    .send({
      name: `Managed ${suffix.slice(-8)}`,
      grade: 8,
      parentName: `Parent ${suffix.slice(-8)}`,
      parentEmail: `managed-parent-${suffix}@example.test`,
      totalCredits: 12,
    })
    .expect(201);
  createdIds.students.push(created.body.id);
  createdIds.users.push(created.body.parent.id);
  assert.equal(created.body.isActive, true);

  const updated = await request(app)
    .patch(`/api/teacher/students/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({ grade: 9, totalCredits: 10 })
    .expect(200);
  assert.equal(updated.body.grade, 9);
  assert.equal(updated.body.totalCredits, 10);

  const archived = await request(app)
    .delete(`/api/teacher/students/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .expect(200);
  assert.equal(archived.body.isActive, false);
});

test('teacher student routes reject invalid input and unknown students', async () => {
  await seedDatabase(prisma);
  const app = createApp();

  await request(app)
    .post('/api/teacher/students')
    .set('x-demo-user', 'teacher-demo')
    .send({
      name: 'Invalid Student',
      grade: 8,
      parentName: 'Invalid Parent',
      parentEmail: 'invalid@example.test',
      totalCredits: 1,
      unexpected: true,
    })
    .expect(400);

  await request(app)
    .patch('/api/teacher/students/unknown-student')
    .set('x-demo-user', 'teacher-demo')
    .send({ grade: 8 })
    .expect(404, { code: 'STUDENT_NOT_FOUND' });

  await request(app)
    .delete('/api/teacher/students/unknown-student')
    .set('x-demo-user', 'teacher-demo')
    .expect(404, { code: 'STUDENT_NOT_FOUND' });
});

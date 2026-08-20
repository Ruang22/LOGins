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
  assert.ok(students.body.some(({ id }) => id === student.id));
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

  await request(app)
    .patch(`/api/teacher/lessons/${created.body.id}`)
    .set('x-demo-user', 'teacher-demo')
    .send({ action: 'complete' })
    .expect(200, (response) => assert.equal(response.body.status, 'completed'));
});

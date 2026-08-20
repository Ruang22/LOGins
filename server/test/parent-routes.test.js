import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import './support/test-database.js';
import { seedDatabase } from '../prisma/seed.js';
import { createApp } from '../src/app.js';

const prisma = new PrismaClient();
const createdIds = { users: [], students: [], lessons: [] };

async function createOtherParentStudent() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parent = await prisma.user.create({
    data: { name: `Other Parent ${suffix}`, email: `other-parent-${suffix}@example.test`, role: 'parent' },
  });
  const student = await prisma.student.create({
    data: { parentId: parent.id, name: `Other Student ${suffix}`, grade: 9, totalCredits: 4 },
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

test('parent dashboard contains only the demo parent student data', async () => {
  await seedDatabase(prisma);
  const otherStudent = await createOtherParentStudent();
  const [teacher, demoStudent] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'maya.chen.demo.teacher@example.test' } }),
    prisma.student.findFirstOrThrow({
      where: { parent: { email: 'jordan.rivera.demo.parent@example.test' } },
      orderBy: { name: 'asc' },
    }),
  ]);
  const lesson = await prisma.lesson.create({
    data: {
      teacherId: teacher.id,
      startsAt: new Date('2032-01-02T09:00:00.000Z'),
      participants: { create: [{ studentId: demoStudent.id }] },
    },
  });
  createdIds.lessons.push(lesson.id);

  const response = await request(createApp())
    .get('/api/parent/dashboard')
    .set('x-demo-user', 'parent-demo')
    .expect(200);

  assert.equal(response.body.parent.email, 'jordan.rivera.demo.parent@example.test');
  assert.equal(response.body.students.length, 2);
  assert.ok(response.body.students.every((student) => student.id !== otherStudent.id));
  assert.ok(response.body.students.every((student) => Array.isArray(student.lessons)));
  assert.ok(response.body.students.some((student) => student.lessons.some(({ id }) => id === lesson.id)));
});

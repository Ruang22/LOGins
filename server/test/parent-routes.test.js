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

test('parent dashboard returns only the earliest-created active child and that child lessons', async () => {
  await seedDatabase(prisma);
  const otherStudent = await createOtherParentStudent();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [teacher, parent] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'maya.chen.demo.teacher@example.test' } }),
    prisma.user.create({
      data: { name: `Scoped Parent ${suffix}`, email: `scoped-parent-${suffix}@example.test`, role: 'parent' },
    }),
  ]);
  createdIds.users.push(parent.id);
  const inactiveStudent = await prisma.student.create({
    data: {
      parentId: parent.id,
      name: `Inactive Student ${suffix}`,
      grade: 7,
      isActive: false,
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
    },
  });
  const firstActiveStudent = await prisma.student.create({
    data: {
      parentId: parent.id,
      name: `First Active Student ${suffix}`,
      grade: 8,
      createdAt: new Date('2001-01-01T00:00:00.000Z'),
    },
  });
  const laterActiveStudent = await prisma.student.create({
    data: {
      parentId: parent.id,
      name: `Later Active Student ${suffix}`,
      grade: 9,
      createdAt: new Date('2002-01-01T00:00:00.000Z'),
    },
  });
  createdIds.students.push(inactiveStudent.id, firstActiveStudent.id, laterActiveStudent.id);
  const lesson = await prisma.lesson.create({
    data: {
      teacherId: teacher.id,
      startsAt: new Date('2032-01-02T09:00:00.000Z'),
      participants: { create: [{ studentId: firstActiveStudent.id }] },
    },
  });
  createdIds.lessons.push(lesson.id);

  const response = await request(createApp())
    .get('/api/parent/dashboard')
    .set('x-demo-user', parent.id)
    .expect(200);

  assert.equal(response.body.parent.email, parent.email);
  assert.equal(response.body.students.length, 1);
  assert.equal(response.body.students[0].id, firstActiveStudent.id);
  assert.ok(response.body.students.every((student) => student.id !== otherStudent.id));
  assert.ok(response.body.students.every((student) => student.id !== inactiveStudent.id));
  assert.ok(response.body.students.every((student) => student.id !== laterActiveStudent.id));
  assert.ok(response.body.students.every((student) => Array.isArray(student.lessons)));
  assert.ok(response.body.students.some((student) => student.lessons.some(({ id }) => id === lesson.id)));
});

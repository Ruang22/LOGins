import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../prisma/seed.js';

const prisma = new PrismaClient();

before(async () => {
  await prisma.order.deleteMany();
  await prisma.lessonParticipant.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
});

test('seed creates teacher, parent, and student records', async () => {
  await seedDatabase(prisma);
  assert.equal(await prisma.user.count({ where: { role: 'teacher' } }), 1);
  assert.ok((await prisma.student.count()) > 0);
});

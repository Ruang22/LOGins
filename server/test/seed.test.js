import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../prisma/seed.js';
import './support/test-database.js';

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

test('seed creates teacher, parent, and student records', async () => {
  await seedDatabase(prisma);
  assert.equal(await prisma.user.count({ where: { role: 'teacher' } }), 1);
  assert.ok((await prisma.student.count()) > 0);
});

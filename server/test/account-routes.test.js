import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import './support/test-database.js';
import { seedDatabase } from '../prisma/seed.js';
import { createApp } from '../src/app.js';

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

test('account list exposes only local parent choices and public account fields', async () => {
  await seedDatabase(prisma);

  const response = await request(createApp())
    .get('/api/accounts?role=parent')
    .expect(200);

  assert.ok(response.body.length > 0);
  assert.ok(response.body.every((account) => account.role === 'parent'));
  assert.ok(response.body.every((account) => (
    Object.keys(account).sort().join(',') === 'email,id,name,role'
  )));
});

test('a persisted local account id authenticates protected routes', async () => {
  await seedDatabase(prisma);
  const parent = await prisma.user.findUniqueOrThrow({
    where: { email: 'jordan.rivera.demo.parent@example.test' },
  });

  const response = await request(createApp())
    .get('/api/parent/dashboard')
    .set('x-demo-user', parent.id)
    .expect(200);

  assert.equal(response.body.parent.id, parent.id);
});

test('protected routes still reject a missing local account selection', async () => {
  await request(createApp())
    .get('/api/parent/dashboard')
    .expect(401, { code: 'UNAUTHORIZED' });
});

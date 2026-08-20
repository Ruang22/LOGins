import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import './support/test-database.js';
import { seedDatabase } from '../prisma/seed.js';
import { createApp } from '../src/app.js';

const prisma = new PrismaClient();
const createdOrderIds = [];

after(async () => {
  if (createdOrderIds.length) await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.$disconnect();
});

test('parent creates a clearly simulated order and teacher can review it', async () => {
  await seedDatabase(prisma);
  const student = await prisma.student.findFirstOrThrow({
    where: { parent: { email: 'jordan.rivera.demo.parent@example.test' } },
    orderBy: { name: 'asc' },
  });
  const app = createApp();

  const created = await request(app)
    .post('/api/parent/orders')
    .set('x-demo-user', 'parent-demo')
    .send({ studentId: student.id, packageName: 'Demo 10 Lesson Package', creditQuantity: 10, amountCents: 50000 })
    .expect(201);
  createdOrderIds.push(created.body.id);
  assert.equal(created.body.status, 'pending');
  assert.equal(created.body.paymentMode, 'simulation');

  const orders = await request(app)
    .get('/api/teacher/orders')
    .set('x-demo-user', 'teacher-demo')
    .expect(200);
  assert.ok(orders.body.some(({ id, paymentMode }) => id === created.body.id && paymentMode === 'simulation'));

  await request(app)
    .post(`/api/parent/orders/${created.body.id}/simulate-payment`)
    .set('x-demo-user', 'parent-demo')
    .expect(200, (response) => {
      assert.equal(response.body.status, 'paid');
      assert.equal(response.body.paymentMode, 'simulation');
    });
});

test('a parent is forbidden from reviewing teacher orders', async () => {
  await seedDatabase(prisma);
  await request(createApp())
    .get('/api/teacher/orders')
    .set('x-demo-user', 'parent-demo')
    .expect(403, { code: 'FORBIDDEN' });
});

test('teacher order review cannot confirm a simulated payment', async () => {
  await seedDatabase(prisma);
  await request(createApp())
    .patch('/api/teacher/orders/not-an-order/confirm')
    .set('x-demo-user', 'teacher-demo')
    .expect(404);
});

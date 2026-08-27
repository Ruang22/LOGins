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
    .send({ studentId: student.id, packageId: 'demo-10', packageName: 'Forged package', creditQuantity: 99999, amountCents: 1 })
    .expect(201);
  createdOrderIds.push(created.body.id);
  assert.equal(created.body.status, 'pending');
  assert.equal(created.body.paymentMode, 'simulation');
  assert.equal(created.body.creditQuantity, 10);
  assert.equal(created.body.amountCents, 50000);

  const orders = await request(app)
    .get('/api/teacher/orders')
    .set('x-demo-user', 'teacher-demo')
    .expect(200);
  assert.ok(orders.body.some(({ id, paymentMode, paidAt }) => id === created.body.id && paymentMode === 'simulation' && paidAt === null));

  const paid = await request(app)
    .post(`/api/parent/orders/${created.body.id}/simulate-payment`)
    .set('x-demo-user', 'parent-demo')
    .expect(200);
  assert.equal(paid.body.status, 'paid');
  assert.equal(paid.body.paymentMode, 'simulation');
  assert.ok(paid.body.paidAt);
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

test('teacher creates and confirms a manual QR order only once', async () => {
  await seedDatabase(prisma);
  const student = await prisma.student.findFirstOrThrow({
    where: { parent: { email: 'jordan.rivera.demo.parent@example.test' } },
    orderBy: { name: 'asc' },
  });
  const app = createApp();

  const created = await request(app)
    .post('/api/teacher/orders/manual')
    .set('x-demo-user', 'teacher-demo')
    .send({
      studentId: student.id,
      packageName: '周末巩固班',
      creditQuantity: 4,
      amountCents: 120000,
      paymentMode: 'manual_qr',
    })
    .expect(201);
  createdOrderIds.push(created.body.id);
  assert.equal(created.body.status, 'pending');
  assert.equal(created.body.paymentMode, 'manual_qr');

  const paid = await request(app)
    .patch(`/api/teacher/orders/${created.body.id}/confirm-manual`)
    .set('x-demo-user', 'teacher-demo')
    .expect(200);
  assert.equal(paid.body.status, 'paid');
  assert.ok(paid.body.paidAt);

  await request(app)
    .patch(`/api/teacher/orders/${created.body.id}/confirm-manual`)
    .set('x-demo-user', 'teacher-demo')
    .expect(400, { code: 'ORDER_ALREADY_PAID' });
});

test('teacher manual order route uses catalog facts and rejects parent access', async () => {
  await seedDatabase(prisma);
  const student = await prisma.student.findFirstOrThrow({
    where: { parent: { email: 'jordan.rivera.demo.parent@example.test' } },
    orderBy: { name: 'asc' },
  });
  const app = createApp();

  const created = await request(app)
    .post('/api/teacher/orders/manual')
    .set('x-demo-user', 'teacher-demo')
    .send({ studentId: student.id, packageId: 'demo-10', packageName: 'Forged', creditQuantity: 9999, amountCents: 1, paymentMode: 'manual_qr' })
    .expect(201);
  createdOrderIds.push(created.body.id);
  assert.deepEqual(
    { packageName: created.body.packageName, creditQuantity: created.body.creditQuantity, amountCents: created.body.amountCents },
    { packageName: 'Demo 10 Lesson Package', creditQuantity: 10, amountCents: 50000 },
  );

  await request(app)
    .post('/api/teacher/orders/manual')
    .set('x-demo-user', 'parent-demo')
    .send({ studentId: student.id, packageName: '无权登记', creditQuantity: 1, amountCents: 0, paymentMode: 'manual_qr' })
    .expect(403, { code: 'FORBIDDEN' });
});

test('order routes enforce the first-active-child and inactive-student boundaries', async (t) => {
  await seedDatabase(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parent = await prisma.user.create({
    data: { name: `Boundary Parent ${suffix}`, email: `boundary-parent-${suffix}@example.test`, role: 'parent' },
  });
  const firstChild = await prisma.student.create({
    data: { parentId: parent.id, name: `First Boundary Child ${suffix}`, grade: 8, totalCredits: 2 },
  });
  const secondChild = await prisma.student.create({
    data: { parentId: parent.id, name: `Second Boundary Child ${suffix}`, grade: 8, totalCredits: 2 },
  });
  t.after(async () => {
    await prisma.order.deleteMany({ where: { parentId: parent.id } });
    await prisma.student.deleteMany({ where: { id: { in: [firstChild.id, secondChild.id] } } });
    await prisma.user.delete({ where: { id: parent.id } });
  });
  const app = createApp();

  await request(app)
    .post('/api/parent/orders')
    .set('x-demo-user', parent.id)
    .send({ studentId: secondChild.id, packageId: 'demo-10' })
    .expect(403, { code: 'FORBIDDEN' });

  const created = await request(app)
    .post('/api/parent/orders')
    .set('x-demo-user', parent.id)
    .send({ studentId: firstChild.id, packageId: 'demo-10' })
    .expect(201);
  createdOrderIds.push(created.body.id);

  await prisma.student.update({ where: { id: firstChild.id }, data: { isActive: false } });
  await request(app)
    .post('/api/parent/orders')
    .set('x-demo-user', parent.id)
    .send({ studentId: firstChild.id, packageId: 'demo-10' })
    .expect(400, { code: 'STUDENT_INACTIVE' });
  await request(app)
    .post('/api/teacher/orders/manual')
    .set('x-demo-user', 'teacher-demo')
    .send({
      studentId: firstChild.id,
      packageName: '停用边界课程包',
      creditQuantity: 1,
      amountCents: 100,
      paymentMode: 'manual_qr',
    })
    .expect(400, { code: 'STUDENT_INACTIVE' });
});

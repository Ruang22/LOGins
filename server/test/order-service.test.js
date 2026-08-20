import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import './support/test-database.js';
import {
  confirmSimulationOrder,
  createOrder,
} from '../src/services/order-service.js';

const prisma = new PrismaClient();
const createdIds = { users: [], students: [], orders: [] };

async function createFixture() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const teacher = await prisma.user.create({
    data: { name: `Order Teacher ${suffix}`, email: `order-teacher-${suffix}@example.test`, role: 'teacher' },
  });
  const parent = await prisma.user.create({
    data: { name: `Order Parent ${suffix}`, email: `order-parent-${suffix}@example.test`, role: 'parent' },
  });
  const otherParent = await prisma.user.create({
    data: { name: `Other Parent ${suffix}`, email: `other-parent-${suffix}@example.test`, role: 'parent' },
  });
  const student = await prisma.student.create({
    data: { parentId: parent.id, name: `Order Student ${suffix}`, grade: 8, totalCredits: 2 },
  });
  createdIds.users.push(teacher.id, parent.id, otherParent.id);
  createdIds.students.push(student.id);
  return { teacher, parent, otherParent, student };
}

after(async () => {
  if (createdIds.orders.length) await prisma.order.deleteMany({ where: { id: { in: createdIds.orders } } });
  if (createdIds.students.length) await prisma.student.deleteMany({ where: { id: { in: createdIds.students } } });
  if (createdIds.users.length) await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
  await prisma.$disconnect();
});

test('a simulation order adds credits only once', async () => {
  const { parent, student } = await createFixture();
  const order = await createOrder({
    studentId: student.id,
    packageId: 'demo-10',
  }, parent);
  createdIds.orders.push(order.id);

  const confirmed = await confirmSimulationOrder(order.id, parent);
  assert.equal(confirmed.status, 'paid');
  assert.equal(confirmed.paymentMode, 'simulation');
  assert.ok(confirmed.paidAt instanceof Date);
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).totalCredits, 12);

  await assert.rejects(
    confirmSimulationOrder(order.id, parent),
    (error) => error.code === 'ORDER_NOT_PENDING',
  );
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).totalCredits, 12);
});

test('a parent cannot create or confirm an order for another parent student', async () => {
  const { parent, otherParent, student } = await createFixture();

  await assert.rejects(
    createOrder({ studentId: student.id, packageId: 'demo-10' }, otherParent),
    (error) => error.code === 'FORBIDDEN',
  );

  const order = await createOrder({ studentId: student.id, packageId: 'demo-10' }, parent);
  createdIds.orders.push(order.id);
  await assert.rejects(
    confirmSimulationOrder(order.id, otherParent),
    (error) => error.code === 'FORBIDDEN',
  );
});

test('a teacher cannot confirm a parent simulated order', async () => {
  const { teacher, parent, student } = await createFixture();
  const order = await createOrder({ studentId: student.id, packageId: 'demo-10' }, parent);
  createdIds.orders.push(order.id);

  await assert.rejects(
    confirmSimulationOrder(order.id, teacher),
    (error) => error.code === 'FORBIDDEN',
  );
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).totalCredits, 2);
});

test('uses catalog facts instead of client-supplied package price and credits', async () => {
  const { parent, student } = await createFixture();
  const order = await createOrder({
    studentId: student.id,
    packageId: 'demo-10',
    packageName: 'Forged package',
    creditQuantity: 99999,
    amountCents: 1,
  }, parent);
  createdIds.orders.push(order.id);
  assert.deepEqual(
    { packageId: order.packageId, packageName: order.packageName, creditQuantity: order.creditQuantity, amountCents: order.amountCents },
    { packageId: 'demo-10', packageName: 'Demo 10 Lesson Package', creditQuantity: 10, amountCents: 50000 },
  );
});

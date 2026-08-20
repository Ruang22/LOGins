import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import './support/test-database.js';

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

test('final correction marks ambiguous historical paidAt values unknown while preserving post-cutoff timestamps', async () => {
  const suffix = Date.now().toString();
  const parent = await prisma.user.create({
    data: { name: `Migration Parent ${suffix}`, email: `migration-${suffix}@example.com`, role: 'parent' },
  });
  const student = await prisma.student.create({
    data: { parentId: parent.id, name: `Migration Student ${suffix}`, grade: 3 },
  });
  const legacyCreatedAt = new Date('2026-01-10T10:00:00.000Z');
  const legacyUpdatedAt = new Date('2026-01-10T10:05:00.000Z');
  const legacyBackfill = await prisma.order.create({
    data: {
      parentId: parent.id,
      studentId: student.id,
      packageName: 'Demo 10 Lesson Package',
      packageId: 'demo-10',
      creditQuantity: 10,
      amountCents: 50000,
      status: 'paid',
      createdAt: legacyCreatedAt,
      updatedAt: legacyUpdatedAt,
    },
  });
  const collisionCreatedAt = new Date('2026-01-11T10:00:00.000Z');
  const collisionUpdatedAt = new Date('2026-01-11T10:05:00.000Z');
  const legacyImmediatePayment = await prisma.order.create({
    data: {
      parentId: parent.id,
      studentId: student.id,
      packageName: 'Demo 10 Lesson Package',
      packageId: 'demo-10',
      creditQuantity: 10,
      amountCents: 50000,
      status: 'paid',
      paidAt: collisionCreatedAt,
      createdAt: collisionCreatedAt,
      updatedAt: collisionUpdatedAt,
    },
  });
  const postCutoffPaidAt = new Date('2026-08-20T02:30:00.000Z');
  const postCutoffUpdatedAt = new Date('2026-08-20T03:00:00.000Z');
  const postCutoff = await prisma.order.create({
    data: {
      parentId: parent.id,
      studentId: student.id,
      packageName: 'Demo 10 Lesson Package',
      packageId: 'demo-10',
      creditQuantity: 10,
      amountCents: 50000,
      status: 'paid',
      paidAt: postCutoffPaidAt,
      createdAt: postCutoffPaidAt,
      updatedAt: postCutoffUpdatedAt,
    },
  });

  // Reproduce the already-applied legacy migration's backfill before running the fix.
  // Reproduce the state left by the prior two migrations. The second legacy
  // row collides with the backfill shape despite having a genuine immediate
  // payment, so the final migration must prefer an honest unknown value.
  await prisma.$executeRaw`UPDATE "Order" SET "paidAt" = "createdAt" WHERE "id" = ${legacyBackfill.id}`;
  const priorCorrection = await fs.readFile(
    new URL('../prisma/migrations/20260820030000_correct_legacy_paid_at/migration.sql', import.meta.url),
    'utf8',
  );
  await prisma.$executeRawUnsafe(priorCorrection);
  const finalCorrection = await fs.readFile(
    new URL('../prisma/migrations/20260820040000_null_ambiguous_historical_paid_at/migration.sql', import.meta.url),
    'utf8',
  );
  await prisma.$executeRawUnsafe(finalCorrection);

  const [backfilled, collision, preserved] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: legacyBackfill.id } }),
    prisma.order.findUniqueOrThrow({ where: { id: legacyImmediatePayment.id } }),
    prisma.order.findUniqueOrThrow({ where: { id: postCutoff.id } }),
  ]);
  assert.equal(backfilled.paidAt, null);
  assert.equal(collision.paidAt, null);
  assert.equal(preserved.paidAt?.toISOString(), postCutoffPaidAt.toISOString());

  await prisma.order.deleteMany({ where: { parentId: parent.id } });
  await prisma.student.delete({ where: { id: student.id } });
  await prisma.user.delete({ where: { id: parent.id } });
});

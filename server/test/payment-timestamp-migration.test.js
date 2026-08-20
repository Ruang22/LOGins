import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import './support/test-database.js';

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

test('corrective migration uses updatedAt for legacy paid orders, preserving new paidAt values', async () => {
  const suffix = Date.now().toString();
  const parent = await prisma.user.create({
    data: { name: `Migration Parent ${suffix}`, email: `migration-${suffix}@example.com`, role: 'parent' },
  });
  const student = await prisma.student.create({
    data: { parentId: parent.id, name: `Migration Student ${suffix}`, grade: 3 },
  });
  const legacyCreatedAt = new Date('2026-01-10T10:00:00.000Z');
  const legacyUpdatedAt = new Date('2026-01-10T10:05:00.000Z');
  const legacy = await prisma.order.create({
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
  const newerPaidAt = new Date('2026-08-20T03:00:00.000Z');
  const newerCreatedAt = new Date('2026-08-20T02:30:00.000Z');
  const newer = await prisma.order.create({
    data: {
      parentId: parent.id,
      studentId: student.id,
      packageName: 'Demo 10 Lesson Package',
      packageId: 'demo-10',
      creditQuantity: 10,
      amountCents: 50000,
      status: 'paid',
      paidAt: newerPaidAt,
      createdAt: newerCreatedAt,
      updatedAt: newerPaidAt,
    },
  });

  // Reproduce the already-applied legacy migration's backfill before running the fix.
  await prisma.$executeRaw`UPDATE "Order" SET "paidAt" = "createdAt" WHERE "id" = ${legacy.id}`;
  const migration = await fs.readFile(
    new URL('../prisma/migrations/20260820030000_correct_legacy_paid_at/migration.sql', import.meta.url),
    'utf8',
  );
  await prisma.$executeRawUnsafe(migration);

  const [corrected, preserved] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: legacy.id } }),
    prisma.order.findUniqueOrThrow({ where: { id: newer.id } }),
  ]);
  assert.equal(corrected.paidAt?.toISOString(), legacyUpdatedAt.toISOString());
  assert.equal(preserved.paidAt?.toISOString(), newerPaidAt.toISOString());

  await prisma.order.deleteMany({ where: { parentId: parent.id } });
  await prisma.student.delete({ where: { id: student.id } });
  await prisma.user.delete({ where: { id: parent.id } });
});

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import './support/test-database.js';

const adminPrisma = new PrismaClient();

after(async () => {
  await adminPrisma.$disconnect();
});

async function applyMigration(prisma, directory) {
  const sql = await fs.readFile(
    new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url),
    'utf8',
  );
  const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

test("migration leaves a pre-existing paid order's unknown payment time null", async () => {
  const schema = `migration_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set('schema', schema);
  await adminPrisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const migrationPrisma = new PrismaClient({ datasourceUrl: databaseUrl.toString() });

  try {
    await applyMigration(migrationPrisma, '20260820000000_initial_schema');
    await migrationPrisma.$executeRawUnsafe(`
      INSERT INTO "User" ("id", "name", "email", "role", "createdAt", "updatedAt")
      VALUES ('legacy-parent', 'Legacy Parent', 'legacy-parent@example.test', 'parent',
              TIMESTAMP '2026-01-10 09:00:00', TIMESTAMP '2026-01-10 09:00:00')
    `);
    await migrationPrisma.$executeRawUnsafe(`
      INSERT INTO "Student" ("id", "parentId", "name", "grade", "createdAt", "updatedAt")
      VALUES ('legacy-student', 'legacy-parent', 'Legacy Student', 3,
              TIMESTAMP '2026-01-10 09:00:00', TIMESTAMP '2026-01-10 09:00:00')
    `);
    await migrationPrisma.$executeRawUnsafe(`
      INSERT INTO "Order" (
        "id", "parentId", "studentId", "packageName", "creditQuantity",
        "amountCents", "status", "createdAt", "updatedAt"
      ) VALUES (
        'legacy-paid-order', 'legacy-parent', 'legacy-student',
        'Demo 20 Lesson Package', 20, 92000, 'paid',
        TIMESTAMP '2026-01-10 10:00:00', TIMESTAMP '2026-01-10 10:05:00'
      )
    `);

    await applyMigration(migrationPrisma, '20260820010000_persist_order_payment_details');
    await applyMigration(migrationPrisma, '20260820020000_sanitize_legacy_order_package_details');

    const [legacyOrder] = await migrationPrisma.$queryRawUnsafe(`
      SELECT "packageId", "paymentMode", "paidAt"
      FROM "Order"
      WHERE "id" = 'legacy-paid-order'
    `);
    assert.deepEqual(legacyOrder, {
      packageId: 'demo-20',
      paymentMode: 'simulation',
      paidAt: null,
    });
  } finally {
    await migrationPrisma.$disconnect();
    await adminPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const testEnvironmentPath = fileURLToPath(new URL('../../.env.test', import.meta.url));
dotenv.config({ path: testEnvironmentPath });

const testDatabaseUrl = process.env.DATABASE_URL;
const expectedDatabaseName = 'schedule_assistant_test';

if (!testDatabaseUrl) {
  throw new Error(
    `Seed tests require ${testEnvironmentPath} with DATABASE_URL for ${expectedDatabaseName}.`,
  );
}

const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
if (databaseName !== expectedDatabaseName) {
  throw new Error(
    `Seed tests only run against the dedicated ${expectedDatabaseName} database.`,
  );
}

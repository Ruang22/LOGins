import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { e2eDatabaseUrl, requireDedicatedE2eDatabase, resetE2eDatabase } from './fixtures.mjs';

const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

process.env.DATABASE_URL = requireDedicatedE2eDatabase(e2eDatabaseUrl);
delete process.env.AI_PROVIDER_API_KEY;
delete process.env.AI_PROVIDER_BASE_URL;
delete process.env.AI_PROVIDER_MODEL;
const migration = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  stdio: 'inherit',
  cwd: 'server',
  env: process.env,
});
const [migrationCode] = await once(migration, 'exit');
if (migrationCode !== 0) process.exitCode = migrationCode || 1;
if (process.exitCode) process.exit();

const { prisma } = await import('../server/src/db/client.js');
const { createApp } = await import('../server/src/app.js');

await resetE2eDatabase(prisma);
const apiServer = createApp().listen(3000, '127.0.0.1');
const vite = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5173'], {
  stdio: 'inherit',
  cwd: 'client',
  env: process.env,
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  vite.kill();
  await new Promise((resolve) => apiServer.close(resolve));
  await prisma.$disconnect();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
await once(vite, 'exit');
await shutdown();

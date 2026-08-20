import { PrismaClient } from '@prisma/client';
import { test as base } from '@playwright/test';

export const e2eDatabaseUrl = process.env.E2E_DATABASE_URL
  ?? 'postgresql://schedule_app:change-me-for-local-development@127.0.0.1:5433/schedule_assistant_e2e';

export function requireDedicatedE2eDatabase(databaseUrl = e2eDatabaseUrl) {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (databaseName !== 'schedule_assistant_e2e') {
    throw new Error('E2E_DATABASE_URL must point to the dedicated schedule_assistant_e2e database.');
  }
  return databaseUrl;
}

const suggestions = {
  'e2e individual lesson': { courseName: 'Individual English', startAt: '2032-01-05T10:00:00.000Z', studentNames: ['Avery Rivera (Demo Student)'] },
  'e2e same-grade group lesson': { courseName: 'Grade 8 English group', startAt: '2032-01-06T10:00:00.000Z', studentNames: ['Avery Rivera (Demo Student)', 'Rowan Rivera (Demo Student)'] },
  'e2e conflict baseline lesson': { courseName: 'Conflict baseline', startAt: '2032-01-07T10:00:00.000Z', studentNames: ['Avery Rivera (Demo Student)'] },
  'e2e conflicting lesson': { courseName: 'Conflicting English lesson', startAt: '2032-01-07T10:00:00.000Z', studentNames: ['Avery Rivera (Demo Student)'] },
  'e2e zero credit lesson': { courseName: 'No-credit English lesson', startAt: '2032-01-08T10:00:00.000Z', studentNames: ['Zero Credit (Demo Student)'] },
  'e2e completion lesson': { courseName: 'Completion English lesson', startAt: '2032-01-09T10:00:00.000Z', studentNames: ['Avery Rivera (Demo Student)'] },
};

export function createE2eAiProvider() {
  return {
    async parseSchedule(text) {
      const suggestion = suggestions[text];
      if (!suggestion) throw new Error(`No deterministic E2E AI suggestion is configured for: ${text}`);
      return JSON.stringify(suggestion);
    },
  };
}

export async function resetE2eDatabase(prisma) {
  await prisma.lessonParticipant.deleteMany();
  await prisma.order.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: 'e2e-teacher', name: 'Maya Chen (Demo Teacher)', email: 'maya.chen.demo.teacher@example.test', role: 'teacher' },
      { id: 'e2e-parent-demo', name: 'Jordan Rivera (Demo Parent)', email: 'jordan.rivera.demo.parent@example.test', role: 'parent' },
      { id: 'e2e-parent-foreign', name: 'Foreign Parent (Synthetic Record)', email: 'foreign.parent@example.test', role: 'parent' },
    ],
  });
  await prisma.student.createMany({
    data: [
      { id: 'e2e-avery', parentId: 'e2e-parent-demo', name: 'Avery Rivera (Demo Student)', grade: 8, totalCredits: 12, attendedCredits: 3, reservedCredits: 0 },
      { id: 'e2e-rowan', parentId: 'e2e-parent-demo', name: 'Rowan Rivera (Demo Student)', grade: 8, totalCredits: 5, attendedCredits: 0, reservedCredits: 0 },
      { id: 'e2e-zero-credit', parentId: 'e2e-parent-demo', name: 'Zero Credit (Demo Student)', grade: 9, totalCredits: 0, attendedCredits: 0, reservedCredits: 0 },
      { id: 'e2e-foreign-child', parentId: 'e2e-parent-foreign', name: 'Foreign Child (Synthetic Record)', grade: 9, totalCredits: 9, attendedCredits: 1, reservedCredits: 0 },
    ],
  });
}

const e2ePrisma = new PrismaClient({
  datasources: { db: { url: requireDedicatedE2eDatabase(e2eDatabaseUrl) } },
});

export const test = base.extend({
  resetDatabase: [async ({}, use) => {
    await resetE2eDatabase(e2ePrisma);
    await use();
  }, { auto: true }],
});

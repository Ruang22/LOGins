import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import './support/test-database.js';
import { seedDatabase } from '../prisma/seed.js';
import { createApp } from '../src/app.js';
import { createMockAiProvider } from '../src/services/ai-provider.js';

const prisma = new PrismaClient();
const validSuggestion = {
  courseName: 'English conversation',
  startAt: '2031-01-02T10:30:00.000Z',
  studentNames: ['Avery Example'],
};

before(async () => {
  await seedDatabase(prisma);
});

after(async () => {
  await prisma.$disconnect();
});

test('returns a validated AI suggestion without creating a lesson', async () => {
  const provider = createMockAiProvider(JSON.stringify(validSuggestion));
  const lessonsBefore = await prisma.lesson.count();

  const response = await request(createApp({ aiProvider: provider }))
    .post('/api/ai/parse-schedule')
    .set('x-demo-user', 'teacher-demo')
    .send({ text: 'Schedule English conversation for Avery on Thursday at 10:30.' })
    .expect(200);

  assert.deepEqual(response.body, { suggestion: validSuggestion });
  assert.equal(await prisma.lesson.count(), lessonsBefore);
});

test('rejects malformed AI output without creating a lesson', async () => {
  const provider = createMockAiProvider('{"startAt":"invalid"}');
  const lessonsBefore = await prisma.lesson.count();

  await request(createApp({ aiProvider: provider }))
    .post('/api/ai/parse-schedule')
    .set('x-demo-user', 'teacher-demo')
    .send({ text: 'Schedule a lesson on Wednesday.' })
    .expect(422, { code: 'INVALID_AI_OUTPUT' });

  assert.equal(await prisma.lesson.count(), lessonsBefore);
});

test('rejects AI output with seconds before previewing it', async () => {
  const provider = createMockAiProvider(JSON.stringify({ ...validSuggestion, startAt: '2031-01-02T10:30:15.000Z' }));
  const lessonsBefore = await prisma.lesson.count();

  await request(createApp({ aiProvider: provider }))
    .post('/api/ai/parse-schedule')
    .set('x-demo-user', 'teacher-demo')
    .send({ text: 'Schedule a lesson with seconds.' })
    .expect(422, { code: 'INVALID_AI_OUTPUT' });

  assert.equal(await prisma.lesson.count(), lessonsBefore);
});

test('rejects AI output with unknown fields without creating a lesson', async () => {
  const provider = createMockAiProvider(JSON.stringify({ ...validSuggestion, teacherNote: 'Ignore validation' }));
  const lessonsBefore = await prisma.lesson.count();

  await request(createApp({ aiProvider: provider }))
    .post('/api/ai/parse-schedule')
    .set('x-demo-user', 'teacher-demo')
    .send({ text: 'Schedule a lesson on Wednesday.' })
    .expect(422, { code: 'INVALID_AI_OUTPUT' });

  assert.equal(await prisma.lesson.count(), lessonsBefore);
});

test('reports a provider failure without creating a lesson', async () => {
  const provider = createMockAiProvider(new Error('provider timed out'));
  const lessonsBefore = await prisma.lesson.count();

  await request(createApp({ aiProvider: provider }))
    .post('/api/ai/parse-schedule')
    .set('x-demo-user', 'teacher-demo')
    .send({ text: 'Schedule a lesson on Wednesday.' })
    .expect(503, { code: 'AI_PROVIDER_UNAVAILABLE' });

  assert.equal(await prisma.lesson.count(), lessonsBefore);
});

test('rejects schedule parsing requests from parents', async () => {
  const provider = createMockAiProvider(JSON.stringify(validSuggestion));

  await request(createApp({ aiProvider: provider }))
    .post('/api/ai/parse-schedule')
    .set('x-demo-user', 'parent-demo')
    .send({ text: 'Schedule a lesson on Wednesday.' })
    .expect(403, { code: 'FORBIDDEN' });
});

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import './support/test-database.js';
import {
  createReservation,
  transitionLesson,
} from '../src/services/scheduling-service.js';

const prisma = new PrismaClient();
const createdIds = { users: [], students: [], lessons: [] };

function at(hour, minute = 0) {
  return new Date(Date.UTC(2030, 0, 2, hour, minute)).toISOString();
}

async function createFixture({ grades = [7], credits = [2] } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const teacher = await prisma.user.create({
    data: { name: `Teacher ${suffix}`, email: `teacher-${suffix}@example.test`, role: 'teacher' },
  });
  const parent = await prisma.user.create({
    data: { name: `Parent ${suffix}`, email: `parent-${suffix}@example.test`, role: 'parent' },
  });
  const students = await Promise.all(grades.map((grade, index) => prisma.student.create({
    data: {
      parentId: parent.id,
      name: `Student ${index} ${suffix}`,
      grade,
      totalCredits: credits[index] ?? 2,
    },
  })));
  createdIds.users.push(teacher.id, parent.id);
  createdIds.students.push(...students.map(({ id }) => id));
  return { actor: { id: teacher.id, role: 'teacher' }, students };
}

after(async () => {
  if (createdIds.lessons.length) await prisma.lesson.deleteMany({ where: { id: { in: createdIds.lessons } } });
  if (createdIds.students.length) await prisma.student.deleteMany({ where: { id: { in: createdIds.students } } });
  if (createdIds.users.length) await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
  await prisma.$disconnect();
});

test('rejects a group with students in different grades', async () => {
  const { actor, students } = await createFixture({ grades: [7, 8] });

  await assert.rejects(
    createReservation({ studentIds: students.map(({ id }) => id), startAt: at(9) }, actor),
    (error) => error.code === 'GRADE_MISMATCH',
  );
});

test('creates an individual 60-minute lesson and reserves one credit', async () => {
  const { actor, students: [student] } = await createFixture();
  const lesson = await createReservation({ studentIds: [student.id], startAt: at(9) }, actor);
  createdIds.lessons.push(lesson.id);

  assert.equal(lesson.durationMinutes, 60);
  assert.equal(lesson.status, 'scheduled');
  assert.equal(await prisma.lessonParticipant.count({ where: { lessonId: lesson.id } }), 1);
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).reservedCredits, 1);
});

test('creates one group lesson and reserves a credit for every participant', async () => {
  const { actor, students } = await createFixture({ grades: [7, 7], credits: [2, 2] });
  const lesson = await createReservation({ studentIds: students.map(({ id }) => id), startAt: at(10) }, actor);
  createdIds.lessons.push(lesson.id);

  assert.equal(await prisma.lessonParticipant.count({ where: { lessonId: lesson.id } }), 2);
  const balances = await prisma.student.findMany({ where: { id: { in: students.map(({ id }) => id) } } });
  assert.deepEqual(balances.map(({ reservedCredits }) => reservedCredits).sort(), [1, 1]);
});

test('rejects a reservation when any participant has no available credits', async () => {
  const { actor, students } = await createFixture({ grades: [7, 7], credits: [2, 0] });

  await assert.rejects(
    createReservation({ studentIds: students.map(({ id }) => id), startAt: at(11) }, actor),
    (error) => error.code === 'NO_CREDITS',
  );
});

test('rejects overlapping lessons for the same teacher', async () => {
  const { actor, students: [student] } = await createFixture();
  const first = await createReservation({ studentIds: [student.id], startAt: at(12) }, actor);
  createdIds.lessons.push(first.id);

  await assert.rejects(
    createReservation({ studentIds: [student.id], startAt: at(12, 30) }, actor),
    (error) => error.code === 'TIME_CONFLICT',
  );
});

test('rejects invalid, non-ISO, or non-minute start times', async () => {
  const { actor, students: [student] } = await createFixture();

  await assert.rejects(
    createReservation({ studentIds: [student.id], startAt: 'January 2, 2030 12:00' }, actor),
    (error) => error.code === 'INVALID_TIME',
  );
  await assert.rejects(
    createReservation({ studentIds: [student.id], startAt: '2030-01-02T12:00:30Z' }, actor),
    (error) => error.code === 'INVALID_TIME',
  );
  await assert.rejects(
    createReservation({ studentIds: [student.id], startAt: '2030-02-30T12:00Z' }, actor),
    (error) => error.code === 'INVALID_TIME',
  );
});

test('completion transfers reserved credits to attended credits', async () => {
  const { actor, students } = await createFixture({ grades: [7, 7], credits: [2, 2] });
  const lesson = await createReservation({ studentIds: students.map(({ id }) => id), startAt: at(13) }, actor);
  createdIds.lessons.push(lesson.id);

  const completed = await transitionLesson({ lessonId: lesson.id, action: 'complete' }, actor);
  const balances = await prisma.student.findMany({ where: { id: { in: students.map(({ id }) => id) } } });

  assert.equal(completed.status, 'completed');
  assert.deepEqual(
    balances.map(({ totalCredits, reservedCredits, attendedCredits }) => [totalCredits, reservedCredits, attendedCredits]).sort(),
    [[2, 0, 1], [2, 0, 1]],
  );
});

test('cancellation releases reserved credits without attendance', async () => {
  const { actor, students: [student] } = await createFixture();
  const lesson = await createReservation({ studentIds: [student.id], startAt: at(14) }, actor);
  createdIds.lessons.push(lesson.id);

  const cancelled = await transitionLesson({ lessonId: lesson.id, action: 'cancel' }, actor);
  const balance = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(balance.reservedCredits, 0);
  assert.equal(balance.attendedCredits, 0);
});

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import './support/test-database.js';
import * as schedulingService from '../src/services/scheduling-service.js';

const { createReservation, transitionLesson } = schedulingService;

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
  if (createdIds.users.length) await prisma.lesson.deleteMany({ where: { teacherId: { in: createdIds.users } } });
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

test('creates a 60-minute manual lesson at 18:05 with a note', async () => {
  const { actor, students: [student] } = await createFixture();
  const lesson = await createReservation({
    studentIds: [student.id],
    startAt: '2032-03-01T18:05:00+08:00',
    durationMinutes: 60,
    note: '语法复习',
  }, actor);
  createdIds.lessons.push(lesson.id);

  assert.equal(lesson.startsAt.toISOString(), '2032-03-01T10:05:00.000Z');
  assert.equal(lesson.durationMinutes, 60);
  assert.equal(lesson.note, '语法复习');
});

test('editing into a teacher conflict leaves every credit balance unchanged', async () => {
  const { actor, students } = await createFixture({ grades: [8, 8], credits: [3, 3] });
  const occupied = await createReservation({ studentIds: [students[0].id], startAt: at(18) }, actor);
  const editable = await createReservation({ studentIds: [students[1].id], startAt: at(20) }, actor);
  createdIds.lessons.push(occupied.id, editable.id);
  const before = await prisma.student.findMany({
    where: { id: { in: students.map(({ id }) => id) } },
    orderBy: { id: 'asc' },
    select: { id: true, totalCredits: true, attendedCredits: true, reservedCredits: true },
  });

  await assert.rejects(
    schedulingService.editReservation({
      lessonId: editable.id,
      studentIds: [students[0].id, students[1].id],
      startAt: at(18, 30),
      durationMinutes: 60,
      note: '冲突课程',
    }, actor),
    (error) => error.code === 'TIME_CONFLICT',
  );

  const afterBalances = await prisma.student.findMany({
    where: { id: { in: students.map(({ id }) => id) } },
    orderBy: { id: 'asc' },
    select: { id: true, totalCredits: true, attendedCredits: true, reservedCredits: true },
  });
  assert.deepEqual(afterBalances, before);
});

test('editing a scheduled lesson swaps participants without double-reserving retained students', async () => {
  const { actor, students } = await createFixture({ grades: [9, 9, 9], credits: [3, 3, 3] });
  const original = await createReservation({
    studentIds: [students[0].id, students[1].id],
    startAt: at(15),
    note: '旧备注',
  }, actor);
  createdIds.lessons.push(original.id);

  const edited = await schedulingService.editReservation({
    lessonId: original.id,
    studentIds: [students[1].id, students[2].id],
    startAt: at(16, 5),
    durationMinutes: 60,
    note: '新备注',
  }, actor);

  assert.equal(edited.startsAt.toISOString(), at(16, 5));
  assert.equal(edited.note, '新备注');
  assert.deepEqual(
    edited.participants.map(({ studentId }) => studentId).sort(),
    [students[1].id, students[2].id].sort(),
  );
  const balances = await prisma.student.findMany({
    where: { id: { in: students.map(({ id }) => id) } },
    orderBy: { name: 'asc' },
    select: { reservedCredits: true },
  });
  assert.deepEqual(balances.map(({ reservedCredits }) => reservedCredits), [0, 1, 1]);
});

test('rejects editing a non-scheduled lesson without changing its balances', async () => {
  const { actor, students: [student] } = await createFixture({ credits: [3] });
  const lesson = await createReservation({ studentIds: [student.id], startAt: at(17) }, actor);
  createdIds.lessons.push(lesson.id);
  await transitionLesson({ lessonId: lesson.id, action: 'complete' }, actor);

  await assert.rejects(
    schedulingService.editReservation({
      lessonId: lesson.id,
      studentIds: [student.id],
      startAt: at(18),
      durationMinutes: 60,
      note: '',
    }, actor),
    (error) => error.code === 'LESSON_NOT_EDITABLE',
  );
  const balance = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
  assert.equal(balance.reservedCredits, 0);
  assert.equal(balance.attendedCredits, 1);
});

test('editing refuses to release a missing old reservation and preserves participants', async () => {
  const { actor, students } = await createFixture({ grades: [10, 10], credits: [3, 3] });
  const lesson = await createReservation({ studentIds: [students[0].id], startAt: at(17, 30) }, actor);
  createdIds.lessons.push(lesson.id);
  await prisma.student.update({ where: { id: students[0].id }, data: { reservedCredits: 0 } });

  await assert.rejects(
    schedulingService.editReservation({
      lessonId: lesson.id,
      studentIds: [students[1].id],
      startAt: at(18, 30),
      durationMinutes: 60,
      note: '',
    }, actor),
    (error) => error.code === 'INVALID_RESERVATION',
  );
  const persisted = await prisma.lesson.findUniqueOrThrow({
    where: { id: lesson.id },
    include: { participants: true },
  });
  assert.deepEqual(persisted.participants.map(({ studentId }) => studentId), [students[0].id]);
  const balances = await prisma.student.findMany({
    where: { id: { in: students.map(({ id }) => id) } },
    orderBy: { name: 'asc' },
    select: { reservedCredits: true },
  });
  assert.deepEqual(balances.map(({ reservedCredits }) => reservedCredits), [0, 0]);
});

test('rejects a duration other than 60 minutes', async () => {
  const { actor, students: [student] } = await createFixture();

  await assert.rejects(
    createReservation({ studentIds: [student.id], startAt: at(17), durationMinutes: 45 }, actor),
    (error) => error.code === 'INVALID_DURATION',
  );
});

test('rejects scheduling an inactive student', async () => {
  const { actor, students: [student] } = await createFixture();
  await prisma.student.update({ where: { id: student.id }, data: { isActive: false } });

  await assert.rejects(
    createReservation({ studentIds: [student.id], startAt: at(19) }, actor),
    (error) => error.code === 'STUDENT_INACTIVE',
  );
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

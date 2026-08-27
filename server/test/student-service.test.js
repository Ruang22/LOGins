import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import './support/test-database.js';
import {
  archiveStudent,
  createStudent,
  updateStudent,
} from '../src/services/student-service.js';
import { createReservation } from '../src/services/scheduling-service.js';

const prisma = new PrismaClient();
const createdIds = { users: [], students: [], lessons: [], orders: [] };
let teacher;

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createExistingStudent({ attendedCredits = 1, reservedCredits = 2, totalCredits = 6 } = {}) {
  const suffix = uniqueSuffix();
  const parent = await prisma.user.create({
    data: { name: `Parent ${suffix}`, email: `student-parent-${suffix}@example.test`, role: 'parent' },
  });
  const student = await prisma.student.create({
    data: {
      parentId: parent.id,
      name: `Student ${suffix}`,
      grade: 9,
      attendedCredits,
      reservedCredits,
      totalCredits,
    },
  });
  createdIds.users.push(parent.id);
  createdIds.students.push(student.id);
  return { parent, student };
}

before(async () => {
  const suffix = uniqueSuffix();
  teacher = await prisma.user.create({
    data: { name: `Teacher ${suffix}`, email: `student-teacher-${suffix}@example.test`, role: 'teacher' },
  });
  createdIds.users.push(teacher.id);
});

after(async () => {
  if (createdIds.orders.length) await prisma.order.deleteMany({ where: { id: { in: createdIds.orders } } });
  if (createdIds.lessons.length) await prisma.lesson.deleteMany({ where: { id: { in: createdIds.lessons } } });
  if (createdIds.students.length) await prisma.student.deleteMany({ where: { id: { in: createdIds.students } } });
  if (createdIds.users.length) await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
  await prisma.$disconnect();
});

test('teacher creates an active grade-8 student with a local parent account', async () => {
  const created = await createStudent({ name: '陈晨', grade: 8, parentName: '陈家长', parentEmail: 'chen@example.test', totalCredits: 12 }, teacher);
  createdIds.students.push(created.id);
  createdIds.users.push(created.parent.id);

  assert.equal(created.isActive, true);
  assert.equal(created.totalCredits, 12);
  assert.deepEqual(created.parent, {
    id: created.parent.id,
    name: '陈家长',
    email: 'chen@example.test',
  });
});

test('teacher reuses a parent account found by normalized email', async () => {
  const suffix = uniqueSuffix();
  const parent = await prisma.user.create({
    data: { name: 'Existing Parent', email: `existing-${suffix}@example.test`, role: 'parent' },
  });
  createdIds.users.push(parent.id);

  const created = await createStudent({
    name: `Normalized ${suffix.slice(-8)}`,
    grade: 7,
    parentName: 'Ignored Replacement Name',
    parentEmail: `  EXISTING-${suffix.toUpperCase()}@EXAMPLE.TEST  `,
    totalCredits: 0,
  }, teacher);
  createdIds.students.push(created.id);

  assert.equal(created.parent.id, parent.id);
  assert.equal(created.parent.name, 'Existing Parent');
  assert.equal(await prisma.user.count({ where: { email: parent.email } }), 1);
});

test('teacher cannot reduce total credits below reserved and attended credits', async () => {
  const { student } = await createExistingStudent();
  const studentId = student.id;

  await assert.rejects(() => updateStudent({ studentId, input: { totalCredits: 2 } }, teacher), { code: 'CREDIT_TOTAL_TOO_LOW' });
});

test('teacher updates student details and returns the stable student shape', async () => {
  const { student } = await createExistingStudent();

  const updated = await updateStudent({
    studentId: student.id,
    input: { name: 'Updated Student', grade: 12, totalCredits: 8 },
  }, teacher);

  assert.deepEqual(updated, {
    id: student.id,
    name: 'Updated Student',
    grade: 12,
    parent: {
      id: updated.parent.id,
      name: updated.parent.name,
      email: updated.parent.email,
    },
    totalCredits: 8,
    attendedCredits: 1,
    reservedCredits: 2,
    isActive: true,
  });
});

test('teacher updates a parent name when the student keeps the same parent email', async () => {
  const { parent, student } = await createExistingStudent();

  const updated = await updateStudent({
    studentId: student.id,
    input: { parentName: 'Renamed Parent', parentEmail: parent.email },
  }, teacher);

  assert.equal(updated.parent.id, parent.id);
  assert.equal(updated.parent.name, 'Renamed Parent');
  assert.equal(await prisma.user.findUnique({ where: { id: parent.id } }).then((user) => user.name), 'Renamed Parent');
});

test('teacher reassigns a student without renaming another existing parent', async () => {
  const { student } = await createExistingStudent();
  const { parent: targetParent, student: targetStudent } = await createExistingStudent();

  const updated = await updateStudent({
    studentId: student.id,
    input: { parentName: 'Untrusted Replacement', parentEmail: targetParent.email },
  }, teacher);

  assert.equal(updated.parent.id, targetParent.id);
  assert.equal(updated.parent.name, targetParent.name);
  assert.equal(await prisma.user.findUnique({ where: { id: targetParent.id } }).then((user) => user.name), targetParent.name);
  assert.equal(await prisma.student.findUnique({ where: { id: targetStudent.id } }).then((row) => row.parentId), targetParent.id);
});

test('archiving a student preserves lesson and order history', async () => {
  const { parent, student } = await createExistingStudent({ reservedCredits: 1 });
  const lesson = await prisma.lesson.create({
    data: {
      teacherId: teacher.id,
      startsAt: new Date('2032-01-02T09:00:00Z'),
      participants: { create: { studentId: student.id } },
    },
  });
  const order = await prisma.order.create({
    data: {
      parentId: parent.id,
      studentId: student.id,
      packageId: 'archive-history',
      packageName: 'Archive History',
      creditQuantity: 1,
      amountCents: 100,
    },
  });
  createdIds.lessons.push(lesson.id);
  createdIds.orders.push(order.id);

  const archived = await archiveStudent({ studentId: student.id }, teacher);

  assert.equal(archived.isActive, false);
  assert.equal(await prisma.lessonParticipant.count({ where: { studentId: student.id } }), 1);
  assert.equal(await prisma.order.count({ where: { studentId: student.id } }), 1);
});

test('student lifecycle writes require a teacher and reject unknown students', async () => {
  const parentActor = { id: 'parent-actor', role: 'parent' };

  await assert.rejects(
    createStudent({ name: 'No Access', grade: 8, parentName: 'Parent', parentEmail: 'no-access@example.test', totalCredits: 0 }, parentActor),
    { code: 'FORBIDDEN' },
  );
  await assert.rejects(updateStudent({ studentId: 'missing', input: { grade: 8 } }, teacher), { code: 'STUDENT_NOT_FOUND' });
  await assert.rejects(archiveStudent({ studentId: 'missing' }, teacher), { code: 'STUDENT_NOT_FOUND' });
});

test('grade changes cannot split an active group lesson and roll back every accompanying edit', async () => {
  const { parent, student } = await createExistingStudent();
  const suffix = uniqueSuffix();
  const peer = await prisma.student.create({
    data: {
      parentId: parent.id,
      name: `Group Peer ${suffix}`,
      grade: student.grade,
      totalCredits: 4,
      reservedCredits: 1,
    },
  });
  createdIds.students.push(peer.id);
  const lesson = await prisma.lesson.create({
    data: {
      teacherId: teacher.id,
      startsAt: new Date('2032-04-02T10:05:00.000Z'),
      participants: { create: [{ studentId: student.id }, { studentId: peer.id }] },
    },
  });
  createdIds.lessons.push(lesson.id);
  const before = await prisma.student.findUniqueOrThrow({
    where: { id: student.id },
    include: { parent: true },
  });

  await assert.rejects(
    updateStudent({
      studentId: student.id,
      input: {
        name: '不得部分写入的名字',
        grade: student.grade + 1,
        parentName: '不得部分写入的家长名',
        totalCredits: 9,
      },
    }, teacher),
    (error) => error.code === 'GRADE_CHANGE_CONFLICT',
  );

  const unchanged = await prisma.student.findUniqueOrThrow({
    where: { id: student.id },
    include: { parent: true },
  });
  assert.deepEqual(
    {
      name: unchanged.name,
      grade: unchanged.grade,
      totalCredits: unchanged.totalCredits,
      parentName: unchanged.parent.name,
    },
    {
      name: before.name,
      grade: before.grade,
      totalCredits: before.totalCredits,
      parentName: before.parent.name,
    },
  );

  await prisma.lesson.update({ where: { id: lesson.id }, data: { status: 'completed' } });
  const updated = await updateStudent({ studentId: student.id, input: { grade: student.grade + 1 } }, teacher);
  assert.equal(updated.grade, student.grade + 1);
});

test('concurrent grade change and group scheduling never leak P2034 or persist a mixed-grade lesson', async () => {
  const { parent, student } = await createExistingStudent({ attendedCredits: 0, reservedCredits: 0, totalCredits: 4 });
  const suffix = uniqueSuffix();
  const peer = await prisma.student.create({
    data: {
      parentId: parent.id,
      name: `Concurrent Grade Peer ${suffix}`,
      grade: student.grade,
      totalCredits: 4,
    },
  });
  createdIds.students.push(peer.id);

  const outcomes = await Promise.allSettled([
    createReservation({
      studentIds: [student.id, peer.id],
      startAt: '2035-06-03T10:05:00.000Z',
    }, teacher),
    updateStudent({ studentId: student.id, input: { grade: student.grade + 1 } }, teacher),
  ]);
  const fulfilled = outcomes.filter(({ status }) => status === 'fulfilled');
  const rejected = outcomes.filter(({ status }) => status === 'rejected');
  const lessonResult = outcomes[0];
  if (lessonResult.status === 'fulfilled') createdIds.lessons.push(lessonResult.value.id);

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.notEqual(rejected[0].reason.code, 'P2034');
  assert.ok(['GRADE_CHANGE_CONFLICT', 'GRADE_MISMATCH', 'RETRYABLE_CONFLICT'].includes(rejected[0].reason.code));

  const scheduledLesson = await prisma.lesson.findFirst({
    where: {
      teacherId: teacher.id,
      startsAt: new Date('2035-06-03T10:05:00.000Z'),
      status: 'scheduled',
    },
    include: { participants: { include: { student: true } } },
  });
  if (scheduledLesson) {
    assert.equal(new Set(scheduledLesson.participants.map(({ student: participant }) => participant.grade)).size, 1);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/db/client.js';
import { updateStudent } from '../src/services/student-service.js';

test('same-email parent edits update the parent name through the real student service flow', async (t) => {
  let parent = { id: 'parent-a', name: 'Old Parent', email: 'parent@example.test', role: 'parent' };
  const student = {
    id: 'student-a',
    parentId: parent.id,
    name: 'Student',
    grade: 8,
    attendedCredits: 1,
    reservedCredits: 1,
    totalCredits: 6,
    isActive: true,
  };
  const tx = {
    $executeRaw: async () => [],
    user: {
      upsert: async ({ update }) => {
        parent = { ...parent, ...update };
        return parent;
      },
      update: async ({ where, data }) => {
        assert.equal(where.id, parent.id);
        parent = { ...parent, ...data };
        return parent;
      },
    },
    student: {
      findUnique: async () => ({ ...student, parent }),
      update: async () => ({ ...student, parent: { id: parent.id, name: parent.name, email: parent.email } }),
    },
  };
  const transaction = prisma.$transaction;
  prisma.$transaction = async (operation) => operation(tx);
  t.after(() => { prisma.$transaction = transaction; });

  const updated = await updateStudent({
    studentId: student.id,
    input: { parentName: 'Renamed Parent', parentEmail: parent.email },
  }, { id: 'teacher-a', role: 'teacher' });

  assert.equal(updated.parent.name, 'Renamed Parent');
});

test('reassigning to another existing parent does not rename that shared account', async (t) => {
  const currentParent = { id: 'parent-current', name: 'Current Parent', email: 'current@example.test', role: 'parent' };
  let targetParent = { id: 'parent-target', name: 'Target Parent', email: 'target@example.test', role: 'parent' };
  const student = {
    id: 'student-a',
    parentId: currentParent.id,
    name: 'Student',
    grade: 8,
    attendedCredits: 1,
    reservedCredits: 1,
    totalCredits: 6,
    isActive: true,
  };
  const tx = {
    $executeRaw: async () => [],
    user: {
      upsert: async ({ where, update }) => {
        assert.equal(where.email, targetParent.email);
        targetParent = { ...targetParent, ...update };
        return targetParent;
      },
      update: async () => assert.fail('a different existing parent must not be renamed'),
    },
    student: {
      findUnique: async () => ({ ...student, parent: currentParent }),
      update: async ({ data }) => ({
        ...student,
        parentId: data.parentId,
        parent: { id: targetParent.id, name: targetParent.name, email: targetParent.email },
      }),
    },
  };
  const transaction = prisma.$transaction;
  prisma.$transaction = async (operation) => operation(tx);
  t.after(() => { prisma.$transaction = transaction; });

  const updated = await updateStudent({
    studentId: student.id,
    input: { parentName: 'Untrusted Replacement', parentEmail: targetParent.email },
  }, { id: 'teacher-a', role: 'teacher' });

  assert.equal(updated.parent.id, targetParent.id);
  assert.equal(updated.parent.name, 'Target Parent');
  assert.equal(targetParent.name, 'Target Parent');
});

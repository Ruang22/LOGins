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

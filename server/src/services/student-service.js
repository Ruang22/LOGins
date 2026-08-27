import { prisma } from '../db/client.js';
import { createStudentSchema, updateStudentSchema } from '../schemas/student-schema.js';

const studentSelect = {
  id: true,
  name: true,
  grade: true,
  parent: { select: { id: true, name: true, email: true } },
  totalCredits: true,
  attendedCredits: true,
  reservedCredits: true,
  isActive: true,
};

class StudentError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'StudentError';
    this.code = code;
  }
}

function requireTeacher(actor) {
  if (!actor?.id) throw new StudentError('UNAUTHORIZED');
  if (actor.role !== 'teacher') throw new StudentError('FORBIDDEN');
}

async function lockStudent(tx, studentId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student:${studentId}`}))`;
}

async function lockStudents(tx, studentIds) {
  for (const studentId of [...new Set(studentIds)].sort()) await lockStudent(tx, studentId);
}

async function activeGroupLessons(tx, studentId) {
  return tx.lesson.findMany({
    where: {
      status: 'scheduled',
      participants: { some: { studentId } },
    },
    select: {
      participants: {
        select: { student: { select: { id: true, grade: true } } },
      },
    },
  });
}

async function findOrCreateParent(tx, { parentEmail, parentName }, { updateNameForParentId = null } = {}) {
  const parent = await tx.user.upsert({
    where: { email: parentEmail },
    update: {},
    create: { name: parentName, email: parentEmail, role: 'parent' },
  });
  if (parent.role !== 'parent') throw new StudentError('PARENT_EMAIL_CONFLICT');
  if (parent.id === updateNameForParentId) {
    return tx.user.update({ where: { id: parent.id }, data: { name: parentName } });
  }
  return parent;
}

export async function createStudent(input, teacher) {
  requireTeacher(teacher);
  const parsed = createStudentSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const parent = await findOrCreateParent(tx, parsed);
    return tx.student.create({
      data: {
        parentId: parent.id,
        name: parsed.name,
        grade: parsed.grade,
        totalCredits: parsed.totalCredits,
      },
      select: studentSelect,
    });
  });
}

export async function updateStudent({ studentId, input }, teacher) {
  requireTeacher(teacher);
  const parsed = updateStudentSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const discoveredLessons = parsed.grade === undefined ? [] : await activeGroupLessons(tx, studentId);
    await lockStudents(tx, [
      studentId,
      ...discoveredLessons.flatMap(({ participants }) => participants.map(({ student }) => student.id)),
    ]);
    const student = await tx.student.findUnique({
      where: { id: studentId },
      include: { parent: true },
    });
    if (!student) throw new StudentError('STUDENT_NOT_FOUND');
    if (
      parsed.totalCredits !== undefined
      && parsed.totalCredits < student.attendedCredits + student.reservedCredits
    ) {
      throw new StudentError('CREDIT_TOTAL_TOO_LOW');
    }
    if (parsed.grade !== undefined && parsed.grade !== student.grade) {
      const lessons = await activeGroupLessons(tx, studentId);
      const splitsGroup = lessons.some(({ participants }) => new Set(
        participants.map(({ student: participant }) => (
          participant.id === studentId ? parsed.grade : participant.grade
        )),
      ).size > 1);
      if (splitsGroup) throw new StudentError('GRADE_CHANGE_CONFLICT');
    }

    let parentId = student.parentId;
    if (parsed.parentEmail !== undefined) {
      const parent = await findOrCreateParent(tx, {
        parentEmail: parsed.parentEmail,
        parentName: parsed.parentName ?? student.parent.name,
      }, { updateNameForParentId: parsed.parentName !== undefined ? student.parentId : null });
      parentId = parent.id;
    } else if (parsed.parentName !== undefined) {
      await tx.user.update({ where: { id: student.parentId }, data: { name: parsed.parentName } });
    }

    return tx.student.update({
      where: { id: student.id },
      data: {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.grade !== undefined && { grade: parsed.grade }),
        ...(parsed.totalCredits !== undefined && { totalCredits: parsed.totalCredits }),
        ...(parentId !== student.parentId && { parentId }),
      },
      select: studentSelect,
    });
  }, { isolationLevel: 'Serializable' });
}

export async function archiveStudent({ studentId }, teacher) {
  requireTeacher(teacher);

  return prisma.$transaction(async (tx) => {
    await lockStudent(tx, studentId);
    const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new StudentError('STUDENT_NOT_FOUND');
    return tx.student.update({
      where: { id: student.id },
      data: { isActive: false },
      select: studentSelect,
    });
  });
}

export { StudentError };

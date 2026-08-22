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

async function findOrCreateParent(tx, { parentEmail, parentName }, { updateName = false } = {}) {
  const parent = await tx.user.upsert({
    where: { email: parentEmail },
    update: updateName ? { name: parentName } : {},
    create: { name: parentName, email: parentEmail, role: 'parent' },
  });
  if (parent.role !== 'parent') throw new StudentError('PARENT_EMAIL_CONFLICT');
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
    await lockStudent(tx, studentId);
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

    let parentId = student.parentId;
    if (parsed.parentEmail !== undefined) {
      const parent = await findOrCreateParent(tx, {
        parentEmail: parsed.parentEmail,
        parentName: parsed.parentName ?? student.parent.name,
      }, { updateName: parsed.parentName !== undefined });
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
  });
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

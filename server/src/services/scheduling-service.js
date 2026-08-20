import { prisma } from '../db/client.js';

const LESSON_DURATION_MINUTES = 60;
const MINUTE_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})$/;

class SchedulingError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'SchedulingError';
    this.code = code;
  }
}

function requireActorId(actor) {
  if (!actor?.id) throw new SchedulingError('UNAUTHORIZED');
  return actor.id;
}

function parseMinute(startAt) {
  if (typeof startAt !== 'string' || !MINUTE_ISO_8601.test(startAt)) {
    throw new SchedulingError('INVALID_TIME', 'A lesson must use a minute-precise ISO 8601 time with an explicit offset.');
  }
  const parsed = new Date(startAt);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCSeconds() !== 0 || parsed.getUTCMilliseconds() !== 0) {
    throw new SchedulingError('INVALID_TIME', 'A lesson must start on a whole minute.');
  }
  return parsed;
}

function validateStudentIds(studentIds) {
  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.some((id) => typeof id !== 'string' || !id)) {
    throw new SchedulingError('INVALID_RESERVATION');
  }
  if (new Set(studentIds).size !== studentIds.length) throw new SchedulingError('INVALID_RESERVATION');
}

async function lock(tx, value) {
  // Transaction-scoped locks serialize reservations for a teacher and credit
  // changes for each student without holding application-process state.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${value}))`;
}

async function lockStudents(tx, studentIds) {
  for (const studentId of [...studentIds].sort()) {
    await lock(tx, `student:${studentId}`);
  }
}

export async function createReservation({ studentIds, startAt }, actor) {
  validateStudentIds(studentIds);
  const teacherId = requireActorId(actor);
  const startsAt = parseMinute(startAt);
  const endsAt = new Date(startsAt.getTime() + LESSON_DURATION_MINUTES * 60_000);

  return prisma.$transaction(async (tx) => {
    await lock(tx, `teacher:${teacherId}`);
    await lockStudents(tx, studentIds);

    const students = await tx.student.findMany({ where: { id: { in: studentIds } } });
    if (students.length !== studentIds.length) throw new SchedulingError('STUDENT_NOT_FOUND');
    if (new Set(students.map(({ grade }) => grade)).size !== 1) throw new SchedulingError('GRADE_MISMATCH');
    if (students.some((student) => student.totalCredits - student.attendedCredits - student.reservedCredits <= 0)) {
      throw new SchedulingError('NO_CREDITS');
    }

    const scheduledLessons = await tx.lesson.findMany({
      where: { teacherId, status: 'scheduled' },
      select: { startsAt: true, durationMinutes: true },
    });
    const hasConflict = scheduledLessons.some((lesson) => {
      const lessonStart = lesson.startsAt.getTime();
      const lessonEnd = lessonStart + lesson.durationMinutes * 60_000;
      return lessonStart < endsAt.getTime() && lessonEnd > startsAt.getTime();
    });
    if (hasConflict) throw new SchedulingError('TIME_CONFLICT');

    const lesson = await tx.lesson.create({
      data: {
        teacherId,
        startsAt,
        durationMinutes: LESSON_DURATION_MINUTES,
        participants: { create: studentIds.map((studentId) => ({ studentId })) },
      },
      include: { participants: true },
    });

    for (const studentId of studentIds) {
      await tx.student.update({ where: { id: studentId }, data: { reservedCredits: { increment: 1 } } });
    }
    return lesson;
  }, { isolationLevel: 'Serializable' });
}

export async function transitionLesson({ lessonId, action }, actor) {
  const teacherId = requireActorId(actor);
  if (!lessonId || !['complete', 'cancel'].includes(action)) throw new SchedulingError('INVALID_TRANSITION');

  return prisma.$transaction(async (tx) => {
    await lock(tx, `lesson:${lessonId}`);
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { select: { studentId: true } } },
    });
    if (!lesson) throw new SchedulingError('LESSON_NOT_FOUND');
    if (lesson.teacherId !== teacherId) throw new SchedulingError('FORBIDDEN');
    if (lesson.status !== 'scheduled') throw new SchedulingError('INVALID_TRANSITION');

    const studentIds = lesson.participants.map(({ studentId }) => studentId);
    await lockStudents(tx, studentIds);
    const students = await tx.student.findMany({ where: { id: { in: studentIds } } });
    if (students.length !== studentIds.length || students.some(({ reservedCredits }) => reservedCredits < 1)) {
      throw new SchedulingError('INVALID_TRANSITION');
    }

    for (const studentId of studentIds) {
      await tx.student.update({
        where: { id: studentId },
        data: action === 'complete'
          ? { reservedCredits: { decrement: 1 }, attendedCredits: { increment: 1 } }
          : { reservedCredits: { decrement: 1 } },
      });
    }

    return tx.lesson.update({
      where: { id: lessonId },
      data: { status: action === 'complete' ? 'completed' : 'cancelled' },
      include: { participants: true },
    });
  }, { isolationLevel: 'Serializable' });
}

export { SchedulingError };

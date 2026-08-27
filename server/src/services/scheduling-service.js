import { runSerializableTransaction } from '../db/transaction-retry.js';

const LESSON_DURATION_MINUTES = 60;
const MINUTE_ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00(?:\.000)?)?(Z|([+-])(\d{2}):(\d{2}))$/;

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

function validateDuration(durationMinutes = LESSON_DURATION_MINUTES) {
  if (durationMinutes !== LESSON_DURATION_MINUTES) throw new SchedulingError('INVALID_DURATION');
  return durationMinutes;
}

function validateNote(note = '') {
  if (typeof note !== 'string') throw new SchedulingError('INVALID_RESERVATION');
  return note.trim() || null;
}

function parseMinute(startAt) {
  const match = typeof startAt === 'string' ? MINUTE_ISO_8601.exec(startAt) : null;
  if (!match) {
    throw new SchedulingError('INVALID_TIME', 'A lesson must use a minute-precise ISO 8601 time with an explicit offset.');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, , , offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, offsetHour, offsetMinute] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    offsetHourText ?? '0',
    offsetMinuteText ?? '0',
  ].map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, 0, 0);
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    throw new SchedulingError('INVALID_TIME', 'A lesson must use a real calendar minute.');
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

function ensureSchedulableStudents(students, studentIds, existingStudentIds = new Set()) {
  if (students.length !== studentIds.length) throw new SchedulingError('STUDENT_NOT_FOUND');
  if (students.some(({ isActive }) => !isActive)) throw new SchedulingError('STUDENT_INACTIVE');
  if (new Set(students.map(({ grade }) => grade)).size !== 1) throw new SchedulingError('GRADE_MISMATCH');
  if (students.some((student) => {
    if (existingStudentIds.has(student.id)) return student.reservedCredits < 1;
    return student.totalCredits - student.attendedCredits - student.reservedCredits <= 0;
  })) {
    throw new SchedulingError('NO_CREDITS');
  }
}

async function hasTimeConflict(tx, { teacherId, studentIds, startsAt, endsAt, excludeLessonId }) {
  const scheduledLessons = await tx.lesson.findMany({
    where: {
      status: 'scheduled',
      ...(excludeLessonId && { id: { not: excludeLessonId } }),
      OR: [
        { teacherId },
        { participants: { some: { studentId: { in: studentIds } } } },
      ],
    },
    select: { startsAt: true, durationMinutes: true },
  });
  return scheduledLessons.some((lesson) => {
    const lessonStart = lesson.startsAt.getTime();
    const lessonEnd = lessonStart + lesson.durationMinutes * 60_000;
    return lessonStart < endsAt.getTime() && lessonEnd > startsAt.getTime();
  });
}

export async function createReservation({
  studentIds,
  startAt,
  durationMinutes = LESSON_DURATION_MINUTES,
  note = '',
}, actor) {
  validateStudentIds(studentIds);
  validateDuration(durationMinutes);
  const normalizedNote = validateNote(note);
  const teacherId = requireActorId(actor);
  const startsAt = parseMinute(startAt);
  const endsAt = new Date(startsAt.getTime() + LESSON_DURATION_MINUTES * 60_000);

  return runSerializableTransaction(async (tx) => {
    await lock(tx, `teacher:${teacherId}`);
    await lockStudents(tx, studentIds);

    const students = await tx.student.findMany({ where: { id: { in: studentIds } } });
    ensureSchedulableStudents(students, studentIds);
    if (await hasTimeConflict(tx, { teacherId, studentIds, startsAt, endsAt })) {
      throw new SchedulingError('TIME_CONFLICT');
    }

    const lesson = await tx.lesson.create({
      data: {
        teacherId,
        startsAt,
        durationMinutes: LESSON_DURATION_MINUTES,
        note: normalizedNote,
        participants: { create: studentIds.map((studentId) => ({ studentId })) },
      },
      include: { participants: true },
    });

    for (const studentId of studentIds) {
      await tx.student.update({ where: { id: studentId }, data: { reservedCredits: { increment: 1 } } });
    }
    return lesson;
  }, () => new SchedulingError('RETRYABLE_CONFLICT'));
}

export async function editReservation({
  lessonId,
  studentIds,
  startAt,
  durationMinutes = LESSON_DURATION_MINUTES,
  note = '',
}, actor) {
  if (!lessonId) throw new SchedulingError('INVALID_RESERVATION');
  validateStudentIds(studentIds);
  validateDuration(durationMinutes);
  const normalizedNote = validateNote(note);
  const teacherId = requireActorId(actor);
  const startsAt = parseMinute(startAt);
  const endsAt = new Date(startsAt.getTime() + LESSON_DURATION_MINUTES * 60_000);

  return runSerializableTransaction(async (tx) => {
    await lock(tx, `lesson:${lessonId}`);
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { select: { studentId: true } } },
    });
    if (!lesson) throw new SchedulingError('LESSON_NOT_FOUND');
    if (lesson.teacherId !== teacherId) throw new SchedulingError('FORBIDDEN');
    if (lesson.status !== 'scheduled') throw new SchedulingError('LESSON_NOT_EDITABLE');

    const oldStudentIds = lesson.participants.map(({ studentId }) => studentId);
    const lockedStudentIds = [...new Set([...oldStudentIds, ...studentIds])];
    await lock(tx, `teacher:${teacherId}`);
    await lockStudents(tx, lockedStudentIds);

    const oldStudentIdSet = new Set(oldStudentIds);
    const nextStudentIdSet = new Set(studentIds);
    const lockedStudents = await tx.student.findMany({ where: { id: { in: lockedStudentIds } } });
    const lockedStudentsById = new Map(lockedStudents.map((student) => [student.id, student]));
    const students = studentIds.map((studentId) => lockedStudentsById.get(studentId)).filter(Boolean);
    ensureSchedulableStudents(students, studentIds, oldStudentIdSet);
    if (oldStudentIds.some((studentId) => (
      !lockedStudentsById.has(studentId) || lockedStudentsById.get(studentId).reservedCredits < 1
    ))) {
      throw new SchedulingError('INVALID_RESERVATION');
    }
    if (await hasTimeConflict(tx, {
      teacherId,
      studentIds,
      startsAt,
      endsAt,
      excludeLessonId: lessonId,
    })) {
      throw new SchedulingError('TIME_CONFLICT');
    }

    const removedStudentIds = oldStudentIds.filter((studentId) => !nextStudentIdSet.has(studentId));
    const addedStudentIds = studentIds.filter((studentId) => !oldStudentIdSet.has(studentId));

    for (const studentId of removedStudentIds) {
      await tx.student.update({ where: { id: studentId }, data: { reservedCredits: { decrement: 1 } } });
    }
    for (const studentId of addedStudentIds) {
      await tx.student.update({ where: { id: studentId }, data: { reservedCredits: { increment: 1 } } });
    }

    return tx.lesson.update({
      where: { id: lessonId },
      data: {
        startsAt,
        durationMinutes: LESSON_DURATION_MINUTES,
        note: normalizedNote,
        participants: {
          ...(removedStudentIds.length && { deleteMany: { studentId: { in: removedStudentIds } } }),
          ...(addedStudentIds.length && { create: addedStudentIds.map((studentId) => ({ studentId })) }),
        },
      },
      include: { participants: true },
    });
  }, () => new SchedulingError('RETRYABLE_CONFLICT'));
}

export async function transitionLesson({ lessonId, action }, actor) {
  const teacherId = requireActorId(actor);
  if (!lessonId || !['complete', 'cancel'].includes(action)) throw new SchedulingError('INVALID_TRANSITION');

  return runSerializableTransaction(async (tx) => {
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
  }, () => new SchedulingError('RETRYABLE_CONFLICT'));
}

export { SchedulingError };

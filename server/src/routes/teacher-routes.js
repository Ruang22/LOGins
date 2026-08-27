import { Router } from 'express';
import { prisma } from '../db/client.js';
import {
  createReservation,
  editReservation,
  SchedulingError,
  transitionLesson,
} from '../services/scheduling-service.js';
import {
  archiveStudent,
  createStudent,
  StudentError,
  updateStudent,
} from '../services/student-service.js';
import { requireRole } from '../middleware/demo-auth.js';
import { z, ZodError } from 'zod';

const transitionLessonUpdateSchema = z.object({
  action: z.enum(['complete', 'cancel']),
}).strict();

const editLessonUpdateSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1),
  startAt: z.string().min(1),
  durationMinutes: z.literal(60),
  note: z.string().optional().default(''),
}).strict();

const lessonInclude = {
  participants: {
    select: {
      studentId: true,
      student: { select: { id: true, name: true, grade: true } },
    },
  },
};

function respondToSchedulingError(error, res) {
  if (!(error instanceof SchedulingError)) return false;
  const status = error.code === 'FORBIDDEN'
    ? 403
    : error.code === 'LESSON_NOT_FOUND'
      ? 404
      : error.code === 'RETRYABLE_CONFLICT'
        ? 409
        : 400;
  res.status(status).json({ code: error.code });
  return true;
}

function parseLessonUpdate(body) {
  try {
    if (body && !Array.isArray(body) && Object.hasOwn(body, 'action')) {
      return { kind: 'transition', input: transitionLessonUpdateSchema.parse(body) };
    }
    return { kind: 'edit', input: editLessonUpdateSchema.parse(body) };
  } catch (error) {
    if (error instanceof ZodError) throw new SchedulingError('INVALID_LESSON_UPDATE');
    throw error;
  }
}

function respondToStudentError(error, res) {
  if (error instanceof ZodError) {
    res.status(400).json({ code: 'INVALID_STUDENT' });
    return true;
  }
  if (!(error instanceof StudentError)) return false;
  const status = error.code === 'FORBIDDEN'
    ? 403
    : error.code === 'STUDENT_NOT_FOUND'
      ? 404
      : error.code === 'RETRYABLE_CONFLICT'
        ? 409
        : 400;
  res.status(status).json({ code: error.code });
  return true;
}

export function createTeacherRouter() {
  const router = Router();
  router.use(requireRole('teacher'));

  router.get('/schedule', async (req, res, next) => {
    try {
      const lessons = await prisma.lesson.findMany({
        where: { teacherId: req.demoUser.id },
        orderBy: { startsAt: 'asc' },
        include: lessonInclude,
      });
      res.json(lessons);
    } catch (error) {
      next(error);
    }
  });

  router.get('/students', async (_req, res, next) => {
    try {
      const students = await prisma.student.findMany({
        orderBy: [{ grade: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          grade: true,
          parent: { select: { id: true, name: true, email: true } },
          totalCredits: true,
          attendedCredits: true,
          reservedCredits: true,
          isActive: true,
        },
      });
      res.json(students);
    } catch (error) {
      next(error);
    }
  });

  router.post('/students', async (req, res, next) => {
    try {
      const student = await createStudent(req.body ?? {}, req.demoUser);
      res.status(201).json(student);
    } catch (error) {
      if (!respondToStudentError(error, res)) next(error);
    }
  });

  router.patch('/students/:id', async (req, res, next) => {
    try {
      const student = await updateStudent({ studentId: req.params.id, input: req.body ?? {} }, req.demoUser);
      res.json(student);
    } catch (error) {
      if (!respondToStudentError(error, res)) next(error);
    }
  });

  router.delete('/students/:id', async (req, res, next) => {
    try {
      const student = await archiveStudent({ studentId: req.params.id }, req.demoUser);
      res.json(student);
    } catch (error) {
      if (!respondToStudentError(error, res)) next(error);
    }
  });

  router.post('/lessons', async (req, res, next) => {
    try {
      const lesson = await createReservation(req.body ?? {}, req.demoUser);
      res.status(201).json(lesson);
    } catch (error) {
      if (!respondToSchedulingError(error, res)) next(error);
    }
  });

  router.patch('/lessons/:id', async (req, res, next) => {
    try {
      const update = parseLessonUpdate(req.body);
      const lesson = update.kind === 'transition'
        ? await transitionLesson({ lessonId: req.params.id, ...update.input }, req.demoUser)
        : await editReservation({ lessonId: req.params.id, ...update.input }, req.demoUser);
      res.json(lesson);
    } catch (error) {
      if (!respondToSchedulingError(error, res)) next(error);
    }
  });

  return router;
}

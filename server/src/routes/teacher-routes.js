import { Router } from 'express';
import { prisma } from '../db/client.js';
import {
  createReservation,
  SchedulingError,
  transitionLesson,
} from '../services/scheduling-service.js';
import { requireRole } from '../middleware/demo-auth.js';

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
  const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'LESSON_NOT_FOUND' ? 404 : 400;
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
      const students = await prisma.student.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] });
      res.json(students);
    } catch (error) {
      next(error);
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
      const lesson = await transitionLesson({ lessonId: req.params.id, action: req.body?.action }, req.demoUser);
      res.json(lesson);
    } catch (error) {
      if (!respondToSchedulingError(error, res)) next(error);
    }
  });

  return router;
}

import { Router } from 'express';
import { prisma } from '../db/client.js';
import { requireRole } from '../middleware/demo-auth.js';

const lessonInclude = {
  lessonLinks: {
    select: {
      studentId: true,
      lesson: {
        select: {
          id: true,
          startsAt: true,
          durationMinutes: true,
          status: true,
          teacherId: true,
        },
      },
    },
  },
};

export function createParentRouter() {
  const router = Router();
  router.use(requireRole('parent'));

  router.get('/dashboard', async (req, res, next) => {
    try {
      const students = await prisma.student.findMany({
        where: { parentId: req.demoUser.id },
        orderBy: [{ grade: 'asc' }, { name: 'asc' }],
        include: lessonInclude,
      });
      res.json({
        parent: { id: req.demoUser.id, name: req.demoUser.name, email: req.demoUser.email },
        students: students.map(({ lessonLinks, ...student }) => ({
          ...student,
          lessons: lessonLinks.map(({ lesson }) => lesson),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

import { z } from 'zod';

export const parseScheduleRequestSchema = z.object({
  text: z.string().trim().min(1),
});

export const scheduleSchema = z.object({
  courseName: z.string().trim().min(1),
  startAt: z.string().datetime({ offset: true }).refine(
    (value) => /T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(value),
    'Schedule suggestions must have minute precision.',
  ),
  studentNames: z.array(z.string().trim().min(1)).min(1),
}).strict();

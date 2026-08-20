import { z } from 'zod';

export const parseScheduleRequestSchema = z.object({
  text: z.string().trim().min(1),
});

export const scheduleSchema = z.object({
  courseName: z.string().trim().min(1),
  startAt: z.string().datetime({ offset: true }),
  studentNames: z.array(z.string().trim().min(1)).min(1),
});

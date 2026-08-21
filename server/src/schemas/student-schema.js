import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(40);
const gradeSchema = z.number().int().min(7).max(12);
const parentEmailSchema = z.string().trim().email().transform((email) => email.toLowerCase());
const totalCreditsSchema = z.number().int().nonnegative();

export const createStudentSchema = z.object({
  name: nameSchema,
  grade: gradeSchema,
  parentName: nameSchema,
  parentEmail: parentEmailSchema,
  totalCredits: totalCreditsSchema,
}).strict();

export const updateStudentSchema = z.object({
  name: nameSchema.optional(),
  grade: gradeSchema.optional(),
  parentName: nameSchema.optional(),
  parentEmail: parentEmailSchema.optional(),
  totalCredits: totalCreditsSchema.optional(),
}).strict();

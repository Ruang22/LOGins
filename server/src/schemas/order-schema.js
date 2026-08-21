import { z } from 'zod';

export const teacherManualOrderSchema = z.object({
  studentId: z.string().min(1),
  packageId: z.string().min(1).optional(),
  packageName: z.string().trim().min(1).max(80).optional(),
  creditQuantity: z.number().int().positive().optional(),
  amountCents: z.number().int().nonnegative().optional(),
  paymentMode: z.literal('manual_qr'),
}).strict().superRefine((input, context) => {
  if (!input.packageId && (!input.packageName || !input.creditQuantity || input.amountCents === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Manual QR orders require packageName, creditQuantity, and amountCents.',
    });
  }
});

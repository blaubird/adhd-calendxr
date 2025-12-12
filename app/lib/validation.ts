import { z } from 'zod';

export const itemInputSchema = z.object({
  kind: z.enum(['event', 'task']),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  title: z.string().min(1).max(255),
  details: z.string().optional().nullable(),
  status: z.enum(['todo', 'done', 'canceled']).optional().nullable(),
});

export const draftSchema = z.object({
  kind: z.enum(['event', 'task', 'clarify']),
  title: z.string(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  details: z.string().optional().nullable(),
  questions: z.array(z.string()).optional(),
});

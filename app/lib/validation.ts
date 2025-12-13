import { z } from 'zod';

export const itemInputSchema = z
  .object({
    kind: z.enum(['event', 'task']),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    timeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    title: z.string().min(1).max(255),
    details: z.string().optional().nullable(),
    status: z.enum(['todo', 'done', 'canceled']).optional().nullable(),
  })
  .strict();

export type ItemInput = z.infer<typeof itemInputSchema>;

export const draftOutputSchema = z.object({
  kind: z.enum(['event', 'task']),
  title: z.string().min(1).max(255),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  details: z.string().nullable().optional().transform((v) => (v === undefined ? null : v)),
  status: z.enum(['todo', 'done', 'canceled']).default('todo'),
});

export const draftListSchema = z.object({
  drafts: z.array(draftOutputSchema).min(1),
  needClarification: z.literal(false).optional(),
});

export const clarificationSchema = z.object({
  needClarification: z.literal(true),
  questions: z.array(z.string()).min(1),
});

export const chatResultSchema = z.union([draftListSchema, clarificationSchema]);

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
});

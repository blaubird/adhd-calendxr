import { z } from 'zod';

import { formatDayKey, normalizeDayString, normalizeTime, nowInTz, todayKey } from 'app/lib/datetime';
import { Draft, DraftClarification, DraftResponse, ItemKind } from 'app/types';

const rawDraftSchema = z.object({
  kind: z.enum(['event', 'task']).optional(),
  title: z.string().min(1).max(255),
  day: z.string().optional(),
  timeStart: z.string().nullable().optional(),
  timeEnd: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  status: z.enum(['todo', 'done', 'canceled']).optional(),
});

const rawResultSchema = z.object({
  drafts: z.array(rawDraftSchema).optional(),
  needClarification: z.boolean().optional(),
  questions: z.array(z.string()).optional(),
});

function fallbackDayKey(defaultDay?: string) {
  if (defaultDay) return defaultDay;
  const zoned = nowInTz(new Date());
  return formatDayKey(zoned);
}

function normalizeDraft(raw: z.infer<typeof rawDraftSchema>, defaultDay?: string): Draft {
  const dayValue = normalizeDayString(raw.day ?? fallbackDayKey(defaultDay)) ?? todayKey();

  const normalizedStart = normalizeTime(raw.timeStart);
  const normalizedEnd = normalizeTime(raw.timeEnd);
  const hasTime = Boolean(normalizedStart || normalizedEnd);

  let kind: ItemKind = raw.kind ?? (hasTime ? 'event' : 'task');
  if (kind === 'event' && !hasTime) {
    kind = 'task';
  }

  return {
    kind,
    title: raw.title,
    day: dayValue,
    timeStart: normalizedStart,
    timeEnd: normalizedEnd,
    details: raw.details ?? null,
    status: kind === 'task' ? raw.status ?? 'todo' : 'todo',
  };
}

export function normalizeAiResponse(payload: unknown, options?: { defaultDay?: string }): DraftResponse | DraftClarification {
  const parsed = rawResultSchema.safeParse(payload);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ai] normalize failed', parsed.error.flatten());
    }
    return { needClarification: true, questions: ['Please restate with a clear title.'] };
  }

  const defaultDay = fallbackDayKey(options?.defaultDay);
  const drafts = (parsed.data.drafts || []).map((draft) => normalizeDraft(draft, defaultDay));

  if (drafts.length > 0) {
    return { drafts, needClarification: false };
  }

  return {
    needClarification: true,
    questions: parsed.data.questions && parsed.data.questions.length > 0
      ? parsed.data.questions
      : ['Could you provide a quick title?'],
  };
}

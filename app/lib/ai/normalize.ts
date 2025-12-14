import { format } from 'date-fns';
import { enGB } from 'date-fns/locale';
import { z } from 'zod';

import { normalizeDayString, normalizeTime, nowInTz, todayKey, TIMEZONE } from '../datetime';
import { Draft } from '../../types';

const rawDraftSchema = z.object({
  kind: z.enum(['event', 'task']).default('task'),
  title: z.string().min(1).max(255),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  details: z.string().nullable().optional().transform((v) => (v === undefined ? null : v)),
  status: z.enum(['todo', 'done', 'canceled']).optional(),
});

const rawDraftListSchema = z.object({
  drafts: z.array(rawDraftSchema).min(1),
  needClarification: z.literal(false).optional(),
  questions: z.array(z.string()).optional(),
});

const clarificationOnlySchema = z.object({
  needClarification: z.literal(true),
  questions: z.array(z.string()).min(1),
});

export type NormalizedDraftResult = { drafts: Draft[]; needClarification?: false } | { needClarification: true; questions: string[] };

function normalizeDraft(raw: z.infer<typeof rawDraftSchema>, today: string): Draft | null {
  const day = normalizeDayString(raw.day || today) || today;

  const timeStart = normalizeTime(raw.timeStart);
  const timeEnd = normalizeTime(raw.timeEnd);

  const hasTime = Boolean(timeStart || timeEnd);
  const baseKind: Draft['kind'] = raw.kind || 'task';
  const kind: Draft['kind'] = hasTime ? baseKind : 'task';

  const finalTimeStart = hasTime ? timeStart : null;
  const finalTimeEnd = hasTime ? timeEnd : null;

  if (kind === 'event' && !finalTimeStart && !finalTimeEnd) {
    return { ...raw, kind: 'task', day, timeStart: null, timeEnd: null, details: raw.details ?? null, status: raw.status || 'todo' };
  }

  return {
    ...raw,
    kind,
    day,
    timeStart: finalTimeStart,
    timeEnd: finalTimeEnd,
    details: raw.details ?? null,
    status: raw.status || 'todo',
  } satisfies Draft;
}

export function normalizeAiResult(payload: unknown, referenceDate: Date = new Date()): NormalizedDraftResult {
  const today = todayKey(nowInTz(referenceDate));

  const clarification = clarificationOnlySchema.safeParse(payload);
  if (clarification.success) {
    return clarification.data;
  }

  const list = rawDraftListSchema.safeParse(payload);
  if (list.success) {
    const drafts: Draft[] = list.data.drafts
      .map((d) => normalizeDraft(d, today))
      .filter((d): d is Draft => Boolean(d));

    if (drafts.length > 0) {
      return { drafts, needClarification: false as const };
    }

    const fallbackQuestions =
      list.data.questions && list.data.questions.length > 0
        ? list.data.questions
        : ['Please provide the day (DD.MM.YYYY) and optional 24h time.'];

    return { needClarification: true, questions: fallbackQuestions };
  }

  throw new Error('AI payload not understood');
}

export function buildNowContext(referenceDate: Date = new Date()) {
  const now = nowInTz(referenceDate);
  const isoNow = `${format(now, "yyyy-MM-dd'T'HH:mm:ss", { locale: enGB })} (${TIMEZONE})`;
  const humanNow = `${format(now, 'dd.MM.yyyy HH:mm', { locale: enGB })} (${TIMEZONE})`;
  const today = todayKey(now);

  return { now, isoNow, humanNow, today };
}

import { z } from 'zod';

import { formatDayKey, normalizeDayString, normalizeTime, nowInTz } from 'app/lib/datetime';
import { Draft } from 'app/types';

const rawDraftSchema = z.object({
  kind: z.string().optional(),
  title: z.string().min(1),
  day: z.string().optional().nullable(),
  timeStart: z.string().optional().nullable(),
  timeEnd: z.string().optional().nullable(),
  details: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
});

const rawResultSchema = z.object({
  drafts: z.array(rawDraftSchema).default([]),
  needClarification: z.boolean().optional(),
  questions: z.array(z.string()).optional(),
});

const DEFAULT_STATUS: Draft['status'] = 'todo';

function normalizeKind(kind: string | undefined, hasTime: boolean): Draft['kind'] {
  if (kind === 'event' || kind === 'task') return hasTime ? kind : 'task';
  return hasTime ? 'event' : 'task';
}

export function normalizeAiResult(payload: unknown): { drafts: Draft[]; needClarification: boolean; questions?: string[] } {
  const parsed = rawResultSchema.parse(payload);
  const todayKey = formatDayKey(nowInTz(new Date()));

  const drafts: Draft[] = parsed.drafts.map((draft) => {
    const normalizedDay = normalizeDayString(draft.day ?? todayKey) ?? todayKey;
    const timeStart = normalizeTime(draft.timeStart);
    const timeEnd = normalizeTime(draft.timeEnd);
    const hasTime = !!(timeStart || timeEnd);
    const kind = normalizeKind(draft.kind, hasTime);

    return {
      kind,
      title: draft.title.trim(),
      day: normalizedDay,
      timeStart: hasTime ? timeStart : null,
      timeEnd: hasTime ? timeEnd : null,
      details: draft.details ?? null,
      status:
        kind === 'task'
          ? draft.status === 'done' || draft.status === 'canceled'
            ? draft.status
            : DEFAULT_STATUS
          : DEFAULT_STATUS,
    } satisfies Draft;
  });

  if (drafts.length === 0) {
    return { drafts: [], needClarification: true, questions: parsed.questions?.length ? parsed.questions : undefined };
  }

  return { drafts, needClarification: false };
}

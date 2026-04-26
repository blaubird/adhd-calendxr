import { addDays, addMinutes, format } from 'date-fns';

import {
  addExdate,
  createOverride,
  deleteItem,
  getItemById,
  getTelegramItemContext,
  saveTelegramItemContext,
  updateItem,
} from 'app/db';
import type { Item } from 'app/types';
import { formatDayKey, formatTimeRange, normalizeTime, nowInTz, parseDayKey, TIMEZONE } from 'app/lib/datetime';
import { escapeTelegramHtml } from './format';
import type { TelegramLanguage } from './i18n';
import { t } from './i18n';

export type TelegramItemRef = {
  n: number;
  id: number | string;
  sourceId?: number;
  day: string;
  occurrenceDay?: string | null;
  isOccurrence?: boolean;
  isOverride?: boolean;
  kind: Item['kind'];
  title: string;
  details?: string | null;
  status?: Item['status'];
  timeStart?: string | null;
  timeEnd?: string | null;
  recurrenceRule?: string | null;
  recurrenceTz?: string | null;
  recurrenceUntilDay?: string | null;
  recurrenceCount?: number | null;
  recurrenceExdates?: string[];
  color?: string | null;
  order?: number | null;
};

type TelegramListContext = {
  contextId: string;
  items: TelegramItemRef[];
};

const WEEKDAY_ALIASES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function activeItems(items: Item[]) {
  return items.filter((item) => item.status !== 'done' && item.status !== 'canceled');
}

function sortForManagement(items: Item[]) {
  return [...activeItems(items)].sort((a, b) => {
    if (a.day !== b.day) return a.day.localeCompare(b.day);
    if (!a.timeStart && b.timeStart) return 1;
    if (a.timeStart && !b.timeStart) return -1;
    if (a.timeStart && b.timeStart && a.timeStart !== b.timeStart) return a.timeStart.localeCompare(b.timeStart);
    return String(a.id).localeCompare(String(b.id));
  });
}

function toRef(item: Item, n: number): TelegramItemRef {
  return {
    n,
    id: item.id,
    sourceId: item.sourceId,
    day: item.day,
    occurrenceDay: item.occurrenceDay ?? (item.isOccurrence ? item.day : null),
    isOccurrence: item.isOccurrence,
    isOverride: item.isOverride,
    kind: item.kind,
    title: item.title,
    details: item.details ?? null,
    status: item.status ?? null,
    timeStart: item.timeStart,
    timeEnd: item.timeEnd,
    recurrenceRule: item.recurrenceRule ?? null,
    recurrenceTz: item.recurrenceTz ?? TIMEZONE,
    recurrenceUntilDay: item.recurrenceUntilDay ?? null,
    recurrenceCount: item.recurrenceCount ?? null,
    recurrenceExdates: item.recurrenceExdates ?? [],
    color: item.color ?? null,
    order: item.order ?? 0,
  };
}

function formatDateLine(day: string, language: TelegramLanguage) {
  return `${format(parseDayKey(day), 'd MMM')} · ${TIMEZONE}`;
}

function formatRefLine(ref: Pick<TelegramItemRef, 'n' | 'timeStart' | 'timeEnd' | 'title'>) {
  const time = formatTimeRange(ref.timeStart ?? null, ref.timeEnd ?? null);
  return `${ref.n}. ${time ? `${escapeTelegramHtml(time)} ` : ''}${escapeTelegramHtml(ref.title)}`;
}

export function formatTelegramRefPreview(ref: Pick<TelegramItemRef, 'timeStart' | 'timeEnd' | 'title'>) {
  const time = formatTimeRange(ref.timeStart ?? null, ref.timeEnd ?? null);
  return `${time ? `${escapeTelegramHtml(time)}\n` : ''}${escapeTelegramHtml(ref.title)}`;
}

export async function buildAndSaveTelegramListContext(
  chatId: string,
  contextType: string,
  items: Item[]
): Promise<TelegramListContext> {
  const refs = sortForManagement(items).map((item, index) => toRef(item, index + 1));
  const context = await saveTelegramItemContext(chatId, contextType, refs);
  return { contextId: context.contextId, items: refs };
}

export function formatTelegramNumberedDay(
  label: string,
  day: string,
  context: TelegramListContext,
  language: TelegramLanguage
) {
  const messages = t(language);
  const timed = context.items.filter((item) => item.timeStart);
  const untimed = context.items.filter((item) => !item.timeStart);
  const sections = [
    `${escapeTelegramHtml(label)}\n${escapeTelegramHtml(formatDateLine(day, language))}`,
  ];

  if (timed.length) {
    sections.push(`${escapeTelegramHtml(messages.timed)}\n\n${timed.map(formatRefLine).join('\n')}`);
  }
  if (untimed.length) {
    sections.push(`${escapeTelegramHtml(messages.untimed)}\n\n${untimed.map(formatRefLine).join('\n')}`);
  }
  if (!timed.length && !untimed.length) {
    sections.push(`${escapeTelegramHtml(messages.nothingPlanned)}\n${escapeTelegramHtml(messages.emptyDay)}`);
  }

  return sections.join('\n\n');
}

export function formatTelegramNumberedRange(
  label: string,
  startDay: string,
  endDay: string,
  context: TelegramListContext,
  language: TelegramLanguage
) {
  const sections = [
    `${escapeTelegramHtml(label)}\n${escapeTelegramHtml(formatDateLine(startDay, language))} – ${escapeTelegramHtml(formatDateLine(endDay, language))}`,
  ];
  const byDay = new Map<string, TelegramItemRef[]>();
  for (const ref of context.items) {
    byDay.set(ref.day, [...(byDay.get(ref.day) || []), ref]);
  }

  Array.from(byDay.entries()).forEach(([day, refs]) => {
    sections.push(`${escapeTelegramHtml(format(parseDayKey(day), 'EEE d MMM'))}\n${refs.map(formatRefLine).join('\n')}`);
  });

  return sections.join('\n\n');
}

function itemInputFromRef(ref: TelegramItemRef, overrides?: Partial<TelegramItemRef>) {
  return {
    kind: overrides?.kind ?? ref.kind,
    day: overrides?.day ?? ref.day,
    timeStart: overrides?.timeStart !== undefined ? overrides.timeStart : ref.timeStart ?? null,
    timeEnd: overrides?.timeEnd !== undefined ? overrides.timeEnd : ref.timeEnd ?? null,
    title: overrides?.title ?? ref.title,
    details: overrides?.details !== undefined ? overrides.details : ref.details ?? null,
    status: overrides?.status !== undefined ? overrides.status : ref.status ?? null,
    recurrenceRule: null,
    recurrenceTz: ref.recurrenceTz ?? TIMEZONE,
    recurrenceUntilDay: null,
    recurrenceCount: null,
    recurrenceExdates: [],
    color: overrides?.color !== undefined ? overrides.color : ref.color ?? null,
    order: overrides?.order !== undefined ? overrides.order ?? 0 : ref.order ?? 0,
    parentId: null,
    occurrenceDay: ref.occurrenceDay ?? ref.day,
  };
}

function itemInputFromRecord(record: Awaited<ReturnType<typeof getItemById>>, overrides?: Partial<TelegramItemRef>) {
  if (!record) return null;
  const day = typeof record.day === 'string' ? record.day : formatDayKey(record.day as Date);
  const recurrenceUntilDay = record.recurrenceUntilDay
    ? typeof record.recurrenceUntilDay === 'string'
      ? record.recurrenceUntilDay
      : formatDayKey(record.recurrenceUntilDay as Date)
    : null;
  return {
    kind: overrides?.kind ?? record.kind,
    day: overrides?.day ?? day,
    timeStart: overrides?.timeStart !== undefined ? overrides.timeStart : normalizeTime(record.timeStart) ?? null,
    timeEnd: overrides?.timeEnd !== undefined ? overrides.timeEnd : normalizeTime(record.timeEnd) ?? null,
    title: overrides?.title ?? record.title,
    details: overrides?.details !== undefined ? overrides.details : record.details ?? null,
    status: overrides?.status !== undefined ? overrides.status : record.status ?? null,
    recurrenceRule: record.recurrenceRule ?? null,
    recurrenceTz: record.recurrenceTz ?? TIMEZONE,
    recurrenceUntilDay,
    recurrenceCount: record.recurrenceCount ?? null,
    recurrenceExdates: Array.isArray(record.recurrenceExdates)
      ? record.recurrenceExdates.map((dayValue) => (
          typeof dayValue === 'string' ? dayValue : formatDayKey(dayValue as Date)
        ))
      : [],
    color: overrides?.color !== undefined ? overrides.color : record.color ?? null,
    order: overrides?.order !== undefined ? overrides.order ?? 0 : record.order ?? 0,
    parentId: record.parentId ?? null,
    occurrenceDay: record.occurrenceDay
      ? typeof record.occurrenceDay === 'string'
        ? record.occurrenceDay
        : formatDayKey(record.occurrenceDay as Date)
      : null,
  };
}

export async function resolveTelegramItemRef(chatId: string, number: number, contextId?: string | null) {
  const context = await getTelegramItemContext(chatId, contextId);
  const refs = Array.isArray(context?.items) ? context.items as TelegramItemRef[] : [];
  const ref = refs.find((item) => item.n === number);
  return ref ? { ref, contextId: context?.contextId ?? null } : null;
}

export async function markTelegramRefDone(userId: number, ref: TelegramItemRef) {
  if (ref.status === 'done') return { status: 'already_done' as const, ref };

  if (ref.isOccurrence && ref.sourceId) {
    const occurrenceDay = ref.occurrenceDay ?? ref.day;
    await addExdate(userId, ref.sourceId, occurrenceDay);
    await createOverride(userId, ref.sourceId, occurrenceDay, itemInputFromRef(ref, { status: 'done' }));
    return { status: 'done' as const, ref };
  }

  if (typeof ref.id !== 'number') return null;
  const record = await getItemById(userId, ref.id);
  const payload = itemInputFromRecord(record, { status: 'done' });
  if (!payload) return null;
  await updateItem(userId, ref.id, payload);
  return { status: 'done' as const, ref };
}

export async function deleteTelegramRef(userId: number, ref: TelegramItemRef) {
  if (ref.isOccurrence && ref.sourceId) {
    await addExdate(userId, ref.sourceId, ref.occurrenceDay ?? ref.day);
    if (ref.isOverride && typeof ref.id === 'number') {
      await deleteItem(userId, ref.id);
    }
    return true;
  }

  if (typeof ref.id !== 'number') return false;
  await deleteItem(userId, ref.id);
  return true;
}

function parseWeekday(value: string, now: Date) {
  const target = WEEKDAY_ALIASES[value.toLowerCase()];
  if (target === undefined) return null;
  const current = now.getUTCDay();
  const offset = (target - current + 7) % 7;
  return formatDayKey(addDays(now, offset));
}

export function parseTelegramMoveArgs(args: string[]) {
  const now = nowInTz(new Date());
  const timeIndex = args.findIndex((arg) => /^\d{1,2}:\d{2}$/.test(arg));
  const time = timeIndex >= 0 ? normalizeTime(args[timeIndex]) : null;
  const dateToken = args.find((arg, index) => index !== timeIndex);
  if (!dateToken) return null;

  let day: string | null = null;
  const normalizedDate = dateToken.toLowerCase();
  if (normalizedDate === 'today') day = formatDayKey(now);
  else if (normalizedDate === 'tomorrow') day = formatDayKey(addDays(now, 1));
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dateToken)) day = dateToken;
  else day = parseWeekday(dateToken, now);

  if (!day) return null;
  return { day, timeStart: time };
}

function moveTimeEnd(ref: TelegramItemRef, nextStart: string | null) {
  if (!nextStart || !ref.timeStart || !ref.timeEnd) return ref.timeEnd ?? null;
  const [oldH, oldM] = ref.timeStart.split(':').map(Number);
  const [endH, endM] = ref.timeEnd.split(':').map(Number);
  const [newH, newM] = nextStart.split(':').map(Number);
  const duration = (endH * 60 + endM) - (oldH * 60 + oldM);
  if (!Number.isFinite(duration) || duration <= 0) return ref.timeEnd ?? null;
  const base = new Date(Date.UTC(2000, 0, 1, newH, newM));
  const shifted = addMinutes(base, duration);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

export async function moveTelegramRef(userId: number, ref: TelegramItemRef, day: string, timeStart: string | null) {
  if (ref.isOccurrence || ref.recurrenceRule) {
    return { status: 'unsupported_recurring' as const, ref };
  }

  if (typeof ref.id !== 'number') return null;
  const record = await getItemById(userId, ref.id);
  const nextTimeStart = timeStart ?? ref.timeStart ?? null;
  const payload = itemInputFromRecord(record, {
    day,
    timeStart: nextTimeStart,
    timeEnd: timeStart ? moveTimeEnd(ref, nextTimeStart) : ref.timeEnd ?? null,
  });
  if (!payload) return null;
  await updateItem(userId, ref.id, payload);
  return {
    status: 'moved' as const,
    ref: { ...ref, day, timeStart: payload.timeStart, timeEnd: payload.timeEnd },
  };
}

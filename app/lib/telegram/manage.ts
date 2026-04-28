import { addDays, addMinutes, differenceInMinutes, format } from 'date-fns';

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

export type TelegramListContext = {
  contextId: string;
  items: TelegramItemRef[];
};

export type TelegramManagementAction = 'done' | 'delete' | 'move';

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

const TEXT_MATCH_STOP_WORDS = new Set([
  'done',
  'delete',
  'move',
  'mark',
  'completed',
  'cancel',
  'today',
  'tomorrow',
  'please',
  'удали',
  'удалить',
  'удалил',
  'удаляла',
  'удаляй',
  'выполнил',
  'выполнила',
  'выполнено',
  'отметь',
  'отметить',
  'готово',
  'сделал',
  'сделала',
  'перенеси',
  'перенести',
  'перенёс',
  'перенес',
  'сегодня',
  'завтра',
  'пожалуйста',
  'нахуй',
  'нахуя',
  'блять',
  'бля',
  'сука',
  'видали',
  'видалити',
  'виконав',
  'виконала',
  'познач',
  'перенеси',
  'перенести',
  'сьогодні',
  'завтра',
  'supprime',
  'supprimer',
  'termine',
  'terminé',
  'deplace',
  'déplace',
  'deplacer',
  'déplacer',
  'aujourdhui',
  'demain',
]);

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

function formatDateLine(day: string, _language: TelegramLanguage) {
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

export function parseTelegramDayArgs(args: string[]) {
  const token = args[0]?.trim();
  const now = nowInTz(new Date());
  if (!token || token.toLowerCase() === 'today') return formatDayKey(now);

  const normalized = token.toLowerCase();
  if (normalized === 'tomorrow') return formatDayKey(addDays(now, 1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;

  return parseWeekday(normalized, now);
}

export function telegramDayLabel(day: string, language: TelegramLanguage) {
  const messages = t(language);
  const today = formatDayKey(nowInTz(new Date()));
  const tomorrow = formatDayKey(addDays(parseDayKey(today), 1));
  if (day === today) return messages.dayToday;
  if (day === tomorrow) return messages.dayTomorrow;
  return format(parseDayKey(day), 'EEEE');
}

export function formatTelegramDayList(
  day: string,
  context: TelegramListContext,
  language: TelegramLanguage
) {
  return formatTelegramNumberedDay(telegramDayLabel(day, language), day, context, language);
}

export function formatTelegramDayListKeyboard(
  day: string,
  contextId: string,
  language: TelegramLanguage
) {
  const messages = t(language);
  return {
    inline_keyboard: [
      [
        { text: messages.prev, callback_data: `day:prev:${day}` },
        { text: messages.next, callback_data: `day:next:${day}` },
        { text: messages.week, callback_data: `day:week:${day}` },
      ],
      [
        { text: messages.actionDone, callback_data: `act:done:${contextId}` },
        { text: messages.actionMove, callback_data: `act:move:${contextId}` },
        { text: messages.actionDelete, callback_data: `act:delete:${contextId}` },
      ],
      [{ text: messages.refresh, callback_data: `day:refresh:${day}` }],
    ],
  };
}

export function formatTelegramItemPickerKeyboard(
  action: 'done' | 'delete' | 'move',
  context: TelegramListContext,
  language: TelegramLanguage
) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < context.items.length; index += 4) {
    rows.push(context.items.slice(index, index + 4).map((ref) => ({
      text: String(ref.n),
      callback_data: `pick:${action}:${context.contextId}:${ref.n}`,
    })));
  }
  rows.push([{ text: t(language).canceled, callback_data: 'flow:cancel' }]);
  return { inline_keyboard: rows };
}

export function formatTelegramPendingChoiceKeyboard(refs: TelegramItemRef[], language: TelegramLanguage) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < refs.length; index += 4) {
    rows.push(refs.slice(index, index + 4).map((ref) => ({
      text: String(ref.n),
      callback_data: `pending_pick:${ref.n}`,
    })));
  }
  rows.push([{ text: t(language).canceled, callback_data: 'pending:cancel' }]);
  return { inline_keyboard: rows };
}

export function formatTelegramCancelKeyboard(language: TelegramLanguage) {
  return {
    inline_keyboard: [[{ text: t(language).canceled, callback_data: 'pending:cancel' }]],
  };
}

export function formatTelegramMoveDestinationKeyboard(
  contextId: string,
  itemNumber: number,
  language: TelegramLanguage
) {
  const messages = t(language);
  return {
    inline_keyboard: [
      [
        { text: messages.moveToday, callback_data: `move:${contextId}:${itemNumber}:today` },
        { text: messages.moveTomorrow, callback_data: `move:${contextId}:${itemNumber}:tomorrow` },
      ],
      [
        { text: messages.movePlusTwoDays, callback_data: `move:${contextId}:${itemNumber}:plus2` },
        { text: messages.moveTypeDate, callback_data: `move:${contextId}:${itemNumber}:type` },
      ],
      [{ text: messages.canceled, callback_data: 'flow:cancel' }],
    ],
  };
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

function minutesUntilLabel(totalMinutes: number, tomorrow: boolean) {
  const clamped = Math.max(0, totalMinutes);
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes || !hours) parts.push(`${minutes}m`);
  return tomorrow ? `tomorrow in ${parts.join(' ')}` : `in ${parts.join(' ')}`;
}

function wallDateTime(day: string, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = parseDayKey(day);
  date.setUTCHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function formatUpcomingItemBlock(ref: TelegramItemRef, now: Date, tomorrow: boolean) {
  const line = formatRefLine(ref);
  if (!ref.timeStart) return line;
  const minutes = differenceInMinutes(wallDateTime(ref.day, ref.timeStart), now);
  return `${line}\n${minutesUntilLabel(minutes, tomorrow)}`;
}

export function formatTelegramUpcoming(items: Item[], language: TelegramLanguage, now = nowInTz(new Date())) {
  const messages = t(language);
  const today = formatDayKey(now);
  const tomorrow = formatDayKey(addDays(parseDayKey(today), 1));
  const upcomingItems = sortForManagement(items).filter((item) => {
    if (item.day === tomorrow) return true;
    if (item.day !== today) return false;
    return !item.timeStart || wallDateTime(item.day, item.timeStart) >= now;
  });
  const refs = upcomingItems.map((item, index) => toRef(item, index + 1));
  const todayRefs = refs.filter((ref) => ref.day === today);
  const tomorrowRefs = refs.filter((ref) => ref.day === tomorrow);
  const todayTimed = todayRefs.filter((ref) => ref.timeStart && wallDateTime(ref.day, ref.timeStart) >= now);
  const todayUntimed = todayRefs.filter((ref) => !ref.timeStart);
  const tomorrowTimed = tomorrowRefs.filter((ref) => ref.timeStart);
  const tomorrowUntimed = tomorrowRefs.filter((ref) => !ref.timeStart);
  const sections = [
    `${escapeTelegramHtml(messages.upcomingTitle)}\n${escapeTelegramHtml(messages.upcomingScope)}`,
  ];

  if (todayTimed.length || todayUntimed.length) {
    const blocks: string[] = [];
    if (todayTimed.length) {
      blocks.push(todayTimed.map((ref) => formatUpcomingItemBlock(ref, now, false)).join('\n\n'));
    }
    if (todayUntimed.length) {
      blocks.push(`${escapeTelegramHtml(messages.untimed)}\n\n${todayUntimed.map(formatRefLine).join('\n')}`);
    }
    sections.push(`${escapeTelegramHtml(messages.dayToday)}\n\n${blocks.join('\n\n')}`);
  }

  if (tomorrowTimed.length || tomorrowUntimed.length) {
    const blocks: string[] = [];
    if (tomorrowTimed.length) {
      blocks.push(tomorrowTimed.map((ref) => formatUpcomingItemBlock(ref, now, true)).join('\n\n'));
    }
    if (tomorrowUntimed.length) {
      blocks.push(`${escapeTelegramHtml(messages.untimed)}\n\n${tomorrowUntimed.map(formatRefLine).join('\n')}`);
    }
    sections.push(`${escapeTelegramHtml(messages.dayTomorrow)}\n\n${blocks.join('\n\n')}`);
  }

  if (sections.length === 1) {
    sections.push(escapeTelegramHtml(messages.noUpcoming));
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

export async function getTelegramListContext(chatId: string, contextId?: string | null): Promise<TelegramListContext | null> {
  const context = await getTelegramItemContext(chatId, contextId);
  const refs = Array.isArray(context?.items) ? context.items as TelegramItemRef[] : [];
  if (!context || !refs.length) return null;
  return { contextId: context.contextId, items: refs };
}

function normalizeMatchText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-яіїєґ0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string) {
  return normalizeMatchText(value)
    .split(' ')
    .filter((token) => token.length >= 2 && !TEXT_MATCH_STOP_WORDS.has(token));
}

function scoreTelegramRefMatch(ref: TelegramItemRef, rawHint: string) {
  const hintTokens = meaningfulTokens(rawHint);
  if (!hintTokens.length) return 0;

  const title = normalizeMatchText(ref.title);
  const details = normalizeMatchText(ref.details);
  const hint = hintTokens.join(' ');
  let score = 0;

  if (title === hint) score += 12;
  if (title.includes(hint) || hint.includes(title)) score += 8;

  for (const token of hintTokens) {
    if (title.split(' ').includes(token)) score += 5;
    else if (title.includes(token)) score += 3;
    else if (details.includes(token)) score += 1;
  }

  return score;
}

export function matchTelegramRefsByText(context: TelegramListContext, rawHint: string | null | undefined) {
  const hint = rawHint?.trim();
  if (!hint) return { status: 'no_hint' as const, matches: [] as TelegramItemRef[] };

  const scored = context.items
    .map((ref) => ({ ref, score: scoreTelegramRefMatch(ref, hint) }))
    .filter((entry) => entry.score >= 5)
    .sort((a, b) => b.score - a.score || a.ref.n - b.ref.n);

  if (!scored.length) return { status: 'none' as const, matches: [] as TelegramItemRef[] };

  const topScore = scored[0].score;
  const strongMatches = scored.filter((entry) => entry.score >= Math.max(5, topScore - 2));
  if (strongMatches.length === 1 && topScore >= 8) {
    return { status: 'single' as const, matches: [strongMatches[0].ref] };
  }

  return { status: 'multiple' as const, matches: strongMatches.map((entry) => entry.ref) };
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

import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  startOfWeek,
} from 'date-fns';
import { Item } from 'app/types';
import { formatDayKey, parseDayKey, TIMEZONE } from './datetime';

type ParsedRule = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  byDay?: number[];
  byMonthDay?: number[];
  until?: Date | null;
  count?: number | null;
};

const WEEKDAY_CODES: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function parseUntil(value?: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{8}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map((v) => Number(v));
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59));
  }
  return null;
}

function parseRule(rule?: string | null): ParsedRule | null {
  if (!rule) return null;
  const segments = rule.split(';');
  const parsed: Partial<ParsedRule> = {};

  for (const seg of segments) {
    const [rawKey, rawValue] = seg.split('=');
    if (!rawKey) continue;
    const key = rawKey.toUpperCase();
    const value = rawValue?.trim();
    switch (key) {
      case 'FREQ':
        if (value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY') {
          parsed.freq = value;
        }
        break;
      case 'INTERVAL':
        parsed.interval = Math.max(1, Number.parseInt(value || '1', 10));
        break;
      case 'BYDAY':
        parsed.byDay = (value || '')
          .split(',')
          .map((v) => WEEKDAY_CODES[v.toUpperCase()] ?? null)
          .filter((v): v is number => v !== null);
        break;
      case 'BYMONTHDAY':
        parsed.byMonthDay = (value || '')
          .split(',')
          .map((v) => Number.parseInt(v, 10))
          .filter((v) => !Number.isNaN(v));
        break;
      case 'UNTIL':
        parsed.until = parseUntil(value || undefined);
        break;
      case 'COUNT':
        parsed.count = Number.isFinite(Number(value)) ? Number(value) : null;
        break;
      default:
        break;
    }
  }

  if (!parsed.freq) return null;

  return {
    freq: parsed.freq,
    interval: parsed.interval ?? 1,
    byDay: parsed.byDay,
    byMonthDay: parsed.byMonthDay,
    until: parsed.until ?? null,
    count: parsed.count ?? null,
  };
}

function addOccurrence(
  occurrences: Item[],
  base: Item,
  occurrenceDate: Date,
  exdates: Set<string>,
  overrides: Map<string, Item>,
  produced: { value: number },
  limits: { until?: Date | null; count?: number | null },
  range: { start: Date; end: Date }
) {
  const { until, count } = limits;
  if (until && occurrenceDate > until) return false;
  const dayKey = formatDayKey(occurrenceDate);
  produced.value += 1;
  if (count && produced.value > count) return false;

  if (occurrenceDate < range.start || occurrenceDate > range.end) {
    return true;
  }
  const override = overrides.get(dayKey);
  if (override) {
    occurrences.push({
      ...override,
      day: dayKey,
      sourceId: Number(base.id),
      isOccurrence: true,
      isOverride: true,
    });
    return true;
  }

  if (exdates.has(dayKey)) return true;

  occurrences.push({
    ...base,
    id: `r:${base.id}:${dayKey}`,
    day: dayKey,
    sourceId: Number(base.id),
    isOccurrence: true,
    isOverride: false,
  });
  return true;
}

function expandDaily(
  rule: ParsedRule,
  base: Item,
  range: { start: Date; end: Date },
  exdates: Set<string>,
  overrides: Map<string, Item>,
  occurrences: Item[]
) {
  const anchor = parseDayKey(base.day);
  let cursor = anchor;
  const produced = { value: 0 };

  if (cursor < range.start) {
    const diff = differenceInCalendarDays(range.start, cursor);
    const steps = Math.floor(diff / rule.interval);
    cursor = addDays(cursor, steps * rule.interval);
    produced.value = steps;
    if (cursor < range.start) {
      cursor = addDays(cursor, rule.interval);
      produced.value += 1;
    }
  }

  let safety = 0;
  while (cursor <= range.end && safety < 10000) {
    safety += 1;
    const keepGoing = addOccurrence(occurrences, base, cursor, exdates, overrides, produced, rule, range);
    if (!keepGoing) break;
    cursor = addDays(cursor, rule.interval);
  }
}

function expandWeekly(
  rule: ParsedRule,
  base: Item,
  range: { start: Date; end: Date },
  exdates: Set<string>,
  overrides: Map<string, Item>,
  occurrences: Item[]
) {
  const anchor = parseDayKey(base.day);
  const weekStartsOn = 1 as const;
  const anchorWeekStart = startOfWeek(anchor, { weekStartsOn });
  const daysOfWeek = (rule.byDay && rule.byDay.length > 0)
    ? rule.byDay
    : [anchor.getUTCDay()];
  const produced = { value: 0 };

  const startWeek = startOfWeek(range.start > anchor ? range.start : anchor, { weekStartsOn });
  const weeksFromAnchorToStart = Math.max(
    0,
    differenceInCalendarWeeks(startWeek, anchorWeekStart, { weekStartsOn })
  );
  produced.value = Math.floor(weeksFromAnchorToStart / rule.interval) * daysOfWeek.length;

  let currentWeek = startWeek;
  let safety = 0;

  while (currentWeek <= range.end && safety < 2000) {
    safety += 1;
    const weeksFromAnchor = differenceInCalendarWeeks(currentWeek, anchorWeekStart, { weekStartsOn });
    if (weeksFromAnchor < 0) {
      currentWeek = addWeeks(currentWeek, 1);
      continue;
    }
    if (weeksFromAnchor % rule.interval !== 0) {
      currentWeek = addWeeks(currentWeek, 1);
      continue;
    }

    for (const weekday of daysOfWeek) {
      const offset = (weekday + 7 - 1) % 7; // convert JS weekday to week starting Monday
      const candidate = addDays(currentWeek, offset);
      if (candidate < anchor) continue;
      const keepGoing = addOccurrence(
        occurrences,
        base,
        candidate,
        exdates,
        overrides,
        produced,
        rule,
        range
      );
      if (!keepGoing) return;
    }

    currentWeek = addWeeks(currentWeek, 1);
  }
}

function expandMonthly(
  rule: ParsedRule,
  base: Item,
  range: { start: Date; end: Date },
  exdates: Set<string>,
  overrides: Map<string, Item>,
  occurrences: Item[]
) {
  const anchor = parseDayKey(base.day);
  const dayNumbers = (rule.byMonthDay && rule.byMonthDay.length > 0)
    ? rule.byMonthDay
    : [anchor.getUTCDate()];
  const produced = { value: 0 };

  let cursor = anchor;
  if (cursor < range.start) {
    const diff = differenceInCalendarMonths(range.start, cursor);
    const steps = Math.floor(diff / rule.interval);
    cursor = addMonths(cursor, steps * rule.interval);
    produced.value = steps * dayNumbers.length;
  }

  let safety = 0;
  while (cursor <= range.end && safety < 600) {
    safety += 1;
    for (const dayNumber of dayNumbers) {
      const candidate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), dayNumber));
      if (candidate < anchor) continue;
      const keepGoing = addOccurrence(
        occurrences,
        base,
        candidate,
        exdates,
        overrides,
        produced,
        rule,
        range
      );
      if (!keepGoing) return;
    }
    cursor = addMonths(cursor, rule.interval);
  }
}

export function expandRecurringItems(
  items: Item[],
  startDayKey: string,
  endDayKey: string,
  timezone: string = TIMEZONE
): Item[] {
  void timezone;
  const range = {
    start: parseDayKey(startDayKey),
    end: parseDayKey(endDayKey),
  };

  const baseItems = items.filter(
    (item) => !item.recurrenceRule && !item.parentId && item.day >= startDayKey && item.day <= endDayKey
  );

  const overrides = items.filter((item) => item.parentId && item.occurrenceDay);
  const overrideMap = new Map<string, Item>();
  overrides.forEach((ov) => {
    const key = formatDayKey(parseDayKey(ov.occurrenceDay || ov.day));
    overrideMap.set(key, ov);
  });

  const masters = items.filter((item) => item.recurrenceRule && !item.parentId);
  const occurrences: Item[] = [...baseItems];

  for (const master of masters) {
    const rule = parseRule(master.recurrenceRule);
    if (!rule) continue;

    const exdates = new Set<string>((master.recurrenceExdates || []).map((d) => formatDayKey(parseDayKey(d))));
    const limits = {
      until: rule.until || (master.recurrenceUntilDay ? parseDayKey(master.recurrenceUntilDay) : null),
      count: rule.count || master.recurrenceCount || null,
    };

    switch (rule.freq) {
      case 'DAILY':
        expandDaily(rule, master, range, exdates, overrideMap, occurrences);
        break;
      case 'WEEKLY':
        expandWeekly(rule, master, range, exdates, overrideMap, occurrences);
        break;
      case 'MONTHLY':
        expandMonthly(rule, master, range, exdates, overrideMap, occurrences);
        break;
      default:
        break;
    }
  }

  const deduped = new Map<string, Item>();
  for (const item of occurrences) {
    deduped.set(String(item.id), item);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.day === b.day) {
      if (!a.timeStart && b.timeStart) return 1;
      if (a.timeStart && !b.timeStart) return -1;
      const timeCompare = (a.timeStart || '').localeCompare(b.timeStart || '');
      if (timeCompare !== 0) return timeCompare;
      return String(a.id).localeCompare(String(b.id));
    }
    return a.day.localeCompare(b.day);
  });
}

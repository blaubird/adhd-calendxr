import { ItemRecord } from 'app/db';
import { Item } from 'app/types';
import { formatDayKey, normalizeDayString, normalizeTime, TIMEZONE } from './datetime';

export function normalizeItemRecord(record: ItemRecord): Item {
  const dayValue =
    typeof record.day === 'string'
      ? normalizeDayString(record.day.split('T')[0])
      : formatDayKey(record.day as Date);

  const timeStart = normalizeTime((record as any).timeStart as string | null | undefined);
  const timeEnd = normalizeTime((record as any).timeEnd as string | null | undefined);

  return {
    id: record.id,
    userId: record.userId,
    kind: record.kind,
    day: dayValue || formatDayKey(new Date(record.day)),
    timeStart,
    timeEnd,
    title: record.title,
    details: record.details ?? null,
    status: record.status ?? null,
    recurrenceRule: (record as any).recurrenceRule ?? null,
    recurrenceTz: (record as any).recurrenceTz ?? TIMEZONE,
    recurrenceUntilDay:
      (record as any).recurrenceUntilDay != null
        ? normalizeDayString(
            typeof (record as any).recurrenceUntilDay === 'string'
              ? (record as any).recurrenceUntilDay
              : formatDayKey((record as any).recurrenceUntilDay as Date)
          )
        : null,
    recurrenceCount: (record as any).recurrenceCount ?? null,
    recurrenceExdates: Array.isArray((record as any).recurrenceExdates)
      ? ((record as any).recurrenceExdates as (string | Date)[])
          .map((d) => (typeof d === 'string' ? normalizeDayString(d) : formatDayKey(d as Date)))
          .filter((v): v is string => Boolean(v))
      : [],
    parentId: (record as any).parentId ?? null,
    occurrenceDay:
      (record as any).occurrenceDay != null
        ? formatDayKey(new Date((record as any).occurrenceDay as Date))
        : null,
  };
}

export function normalizeItemList(records: ItemRecord[]): Item[] {
  return records.map(normalizeItemRecord);
}


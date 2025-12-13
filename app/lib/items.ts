import { ItemRecord } from 'app/db';
import { Item } from 'app/types';
import { formatDayKey, normalizeDayString, normalizeTime } from './datetime';

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
  };
}

export function normalizeItemList(records: ItemRecord[]): Item[] {
  return records.map(normalizeItemRecord);
}


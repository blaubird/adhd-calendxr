import { addDays, format, parseISO } from 'date-fns';

export const DAY_KEY_FORMAT = 'yyyy-MM-dd';

export function formatDayKey(date: Date) {
  return format(date, DAY_KEY_FORMAT);
}

export function parseDayKey(dayKey: string) {
  return parseISO(dayKey);
}

export function rangeEndFromAnchor(anchor: string, days: number) {
  return formatDayKey(addDays(parseDayKey(anchor), days - 1));
}

export function formatDayHeading(date: Date) {
  return format(date, 'EEE, dd MMM');
}

export function formatDateFull(date: Date) {
  return format(date, 'dd MMM yyyy');
}

export function formatTimeValue(time: string | null) {
  if (!time) return '';
  // Already stored as HH:mm; keep 24h representation
  return time;
}

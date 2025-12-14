import { addDays, format, isValid } from 'date-fns';
import { enGB } from 'date-fns/locale';

export const TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Paris';
export const DAY_KEY_FORMAT = 'yyyy-MM-dd';
const DISPLAY_DATE_FORMAT = 'dd.MM.yyyy';
const HEADING_DATE_FORMAT = 'EEE dd.MM.yyyy';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getZonedParts(date: Date = new Date()): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hours: Number(lookup.hour),
    minutes: Number(lookup.minute),
    seconds: Number(lookup.second),
  };
}

export function nowInTz(date: Date = new Date()) {
  const { year, month, day, hours, minutes, seconds } = getZonedParts(date);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

export function todayKey(date: Date = new Date()) {
  return formatDayKey(nowInTz(date));
}

export function formatDayKey(date: Date) {
  const zoned = nowInTz(date);
  return format(zoned, DAY_KEY_FORMAT, { locale: enGB });
}

export function parseDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map((v) => Number(v));
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

export function rangeEndFromAnchor(anchor: string, days: number) {
  return formatDayKey(addDays(parseDayKey(anchor), days - 1));
}

export function formatDayHeading(date: Date) {
  return format(nowInTz(date), HEADING_DATE_FORMAT, { locale: enGB });
}

export function formatDateFull(date: Date) {
  return format(nowInTz(date), DISPLAY_DATE_FORMAT, { locale: enGB });
}

export function formatDayEU(isoDay: string) {
  return format(parseDayKey(isoDay), DISPLAY_DATE_FORMAT, { locale: enGB });
}

export function formatTimeValue(time: string | null) {
  if (!time) return '';
  return formatTime24(time) ?? '';
}

export function formatTime24(time: string | null | undefined) {
  if (!time) return '';
  // Normalize common formats (HH:mm:ss, HH:mm) to HH:mm (24h)
  const normalized = normalizeTime(time);
  return normalized ?? '';
}

export function formatTimeRange24(start: string | null, end: string | null) {
  const startStr = formatTime24(start);
  const endStr = formatTime24(end);
  if (!startStr && !endStr) return '';
  if (startStr && endStr) return `${startStr}–${endStr}`;
  return startStr || endStr;
}

export function normalizeDayString(day: string) {
  try {
    const parsed = parseDayKey(day);
    if (!isValid(parsed)) return null;
    return formatDayKey(parsed);
  } catch (e) {
    return null;
  }
}

export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();

  // Handle HH:mm:ss
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([aApP][mM]))?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;

  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hours === 12) hours = 0;
    if (meridiem === 'pm') hours += 12;
  }
  if (hours > 23) return null;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function formatTimeRange(start: string | null, end: string | null) {
  const startStr = formatTimeValue(start);
  const endStr = formatTimeValue(end);
  if (!startStr && !endStr) return '';
  if (startStr && endStr) return `${startStr}–${endStr}`;
  return startStr || endStr;
}

export function parseDayEU(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  return normalizeDayString(iso);
}

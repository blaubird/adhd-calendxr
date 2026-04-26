import { addDays, differenceInCalendarDays, format } from 'date-fns';

import type { Draft, Item } from 'app/types';
import { formatTimeRange, parseDayKey } from 'app/lib/datetime';

type TelegramDraftLike = Omit<Draft, 'timeStart' | 'timeEnd' | 'details' | 'status'> & {
  timeStart?: string | null;
  timeEnd?: string | null;
  details?: string | null;
  status?: Draft['status'] | null;
};

function itemDay(item: Item) {
  return item.occurrenceDay || item.day;
}

function donePrefix(item: Pick<Item, 'status'>) {
  return item.status === 'done' ? '✓ ' : '';
}

function sortByTime(a: Pick<Item, 'timeStart'>, b: Pick<Item, 'timeStart'>) {
  return (a.timeStart || '').localeCompare(b.timeStart || '');
}

export function formatTelegramTimeRange(timeStart: string | null | undefined, timeEnd: string | null | undefined) {
  return formatTimeRange(timeStart ?? null, timeEnd ?? null) || 'No time';
}

export function formatTelegramItemLine(item: Item) {
  const title = `${donePrefix(item)}${item.title}`;
  if (!item.timeStart) return `• ${title}`;
  return `${formatTelegramTimeRange(item.timeStart, item.timeEnd)} — ${title}`;
}

export function formatTelegramDraftLine(draft: TelegramDraftLike) {
  return `${formatTelegramTimeRange(draft.timeStart, draft.timeEnd)} — ${draft.title}`;
}

export function formatTelegramDraftMessage(draft: TelegramDraftLike) {
  let text = `*${draft.day}*\n${formatTelegramDraftLine(draft)}`;
  if (draft.recurrenceRule) text += `\nRepeats: ${draft.recurrenceRule}`;
  return text;
}

export function formatTelegramSavedDraft(draft: TelegramDraftLike) {
  return `✅ Saved: ${draft.day} ${formatTelegramDraftLine(draft)}`;
}

export function formatTelegramDay(items: Item[], dateHeader: string, emptyText = 'No items.') {
  const untimed = items.filter((item) => !item.timeStart);
  const timed = items.filter((item) => item.timeStart).sort(sortByTime);

  let text = `*${dateHeader}*\n\n`;
  if (untimed.length) {
    text += `*No time:*\n${untimed.map(formatTelegramItemLine).join('\n')}\n\n`;
  }
  if (timed.length) {
    text += `*Timed:*\n${timed.map(formatTelegramItemLine).join('\n')}\n\n`;
  }
  if (!untimed.length && !timed.length) {
    text += `${emptyText}\n\n`;
  }
  return text.trim();
}

export function formatTelegramRange(items: Item[], startDay: string, endDay: string, label: string) {
  if (startDay === endDay) {
    const dayItems = items.filter((item) => itemDay(item) === startDay);
    const heading = `${format(parseDayKey(startDay), 'dd.MM.yyyy — EEEE')}`;
    return formatTelegramDay(dayItems, heading);
  }

  const start = parseDayKey(startDay);
  const end = parseDayKey(endDay);
  const days = differenceInCalendarDays(end, start) + 1;
  let text = `*${label}*\n\n`;

  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const dayKey = format(day, 'yyyy-MM-dd');
    const dayItems = items
      .filter((item) => itemDay(item) === dayKey)
      .sort((a, b) => {
        if (!a.timeStart && b.timeStart) return -1;
        if (a.timeStart && !b.timeStart) return 1;
        return sortByTime(a, b);
      });

    text += `*${format(day, 'EEE dd.MM')}*\n`;
    if (!dayItems.length) {
      text += 'No items\n\n';
      continue;
    }
    text += `${dayItems.map(formatTelegramItemLine).join('\n')}\n\n`;
  }

  return text.trim();
}

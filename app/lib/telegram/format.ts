import { addDays, differenceInCalendarDays, format } from 'date-fns';
import type { Locale } from 'date-fns';
import { enGB, fr, ru, uk } from 'date-fns/locale';

import type { Draft, Item } from 'app/types';
import { TIMEZONE, formatTimeRange, parseDayKey } from 'app/lib/datetime';
import { TELEGRAM_LANGUAGE_LABELS, type TelegramLanguage, t } from './i18n';

type TelegramDraftLike = Omit<Draft, 'timeStart' | 'timeEnd' | 'details' | 'status'> & {
  timeStart?: string | null;
  timeEnd?: string | null;
  details?: string | null;
  status?: Draft['status'] | null;
};

type TelegramDayHeader = {
  date: Date;
  label: string;
  offsetDays?: number;
};

const DATE_LOCALES = {
  en: enGB,
  fr,
  uk,
  ru,
} satisfies Record<TelegramLanguage, Locale>;

function itemDay(item: Item) {
  return item.occurrenceDay || item.day;
}

function sortByTime(a: Pick<Item, 'timeStart'>, b: Pick<Item, 'timeStart'>) {
  return (a.timeStart || '').localeCompare(b.timeStart || '');
}

export function escapeTelegramHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTelegramDate(date: Date, language: TelegramLanguage) {
  return format(date, 'd MMM', { locale: DATE_LOCALES[language] });
}

function formatReminderDayLabel(day: string, today: string, tomorrow: string, language: TelegramLanguage) {
  if (day === today) return t(language).dayToday;
  if (day === tomorrow) return t(language).dayTomorrow;
  return formatTelegramDate(parseDayKey(day), language);
}

function formatDayTitle(header: string | TelegramDayHeader, language: TelegramLanguage) {
  if (typeof header === 'string') return `<b>${escapeTelegramHtml(header)}</b>`;

  const offset = typeof header.offsetDays === 'number'
    ? ` · D${header.offsetDays >= 0 ? '+' : ''}${header.offsetDays}`
    : '';
  return `<b>${escapeTelegramHtml(header.label)}${offset}</b>\n${escapeTelegramHtml(formatTelegramDate(header.date, language))} · ${escapeTelegramHtml(TIMEZONE)}`;
}

export function formatTelegramTimeRange(timeStart: string | null | undefined, timeEnd: string | null | undefined) {
  return formatTimeRange(timeStart ?? null, timeEnd ?? null) || '';
}

export function formatTelegramItemLine(item: Item, language: TelegramLanguage = 'en') {
  const messages = t(language);
  const title = escapeTelegramHtml(item.title);

  if (!item.timeStart) return title;

  const time = escapeTelegramHtml(formatTelegramTimeRange(item.timeStart, item.timeEnd) || messages.noTime);
  return `${time}\n${title}`;
}

export function formatTelegramDraftLine(draft: TelegramDraftLike, language: TelegramLanguage = 'en') {
  const messages = t(language);
  const time = escapeTelegramHtml(formatTelegramTimeRange(draft.timeStart, draft.timeEnd) || messages.noTime);
  return `⏱ ${time}\n◦ ${escapeTelegramHtml(draft.title)}`;
}

export function formatTelegramDraftMessage(draft: TelegramDraftLike, language: TelegramLanguage = 'en') {
  const messages = t(language);
  let text = `☾ Draft\n${escapeTelegramHtml(draft.day)}\n\n${formatTelegramDraftLine(draft, language)}`;

  if (draft.details) text += `\n◇ ${escapeTelegramHtml(draft.details)}`;
  if (draft.recurrenceRule) text += `\n${escapeTelegramHtml(messages.repeats)}: ${escapeTelegramHtml(draft.recurrenceRule)}`;

  return text;
}

export function formatTelegramSavedDraft(draft: TelegramDraftLike, language: TelegramLanguage = 'en') {
  const messages = t(language);
  return `✓ ${escapeTelegramHtml(messages.savedPrefix)}\n${escapeTelegramHtml(draft.day)}\n\n${formatTelegramDraftLine(draft, language)}`;
}

export function formatTelegramDay(
  items: Item[],
  dateHeader: string | TelegramDayHeader,
  emptyTextOrLanguage: string | TelegramLanguage = 'en',
  maybeLanguage?: TelegramLanguage
) {
  const isLanguage = ['en', 'fr', 'uk', 'ru'].includes(emptyTextOrLanguage);
  const language = maybeLanguage || (isLanguage ? emptyTextOrLanguage as TelegramLanguage : 'en');
  const emptyText = maybeLanguage
    ? emptyTextOrLanguage
    : isLanguage
      ? t(language).emptyDay
      : emptyTextOrLanguage;
  const messages = t(language);
  const timed = items.filter((item) => item.timeStart).sort(sortByTime);
  const untimed = items.filter((item) => !item.timeStart);
  const itemBlocks = [...timed, ...untimed].map((item) => formatTelegramItemLine(item, language));

  let text = `${formatDayTitle(dateHeader, language)}\n\n`;

  if (itemBlocks.length) {
    text += `${itemBlocks.join('\n\n')}\n\n`;
  }
  if (!untimed.length && !timed.length) {
    text += `${escapeTelegramHtml(messages.nothingPlanned)}\n${escapeTelegramHtml(emptyText)}\n\n`;
  }

  return text.trim();
}

export function formatTelegramRange(
  items: Item[],
  startDay: string,
  endDay: string,
  label: string,
  language: TelegramLanguage = 'en'
) {
  if (startDay === endDay) {
    const dayItems = items.filter((item) => itemDay(item) === startDay);
    return formatTelegramDay(dayItems, {
      date: parseDayKey(startDay),
      label,
    }, language);
  }

  const messages = t(language);
  const start = parseDayKey(startDay);
  const end = parseDayKey(endDay);
  const days = differenceInCalendarDays(end, start) + 1;
  let text = `<b>${escapeTelegramHtml(label)}</b>\n${escapeTelegramHtml(formatTelegramDate(start, language))} – ${escapeTelegramHtml(formatTelegramDate(end, language))} · ${escapeTelegramHtml(TIMEZONE)}\n\n`;

  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const dayKey = format(day, 'yyyy-MM-dd');
    const dayItems = items
      .filter((item) => itemDay(item) === dayKey)
      .sort((a, b) => {
        if (!a.timeStart && b.timeStart) return 1;
        if (a.timeStart && !b.timeStart) return -1;
        return sortByTime(a, b);
      });

    text += `<b>${escapeTelegramHtml(format(day, 'EEE d MMM', { locale: DATE_LOCALES[language] }))}</b>\n`;
    if (!dayItems.length) {
      text += `${escapeTelegramHtml(messages.noItems)}\n\n`;
      continue;
    }
    text += `${dayItems.map((item) => formatTelegramItemLine(item, language)).join('\n\n')}\n\n`;
  }

  return text.trim();
}

export function formatTelegramLanguageMessage(language: TelegramLanguage) {
  return t(language).languageTitle;
}

export function formatTelegramLanguageKeyboard() {
  return {
    inline_keyboard: [
      [{ text: TELEGRAM_LANGUAGE_LABELS.en, callback_data: 'language:en' }],
      [{ text: TELEGRAM_LANGUAGE_LABELS.fr, callback_data: 'language:fr' }],
      [{ text: TELEGRAM_LANGUAGE_LABELS.uk, callback_data: 'language:uk' }],
      [{ text: TELEGRAM_LANGUAGE_LABELS.ru, callback_data: 'language:ru' }],
    ],
  };
}

export function formatTelegramSettings(language: TelegramLanguage, remindersEnabled = false) {
  const messages = t(language);
  return `${messages.settingsTitle}\n\n${messages.settingsLanguage(TELEGRAM_LANGUAGE_LABELS[language])}\n${messages.settingsReminders(remindersEnabled)}`;
}

export function formatTelegramSettingsKeyboard(language: TelegramLanguage, remindersEnabled = false) {
  return {
    inline_keyboard: [
      [{ text: t(language).changeLanguage, callback_data: 'settings:language' }],
      [{
        text: remindersEnabled ? t(language).disableReminders : t(language).enableReminders,
        callback_data: remindersEnabled ? 'settings:reminders:off' : 'settings:reminders:on',
      }],
    ],
  };
}

export function formatTelegramTimedReminder(
  item: Pick<Item, 'title' | 'day' | 'timeStart' | 'timeEnd'>,
  language: TelegramLanguage,
  today: string,
  tomorrow: string
) {
  const messages = t(language);
  const time = escapeTelegramHtml(formatTelegramTimeRange(item.timeStart, item.timeEnd) || messages.noTime);
  const dayLabel = escapeTelegramHtml(formatReminderDayLabel(item.day, today, tomorrow, language));

  return `<b>${escapeTelegramHtml(messages.reminderTitle)}</b>\n${escapeTelegramHtml(messages.reminderIn15Minutes)}\n\n${time}\n${escapeTelegramHtml(item.title)}\n\n${dayLabel} · ${escapeTelegramHtml(TIMEZONE)}`;
}

export function formatTelegramUntimedMorningDigest(
  items: Array<Pick<Item, 'title'>>,
  language: TelegramLanguage,
  day: string
) {
  const messages = t(language);
  const date = escapeTelegramHtml(formatTelegramDate(parseDayKey(day), language));
  const titles = items.map((item) => escapeTelegramHtml(item.title)).join('\n');

  return `<b>${escapeTelegramHtml(messages.morningDigest)}</b>\n${escapeTelegramHtml(messages.dayToday)} · ${date}\n\n<b>${escapeTelegramHtml(messages.untimedMorningTitle)}</b>\n${titles}`;
}

export function formatTelegramDailyMorningDigest(items: Item[], language: TelegramLanguage, day: string) {
  const messages = t(language);
  const date = escapeTelegramHtml(formatTelegramDate(parseDayKey(day), language));
  const timed = items.filter((item) => item.timeStart).sort(sortByTime);
  const untimed = items.filter((item) => !item.timeStart);
  const sections: string[] = [
    `${escapeTelegramHtml(messages.dayToday)}\n${date} · ${escapeTelegramHtml(TIMEZONE)}`,
  ];

  if (timed.length) {
    sections.push(`${escapeTelegramHtml(messages.timed)}\n\n${timed.map((item) => formatTelegramItemLine(item, language)).join('\n\n')}`);
  }

  if (untimed.length) {
    sections.push(`${escapeTelegramHtml(messages.untimed)}\n\n${untimed.map((item) => formatTelegramItemLine(item, language)).join('\n\n')}`);
  }

  return sections.join('\n\n');
}

import { differenceInCalendarDays } from 'date-fns';

import { formatDayKey, normalizeDayString, parseDayKey } from 'app/lib/datetime';
import { type TelegramLanguage, t } from './i18n';

export const TELEGRAM_MAX_AI_TEXT_LENGTH = 1000;
export const TELEGRAM_MAX_QUERY_RANGE_DAYS = 30;
export const TELEGRAM_AI_COOLDOWN_MS = 2500;

export type TelegramIntentConfidence = 'high' | 'medium' | 'low';

export type TelegramIntent =
  | {
      intent: 'show_day';
      date: string;
      dateRangeStart: null;
      dateRangeEnd: null;
      timeStart: string | null;
      timeEnd: string | null;
      title: null;
      itemNumber: null;
      itemTextHint: string | null;
      targetDate: null;
      targetTimeStart: null;
      targetTimeEnd: null;
      confidence: TelegramIntentConfidence;
      clarificationQuestion: string | null;
      reason?: string | null;
    }
  | {
      intent: 'show_week' | 'show_upcoming';
      date: null;
      dateRangeStart: string | null;
      dateRangeEnd: string | null;
      timeStart: null;
      timeEnd: null;
      title: null;
      itemNumber: null;
      itemTextHint: string | null;
      targetDate: null;
      targetTimeStart: null;
      targetTimeEnd: null;
      confidence: TelegramIntentConfidence;
      clarificationQuestion: string | null;
      reason?: string | null;
    }
  | {
      intent: 'create_draft';
      date: string | null;
      dateRangeStart: null;
      dateRangeEnd: null;
      timeStart: string | null;
      timeEnd: string | null;
      title: string | null;
      itemNumber: null;
      itemTextHint: string | null;
      targetDate: null;
      targetTimeStart: null;
      targetTimeEnd: null;
      confidence: TelegramIntentConfidence;
      clarificationQuestion: string | null;
      draftInput: string;
      reason?: string | null;
    }
  | {
      intent: 'mark_done' | 'delete_item' | 'move_item';
      date: string | null;
      dateRangeStart: null;
      dateRangeEnd: null;
      timeStart: string | null;
      timeEnd: string | null;
      title: string | null;
      itemNumber: number | null;
      itemTextHint: string | null;
      targetDate: string | null;
      targetTimeStart: string | null;
      targetTimeEnd: string | null;
      confidence: TelegramIntentConfidence;
      clarificationQuestion: string | null;
      reason?: string | null;
    }
  | {
      intent: 'clarify' | 'unsupported';
      date: null;
      dateRangeStart: null;
      dateRangeEnd: null;
      timeStart: null;
      timeEnd: null;
      title: string | null;
      itemNumber: number | null;
      itemTextHint: string | null;
      targetDate: null;
      targetTimeStart: null;
      targetTimeEnd: null;
      confidence: TelegramIntentConfidence;
      clarificationQuestion: string | null;
      reason?: string | null;
    };

export type TelegramQueryRange = {
  startDay: string;
  endDay: string;
  label: string;
};

export type TelegramTextGateResult =
  | { allowed: true; text: string }
  | { allowed: false; reason: 'empty' | 'too_long' | 'unsafe' | 'unrelated'; message: string };

const HARD_REJECT_PATTERNS = [
  /ignore (all |previous )?instructions/i,
  /system prompt/i,
  /developer message/i,
  /show (your )?prompt/i,
  /reveal instructions/i,
  /jailbreak/i,
  /\bDAN\b/,
  /act as/i,
  /you are now/i,
  /bypass/i,
  /override rules/i,
  /print hidden/i,
  /show secrets?/i,
  /\bapi key\b/i,
  /\btoken\b/i,
  /environment variables/i,
  /env vars/i,
  /\bleak\b/i,
  /\bsecret\b/i,
  /игнорируй инструкции/i,
  /забудь инструкции/i,
  /системн(ый|ого) промпт/i,
  /покажи промпт/i,
  /раскрой инструкции/i,
  /обойди правила/i,
  /джейлбрейк/i,
  /покажи ключ/i,
  /апи ключ/i,
  /токен/i,
  /секрет/i,
  /переменные окружения/i,
];

const UNRELATED_PATTERNS = [
  /write (me )?(code|a react app|an app|essay)/i,
  /generate (an )?(essay|image|prompt|story)/i,
  /translate/i,
  /roleplay/i,
  /malware|hacking|phishing/i,
  /financial advice/i,
  /medical diagnosis/i,
  /casino logic/i,
  /напиши (код|приложение|эссе|историю)/i,
  /переведи/i,
  /расскажи историю/i,
  /сгенерируй (картинку|изображение|промпт)/i,
];

const CALENDAR_RELEVANCE_PATTERNS = [
  /что у меня/i,
  /покажи/i,
  /какие (дела|события)/i,
  /что запланировано/i,
  /календар[ьяеь]/i,
  /расписани[ея]/i,
  /сегодня|завтра|послезавтра/i,
  /через\s+\d+\s+(дн|недел|месяц)/i,
  /через\s+(один|два|три|четыре|пять|шесть|семь|неделю|месяц)/i,
  /следующ(ая|ую|ей|ий|ие)/i,
  /ближайш(ие|их|ий)/i,
  /грядущ(ие|их|ий)/i,
  /понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресень[ея]/i,
  /создай|добавь|запиши|напомни/i,
  /надо|нужно|купить|сделать|сходить|позвонить|отправить/i,
  /встреч[ауы]|рандеву|запись|при[её]м|работа|тренировка|урок|волонт[её]рство/i,
  /кажд(ый|ую|ое|ые)/i,
  /\b\d{1,2}:\d{2}\b/,
  /\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/,
  /what do i have/i,
  /show me/i,
  /\bschedule\b/i,
  /\bcalendar\b/i,
  /\btoday\b|\btomorrow\b/i,
  /next (week|\d+ days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /\badd\b|\bcreate\b|\bremember\b|\bremind\b/i,
  /\bmeeting\b|\bappointment\b|\bbuy\b|\bdo\b|\bcall\b|\bsend\b/i,
];

export function gateTelegramTextBeforeAi(rawText: string, language: TelegramLanguage = 'en'): TelegramTextGateResult {
  const text = rawText.trim();
  if (!text) return { allowed: false, reason: 'empty', message: '' };
  if (text.length > TELEGRAM_MAX_AI_TEXT_LENGTH) {
    return {
      allowed: false,
      reason: 'too_long',
      message: t(language).unsupported,
    };
  }
  if (HARD_REJECT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { allowed: false, reason: 'unsafe', message: t(language).unsupported };
  }
  if (UNRELATED_PATTERNS.some((pattern) => pattern.test(text))) {
    return { allowed: false, reason: 'unrelated', message: t(language).unsupported };
  }
  if (text.length > 80 && !CALENDAR_RELEVANCE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { allowed: false, reason: 'unrelated', message: t(language).unsupported };
  }
  return { allowed: true, text };
}

export function formatTelegramUnsupportedMessage(language: TelegramLanguage = 'en') {
  return t(language).unsupported;
}

export function validateTelegramQueryRange(query: TelegramQueryRange | null | undefined) {
  if (!query) return null;
  const startDay = normalizeDayString(query.startDay);
  const endDay = normalizeDayString(query.endDay);
  if (!startDay || !endDay) return null;
  if (startDay !== query.startDay || endDay !== query.endDay) return null;

  const start = parseDayKey(startDay);
  const end = parseDayKey(endDay);
  if (formatDayKey(start) !== startDay || formatDayKey(end) !== endDay) return null;

  const rangeDays = differenceInCalendarDays(end, start) + 1;
  if (rangeDays < 1 || rangeDays > TELEGRAM_MAX_QUERY_RANGE_DAYS) return null;

  return {
    startDay,
    endDay,
    label: query.label?.trim() || (startDay === endDay ? startDay : `${startDay} – ${endDay}`),
    rangeDays,
  };
}

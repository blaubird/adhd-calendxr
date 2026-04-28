import { env } from 'app/env';
import { formatDayKey, nowInTz, TIMEZONE } from 'app/lib/datetime';
import { draftListSchema, draftOutputSchema, chatResultSchema, clarificationSchema } from 'app/lib/validation';
import { addDays, format } from 'date-fns';
import { enGB } from 'date-fns/locale';
import { z } from 'zod';
import { TELEGRAM_MAX_QUERY_RANGE_DAYS, type TelegramIntent } from './intent';

// Re-using the prompt logic so we don't duplicate or break the web UI
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'ft:gpt-4.1-nano-2025-04-14:luminiteq:calendar:Cn5UR8JN';

function buildSystemPrompt() {
  const now = new Date(); // assume server runs in the correct TZ or we handle it
  const isoNow = `${format(now, "yyyy-MM-dd'T'HH:mm:ss", { locale: enGB })} (${TIMEZONE})`;
  const humanNow = `${format(now, 'dd MMM yyyy HH:mm', { locale: enGB })} (${TIMEZONE})`;
  const rangeText = 'Visible calendar window: current anchor + 4 days (inclusive).';

  return `You are an assistant that turns free-form RU/EN scheduling requests into JSON drafts for a calendar.\nTime zone: ${TIMEZONE}.\nCurrent datetime: ${isoNow} (${humanNow}). ${rangeText}\n\nContract:\n- Always respond with pure JSON only.\n- JSON shape: either {"drafts": Draft[]} or {"needClarification": true, "questions": string[]}\n- Draft fields: kind ("task" | "event"), day (YYYY-MM-DD), timeStart (HH:mm or null), timeEnd (HH:mm or null), title, details (or null), status ("todo" | "done" | "canceled", default todo), recurrenceRule (string or null), recurrenceUntilDay (YYYY-MM-DD or null), recurrenceCount (integer or null).\n- Interpret relative phrases like today/tomorrow/weekdays using the configured time zone.\n- Always use 24-hour times and ISO-like dates.\n- RECURRENCE RULES: If the user mentions repeating events (каждый день / every day / каждую неделю / every Monday / раз в месяц / monthly etc.), set recurrenceRule using the format: FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=N[;BYDAY=MO,TU,...][;BYMONTHDAY=15]. Set day to the FIRST occurrence. BYDAY uses codes MO TU WE TH FR SA SU. If the user gives an end date, set recurrenceUntilDay. If they say "N times", set recurrenceCount.\n- If no recurrence is mentioned, set recurrenceRule to null.\n- Never include explanations or code fences; return JSON only.\n- If the request is unclear and you cannot create even one draft, ask concise clarification questions.`;
}

function extractJsonContent(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const target = fenced ? fenced[1] : raw;
  return JSON.parse(target);
}

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const telegramIntentResponseSchema = z.object({
  intent: z.enum([
    'show_day',
    'show_week',
    'show_upcoming',
    'create_draft',
    'mark_done',
    'delete_item',
    'move_item',
    'clarify',
    'unsupported',
  ]),
  date: daySchema.nullable(),
  dateRangeStart: daySchema.nullable(),
  dateRangeEnd: daySchema.nullable(),
  timeStart: timeSchema.nullable(),
  timeEnd: timeSchema.nullable(),
  title: z.string().trim().min(1).max(200).nullable(),
  itemNumber: z.number().int().positive().max(100).nullable(),
  itemTextHint: z.string().trim().min(1).max(200).nullable(),
  targetDate: daySchema.nullable(),
  targetTimeStart: timeSchema.nullable(),
  targetTimeEnd: timeSchema.nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  clarificationQuestion: z.string().trim().min(1).max(240).nullable(),
  reason: z.string().trim().max(300).nullable().optional(),
}).strict();

function buildTelegramIntentPrompt() {
  const now = nowInTz(new Date());
  const isoNow = `${format(now, "yyyy-MM-dd'T'HH:mm:ss", { locale: enGB })} (${TIMEZONE})`;
  const today = formatDayKey(now);
  const tomorrow = formatDayKey(addDays(now, 1));
  const dayAfterTomorrow = formatDayKey(addDays(now, 2));

  return `You are a strict intent router for CALENDXR, a Telegram calendar bot.
Return pure JSON only, no markdown.

Current timezone: ${TIMEZONE}
Current date: ${today}
Current datetime: ${isoNow}
Maximum calendar query range: ${TELEGRAM_MAX_QUERY_RANGE_DAYS} days.

Allowed intents:
- "show_day": user asks what is already scheduled on one day.
- "show_week": user asks what is scheduled for a week/range.
- "show_upcoming": user asks what is next/upcoming soon.
- "create_draft": user wants to add/create/remind/schedule a new task or event.
- "mark_done": user wants an existing item marked done.
- "delete_item": user wants an existing item deleted.
- "move_item": user wants an existing item moved/rescheduled.
- "clarify": calendar-related but ambiguous or low confidence.
- "unsupported": unrelated to calendar/task management.

JSON contract:
{
  "intent": "show_day" | "show_week" | "show_upcoming" | "create_draft" | "mark_done" | "delete_item" | "move_item" | "clarify" | "unsupported",
  "date": "YYYY-MM-DD" | null,
  "dateRangeStart": "YYYY-MM-DD" | null,
  "dateRangeEnd": "YYYY-MM-DD" | null,
  "timeStart": "HH:mm" | null,
  "timeEnd": "HH:mm" | null,
  "title": string | null,
  "itemNumber": number | null,
  "itemTextHint": string | null,
  "targetDate": "YYYY-MM-DD" | null,
  "targetTimeStart": "HH:mm" | null,
  "targetTimeEnd": "HH:mm" | null,
  "confidence": "high" | "medium" | "low",
  "clarificationQuestion": string | null,
  "reason": string
}

Rules:
- You only classify intent and resolve dates/times. Do not answer calendar questions.
- Calendar data must be fetched by the backend. Never invent calendar items.
- Never save, edit, move, delete, or mark items done.
- Slash commands are handled outside you.
- For show_day, set date.
- For show_week, set dateRangeStart and dateRangeEnd. If user says "week" without another anchor, use today through today + 6 days.
- For show_upcoming, leave date/ranges null.
- For create_draft, classify only actual creation intent. Do not classify "what do I have..." questions as create_draft.
- For mark_done/delete_item/move_item, fill itemNumber if the user clearly gives a list number, otherwise itemTextHint/title. For move_item, fill targetDate/targetTimeStart when clear.
- If management action is ambiguous, use clarify.
- Low confidence must use clarify with a concise clarificationQuestion.
- "day after tomorrow", "через два дня", "послезавтра", "післязавтра", and "après-demain" mean today + 2 days.
- "ближайшие X дней", "грядущие X дней", and "next X days" start today and include X total days.
- "следующая среда" means the next Wednesday after today; if today is Wednesday, use Wednesday next week.
- "this evening" is still show_day today unless the user clearly asks to create something.
- If a date or range cannot be determined confidently, return clarify.

Examples:
User: чё завтра
{"intent":"show_day","date":"${tomorrow}","dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":null,"itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"Casual Russian asks what is scheduled tomorrow."}
User: а послезавтра?
{"intent":"show_day","date":"${dayAfterTomorrow}","dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":null,"itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"User asks to view day after tomorrow."}
User: what do I have tomorrow
{"intent":"show_day","date":"${tomorrow}","dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":null,"itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"User asks to view existing calendar items."}
User: що завтра
{"intent":"show_day","date":"${tomorrow}","dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":null,"itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"Ukrainian query asks what is scheduled tomorrow."}
User: demain ?
{"intent":"show_day","date":"${tomorrow}","dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":null,"itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"French query asks about tomorrow."}
User: что дальше
{"intent":"show_upcoming","date":null,"dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":null,"itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"User asks for upcoming items."}
User: завтра купить таблетки
{"intent":"create_draft","date":"${tomorrow}","dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":"купить таблетки","itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"User asks to create a task."}
User: завтра в 14 стоматолог
{"intent":"create_draft","date":"${tomorrow}","dateRangeStart":null,"dateRangeEnd":null,"timeStart":"14:00","timeEnd":null,"title":"стоматолог","itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"User describes a new timed calendar item."}
User: удали стоматолога
{"intent":"delete_item","date":null,"dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":"стоматолог","itemNumber":null,"itemTextHint":"стоматолог","targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"medium","clarificationQuestion":"Which listed item number should I delete?","reason":"Delete intent without a clear item number needs confirmation or clarification."}
User: перенеси стоматолога на завтра в 14
{"intent":"move_item","date":null,"dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":"стоматолог","itemNumber":null,"itemTextHint":"стоматолог","targetDate":"${tomorrow}","targetTimeStart":"14:00","targetTimeEnd":null,"confidence":"medium","clarificationQuestion":"Which listed item number should I move?","reason":"Move target is clear but source item is ambiguous."}
User: напиши React app
{"intent":"unsupported","date":null,"dateRangeStart":null,"dateRangeEnd":null,"timeStart":null,"timeEnd":null,"title":null,"itemNumber":null,"itemTextHint":null,"targetDate":null,"targetTimeStart":null,"targetTimeEnd":null,"confidence":"high","clarificationQuestion":null,"reason":"Request is unrelated to calendar queries or draft creation."}`;
}

function normalizeTelegramIntent(raw: unknown, fallbackText: string): TelegramIntent {
  const parsed = telegramIntentResponseSchema.parse(raw);

  if (parsed.confidence === 'low') {
    return {
      intent: 'clarify',
      date: null,
      dateRangeStart: null,
      dateRangeEnd: null,
      timeStart: null,
      timeEnd: null,
      title: parsed.title,
      itemNumber: parsed.itemNumber,
      itemTextHint: parsed.itemTextHint,
      targetDate: null,
      targetTimeStart: null,
      targetTimeEnd: null,
      confidence: parsed.confidence,
      clarificationQuestion: parsed.clarificationQuestion || 'Please clarify what you want me to do.',
      reason: parsed.reason ?? null,
    };
  }

  if (parsed.intent === 'show_day') {
    if (!parsed.date) throw new Error('show_day requires date');
    return {
      ...parsed,
      intent: 'show_day',
      date: parsed.date,
      dateRangeStart: null,
      dateRangeEnd: null,
      title: null,
      itemNumber: null,
      targetDate: null,
      targetTimeStart: null,
      targetTimeEnd: null,
      reason: parsed.reason ?? null,
    };
  }

  if (parsed.intent === 'show_week' || parsed.intent === 'show_upcoming') {
    return {
      ...parsed,
      intent: parsed.intent,
      date: null,
      timeStart: null,
      timeEnd: null,
      title: null,
      itemNumber: null,
      targetDate: null,
      targetTimeStart: null,
      targetTimeEnd: null,
      reason: parsed.reason ?? null,
    };
  }

  if (parsed.intent === 'create_draft') {
    return {
      ...parsed,
      intent: 'create_draft',
      dateRangeStart: null,
      dateRangeEnd: null,
      itemNumber: null,
      targetDate: null,
      targetTimeStart: null,
      targetTimeEnd: null,
      draftInput: fallbackText,
      reason: parsed.reason ?? null,
    };
  }

  if (parsed.intent === 'mark_done' || parsed.intent === 'delete_item' || parsed.intent === 'move_item') {
    return {
      ...parsed,
      intent: parsed.intent,
      dateRangeStart: null,
      dateRangeEnd: null,
      reason: parsed.reason ?? null,
    };
  }

  return {
    ...parsed,
    intent: parsed.intent,
    date: null,
    dateRangeStart: null,
    dateRangeEnd: null,
    timeStart: null,
    timeEnd: null,
    targetDate: null,
    targetTimeStart: null,
    targetTimeEnd: null,
    reason: parsed.reason ?? null,
  };
}

export async function detectTelegramIntent(text: string): Promise<TelegramIntent> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI key missing');

  const model = env.OPENAI_MODEL || DEFAULT_MODEL;

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: buildTelegramIntentPrompt() },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  };

  let aiResponse = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (aiResponse.status === 400) {
    const { response_format: _responseFormat, ...fallbackBody } = requestBody;
    aiResponse = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(fallbackBody),
    });
  }

  if (!aiResponse.ok) {
    throw new Error(`OpenAI error: ${aiResponse.status}`);
  }

  const completion = await aiResponse.json() as any;
  const content = completion?.choices?.[0]?.message?.content as string | undefined;
  if (!content) throw new Error('Invalid AI response');

  try {
    return normalizeTelegramIntent(extractJsonContent(content), text);
  } catch (err) {
    return {
      intent: 'clarify',
      date: null,
      dateRangeStart: null,
      dateRangeEnd: null,
      timeStart: null,
      timeEnd: null,
      title: null,
      itemNumber: null,
      itemTextHint: null,
      targetDate: null,
      targetTimeStart: null,
      targetTimeEnd: null,
      confidence: 'low',
      clarificationQuestion: 'Please clarify whether you want to view the calendar or create a new item.',
      reason: 'Could not parse intent router JSON.',
    };
  }
}

export async function generateDraftsFromText(text: string) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI key missing');

  const model = env.OPENAI_MODEL || DEFAULT_MODEL;

  const aiResponse = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`OpenAI error: ${aiResponse.status}`);
  }

  const completion = await aiResponse.json() as any;
  const content = completion?.choices?.[0]?.message?.content as string | undefined;
  if (!content) throw new Error('Invalid AI response');

  try {
    const rawJson = extractJsonContent(content);
    const result = chatResultSchema.parse(rawJson);
    if (clarificationSchema.safeParse(result).success) {
      return result as any; // { needClarification: true, questions: string[] }
    }
    const list = draftListSchema.parse(result);
    return {
      drafts: list.drafts,
      needClarification: false
    };
  } catch (err) {
    return {
      needClarification: true,
      questions: ['Could not parse drafts. Please confirm the exact day and time.'],
    };
  }
}

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

const telegramIntentResponseSchema = z
  .object({
    intent: z.enum(['calendar_query', 'draft_create', 'unsupported']),
    confidence: z.number().min(0).max(1),
    query: z
      .object({
        startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        label: z.string().min(1).max(120),
      })
      .nullable(),
    draftInput: z.string().min(1).max(1000).nullable(),
    reason: z.string().max(300).nullable().optional(),
  })
  .strict();

function buildTelegramIntentPrompt() {
  const now = nowInTz(new Date());
  const isoNow = `${format(now, "yyyy-MM-dd'T'HH:mm:ss", { locale: enGB })} (${TIMEZONE})`;
  const today = formatDayKey(now);
  const dayAfterTomorrow = formatDayKey(addDays(now, 2));

  return `You are a strict intent router for a Telegram calendar bot.
Return pure JSON only, no markdown.

Current timezone: ${TIMEZONE}
Current date: ${today}
Current datetime: ${isoNow}
Maximum calendar query range: ${TELEGRAM_MAX_QUERY_RANGE_DAYS} days.

Allowed intents:
- "calendar_query": user asks what is already scheduled.
- "draft_create": user asks to add/create/remember/schedule a task or event.
- "unsupported": anything else or unclear date/range.

JSON contract:
{
  "intent": "calendar_query" | "draft_create" | "unsupported",
  "confidence": number,
  "query": {"startDay":"YYYY-MM-DD","endDay":"YYYY-MM-DD","label":"short user-facing label"} | null,
  "draftInput": string | null,
  "reason": string
}

Rules:
- You only classify intent and resolve query dates. Do not answer calendar questions.
- Calendar data must be fetched by the backend. Never invent calendar items.
- Never save, edit, move, delete, or mark items done.
- Slash commands are handled outside you.
- For calendar_query, return startDay/endDay/label.
- "через два дня" and "послезавтра" mean today + 2 days.
- "ближайшие X дней", "грядущие X дней", and "next X days" start today and include X total days.
- "следующая среда" means the next Wednesday after today; if today is Wednesday, use Wednesday next week.
- If a date or range cannot be determined confidently, return unsupported.
- For draft_create, return the original user text in draftInput.

Examples:
User: что у меня через два дня
{"intent":"calendar_query","confidence":0.9,"query":{"startDay":"${dayAfterTomorrow}","endDay":"${dayAfterTomorrow}","label":"через два дня"},"draftInput":null,"reason":"User asks to view existing calendar items."}
User: завтра купить таблетки
{"intent":"draft_create","confidence":0.95,"query":null,"draftInput":"завтра купить таблетки","reason":"User asks to create a draft."}
User: напиши React app
{"intent":"unsupported","confidence":0.8,"query":null,"draftInput":null,"reason":"Request is unrelated to calendar queries or draft creation."}`;
}

function normalizeTelegramIntent(raw: unknown, fallbackText: string): TelegramIntent {
  const parsed = telegramIntentResponseSchema.parse(raw);

  if (parsed.intent === 'calendar_query' && parsed.query) {
    return {
      intent: 'calendar_query',
      confidence: parsed.confidence,
      query: parsed.query,
      draftInput: null,
      reason: parsed.reason ?? null,
    };
  }

  if (parsed.intent === 'draft_create') {
    return {
      intent: 'draft_create',
      confidence: parsed.confidence,
      query: null,
      draftInput: parsed.draftInput || fallbackText,
      reason: parsed.reason ?? null,
    };
  }

  return {
    intent: 'unsupported',
    confidence: parsed.confidence,
    query: null,
    draftInput: null,
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
      intent: 'unsupported',
      confidence: 0,
      query: null,
      draftInput: null,
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

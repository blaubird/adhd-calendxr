import { NextResponse } from 'next/server';

import { auth } from 'app/auth';
import {
  chatRequestSchema,
  chatResultSchema,
  clarificationSchema,
  draftListSchema,
  draftOutputSchema,
} from 'app/lib/validation';
import { normalizeDayString, normalizeTime, nowInTz, TIMEZONE } from 'app/lib/datetime';
import { format } from 'date-fns';
import { enGB } from 'date-fns/locale';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemma-3-27b-it:free';

function buildSystemPrompt(range?: { start: string; end: string }) {
  const now = nowInTz(new Date());
  const isoNow = `${format(now, "yyyy-MM-dd'T'HH:mm:ss", { locale: enGB })} (${TIMEZONE})`;
  const humanNow = `${format(now, 'dd MMM yyyy HH:mm', { locale: enGB })} (${TIMEZONE})`;
  const rangeText = range
    ? `Visible calendar window: ${range.start} to ${range.end} (inclusive).`
    : 'Visible calendar window: current anchor + 4 days (inclusive).';

  return `You are an assistant that turns free-form RU/EN scheduling requests into JSON drafts for a calendar.\nTime zone: ${TIMEZONE}.\nCurrent datetime: ${isoNow} (${humanNow}). ${rangeText}\n\nContract:\n- Always respond with pure JSON only.\n- JSON shape: either {"drafts": Draft[]} or {"needClarification": true, "questions": string[]}\n- Draft fields: kind ("task" | "event"), day (YYYY-MM-DD), timeStart (HH:mm or null), timeEnd (HH:mm or null), title, details (or null), status ("todo" | "done" | "canceled", default todo).\n- Interpret relative phrases like today/tomorrow/weekdays using the configured time zone.\n- Always use 24-hour times and ISO-like dates.\n- If the request is unclear or missing day/time, ask concise clarification questions instead of guessing.\n- Never include explanations or code fences; return JSON only.`;
}

function extractJsonContent(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const target = fenced ? fenced[1] : raw;
  return JSON.parse(target);
}

function normalizeDraftOutput(data: unknown) {
  const parsed = draftOutputSchema.parse(data);
  const day = normalizeDayString(parsed.day);
  const timeStart = normalizeTime(parsed.timeStart);
  const timeEnd = normalizeTime(parsed.timeEnd);

  if (!day || (parsed.timeStart && !timeStart) || (parsed.timeEnd && !timeEnd)) {
    throw new Error('Invalid date/time in draft');
  }

  return {
    ...parsed,
    day,
    timeStart,
    timeEnd,
    details: parsed.details ?? null,
    status: parsed.status ?? 'todo',
    recurrenceRule: parsed.recurrenceRule ?? null,
    recurrenceUntilDay: parsed.recurrenceUntilDay ?? null,
    recurrenceCount: parsed.recurrenceCount ?? null,
  };
}

function normalizeResult(payload: unknown) {
  const result = chatResultSchema.parse(payload);
  if (clarificationSchema.safeParse(result).success) {
    return result;
  }

  const list = draftListSchema.parse(result);
  return {
    drafts: list.drafts.map(normalizeDraftOutput),
    needClarification: false as const,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenRouter key missing' }, { status: 500 });
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const body = await request.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[ai/chat] request', {
      user: session.user.id,
      model,
      messages: parsed.data.messages.length,
      range: parsed.data.range,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const aiResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(parsed.data.range) },
          ...parsed.data.messages,
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!aiResponse.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[ai/chat] OpenRouter error', { status: aiResponse.status });
      }
      return NextResponse.json({ error: 'OpenRouter error', status: aiResponse.status }, { status: 502 });
    }

    const completion = await aiResponse.json();
    const content = completion?.choices?.[0]?.message?.content as string | undefined;
    if (!content) {
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 });
    }

    let parsedContent;
    try {
      parsedContent = normalizeResult(extractJsonContent(content));
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[ai/chat] normalization failed', { message: (err as Error)?.message });
      }
      return NextResponse.json({
        needClarification: true,
        questions: ['Please confirm the exact day (YYYY-MM-DD) and 24h time for this request.'],
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[ai/chat] response payload', {
        needClarification: parsedContent.needClarification,
        drafts: 'drafts' in parsedContent ? parsedContent.drafts.length : undefined,
      });
    }
    return NextResponse.json(parsedContent);
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ai/chat] request failed', { message: error?.message, name: error?.name });
    }
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'AI request timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Unable to create drafts' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}


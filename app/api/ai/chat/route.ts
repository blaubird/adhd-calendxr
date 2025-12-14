import { NextResponse } from 'next/server';

import { auth } from 'app/auth';
import { chatRequestSchema } from 'app/lib/validation';
import { nowInTz, TIMEZONE, todayKey } from 'app/lib/datetime';
import { normalizeAiResponse } from 'app/lib/ai/normalize';
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

  return `You are an assistant that turns free-form RU/EN scheduling requests into JSON drafts for a calendar.\nTime zone: ${TIMEZONE}.\nCurrent datetime: ${isoNow} (${humanNow}). ${rangeText}\n\nContract:\n- Always respond with pure JSON only.\n- JSON shape: either {"drafts": Draft[]} or {"needClarification": true, "questions": string[]}\n- Draft fields: kind ("task" | "event"), day (YYYY-MM-DD), timeStart (HH:mm or null), timeEnd (HH:mm or null), title, details (or null), status ("todo" | "done" | "canceled", default todo).\n- Interpret relative phrases like today/tomorrow/weekdays/сегодня/завтра relative to the configured time zone.\n- Use 24-hour times and YYYY-MM-DD dates.\n- If no time is present, create a task with timeStart/timeEnd = null.\n- If day is missing, default to today in the configured time zone.\n- Only ask clarification if you cannot create any drafts; otherwise, never ask questions.\n- Never include explanations or code fences; return JSON only.`;
}

function extractJsonContent(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const target = fenced ? fenced[1] : raw;
  return JSON.parse(target);
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
      return NextResponse.json({ error: 'OpenRouter error', status: aiResponse.status }, { status: 502 });
    }

    const completion = await aiResponse.json();
    const content = completion?.choices?.[0]?.message?.content as string | undefined;
    if (!content) {
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 });
    }

    let parsedContent;
    try {
      const defaultDay = todayKey(nowInTz(new Date()));
      parsedContent = normalizeAiResponse(extractJsonContent(content), { defaultDay });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[ai] response parse failed', err);
      }
      return NextResponse.json({
        needClarification: true,
        questions: ['Please confirm the title so I can draft it.'],
      });
    }
    return NextResponse.json(parsedContent);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'AI request timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Unable to create drafts' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}


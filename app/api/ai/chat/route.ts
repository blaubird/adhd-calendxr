import { NextResponse } from 'next/server';

import { auth } from 'app/auth';
import {
  chatRequestSchema,
  chatResultSchema,
  clarificationSchema,
  draftListSchema,
  draftOutputSchema,
} from 'app/lib/validation';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemma-3-27b-it:free';

const SYSTEM_PROMPT = `You are an assistant that turns free-form RU/EN scheduling requests into JSON drafts for a calendar.\n\nRules:\n- Always respond with pure JSON only.\n- JSON shape: either {"drafts": Draft[]} or {"needClarification": true, "questions": string[]}\n- Draft fields: kind ("task" | "event"), day (YYYY-MM-DD), timeStart (HH:mm or null), timeEnd (HH:mm or null), title, details (or null), status ("todo" | "done" | "canceled", default todo).\n- Use 24-hour times. Interpret dates in European style; prefer ISO date outputs.\n- If the request is unclear, ask concise clarification questions instead of guessing.\n- Never include explanations or code fences; return JSON only.`;

function extractJsonContent(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const target = fenced ? fenced[1] : raw;
  return JSON.parse(target);
}

function normalizeDraftOutput(data: unknown) {
  const parsed = draftOutputSchema.parse(data);
  return {
    ...parsed,
    timeStart: parsed.timeStart ?? null,
    timeEnd: parsed.timeEnd ?? null,
    details: parsed.details ?? null,
    status: parsed.status ?? 'todo',
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
          { role: 'system', content: SYSTEM_PROMPT },
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

    const parsedContent = normalizeResult(extractJsonContent(content));
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


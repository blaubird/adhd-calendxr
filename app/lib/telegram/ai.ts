import { env } from 'app/env';
import { TIMEZONE } from 'app/lib/datetime';
import { draftListSchema, draftOutputSchema, chatResultSchema, clarificationSchema } from 'app/lib/validation';
import { format } from 'date-fns';
import { enGB } from 'date-fns/locale';

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

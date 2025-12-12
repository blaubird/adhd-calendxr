import { NextResponse } from 'next/server';
import { addDays, format } from 'date-fns';
import { draftSchema } from 'app/lib/validation';
import { auth } from 'app/auth';

function normalizeTime(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const hours = match[1].padStart(2, '0');
  const minutes = (match[2] || '00').padStart(2, '0');
  return `${hours}:${minutes}`;
}

function extractDay(text: string, now = new Date()) {
  const lower = text.toLowerCase();
  if (lower.includes('today')) return format(now, 'yyyy-MM-dd');
  if (lower.includes('tomorrow')) return format(addDays(now, 1), 'yyyy-MM-dd');

  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const weekdayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const todayIndex = now.getDay();
    const targetIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(
      weekdayMatch[1]
    );
    const delta = (targetIndex + 7 - todayIndex) % 7;
    return format(addDays(now, delta === 0 ? 7 : delta), 'yyyy-MM-dd');
  }
  return null;
}

function extractTime(text: string) {
  const time = text.match(/(\d{1,2}[:h]\d{2})/);
  if (time) {
    return normalizeTime(time[1].replace('h', ':'));
  }
  return null;
}

function cleanseTitle(text: string) {
  return text
    .replace(/\b(today|tomorrow|morning|evening|afternoon)\b/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\d{1,2}[:h]\d{2}/g, '')
    .trim();
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const text = (body?.text as string | undefined)?.trim();
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const day = extractDay(text);
  const timeStart = extractTime(text);
  const title = cleanseTitle(text) || 'Draft item';

  if (!day) {
    const draft = {
      kind: 'clarify',
      title,
      day: null,
      questions: ['Which day is this for?', 'Do you want to add a time?'],
    } as const;
    return NextResponse.json(draftSchema.parse(draft));
  }

  const draft = {
    kind: 'task',
    title,
    day,
    timeStart,
  };

  return NextResponse.json(draftSchema.parse(draft));
}

import { addDays } from 'date-fns';
import { NextResponse } from 'next/server';
import { auth } from 'app/auth';
import { formatDayKey, nowInTz, parseDayKey } from 'app/lib/datetime';
import { loadExpandedItems } from 'app/lib/load-items';

const DAY_MS = 24 * 60 * 60 * 1000;

function upcomingMinutes(itemDay: string, timeStart: string, now: Date) {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const itemDate = parseDayKey(itemDay);
  const dayOffset = Math.round((itemDate.getTime() - todayStart) / DAY_MS);
  const [hour, minute] = timeStart.split(':').map(Number);
  return dayOffset * 1440 + hour * 60 + minute - (now.getUTCHours() * 60 + now.getUTCMinutes());
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = nowInTz(new Date());
  const start = formatDayKey(now);
  const end = formatDayKey(addDays(now, 370));
  const items = await loadExpandedItems(Number(session.user.id), start, end);

  const nextUp = items
    .filter((item) => item.timeStart && item.status !== 'done' && item.status !== 'canceled')
    .map((item) => ({
      item,
      totalMinutes: upcomingMinutes(item.occurrenceDay ?? item.day, item.timeStart!, now),
    }))
    .filter((candidate) => candidate.totalMinutes >= 0)
    .sort((a, b) => a.totalMinutes - b.totalMinutes)[0] ?? null;

  return NextResponse.json({ nextUp });
}

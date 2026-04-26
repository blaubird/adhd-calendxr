import { NextResponse } from 'next/server';

import { env } from 'app/env';
import { sendTelegramReminders } from 'app/lib/telegram/reminders';
import { createTelegramClient, getTelegramUserId } from 'app/lib/telegram/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  if (!env.CRON_SECRET) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    console.error('[telegram/reminders] CRON_SECRET is missing');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!isAuthorized(request)) {
    console.warn('[telegram/reminders] unauthorized request');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const client = createTelegramClient();
    const userId = await getTelegramUserId();
    const result = await sendTelegramReminders(client, userId, env.TELEGRAM_ALLOWED_CHAT_ID);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[telegram/reminders] failed', { message: error?.message, name: error?.name });
    return NextResponse.json({ ok: false, error: 'Reminders failed' }, { status: 500 });
  }
}
